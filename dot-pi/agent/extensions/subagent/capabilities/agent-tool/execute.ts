/**
 * execute.ts — foreground/background/resume execution paths for the Agent tool.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createOutputFilePath, streamToOutputFile, writeInitialEntry } from "../../engine/output-file.js";
import {
  buildDetails,
  createActivityTracker,
  formatLifetimeTokens,
  partialOutputSuffix,
  textResult,
} from "../../shared/helpers.js";
import { getStatusNote } from "../../shared/status-note.js";
import type { AgentRecord, SubagentDeps } from "../../shared/types.js";
import { type AgentDetails, describeActivity, formatMs, SPINNER, type UICtx } from "../../ui/agent-widget.js";
import { resolveModel } from "./model-resolver.js";

function attachTranscriptFactory(deps: SubagentDeps, ctx: ExtensionContext, prompt: string) {
  const outputTranscript = deps.getOutputTranscriptDefault();
  return (rec: AgentRecord | undefined, agentId: string): void => {
    if (!rec || !outputTranscript) return;
    rec.outputFile = createOutputFilePath(ctx.cwd, agentId, ctx.sessionManager.getSessionId());
    writeInitialEntry(rec.outputFile, agentId, prompt, ctx.cwd);
  };
}

export async function executeAgentTool(
  pi: ExtensionAPI,
  deps: SubagentDeps,
  toolCallId: string,
  params: Record<string, any>,
  signal: AbortSignal | undefined,
  onUpdate: ((result: any) => void) | undefined,
  ctx: ExtensionContext,
) {
  const { manager, widget, fleet, agentActivity } = deps;
  widget.setUICtx(ctx.ui as UICtx);

  const displayName = "Agent";
  const description = params.description as string;

  // Resolve model
  let model = ctx.model;
  if (params.model) {
    const resolved = resolveModel(params.model, ctx.modelRegistry);
    if (typeof resolved === "string") return textResult(resolved);
    model = resolved;
  }

  const thinking = params.thinking as string | undefined;
  const runInBackground = params.run_in_background as boolean | undefined;
  const attachTranscript = attachTranscriptFactory(deps, ctx, params.prompt);

  const parentModelId = ctx.model?.id;
  const effectiveModelId = model?.id;
  const modelName = effectiveModelId && effectiveModelId !== parentModelId
    ? (model?.name ?? effectiveModelId).replace(/^Claude\s+/i, "").toLowerCase()
    : undefined;

  const detailBase = {
    displayName,
    description,
    modelName,
    tags: undefined,
  };

  // Resume existing agent
  if (params.resume) {
    const existing = manager.getRecord(params.resume as string);
    if (!existing) {
      return textResult(`Agent not found: "${params.resume}". It may have been cleaned up.`);
    }
    if (!existing.session) {
      return textResult(`Agent "${params.resume}" has no active session to resume.`);
    }
    const record = await manager.resume(params.resume as string, params.prompt, signal);
    if (!record) {
      return textResult(`Failed to resume agent "${params.resume}".`);
    }
    if (record.status === "error") {
      return textResult(`Agent failed: ${record.error}${partialOutputSuffix(record)}`, buildDetails(detailBase, record));
    }
    return textResult(
      record.result?.trim() || "No output.",
      buildDetails(detailBase, record),
    );
  }

  // Background execution
  if (runInBackground) {
    const { state: bgState, callbacks: bgCallbacks } = createActivityTracker();

    let id: string;
    const origBgOnSession = bgCallbacks.onSessionCreated;
    bgCallbacks.onSessionCreated = (session: any) => {
      origBgOnSession(session);
      const rec = manager.getRecord(id);
      if (rec?.outputFile) {
        rec.outputCleanup = streamToOutputFile(session, rec.outputFile, id, ctx.cwd);
      }
    };

    try {
      id = manager.spawn(pi, ctx, params.prompt, {
        description,
        model,
        thinkingLevel: thinking,
        isBackground: true,
        ...bgCallbacks,
      });
    } catch (err) {
      return textResult(err instanceof Error ? err.message : String(err));
    }

    const record = manager.getRecord(id);
    if (record) {
      record.toolCallId = toolCallId;
      attachTranscript(record, id);
    }

    agentActivity.set(id, bgState);
    widget.ensureTimer();
    widget.update();
    fleet.ensureTimer();
    fleet.update();

    pi.events.emit("subagents:created", {
      id,
      description,
      isBackground: true,
    });

    const isQueued = record?.status === "queued";
    return textResult(
      `Agent ${isQueued ? "queued" : "started"} in background.\n` +
      `Agent ID: ${id}\n` +
      `Description: ${description}\n` +
      (record?.outputFile ? `Output file: ${record.outputFile}\n` : "") +
      (isQueued ? `Position: queued (max ${manager.getMaxConcurrent()} concurrent)\n` : "") +
      `\nYou will be notified when this agent completes.\n` +
      `Use get_subagent_result to retrieve full results, or steer_subagent to send it messages.\n` +
      `Do not duplicate this agent's work.`,
      { ...detailBase, toolUses: 0, tokens: "", durationMs: 0, status: "background" as const, agentId: id },
    );
  }

  // Foreground execution
  let spinnerFrame = 0;
  const startedAt = Date.now();
  let fgId: string | undefined;

  const streamUpdate = () => {
    const details: AgentDetails = {
      ...detailBase,
      toolUses: fgState.toolUses,
      tokens: formatLifetimeTokens(fgState),
      turnCount: fgState.turnCount,
      maxTurns: fgState.maxTurns,
      durationMs: Date.now() - startedAt,
      status: "running",
      activity: describeActivity(fgState.activeTools, fgState.responseText),
      spinnerFrame: spinnerFrame % SPINNER.length,
    };
    onUpdate?.({
      content: [{ type: "text", text: `${fgState.toolUses} tool uses...` }],
      details: details as any,
    });
  };

  const { state: fgState, callbacks: fgCallbacks } = createActivityTracker(streamUpdate);

  const origOnSession = fgCallbacks.onSessionCreated;
  fgCallbacks.onSessionCreated = (session: any) => {
    origOnSession(session);
    for (const a of manager.listAgents()) {
      if (a.session === session) {
        fgId = a.id;
        agentActivity.set(a.id, fgState);
        widget.ensureTimer();
        fleet.ensureTimer();
        fleet.update();
        break;
      }
    }
    if (fgId) {
      const rec = manager.getRecord(fgId);
      if (rec?.outputFile) {
        rec.outputCleanup = streamToOutputFile(session, rec.outputFile, fgId, ctx.cwd);
      }
    }
  };

  const spinnerInterval = setInterval(() => {
    spinnerFrame++;
    streamUpdate();
  }, 80);

  streamUpdate();

  let record: AgentRecord;
  try {
    const fgResult = await manager.spawnAndWait(pi, ctx, params.prompt, {
      description,
      model,
      thinkingLevel: thinking,
      signal,
      ...fgCallbacks,
    }, (fgAgentId) => {
      const fgRec = manager.getRecord(fgAgentId);
      attachTranscript(fgRec, fgAgentId);
    });
    record = fgResult.record;
  } catch (err) {
    clearInterval(spinnerInterval);
    return textResult(err instanceof Error ? err.message : String(err));
  }

  clearInterval(spinnerInterval);

  if (fgId) {
    agentActivity.delete(fgId);
    widget.markFinished(fgId);
    fleet.onAgentFinished(fgId);
  }

  const tokenText = formatLifetimeTokens(fgState);

  const details = buildDetails(detailBase, record, fgState, { tokens: tokenText });

  if (record.status === "error") {
    return textResult(`Agent failed: ${record.error}${partialOutputSuffix(record)}`, details);
  }

  const durationMs = (record.completedAt ?? Date.now()) - record.startedAt;
  const statsParts = [`${record.toolUses} tool uses`];
  if (tokenText) statsParts.push(tokenText);
  return textResult(
    `Agent completed in ${formatMs(durationMs)} (${statsParts.join(", ")})${getStatusNote(record.status)}.\n\n` +
    (record.result?.trim() || "No output."),
    details,
  );
}

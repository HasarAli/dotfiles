"""Adapter that runs a prompt through the `codex` CLI in non-interactive JSONL mode.

Invokes the org wrapper at `codex` (never the raw binary): the wrapper forces
approval_policy="never" for `codex exec`. `shell_environment_policy.inherit=all` is required so
the fake-CLI PATH set up by run_evals.py reaches the commands the model runs.
"""
import json
import subprocess
import time

from adapters.claude import AgentRunResult


def build_skill_prompt(skill_name: str, request: str) -> str:
    """Returns the prompt that invokes the skill on the request (codex has no slash commands)."""
    return f"Use the {skill_name} skill (in .agents/skills). {request}"


def build_command(prompt: str, model: str) -> list[str]:
    """Returns the `codex exec` argv for a non-interactive JSONL run of the prompt."""
    return [
        "codex",
        "exec",
        prompt,
        "--json",
        "-m",
        model,
        "--skip-git-repo-check",
        "--ephemeral",
        "-s",
        "workspace-write",
        "-c",
        "shell_environment_policy.inherit=all",
    ]


def extract_agent_text(event) -> str | None:
    """Returns the agent-message text carried by one JSONL event, or None.

    Codex event shapes vary across versions, so scan liberally: top-level `msg` objects with an
    agent_message type, and `item`/`message` payloads carrying agent text.
    """
    if not isinstance(event, dict):
        return None
    for payload in (event.get("msg"), event.get("item"), event.get("message"), event):
        if not isinstance(payload, dict):
            continue
        payload_type = str(payload.get("type", ""))
        if "agent_message" in payload_type or payload_type in ("agent.message", "assistant"):
            text = payload.get("message") or payload.get("text") or payload.get("content")
            if isinstance(text, str) and text:
                return text
    return None


def extract_token_counts(event) -> tuple[int | None, int | None]:
    """Returns (tokens_in, tokens_out) from a usage/token_count payload in the event, or Nones."""
    if not isinstance(event, dict):
        return None, None
    candidates = [event]
    for key in ("msg", "usage", "info", "token_count"):
        value = event.get(key)
        if isinstance(value, dict):
            candidates.append(value)
            for nested_key in ("usage", "info", "total_token_usage", "last_token_usage"):
                nested = value.get(nested_key)
                if isinstance(nested, dict):
                    candidates.append(nested)
    for candidate in candidates:
        tokens_in = candidate.get("input_tokens")
        tokens_out = candidate.get("output_tokens")
        if isinstance(tokens_in, int) or isinstance(tokens_out, int):
            return tokens_in, tokens_out
    return None, None


def run(
    prompt: str, model: str, cwd: str, env: dict[str, str], timeout_s: int = 1200
) -> AgentRunResult:
    """Invokes the `codex` CLI on the prompt and returns the parsed run result."""
    command = build_command(prompt, model)
    start_time = time.monotonic()
    completed = subprocess.run(
        command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout_s
    )
    duration_s = time.monotonic() - start_time
    transcript = None
    tokens_in = None
    tokens_out = None
    for line in completed.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        agent_text = extract_agent_text(event)
        if agent_text is not None:
            transcript = agent_text
        event_tokens_in, event_tokens_out = extract_token_counts(event)
        if event_tokens_in is not None or event_tokens_out is not None:
            tokens_in, tokens_out = event_tokens_in, event_tokens_out
    if transcript is None:
        transcript = completed.stdout
        if completed.returncode != 0:
            # The wrapper reports launch failures (e.g. cwd policy) on stderr only.
            transcript += f"\n=== stderr ===\n{completed.stderr}"
    return AgentRunResult(
        transcript=transcript,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        duration_s=duration_s,
        exit_code=completed.returncode,
    )

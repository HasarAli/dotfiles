import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DISTILL_MODEL } from "./config.js";

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * USD cost of a distill call, priced from pi's model registry (USD per million tokens).
 * A model the registry does not know reports no cost — a missing number invites a
 * look, a zero does not.
 */
export function usdOf(ctx: ExtensionContext, inTok: number, outTok: number): number | undefined {
  const cost = ctx.modelRegistry?.getAll?.().find((m) => m.id === DISTILL_MODEL)?.cost;
  return cost ? round4((inTok * cost.input + outTok * cost.output) / 1e6) : undefined;
}

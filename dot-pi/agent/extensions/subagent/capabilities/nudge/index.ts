/**
 * capabilities/nudge — batched completion notifications for background agents.
 *
 * Self-contained vertical slice: never imports from other capabilities/.
 */

export { createNudgeScheduler, type NudgeAccessors, type NudgeScheduler } from "./scheduler.js";

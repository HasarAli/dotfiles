Launch or resume an autonomous agent for complex, multi-step tasks.

Route by cost: send mechanical work to cheaper models and hard reasoning to stronger ones. Delegate context-heavy tasks (codebase spelunking, large files, sweeping edits, log triage) to an agent; use direct tools when you already know the exact target.

When you run an agent in the background, you will be notified on completion. Do not poll or sleep; keep working and use `get_subagent_result` with the agent ID if you need its output. Use `steer_subagent` to redirect a long-running background agent mid-run.

Trust but verify: an agent's summary describes intent, not outcome. When it edits code, inspect the actual diff before claiming the work is done.

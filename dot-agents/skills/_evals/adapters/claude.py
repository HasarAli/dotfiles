"""Adapter that runs a prompt through the `claude` CLI in non-interactive JSON mode."""
import dataclasses
import json
import subprocess
import time

# Non-interactive `claude -p` denies tools by default, and managed settings on devpods disable
# bypassPermissions, so grant explicit allow rules instead. `Bash(*)` is safe here: each trial
# runs in a throwaway workdir whose PATH is prefixed with fake CLIs, so no real glab/git side
# effects are possible.
ALLOWED_TOOLS = "Bash(*),Bash,Read,Grep,Glob,Skill"


@dataclasses.dataclass
class AgentRunResult:
    """Holds the outcome of one agent CLI invocation."""

    transcript: str
    tokens_in: int | None
    tokens_out: int | None
    duration_s: float
    exit_code: int


def build_skill_prompt(skill_name: str, request: str) -> str:
    """Returns the prompt that invokes the skill on the request (slash-command idiom)."""
    return f"/{skill_name} {request}"


def build_command(prompt: str, model: str) -> list[str]:
    """Returns the `claude` CLI argv for a non-interactive JSON run of the prompt."""
    return [
        "claude",
        "-p",
        prompt,
        "--output-format",
        "json",
        "--model",
        model,
        "--allowedTools",
        ALLOWED_TOOLS,
        "--permission-mode",
        "acceptEdits",
    ]


def run(
    prompt: str, model: str, cwd: str, env: dict[str, str], timeout_s: int = 1200
) -> AgentRunResult:
    """Invokes the `claude` CLI on the prompt and returns the parsed run result."""
    command = build_command(prompt, model)
    start_time = time.monotonic()
    completed = subprocess.run(
        command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout_s
    )
    duration_s = time.monotonic() - start_time
    transcript = completed.stdout
    tokens_in = None
    tokens_out = None
    try:
        payload = json.loads(completed.stdout)
    except (json.JSONDecodeError, ValueError):
        payload = None
    if isinstance(payload, dict):
        transcript = payload.get("result", "") or ""
        usage = payload.get("usage")
        if isinstance(usage, dict):
            tokens_in = usage.get("input_tokens")
            tokens_out = usage.get("output_tokens")
    return AgentRunResult(
        transcript=transcript,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        duration_s=duration_s,
        exit_code=completed.returncode,
    )

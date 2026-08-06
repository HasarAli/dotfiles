"""Registry of agent CLI adapters. Add new vendors as sibling modules."""
from . import claude
from . import codex

ADAPTERS = {"claude": claude.run, "codex": codex.run}
COMMAND_BUILDERS = {"claude": claude.build_command, "codex": codex.build_command}
SKILL_PROMPT_BUILDERS = {
    "claude": claude.build_skill_prompt,
    "codex": codex.build_skill_prompt,
}

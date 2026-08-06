# Skill eval harness

Vendor-neutral harness for evaluating agent skills under `skills/`. Stdlib-only Python.

## Layout

```
skills/
├── _evals/
│   ├── run_evals.py       # CLI entry point
│   ├── checks.py          # Check registry (output/command regex checks)
│   ├── fake_cli.py        # Generic fake command (glab, git, date, ...) backed by fixtures
│   └── adapters/          # Agent CLI adapters; claude.py is the only one today
└── <skill>/
    ├── SKILL.md
    └── evals/
        ├── cases.json     # List of eval cases
        └── fixtures/<case-subdir>/<cmd>/<subcommands joined by _>.{json,txt}
```

## Running

```bash
cd skills/_evals
python3 run_evals.py --skill ../pick-web-my-reviewer [--models claude-sonnet-5,claude-opus-5] \
    [--adapter claude] [--trials 3] [--cases id1,id2] [--no-skill]
```

Each trial runs in a temp workdir: fake commands are placed first on PATH (calls are logged to
`FAKE_CLI_LOG` and answered from `FAKE_CLI_FIXTURES`), and the skill is symlinked into
`<workdir>/.claude/skills/` so the CLI discovers it. Exit is nonzero when any case has zero
passing trials.

### Codex

```bash
python3 run_evals.py --adapter codex --models gpt-5-codex --skill ../pick-web-my-reviewer
```

The codex adapter invokes the org `codex` wrapper (never the raw binary — the wrapper forces
`approval_policy="never"` for `codex exec`) with `--json`, `--ephemeral`, `-s workspace-write`,
and `-c shell_environment_policy.inherit=all` so the fake-CLI PATH reaches model-run commands.
Codex has no slash commands, so cases carry a `prompt_codex` prose variant (generally
`prompt_<adapter>` overrides `prompt`); prompts may be JSON arrays of strings, joined with
spaces. Known blocker: the wrapper currently crashes with `ModuleNotFoundError: filelock` in
system python3 — `pip install filelock` (or ask the platform team) before live codex runs.

## Adding a case

Append to `<skill>/evals/cases.json`: `id`, `title` (one line stating the behavior under test,
printed as the case header), `prompt`, `checks` (entries like
`{"type": "output_matches", "pattern": "...", "expect": "prose expectation"}` — see
`CHECK_REGISTRY` in `checks.py`; `expect` is printed with each PASS/FAIL), optional
`fake_commands` (default `["glab", "git", "date"]`), optional `fixtures` subdir name.
Add fixture files under `<skill>/evals/fixtures/<subdir>/<cmd>/` — e.g.
`glab mr list ...` resolves to `glab/mr_list.json`, with `glab/default.txt` as the fallback.

## No-skill pruning workflow

Run with `--no-skill` to measure how the bare model does on the same prompts. Cases the model
passes without the skill are candidates for pruning from SKILL.md — the instructions they cover
add tokens without adding behavior.

## Adapter seam

`adapters/` isolates the agent CLI. To support another vendor (e.g. codex), add
`adapters/codex.py` with the same `run(prompt, model, cwd, env, timeout_s)` signature returning
an `AgentRunResult`, and register it in `adapters/__init__.py`.

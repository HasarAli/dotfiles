#!/usr/bin/env python3
"""Runs a skill's eval cases against an agent CLI adapter and prints a pass/fail table.

Usage:
    run_evals.py --skill <path-to-skill-dir> [--models m1,m2] [--adapter claude]
                 [--trials 3] [--no-skill] [--cases id1,id2]

Cases live at <skill>/evals/cases.json; fixtures under <skill>/evals/fixtures/. Each trial runs
in a temp workdir whose PATH is prefixed with fake commands (fake_cli.py copies) so the agent's
shell calls hit fixtures instead of the network.
"""
import argparse
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile

from adapters import ADAPTERS
from adapters import COMMAND_BUILDERS
from adapters import SKILL_PROMPT_BUILDERS
from checks import CHECK_REGISTRY

DEFAULT_FAKE_COMMANDS = ["glab", "git", "date"]
FAKE_CLI_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fake_cli.py")


def build_arg_parser():
    """Returns the CLI argument parser."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill", required=True, help="Path to the skill directory")
    parser.add_argument("--models", default="claude-sonnet-5", help="Comma-separated model names")
    parser.add_argument("--adapter", default="claude", choices=sorted(ADAPTERS))
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument(
        "--no-skill", action="store_true", help="Run prompts without loading the skill"
    )
    parser.add_argument("--cases", default="", help="Comma-separated case ids to run (default all)")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the agent CLI argv per case/model and exit"
    )
    parser.add_argument(
        "--artifacts-dir",
        default="/tmp/skill-eval-artifacts",
        help="Directory receiving the transcript and call log of each failing trial",
    )
    parser.add_argument(
        "--workdir-root",
        default=None,
        help="Parent directory for trial workdirs (default: <skill>/evals/.runs, which satisfies"
        " the codex wrapper's requirement that the cwd lives inside /mnt/persistent/ff)",
    )
    return parser


def load_cases(skill_dir, case_ids):
    """Returns the (filtered) list of case dicts from <skill>/evals/cases.json."""
    cases_path = os.path.join(skill_dir, "evals", "cases.json")
    with open(cases_path) as cases_file:
        cases = json.load(cases_file)
    # Long prompts may be stored as lists of strings (joined with spaces) to satisfy the
    # 100-column line limit in cases.json.
    for case in cases:
        for key, value in case.items():
            if key.startswith("prompt") and isinstance(value, list):
                case[key] = " ".join(value)
    if case_ids:
        wanted = set(case_ids)
        cases = [case for case in cases if case["id"] in wanted]
        missing = wanted - {case["id"] for case in cases}
        if missing:
            sys.exit(f"Unknown case ids: {', '.join(sorted(missing))}")
    return cases


def prepare_workdir(workdir, skill_dir, case, is_skill_loaded):
    """Populates the trial workdir (fake bin dir, skill symlink) and returns the trial env."""
    bin_dir = os.path.join(workdir, "bin")
    os.makedirs(bin_dir)
    # Passthrough commands (e.g. python3, bash) are logged by the fake but re-exec the real
    # command, so a case can assert scripts were not invoked via interpreter prefixes.
    passthrough_commands = case.get("passthrough_commands", [])
    faked_commands = case.get("fake_commands", DEFAULT_FAKE_COMMANDS) + passthrough_commands
    for command_name in faked_commands:
        target_path = os.path.join(bin_dir, command_name)
        shutil.copy(FAKE_CLI_PATH, target_path)
        os.chmod(target_path, 0o755)
    fixtures_root = os.path.join(skill_dir, "evals", "fixtures")
    fixtures_dir = (
        os.path.join(fixtures_root, case["fixtures"]) if case.get("fixtures") else fixtures_root
    )
    if is_skill_loaded:
        # Different agent CLIs (and codex versions) scan different skill dirs; link all three.
        for config_dir in (".claude", ".agents", ".codex"):
            skill_link_dir = os.path.join(workdir, config_dir, "skills")
            os.makedirs(skill_link_dir)
            os.symlink(skill_dir, os.path.join(skill_link_dir, os.path.basename(skill_dir)))
    env = dict(os.environ)
    env["PATH"] = bin_dir + os.pathsep + env.get("PATH", "")
    env["FAKE_CLI_LOG"] = os.path.join(workdir, "fake_cli_log.jsonl")
    env["FAKE_CLI_FIXTURES"] = fixtures_dir
    env["FAKE_CLI_PASSTHROUGH"] = ",".join(passthrough_commands)
    return env


def read_call_log(log_path):
    """Returns the parsed fake-CLI call log entries, or [] when no call was made."""
    if not os.path.exists(log_path):
        return []
    with open(log_path) as log_file:
        return [json.loads(line) for line in log_file if line.strip()]


def save_failure_artifacts(artifacts_dir, case, model, trial_index, result, call_log):
    """Writes the failing trial's transcript and fake-CLI call log; returns the file path."""
    os.makedirs(artifacts_dir, exist_ok=True)
    artifact_path = os.path.join(artifacts_dir, f"{case['id']}_{model}_trial{trial_index + 1}.txt")
    with open(artifact_path, "w") as artifact_file:
        artifact_file.write("=== transcript ===\n")
        artifact_file.write(result.transcript)
        artifact_file.write("\n\n=== fake CLI calls ===\n")
        for entry in call_log:
            artifact_file.write(json.dumps(entry) + "\n")
    return artifact_path


def resolve_prompt(case, adapter_name, skill_name, is_skill_loaded):
    """Returns the trial prompt, translating the explicit slash invocation per adapter.

    Case prompts must start with "/<skill-name> " so the invocation is visible in cases.json.
    Adapters translate that into their own idiom (claude keeps the slash command verbatim);
    --no-skill baselines get the bare task with the invocation stripped.
    """
    prefix = f"/{skill_name} "
    if not case["prompt"].startswith(prefix):
        sys.exit(f"Case {case['id']}: prompt must start with '{prefix}'")
    request = case["prompt"][len(prefix) :]
    if not is_skill_loaded:
        return request
    return SKILL_PROMPT_BUILDERS[adapter_name](skill_name, request)


def resolve_workdir_root(workdir_root_arg, skill_dir):
    """Returns the (created) parent directory for trial workdirs.

    Defaults to a gitignored .runs dir under the skill's evals directory: the codex org wrapper
    refuses to run outside /mnt/persistent/ff, and using one location for every adapter keeps
    trial behavior uniform.
    """
    workdir_root = workdir_root_arg or os.path.join(skill_dir, "evals", ".runs")
    os.makedirs(workdir_root, exist_ok=True)
    return workdir_root


def run_trial(adapter, adapter_name, case, model, skill_dir, workdir_root, is_skill_loaded):
    """Runs one trial and returns (passed, notes, result_or_none, call_log, error_or_none)."""
    with tempfile.TemporaryDirectory(prefix="skill-eval-", dir=workdir_root) as workdir:
        env = prepare_workdir(workdir, skill_dir, case, is_skill_loaded)
        prompt = resolve_prompt(case, adapter_name, os.path.basename(skill_dir), is_skill_loaded)
        try:
            result = adapter(prompt, model, workdir, env)
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            return False, [], None, [], f"{type(error).__name__}: {error}"
        call_log = read_call_log(env["FAKE_CLI_LOG"])
        notes = []
        passed = True
        for check in case["checks"]:
            check_args = {
                key: value for key, value in check.items() if key not in ("type", "expect")
            }
            check_passed, note = CHECK_REGISTRY[check["type"]](
                check_args, result.transcript, call_log
            )
            passed = passed and check_passed
            expectation = check.get("expect", check["type"])
            notes.append(f"[{'PASS' if check_passed else 'FAIL'}] {expectation} ({note})")
        return passed, notes, result, call_log, None


def format_mean(values):
    """Returns the mean of the non-None values formatted to one decimal, or '-'."""
    known_values = [value for value in values if value is not None]
    return f"{statistics.mean(known_values):.1f}" if known_values else "-"


def main():
    """Runs every selected case x model x trial and prints the summary table."""
    args = build_arg_parser().parse_args()
    skill_dir = os.path.abspath(args.skill)
    case_ids = [case_id for case_id in args.cases.split(",") if case_id]
    cases = load_cases(skill_dir, case_ids)
    adapter = ADAPTERS[args.adapter]
    models = [model for model in args.models.split(",") if model]
    if args.dry_run:
        build_command = COMMAND_BUILDERS[args.adapter]
        skill_name = os.path.basename(skill_dir)
        for case in cases:
            for model in models:
                prompt = resolve_prompt(case, args.adapter, skill_name, not args.no_skill)
                print(f"{case['id']} [{model}]: {build_command(prompt, model)}")
        sys.exit(0)
    workdir_root = resolve_workdir_root(args.workdir_root, skill_dir)
    rows = []
    has_failing_case = False
    for case in cases:
        if case.get("title"):
            print(f"\n## {case['id']}: {case['title']}", flush=True)
        for model in models:
            passes = 0
            token_totals = []
            durations = []
            for trial_index in range(args.trials):
                passed, notes, result, call_log, error = run_trial(
                    adapter, args.adapter, case, model, skill_dir, workdir_root, not args.no_skill
                )
                if error:
                    print(f"{case['id']} [{model}] trial {trial_index + 1}: ERROR {error}")
                else:
                    for note in notes:
                        print(f"{case['id']} [{model}] trial {trial_index + 1}: {note}")
                    tokens = (result.tokens_in or 0) + (result.tokens_out or 0)
                    token_totals.append(tokens if result.tokens_in is not None else None)
                    durations.append(result.duration_s)
                    print(
                        f"{case['id']} [{model}] trial {trial_index + 1}: "
                        f"{'PASS' if passed else 'FAIL'} ({result.duration_s:.1f}s, "
                        f"{tokens} tokens)",
                        flush=True,
                    )
                    if not passed:
                        artifact_path = save_failure_artifacts(
                            args.artifacts_dir, case, model, trial_index, result, call_log
                        )
                        print(f"    transcript saved: {artifact_path}", flush=True)
                passes += passed
            if passes == 0:
                has_failing_case = True
            rows.append(
                (
                    case["id"],
                    model,
                    f"{passes}/{args.trials}",
                    format_mean(token_totals),
                    format_mean(durations),
                )
            )
    header = ("case", "model", "passed", "mean tokens", "mean duration (s)")
    widths = [max(len(str(row[i])) for row in rows + [header]) for i in range(len(header))]
    print()
    for row in [header] + rows:
        print("  ".join(str(cell).ljust(width) for cell, width in zip(row, widths)))
    sys.exit(1 if has_failing_case else 0)


if __name__ == "__main__":
    main()

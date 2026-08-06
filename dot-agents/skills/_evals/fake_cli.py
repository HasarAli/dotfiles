#!/usr/bin/python3
"""Generic fake CLI used in evals in place of real commands (glab, git, date, ...).

Copied or symlinked into a temp bin dir under the name of the command it fakes. On invocation it:
- appends a JSON line {"cmd": <name>, "argv": [...]} to the file at $FAKE_CLI_LOG,
- resolves a fixture under $FAKE_CLI_FIXTURES/<name>/ by joining the first N non-flag args with
  "_" (N from 3 down to 1), e.g. `glab mr list ...` -> glab/mr_list.json, falling back to
  <name>/default.txt,
- prints the fixture contents to stdout and exits 0. A miss prints nothing, exits 0, and marks
  the log line with "miss": true.

Commands listed in $FAKE_CLI_PASSTHROUGH (comma-separated) are logged but not faked: the call is
re-executed with the real command found later on PATH, so interpreters like python3/bash can be
observed without breaking them. The absolute shebang above keeps a passthrough python3 copy from
resolving to itself.
"""
import json
import os
import sys


def find_real_command_path(name: str) -> str | None:
    """Returns the first executable named `name` on PATH outside this fake's own directory."""
    own_dir = os.path.dirname(os.path.abspath(__file__))
    for path_dir in os.environ.get("PATH", "").split(os.pathsep):
        if path_dir and os.path.abspath(path_dir) != own_dir:
            candidate_path = os.path.join(path_dir, name)
            if os.path.isfile(candidate_path) and os.access(candidate_path, os.X_OK):
                return candidate_path
    return None


def find_fixture_path(fixtures_dir: str, name: str, args: list[str]) -> str | None:
    """Returns the fixture file path for the invoked command, or None when nothing matches."""
    command_dir = os.path.join(fixtures_dir, name)
    non_flag_args = [arg for arg in args if not arg.startswith("-")]
    for arg_count in range(min(3, len(non_flag_args)), 0, -1):
        stem = "_".join(non_flag_args[:arg_count])
        for extension in (".json", ".txt"):
            candidate_path = os.path.join(command_dir, stem + extension)
            if os.path.isfile(candidate_path):
                return candidate_path
    default_path = os.path.join(command_dir, "default.txt")
    if os.path.isfile(default_path):
        return default_path
    return None


def main():
    """Logs the invocation, then prints the matching fixture or execs the real command."""
    name = os.path.basename(sys.argv[0])
    args = sys.argv[1:]
    passthrough_names = os.environ.get("FAKE_CLI_PASSTHROUGH", "")
    is_passthrough = name in [entry for entry in passthrough_names.split(",") if entry]
    fixtures_dir = os.environ.get("FAKE_CLI_FIXTURES", "")
    fixture_path = None
    if fixtures_dir and not is_passthrough:
        fixture_path = find_fixture_path(fixtures_dir, name, args)
    log_entry = {"cmd": name, "argv": args}
    if is_passthrough:
        log_entry["passthrough"] = True
    elif fixture_path is None:
        log_entry["miss"] = True
    log_path = os.environ.get("FAKE_CLI_LOG")
    if log_path:
        with open(log_path, "a") as log_file:
            log_file.write(json.dumps(log_entry) + "\n")
    if is_passthrough:
        real_command_path = find_real_command_path(name)
        if real_command_path is None:
            sys.exit(127)
        os.execv(real_command_path, [real_command_path, *args])
    if fixture_path is not None:
        with open(fixture_path) as fixture_file:
            sys.stdout.write(fixture_file.read())
    sys.exit(0)


if __name__ == "__main__":
    main()

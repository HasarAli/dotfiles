"""Check functions used by run_evals.py to grade a trial's transcript and fake-CLI call log."""
import re


def check_output_matches(args, transcript, call_log):
    """Passes when the transcript matches the regex in args["pattern"]."""
    pattern = args["pattern"]
    if re.search(pattern, transcript, re.I | re.S):
        return True, f"transcript matches /{pattern}/"
    return False, f"transcript does not match /{pattern}/"


def check_output_not_matches(args, transcript, call_log):
    """Passes when the transcript does not match the regex in args["pattern"]."""
    passed, note = check_output_matches(args, transcript, call_log)
    return not passed, note


def check_command_ran(args, transcript, call_log):
    """Passes when a logged call matches args["cmd"] and the args["argv_pattern"] regex."""
    cmd = args["cmd"]
    argv_pattern = args.get("argv_pattern", "")
    for entry in call_log:
        if entry.get("cmd") != cmd:
            continue
        if re.search(argv_pattern, " ".join(entry.get("argv", []))):
            return True, f"{cmd} ran with argv matching /{argv_pattern}/"
    return False, f"no {cmd} call matched /{argv_pattern}/"


def check_command_not_ran(args, transcript, call_log):
    """Passes when no logged call matches args["cmd"] and args["argv_pattern"]."""
    passed, note = check_command_ran(args, transcript, call_log)
    return not passed, note


CHECK_REGISTRY = {
    "output_matches": check_output_matches,
    "output_not_matches": check_output_not_matches,
    "command_ran": check_command_ran,
    "command_not_ran": check_command_not_ran,
}

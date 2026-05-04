#!/usr/bin/env python3
"""Generic tmux notifier: sets `@notify_state`, rings the bell, refreshes title.

Surfaces a notification on a target tmux window. Sets the per-window
`@notify_state` user option so format strings (window-status pill, OSC 2
title prefix) can branch on it. Optionally rings the pane TTY bell.
Spawns `update_terminal_title.py` to push a fresh OSC 2 title to every
client attached to the target window's session.

Caller picks the state tag. Well-known tags are `done` and `needs-input`,
which the format strings render as `✓` and `?` respectively. Other tags
are stored but produce no marker.

No-ops when `$TMUX` is unset. When the target window is currently
focused (signalled by the `@is_window_focused` per-window option set by
tmux.conf's `pane-focus-in`/`pane-focus-out` hooks), the state write and
bell are suppressed but the title is still refreshed — so any stale
marker for the focused window (e.g. left over from a race with the
focus-in hook) gets cleared. No env-based opt-out and no client-specific
checks live here — those belong to caller-side wrappers (e.g.
`claude_state_alert.py`).

See //tools/tmux/README.md for the tmux.conf wiring (focus-events, pill
format, focus-in hook) needed to make the per-window state and OSC 2
title clear automatically.

Invocation:

    tmux_notify.py --window "@3" --state needs-input
"""
import argparse
import os
import subprocess

TMUX_COMMAND_TIMEOUT_SECONDS = 2
BELL_CHARACTER = b"\a"
NOTIFY_STATE_OPTION = "@notify_state"
IS_WINDOW_FOCUSED_OPTION = "@is_window_focused"
UPDATE_TERMINAL_TITLE_SCRIPT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "update_terminal_title.py"
)


def _run_tmux(tmux_arguments: list[str]) -> str:
    """Runs `tmux <tmux_arguments>` and returns trimmed stdout, or '' on failure."""
    try:
        subprocess_result = subprocess.run(
            ["tmux"] + tmux_arguments,
            capture_output=True,
            text=True,
            timeout=TMUX_COMMAND_TIMEOUT_SECONDS,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    if subprocess_result.returncode != 0:
        return ""
    return subprocess_result.stdout.strip()


def _get_window_pane_tty_and_session_id(window_id: str) -> tuple[str, str]:
    """Returns the active pane TTY path and session id for the given window."""
    pane_tty_path = _run_tmux(["display-message", "-p", "-t", window_id, "#{pane_tty}"])
    session_id = _run_tmux(["display-message", "-p", "-t", window_id, "#{session_id}"])
    return pane_tty_path, session_id


def _set_tmux_window_notify_state(window_id: str, state: str) -> None:
    """Stores the state on the window so format strings can branch on it."""
    _run_tmux(["set-option", "-w", "-t", window_id, NOTIFY_STATE_OPTION, state])


def _is_target_window_focused(window_id: str) -> bool:
    """Returns True iff `@is_window_focused` is set to "1" on the target window."""
    return _run_tmux(["show-options", "-wqv", "-t", window_id, IS_WINDOW_FOCUSED_OPTION]) == "1"


def _ring_pane_tty_bell(pane_tty_path: str) -> None:
    """Writes a bell character to the pane tty and ignores write failures."""
    try:
        with open(pane_tty_path, "wb") as pane_tty_file:
            pane_tty_file.write(BELL_CHARACTER)
    except OSError:
        return


def _refresh_terminal_title(session_id: str) -> None:
    """Spawns update_terminal_title.py to push a fresh OSC 2 title for the session."""
    try:
        subprocess.run(
            [UPDATE_TERMINAL_TITLE_SCRIPT_PATH, "--session-id", session_id],
            timeout=TMUX_COMMAND_TIMEOUT_SECONDS,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return


def main() -> None:
    """Sets the notifier state on a window and surfaces it via bell + title."""
    parser = argparse.ArgumentParser(description="Surface a tmux notification on a window.")
    parser.add_argument(
        "--window",
        required=True,
        help="Target tmux window id (e.g. @3).",
    )
    parser.add_argument(
        "--state",
        required=True,
        help="State tag to store in `@notify_state` (well-known: done, needs-input).",
    )
    parser.add_argument(
        "--no-bell",
        action="store_true",
        help="Skip writing the bell character to the pane TTY.",
    )
    parsed_args = parser.parse_args()

    if not os.environ.get("TMUX"):
        return

    pane_tty_path, session_id = _get_window_pane_tty_and_session_id(parsed_args.window)

    if not _is_target_window_focused(parsed_args.window):
        _set_tmux_window_notify_state(parsed_args.window, parsed_args.state)
        if not parsed_args.no_bell and pane_tty_path:
            _ring_pane_tty_bell(pane_tty_path)

    if session_id:
        _refresh_terminal_title(session_id)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Refreshes the terminal title to reflect notifier state across windows.

Walks every window in the session: each window whose `@notify_state` user
option is set to a known state contributes a marker (`?<idx>` for needs-input,
`✓<idx>` for done) to a parenthesized prefix on the OSC 2 title. The caller's
tmux hooks (pane-focus-in/out, session-window-changed) clear `@notify_state`
on the source/destination window before refreshing, so markers drop off as
the user visits each window.

Title format: `(<markers>) <current_idx>:<current_name>` — e.g. `(?2,✓3) 1:bash`.
When no windows are flagged, just `<current_idx>:<current_name>`.

Pushes OSC 2 to every attached client's TTY. Whatever client is attached
gets retitled — web terminals (ttyd) update the browser tab, native
xterm/iTerm update the window title.

Invoke from tmux hooks (pane-focus-in/out, session-window-changed) and from
tmux_notify.py after setting the per-window state. See tmux_notify.py
docstring for an example tmux.conf wiring.
"""
import argparse
import os
import subprocess

TMUX_COMMAND_TIMEOUT_SECONDS = 2
NOTIFY_STATE_OPTION = "@notify_state"
STATE_SYMBOLS_BY_STATE = {
    "done": "✓",
    "needs-input": "?",
}


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


def _resolve_session_id(provided_session_id: str) -> str:
    """Returns the session id from the arg, else derives it from $TMUX_PANE."""
    if provided_session_id:
        return provided_session_id
    pane_id = os.environ.get("TMUX_PANE")
    if not pane_id:
        return ""
    return _run_tmux(["display-message", "-p", "-t", pane_id, "#{session_id}"])


def _build_marker_prefix(session_id: str) -> str:
    """Returns `(<markers>) ` for windows with `@notify_state` set, else ''.

    Markers are emitted in window-index order. The symbol is `✓` for `done`
    and `?` for `needs-input`. Windows with an unset or unknown state are
    skipped, so non-notifier bells (or stray option values) don't surface here.
    """
    list_format = f"#{{window_index}}|#{{{NOTIFY_STATE_OPTION}}}"
    list_output = _run_tmux(["list-windows", "-t", session_id, "-F", list_format])
    markers: list[str] = []
    for line in list_output.splitlines():
        index_field, _, state = line.partition("|")
        symbol = STATE_SYMBOLS_BY_STATE.get(state)
        if symbol is None:
            continue
        markers.append(f"{symbol}{index_field}")
    if not markers:
        return ""
    return f"({','.join(markers)}) "


def _get_active_window_label(session_id: str) -> str:
    """Returns `<index>:<name>` for the session's active window."""
    return _run_tmux(
        [
            "display-message",
            "-p",
            "-t",
            session_id,
            "#{window_index}:#{window_name}",
        ]
    )


def update_terminal_title(session_id: str) -> None:
    """Pushes a fresh OSC 2 title to every client attached to the session."""
    active_window_label = _get_active_window_label(session_id)
    if not active_window_label:
        return
    title = f"{_build_marker_prefix(session_id)}{active_window_label}"
    osc_sequence = f"\033]2;{title}\a".encode()
    client_ttys_output = _run_tmux(["list-clients", "-t", session_id, "-F", "#{client_tty}"])
    for client_tty_path in client_ttys_output.splitlines():
        if not client_tty_path:
            continue
        try:
            with open(client_tty_path, "wb") as client_tty_file:
                client_tty_file.write(osc_sequence)
        except OSError:
            continue


def main() -> None:
    """Refreshes the terminal title for the resolved session."""
    parser = argparse.ArgumentParser(
        description="Retitle every client attached to a tmux session via OSC 2."
    )
    parser.add_argument(
        "--session-id",
        default="",
        help="Tmux session id. Defaults to the session of $TMUX_PANE.",
    )
    parsed_args = parser.parse_args()

    session_id = _resolve_session_id(parsed_args.session_id)
    if not session_id:
        return
    update_terminal_title(session_id)


if __name__ == "__main__":
    main()

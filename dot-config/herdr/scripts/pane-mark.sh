#!/usr/bin/env bash
# tmux-style mark + join-pane for herdr.
#
#   pane-mark.sh mark          toggle the mark on the focused pane
#   pane-mark.sh join right    move the marked pane beside the focused pane
#   pane-mark.sh join down     move the marked pane below the focused pane
#
# Keybound commands get no pane context, so the focused pane comes from the API.
set -euo pipefail

herdr=${HERDR_BIN_PATH:-herdr}
state=/tmp/herdr-marked-pane

# Prints "<pane_id> <tab_id>".
focused_pane() {
  "$herdr" pane list | jq -r '.result.panes[] | select(.focused) | "\(.pane_id) \(.tab_id)"'
}

notify() {
  "$herdr" notification show "$@" >/dev/null
}

pane_exists() {
  "$herdr" pane get "$1" >/dev/null 2>&1
}

# The 📌 prefix is the only visible sign of a mark, so restore the old label
# whenever the mark goes away.
clear_mark() {
  local pane=$1 label=$2
  if [[ -n $label ]]; then
    "$herdr" pane rename "$pane" "$label" >/dev/null
  else
    "$herdr" pane rename "$pane" --clear >/dev/null
  fi
  rm -f "$state"
}

read_mark() {
  IFS=$'\t' read -r marked label <"$state"
}

mark() {
  local pane marked label
  read -r pane _ < <(focused_pane)
  if [[ -f $state ]]; then
    read_mark
    if pane_exists "$marked"; then
      clear_mark "$marked" "$label"
    else
      rm -f "$state"
    fi
    [[ $marked == "$pane" ]] && return
  fi
  label=$("$herdr" pane get "$pane" | jq -r '.result.pane.label // empty')
  printf '%s\t%s\n' "$pane" "$label" >"$state"
  "$herdr" pane rename "$pane" "📌${label:+ $label}" >/dev/null
}

join() {
  local direction=$1 target tab marked label
  if [[ ! -f $state ]]; then
    notify "No marked pane" --body "Mark one with prefix+m first"
    return 1
  fi
  read_mark
  if ! pane_exists "$marked"; then
    rm -f "$state"
    notify "Marked pane is gone"
    return 1
  fi
  read -r target tab < <(focused_pane)
  if [[ $marked == "$target" ]]; then
    notify "Can't join a pane to itself"
    return 1
  fi
  clear_mark "$marked" "$label"
  if ! err=$("$herdr" pane move "$marked" --tab "$tab" --target-pane "$target" --split "$direction" --focus 2>&1 >/dev/null); then
    notify "Join failed" --body "$err"
    return 1
  fi
}

case ${1:-} in
  mark) mark ;;
  join) join "${2:?right or down}" ;;
  *)
    echo "usage: $0 mark | join right|down" >&2
    exit 2
    ;;
esac

#!/bin/bash
# Claude Code statusLine: dir | branch | model | context tokens | 5h/7d limit left
input=$(cat)

DIR=$(jq -r '.workspace.current_dir' <<<"$input")
MODEL=$(jq -r '.model.display_name' <<<"$input")
IN_TOK=$(jq -r '.context_window.total_input_tokens // 0' <<<"$input")
OUT_TOK=$(jq -r '.context_window.total_output_tokens // 0' <<<"$input")
FIVE_H=$(jq -r '.rate_limits.five_hour.used_percentage // empty' <<<"$input")
SEVEN_D=$(jq -r '.rate_limits.seven_day.used_percentage // empty' <<<"$input")
FIVE_H_RESET=$(jq -r '.rate_limits.five_hour.resets_at // empty' <<<"$input")
SEVEN_D_RESET=$(jq -r '.rate_limits.seven_day.resets_at // empty' <<<"$input")

BRANCH=$(git branch --show-current 2>/dev/null)

fmt_eta() {
  local secs=$(( $1 - $(date +%s) ))
  [ "$secs" -lt 0 ] && secs=0
  local d=$((secs / 86400)) h=$(((secs % 86400) / 3600)) m=$(((secs % 3600) / 60))
  if [ "$d" -gt 0 ]; then printf '%dd%dh' "$d" "$h"
  elif [ "$h" -gt 0 ]; then printf '%dh%dm' "$h" "$m"
  else printf '%dm' "$m"
  fi
}

TOK=$((IN_TOK + OUT_TOK))
if [ "$TOK" -ge 1000 ]; then
  TOK_FMT="$(awk -v t="$TOK" 'BEGIN{printf "%.1fk", t/1000}')"
else
  TOK_FMT="${TOK}"
fi

LIMITS=""
if [ -n "$FIVE_H" ]; then
  LIMITS="$([ -n "$FIVE_H_RESET" ] && fmt_eta "$FIVE_H_RESET")"
  LIMITS="${LIMITS}:$(awk -v p="$FIVE_H" 'BEGIN{printf "%.0f", 100-p}')%"
fi
if [ -n "$SEVEN_D" ]; then
  SEVEN_LIM="$([ -n "$SEVEN_D_RESET" ] && fmt_eta "$SEVEN_D_RESET")"
  SEVEN_LIM="${SEVEN_LIM}:$(awk -v p="$SEVEN_D" 'BEGIN{printf "%.0f", 100-p}')%"
  LIMITS="${LIMITS:+$LIMITS }$SEVEN_LIM"
fi

LINE="${DIR##*/}"
[ -n "$BRANCH" ] && LINE="$LINE | $BRANCH"
LINE="$LINE | $MODEL | $TOK_FMT"
[ -n "$LIMITS" ] && LINE="$LINE | $LIMITS"

echo "$LINE"

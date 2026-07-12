#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${COURTGPT_RUNTIME_DIR:-$HOME/Library/Application Support/CourtGPT/congress-tracker-sync/repo}"
CONGRESS_LABEL="com.courtgpt.congress-sync"
US_CODE_LABEL="com.courtgpt.us-code-sync"
DAILY_LABEL="com.courtgpt.daily-legal-publish"
CONGRESS_PLIST="$HOME/Library/LaunchAgents/${CONGRESS_LABEL}.plist"
US_CODE_PLIST="$HOME/Library/LaunchAgents/${US_CODE_LABEL}.plist"
DAILY_PLIST="$HOME/Library/LaunchAgents/${DAILY_LABEL}.plist"

failures=0
check() {
  local label="$1"; shift
  if "$@"; then
    printf 'PASS %s\n' "$label"
  else
    printf 'FAIL %s\n' "$label"
    failures=$((failures + 1))
  fi
}

print_job() {
  local label="$1"
  local plist="$2"
  echo "--- ${label} ---"
  if [[ ! -f "$plist" ]]; then
    echo "missing plist: $plist"
    return 1
  fi
  plutil -lint "$plist" >/dev/null
  launchctl print "gui/$(id -u)/${label}" 2>/dev/null | grep -E 'state =|runs =|last exit code|path =|program =' || true
  return 0
}

echo "CourtGPT local scheduler doctor"
echo "workspace=$ROOT_DIR"
echo "runtime=$RUNTIME_DIR"
echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

check "Congress launchd plist" print_job "$CONGRESS_LABEL" "$CONGRESS_PLIST"
check "U.S. Code launchd plist" print_job "$US_CODE_LABEL" "$US_CODE_PLIST"
check "Daily legal publisher plist" print_job "$DAILY_LABEL" "$DAILY_PLIST"
check "Congress interval is hourly" bash -c "[[ \$(/usr/libexec/PlistBuddy -c 'Print :StartInterval' '$CONGRESS_PLIST' 2>/dev/null || true) == '3600' ]]"
check "Daily publisher is calendar scheduled" bash -c "[[ \$(/usr/libexec/PlistBuddy -c 'Print :StartCalendarInterval:Hour' '$DAILY_PLIST' 2>/dev/null || true) == '2' ]] && [[ \$(/usr/libexec/PlistBuddy -c 'Print :StartCalendarInterval:Minute' '$DAILY_PLIST' 2>/dev/null || true) == '30' ]]"
check "Codex automation directory has no files" bash -c "[[ ! -d \"\$HOME/.codex/automations\" ]] || [[ -z \$(find \"\$HOME/.codex/automations\" -type f ! -name '.run-jitter-salt' -print -quit) ]]"
check "No user crontab" bash -c "! crontab -l >/tmp/courtgpt-crontab-doctor.$$ 2>/dev/null || [[ ! -s /tmp/courtgpt-crontab-doctor.$$ ]]"
rm -f "/tmp/courtgpt-crontab-doctor.$$"
check "Runtime checkout exists" test -d "$RUNTIME_DIR/.git"
if [[ -d "$RUNTIME_DIR/.git" ]]; then
  runtime_sha="$(git -C "$RUNTIME_DIR" rev-parse HEAD 2>/dev/null || true)"
  remote_sha="$(git -C "$RUNTIME_DIR" ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}')"
  echo "runtime_sha=${runtime_sha:-unknown}"
  echo "remote_sha=${remote_sha:-unknown}"
  check "Runtime checkout matches origin/main" test -n "$runtime_sha" -a "$runtime_sha" = "$remote_sha"
fi
check "No active local sync process" bash -c "! pgrep -f 'run-local-(sync|us-code-sync|daily-publish)\.sh' >/dev/null"

if [[ "$failures" -gt 0 ]]; then
  echo "Scheduler doctor failed: $failures check(s)"
  exit 1
fi
echo "Scheduler doctor passed"

#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.courtgpt.congress-sync"
US_CODE_LABEL="com.courtgpt.us-code-sync"
RUNTIME_DIR="${HOME}/Library/Application Support/CourtGPT/congress-tracker-sync"
RUNTIME_REPO="${RUNTIME_DIR}/repo"
PLIST_SOURCE="${ROOT_DIR}/launchd/${LABEL}.plist"
PLIST_TARGET="${HOME}/Library/LaunchAgents/${LABEL}.plist"
US_CODE_PLIST_SOURCE="${ROOT_DIR}/launchd/${US_CODE_LABEL}.plist"
US_CODE_PLIST_TARGET="${HOME}/Library/LaunchAgents/${US_CODE_LABEL}.plist"
DOMAIN="gui/$(id -u)"

if [[ ! -f "${ROOT_DIR}/.env.local" ]]; then
  echo "Missing ${ROOT_DIR}/.env.local; copy .env.local.example and set CONGRESS_API_KEY first" >&2
  exit 1
fi

mkdir -p "${RUNTIME_DIR}"
if [[ ! -d "${RUNTIME_REPO}/.git" ]]; then
  git clone https://github.com/CourtGPT/congress-tracker.git "${RUNTIME_REPO}"
else
  git -C "${RUNTIME_REPO}" fetch origin main
  git -C "${RUNTIME_REPO}" reset --hard origin/main
fi
install -m 600 "${ROOT_DIR}/.env.local" "${RUNTIME_REPO}/.env.local"

mkdir -p "${HOME}/Library/LaunchAgents"
launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
cp "${PLIST_SOURCE}" "${PLIST_TARGET}"
launchctl bootstrap "${DOMAIN}" "${PLIST_TARGET}"
launchctl bootout "${DOMAIN}/${US_CODE_LABEL}" 2>/dev/null || true
cp "${US_CODE_PLIST_SOURCE}" "${US_CODE_PLIST_TARGET}"
launchctl bootstrap "${DOMAIN}" "${US_CODE_PLIST_TARGET}"

echo "Installed ${LABEL} as a macOS user agent"
echo "Runtime clone: ${RUNTIME_REPO}"
echo "Status: launchctl print ${DOMAIN}/${LABEL}"
echo "U.S. Code status: launchctl print ${DOMAIN}/${US_CODE_LABEL}"
echo "Logs: /tmp/courtgpt-congress-sync.log and /tmp/courtgpt-us-code-sync.log"

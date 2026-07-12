#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.courtgpt.congress-sync"
PLIST_SOURCE="${ROOT_DIR}/launchd/${LABEL}.plist"
PLIST_TARGET="${HOME}/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

mkdir -p "${HOME}/Library/LaunchAgents"
launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
cp "${PLIST_SOURCE}" "${PLIST_TARGET}"
launchctl bootstrap "${DOMAIN}" "${PLIST_TARGET}"

echo "Installed ${LABEL} as a macOS user agent"
echo "Status: launchctl print ${DOMAIN}/${LABEL}"
echo "Logs: /tmp/courtgpt-congress-sync.log and /tmp/courtgpt-congress-sync.error.log"

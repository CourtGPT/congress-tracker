#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# The hourly publisher already owns the lock, validation, checksum comparison,
# commit, and push behavior. This daily entry point is a second local launchd
# safety net; if the hourly job has just run, the shared lock or no-op path
# prevents duplicate writes.
exec "${ROOT_DIR}/scripts/run-local-sync.sh"

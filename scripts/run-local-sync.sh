#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="${ROOT_DIR}/.local-sync.lock"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "Congress.gov sync already running; skipping this invocation"
  exit 0
fi
trap 'rmdir "${LOCK_DIR}"' EXIT

cd "${ROOT_DIR}"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${CONGRESS_API_KEY:?Set CONGRESS_API_KEY in the environment or .env.local}"

export CONGRESS="${CONGRESS:-119}"
export CONGRESS_LOOKBACK_HOURS="${CONGRESS_LOOKBACK_HOURS:-6}"
export CONGRESS_SYNC_MODE="${CONGRESS_SYNC_MODE:-hourly}"

if ! [[ "${CONGRESS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "CONGRESS must be a positive integer" >&2
  exit 1
fi
if ! [[ "${CONGRESS_LOOKBACK_HOURS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "CONGRESS_LOOKBACK_HOURS must be a positive integer" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to sync with uncommitted changes in ${ROOT_DIR}" >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Local sync must run from the main branch" >&2
  exit 1
fi

echo "[sync] pulling origin/main"
git pull --ff-only origin main

if [[ -z "${CONGRESS_RESOURCES:-}" && "${CONGRESS_SYNC_MODE}" == "hourly" && ( ! -f data/metadata.json || ! -f data/resources/members.json || ! -f data/derived/index.json || ! -f data/resources/amendments.json || ! -f data/resources/crs-reports.json || ! -f data/resources/bound-congressional-record.json ) ]]; then
  echo "Incomplete snapshot found; running the one-time full bootstrap"
  export CONGRESS_SYNC_MODE=full
fi

echo "[sync] running tests"
npm test
echo "[sync] synchronizing resources, relations, index, and verification"
npm run update
echo "[sync] validating generated data"
npm run validate

if git status --porcelain -- data | grep -q .; then
  if [[ "${CONGRESS_DRY_RUN:-0}" == "1" ]]; then
    echo "Data changes detected; dry run skips commit and push"
  else
    git add data
    git commit -m "chore(data): update Congress.gov records"
    git push origin main
    echo "Published updated Congress.gov data to origin/main"
  fi
else
  echo "Congress.gov data is unchanged; no commit or push needed"
fi

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

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to sync with uncommitted changes in ${ROOT_DIR}" >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Local sync must run from the main branch" >&2
  exit 1
fi

git pull --ff-only origin main

export CONGRESS="${CONGRESS:-119}"
export CONGRESS_LOOKBACK_HOURS="${CONGRESS_LOOKBACK_HOURS:-6}"
export CONGRESS_SYNC_MODE="${CONGRESS_SYNC_MODE:-hourly}"

if [[ ! -f data/resources/bills.json && "${CONGRESS_SYNC_MODE}" == "hourly" ]]; then
  echo "No bill snapshot found; running the one-time full bootstrap"
  export CONGRESS_SYNC_MODE=full
fi

npm test
npm run update
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

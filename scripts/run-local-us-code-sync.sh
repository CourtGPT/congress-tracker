#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="${ROOT_DIR}/.local-sync.lock"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "Another federal-data sync is already running; skipping this invocation"
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

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to sync U.S. Code with uncommitted changes in ${ROOT_DIR}" >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "U.S. Code sync must run from the main branch" >&2
  exit 1
fi

echo "[us-code] pulling origin/main"
git pull --ff-only origin main 2>&1
echo "[us-code] downloading and parsing the current OLRC release"
npm run sync:us-code
echo "[us-code] validating canonical data"
npm run validate

if git status --porcelain -- data/federal-laws | grep -q .; then
  if [[ "${CONGRESS_DRY_RUN:-0}" == "1" ]]; then
    echo "U.S. Code changes detected; dry run skips commit and push"
  else
    git add data/federal-laws
    git commit -m "chore(data): update U.S. Code from OLRC"
    git push origin main
    echo "Published updated U.S. Code data to origin/main"
  fi
else
  echo "U.S. Code data is unchanged; no commit or push needed"
fi

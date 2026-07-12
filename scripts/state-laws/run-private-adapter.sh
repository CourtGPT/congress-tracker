#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIVATE_REPO="${PIONEER_LAW_REPO:-${ROOT_DIR}/../../pioneer-model-training}"
PRIVATE_OUTPUT="${STATE_LAWS_PRIVATE_OUTPUT_DIR:-}"
JURISDICTION="${1:-}"
shift || true

if [[ -z "$JURISDICTION" ]]; then
  echo "usage: $0 <jurisdiction> [scraper arguments...]" >&2
  exit 2
fi
if [[ ! -d "$PRIVATE_REPO" ]]; then
  echo "Private scraper repository not found: $PRIVATE_REPO" >&2
  exit 1
fi
if [[ -z "$PRIVATE_OUTPUT" ]]; then
  echo "STATE_LAWS_PRIVATE_OUTPUT_DIR is required; public repository data output is disabled" >&2
  exit 1
fi
case "$PRIVATE_OUTPUT" in
  "$ROOT_DIR"|"$ROOT_DIR"/*)
    echo "Refusing to write proprietary state-law data inside the public repository" >&2
    exit 1
    ;;
esac
if [[ -n "${LAWS_PG_URL:-}" || -n "${DATABASE_URL:-}" || -n "${PGPASSWORD:-}" ]]; then
  echo "Refusing to run with database credentials in the public adapter bridge; use the private dashboard runner" >&2
  exit 1
fi

declare -A ADAPTERS=(
  [alabama]=scripts/alabama_crawler.py
  [alaska]=scripts/alaska_crawler.py
  [arizona]=scripts/arizona_crawler.py
  [california]=scripts/california_crawler.py
  [florida]=scripts/florida_crawler.py
  [texas]=scripts/texas_crawler.py
  [virginia]=scripts/virginia_crawler.py
  [washington]=scripts/washington_crawler.py
  [wisconsin]=scripts/wisconsin_crawler.py
  [wyoming]=scripts/wyoming_crawler.py
  [district_of_columbia]=scripts/dc_crawler.py
  [guam]=scripts/guam_crawler.py
  [american_samoa]=scripts/americansamoa_crawler.py
  [northern_mariana_islands]=scripts/cnmi_crawler.py
)
SCRIPT="${ADAPTERS[$JURISDICTION]:-}"
if [[ -z "$SCRIPT" || ! -f "$PRIVATE_REPO/$SCRIPT" ]]; then
  echo "No scrubbed public bridge adapter is registered for: $JURISDICTION" >&2
  exit 1
fi

mkdir -p "$PRIVATE_OUTPUT"
exec python3 "$PRIVATE_REPO/$SCRIPT" "$@" --output "$PRIVATE_OUTPUT/${JURISDICTION}.jsonl"

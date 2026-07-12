# Congress Tracker

Congress.gov data in deterministic JSON: legislation, members, committees, votes, hearings, chronology, and source-linked relationships.

## Source and Limits

- **Source:** [Congress.gov API v3](https://api.congress.gov/)
- **API key:** `CONGRESS_API_KEY` is required and is never stored in generated data or logs.
- **Rate limit:** Congress.gov documents a 5,000-request/hour limit. The client paginates at 250 records, retries 429 and transient 5xx responses, honors `Retry-After`, and reports request/retry counts.
- **Congress:** `CONGRESS` defaults to `119`.
- **Incremental overlap:** `CONGRESS_LOOKBACK_HOURS` defaults to `6` so a missed hourly run can recover recently updated records.
- **License:** Public Domain for US Government work.

## Repository Structure

```text
congress-tracker/
├── data/
│   ├── resources/                  # Source-aligned Congress.gov JSON arrays
│   ├── derived/index.json          # Chronology and relationship index
│   └── metadata.json               # Source, Congress, counts, and metrics
├── scripts/
│   ├── sync-resources.js           # Top-level Congress.gov collections
│   ├── sync-bill-relations.js      # Sponsor/cosponsor detail cache
│   ├── build-index.js              # Derived entity, relation, and timeline index
│   ├── verify-data.js              # Semantic cross-resource verification
│   ├── validate.js                 # Structural plus semantic validation
│   ├── run-local-sync.sh           # Local publishing entry point
│   ├── install-local-scheduler.sh  # Install the macOS launchd agent
│   └── backfill.js                 # Explicit historical bills/votes backfill
├── test/
└── .github/workflows/update.yml   # Manual recovery workflow; not scheduled
```

## JSON Contract

### Source-aligned resources

Every file in `data/resources/` is a non-empty JSON array from one Congress.gov collection. Records retain Congress.gov fields; the pipeline only canonicalizes object-key and record ordering. Examples include `bills.json`, `members.json`, `committees.json`, `house-votes.json`, `hearings.json`, and `bill-relations.json`.

`bill-relations.json` contains normalized detail links with fields such as:

```json
{
  "billId": "119:hr:1",
  "memberId": "M000001",
  "memberName": "Member, One",
  "role": "cosponsor",
  "congress": 119,
  "billUrl": "https://api.congress.gov/v3/bill/119/hr/1?format=json",
  "sourceUrl": "https://api.congress.gov/v3/bill/119/hr/1/cosponsors"
}
```

Hourly runs fetch sponsor and cosponsor details for bills changed within the overlap window. A complete historical relation backfill is intentionally explicit because fetching two detail endpoints per bill can exceed the hourly API budget. Run it in bounded batches with `CONGRESS_RELATIONS_MODE=full`, `CONGRESS_RELATIONS_MAX_BILLS`, and an increasing `CONGRESS_RELATIONS_OFFSET`.

### Derived index

`data/derived/index.json` is consumer-oriented and does not duplicate complete source records. It contains:

- `entities`: compact members, bills, committees, votes, and hearings keyed by stable IDs.
- `relationships`: typed links such as `sponsored`, `cosponsored`, `referred_to`, `voted_on`, and `scheduled_for` when Congress.gov exposes enough source data.
- `timeline`: introduction, update, action, vote, hearing, and other dated events sorted chronologically with stable tie-breakers.
- `source`, `generatedAt`, and `counts` for provenance and inspection.

All derived IDs are strings. Dates are normalized to ISO 8601 UTC timestamps. Missing optional values are `null`, not fabricated. Every relationship retains a Congress.gov or Congress.gov API source URL.

Members and representative information are the records returned by Congress.gov, including bioguide IDs, names, party, state, district, chamber, and source links when provided. The verifier rejects duplicate identities, cross-Congress records, chamber/type mismatches, invalid source URLs, impossible date order, and relationships that point to unknown entities.

## Setup

```bash
npm ci
cp .env.local.example .env.local
# Edit .env.local and set CONGRESS_API_KEY.
```

The default configuration synchronizes all stable JSON collections in the active catalog. Congress.gov exposes bill summaries and CRS reports through routes that do not return stable JSON collections for this client; the historical Congressional Record routes also exceeded the bounded bootstrap window. Those routes are intentionally excluded rather than represented by fabricated or partial exports. Use `CONGRESS_RESOURCES` only for a targeted recovery run, for example:

```bash
CONGRESS_RESOURCES=bills npm run update
```

## Commands

```bash
npm test              # API, merge, relation, index, and verification fixtures
npm run validate      # JSON shape plus semantic cross-resource checks
npm run verify        # Semantic verification only
npm run build:index   # Rebuild data/derived/index.json from local resources
npm run update        # Fetch, derive, and verify without the publishing wrapper
npm run sync:local   # Full hourly-safe sync and generated-data publication
```

For a non-publishing rehearsal:

```bash
CONGRESS_DRY_RUN=1 npm run sync:local
```

For a bounded historical sponsor/cosponsor batch:

```bash
CONGRESS_RELATIONS_MODE=full \
CONGRESS_RELATIONS_MAX_BILLS=250 \
CONGRESS_RELATIONS_OFFSET=0 \
npm run update
```

Increase the offset by 250 for the next batch. Review request metrics and run `npm run verify` after each batch.

## Hourly Operation

The canonical publisher is `scripts/run-local-sync.sh`. It:

1. Loads `.env.local` and validates the API key, Congress, and lookback settings.
2. Refuses to run over uncommitted work or a non-`main` branch.
3. Pulls `origin/main` fast-forward-only.
4. Automatically performs a full resource bootstrap when the snapshot is incomplete.
5. Runs tests, resource sync, incremental bill relations, index generation, and semantic verification.
6. Commits and pushes only `data/` when generated data changed, unless `CONGRESS_DRY_RUN=1` is set.

The macOS `launchd` user agent is the only recurring scheduler. Codex automation is not required. GitHub Actions is manual recovery only. Install the system agent with:

```bash
npm run scheduler:install
```

The installer creates a dedicated runtime clone under `~/Library/Application Support/CourtGPT/congress-tracker-sync`, outside macOS Desktop privacy restrictions. The agent runs at load and every hour from that clone, reads its `0600` `.env.local`, writes logs to `/tmp/courtgpt-congress-sync.log` and `/tmp/courtgpt-congress-sync.error.log`, and pushes only validated data changes. Inspect it with `launchctl print gui/$(id -u)/com.courtgpt.congress-sync`.

## Recovery

- Missing key: set `CONGRESS_API_KEY` in `.env.local`; the runner fails before network work.
- Incomplete snapshot: remove the resource filter and rerun; the runner selects full bootstrap automatically.
- Failed validation: inspect the bounded verification errors, correct the data or configuration, then rerun from a clean worktree.
- Rate limiting: keep the six-hour overlap, allow retries to finish, and use targeted resources or bounded relation batches when recovering.
- Historical bills and votes: use `node scripts/backfill.js --start=114 --end=119` with a valid key.

## Disclaimer

This dataset is for informational and research purposes. Review the linked [Congress.gov](https://www.congress.gov/) source record for authoritative details.

# Congress Tracker

Congress.gov data in deterministic JSON: legislation, members, committees, votes, hearings, chronology, and source-linked relationships.

## Source and Limits

- **Source:** [Congress.gov API v3](https://api.congress.gov/)
- **API key:** `CONGRESS_API_KEY` is required and is never stored in generated data or logs.
- **Rate limit:** Congress.gov documents a 5,000-request/hour limit. The client paginates at 250 records, retries 429 and transient 5xx responses, honors `Retry-After`, and reports request/retry counts.
- **Congress:** `CONGRESS` defaults to `119`.
- **Incremental overlap:** `CONGRESS_LOOKBACK_HOURS` defaults to `6` so a missed hourly run can recover recently updated records.
- **License:** Public Domain for US Government work.

The shared legal-data contract is documented in [`schema/legal-node.schema.json`](schema/legal-node.schema.json) and [`schema/source-manifest.schema.json`](schema/source-manifest.schema.json). State administrative-code publication is source-gated: [`data/manifests/state-administrative-codes.json`](data/manifests/state-administrative-codes.json) remains empty until each candidate source passes a live probe, count check, freshness check, and terms review. The research matrix and training profile are maintained in the private [`pioneer-model-training`](https://github.com/CourtGPT/pioneer-model-training) repository.

See [`docs/awesome-legal-data/README.md`](docs/awesome-legal-data/README.md) for the maintained open legal-data catalog. Justia and other secondary sites may support discovery and citation cross-checks, but are never authoritative replacement text.

State and territory statutory data is proprietary and remains outside this public repository. The code-only boundary in [`scripts/state-laws/`](scripts/state-laws/) can invoke approved private adapters, but the `.gitignore` rules and runner guard prevent private JSON/JSONL, databases, checkpoints, browser profiles, or credentials from entering this repository.

## Repository Structure

```text
congress-tracker/
├── data/
│   ├── resources/                  # Source-aligned Congress.gov JSON arrays
│   ├── congress/119/catalog.json   # Resource-family map for the 119th Congress
│   ├── derived/index.json          # Chronology and relationship index
│   ├── federal-laws/us-code/       # OLRC title indexes plus native hierarchy tree
│   └── metadata.json               # Source, Congress, counts, and metrics
├── scripts/
│   ├── sync-resources.js           # Top-level Congress.gov collections
│   ├── sync-bill-relations.js      # Sponsor/cosponsor detail cache
│   ├── build-index.js              # Derived entity, relation, and timeline index
│   ├── verify-data.js              # Semantic cross-resource verification
│   ├── validate.js                 # Structural plus semantic validation
│   ├── run-local-sync.sh           # Local publishing entry point
│   ├── run-local-us-code-sync.sh   # Weekly OLRC publishing entry point
│   ├── run-local-daily-publish.sh  # Daily local GitHub publisher safety net
│   ├── sync-us-code.sh              # Download and parse the current OLRC release
│   ├── install-local-scheduler.sh  # Install the macOS launchd agent
│   └── backfill.js                 # Explicit historical bills/votes backfill
├── scripts/state-laws/              # Code-only bridge; proprietary state data stays private
├── test/
└── .github/workflows/update.yml   # Manual recovery workflow; not scheduled
```

## JSON Contract

### Source-aligned resources

Every file in `data/resources/` is a non-empty JSON array from one Congress.gov collection. Records retain Congress.gov fields; the pipeline only canonicalizes object-key and record ordering. Examples include `bills.json`, `members.json`, `committees.json`, `house-votes.json`, `hearings.json`, and `bill-relations.json`.

Congress.gov is resource-oriented rather than a statutory hierarchy, so those exports remain grouped by source family under `data/resources/`. Enacted laws are additionally split into individual files under `data/congress/119/legislation/laws/`; public and private laws use distinct filenames, so one changed law produces one focused JSON diff. Federal codified law is different: `data/federal-laws/us-code/tree/` mirrors the OLRC hierarchy with title/chapter/section directories. Each section `index.json` contains its nested subsections, paragraphs, subparagraphs, clauses, text, notes, hierarchy identifiers, and official OLRC URL. The title-level `title-*.json` files are compact indexes and do not duplicate section text.

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

The default configuration synchronizes all stable JSON collections in the active catalog, including amendments, CRS reports, and the historical bound Congressional Record. The bound Congressional Record is bootstrap-only because it is a large historical collection. Congress.gov currently reports 93,290 raw bound-record rows, including repeated identical source URLs; the exporter keeps one canonical record per source URL and records the fetched-versus-exported counts in `data/metadata.json`. Bill summaries remain per-bill detail resources rather than a top-level collection; the live pipeline queues them through the bill-detail crawler. The `/congressional-record` route is inspected against `daily-congressional-record` before being exported separately so equivalent issues are not duplicated.

Use `CONGRESS_RESOURCES` only for a targeted recovery run, for example:

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

The macOS `launchd` user agents are the only recurring schedulers. Congress.gov runs hourly; the daily publisher runs at 02:30 local time as a checksum/no-op safety net; the large OLRC U.S. Code snapshot runs weekly on Sunday at 01:00 local time. All use the protected runtime clone and shared lock. Codex automation is not required. GitHub Actions is manual recovery only. The federal hierarchy is tracked through Git LFS while each section remains an individual Git path. Install the system agents with:

```bash
npm run scheduler:install
```

The installer creates a dedicated runtime clone under `~/Library/Application Support/CourtGPT/congress-tracker-sync`, outside macOS Desktop privacy restrictions. The agents read their `0600` `.env.local`, write logs to `/tmp/courtgpt-congress-sync.log`, `/tmp/courtgpt-us-code-sync.log`, and `/tmp/courtgpt-daily-legal-publish.log`, and push only validated data changes. Inspect them with `launchctl print gui/$(id -u)/com.courtgpt.congress-sync`, `launchctl print gui/$(id -u)/com.courtgpt.us-code-sync`, and `launchctl print gui/$(id -u)/com.courtgpt.daily-legal-publish`.

## Recovery

- Missing key: set `CONGRESS_API_KEY` in `.env.local`; the runner fails before network work.
- Incomplete snapshot: remove the resource filter and rerun; the runner selects full bootstrap automatically.
- Failed validation: inspect the bounded verification errors, correct the data or configuration, then rerun from a clean worktree.
- Rate limiting: keep the six-hour overlap, allow retries to finish, and use targeted resources or bounded relation batches when recovering.
- Historical bills and votes: use `node scripts/backfill.js --start=114 --end=119` with a valid key.

## Disclaimer

This dataset is for informational and research purposes. Review the linked [Congress.gov](https://www.congress.gov/) source record for authoritative details.

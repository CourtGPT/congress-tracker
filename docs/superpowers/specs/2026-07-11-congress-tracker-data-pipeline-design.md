# Congress Tracker Data Pipeline Design

**Date:** 2026-07-11
**Status:** Approved for implementation, pending written-spec review

## Goal

Maintain a trustworthy, hourly Congress.gov dataset that is entirely JSON, easy to inspect, chronologically useful, and explicit about relationships among members, legislation, committees, hearings, and votes. The repository remains a data pipeline and documentation project; it does not add a browser frontend in this phase.

## Scope

### In scope

- Reliable hourly local synchronization using the existing Codex automation and `scripts/run-local-sync.sh`.
- Explicit API-key preflight, bounded retries, rate-limit-aware request behavior, and actionable failure output.
- Source-aligned JSON exports in `data/resources/`.
- A deterministic derived JSON index for cross-resource relationships and chronological navigation.
- Verification of JSON shape, stable identifiers, Congress/chamber consistency, date ordering, source URLs, duplicate records, and references between members, bills, committees, and votes.
- Tests using fixtures for happy paths, malformed data, missing references, duplicate identities, and API failure responses.
- README documentation covering setup, scheduling, data semantics, relationships, verification, dry runs, recovery, and API-key requirements.

### Out of scope

- A new web or desktop user interface.
- Independent reconciliation against non-Congress.gov sources. Congress.gov remains authoritative for this dataset; external reconciliation can be a later project.
- Automatic historical rebackfill on every hourly run.
- Committing or pushing changes as part of implementation unless explicitly requested. The existing runner may publish generated data as its defined operational behavior.

## Data Contract

`data/resources/*.json` remains source-aligned: each file contains a non-empty JSON array of records from one Congress.gov collection, normalized only for deterministic key ordering and record ordering. Raw fields are not silently renamed or discarded.

`data/derived/index.json` is a generated, consumer-oriented JSON document. It contains:

- `generatedAt`: UTC generation timestamp.
- `source`: source name, API version, Congress number, and source URL.
- `entities`: compact member, bill, committee, vote, hearing, and related-resource summaries keyed by stable identifiers.
- `relationships`: typed links such as `sponsored`, `cosponsored`, `referred_to`, `reported_by`, `scheduled_for`, `considered_in`, and `voted_on`.
- `timeline`: dated events with an event type, subject identifier, related identifiers, title, and source URL.

All identifiers in the derived index are strings. Dates use ISO 8601 UTC strings where Congress.gov provides a date. Missing source fields remain `null` rather than being fabricated. Relationships only point to records that exist in the synchronized resource set; unresolved source links are reported as validation errors or explicitly recorded as source-provided unresolved references when the API does not expose the target collection.

The derived index is deterministic except for `generatedAt`; tests use a fixed timestamp or ignore that field when comparing snapshots. It must not duplicate complete source records.

## Components

### Synchronization

Keep `scripts/run-local-sync.sh` as the only publishing entry point. It will:

1. Acquire the existing lock and load `.env.local`.
2. Validate the API key, branch, clean working tree, Congress number, and configured resource selection before network work.
3. Pull `origin/main` with fast-forward-only behavior.
4. Run tests, synchronize resources using the overlap window, build the derived index, and run verification.
5. Commit and push only generated data when the non-dry-run data diff is real.
6. Report whether data was published, unchanged, skipped, or failed. Failures must retain the command and stderr in the automation result, with secrets redacted.

The Codex automation remains `ACTIVE` with `FREQ=HOURLY;INTERVAL=1`. No second cron, GitHub schedule, or launchd job is added. The manual GitHub workflow remains a recovery path.

### Derived index builder

Add a focused Node script that reads resource arrays, extracts stable IDs and relationship fields exposed by Congress.gov, and writes `data/derived/index.json`. The builder must tolerate absent optional fields, preserve nulls, sort entities and relationships deterministically, and fail when a required identity cannot be established for a record that is intended to be indexed.

The builder should use resource-specific adapters rather than a single heuristic for all collections. This keeps member, bill, vote, committee, and chronology semantics understandable and makes new resource types additive.

### Verification

Extend validation with a separate verification layer so structural JSON checks and semantic cross-resource checks have distinct error messages. Verification includes:

- Every resource file is valid, non-empty JSON array data.
- Metadata names and counts match generated resources.
- Stable identities are present and unique within each resource.
- Congress values match the configured Congress where the resource is Congress-scoped.
- Member records have a bioguide ID, name, chamber, and source URL when supplied by the API.
- Bill records have a bill identity, Congress, type/number, and source URL.
- Dates parse as ISO dates and do not create impossible chronology, such as an action before introduction when both are present.
- Derived relationships reference known entity IDs and use an allowed relationship type.
- Source URLs use `https://api.congress.gov/` or `https://www.congress.gov/` and preserve the original link.
- Records from different chambers are not silently merged.

Verification must provide a concise summary on success and a bounded list of actionable failures on error. It must never print API keys or complete authorization URLs.

## API and Operations

The API client keeps retry behavior for 429 and transient 5xx responses, honors `Retry-After`, and enforces request timeouts. Configuration remains environment-based:

- `CONGRESS_API_KEY` is required and is never written to JSON, metadata, logs, or commits.
- `CONGRESS` defaults to 119.
- `CONGRESS_LOOKBACK_HOURS` defaults to 6 to cover missed hourly runs.
- `CONGRESS_SYNC_MODE` defaults to `hourly`; `full` is explicit recovery/bootstrap behavior.
- `CONGRESS_DRY_RUN=1` runs the full pipeline without commit or push.
- `CONGRESS_RESOURCES` can limit a run for targeted recovery, while validation still requires the selected exports and derived output to be internally coherent.

The pipeline should expose enough request-count information to make the 5,000-request hourly limit reviewable. It should fail early when configuration is invalid and fail closed before publication when tests or verification fail.

## Testing

Add fixture-driven tests for:

- Deterministic derived index output and timeline ordering.
- Sponsor/cosponsor and committee/vote relationships when source links are present.
- Missing optional fields remaining null.
- Duplicate member or bill identities being rejected.
- Cross-Congress and cross-chamber mismatches being rejected.
- Invalid URLs and impossible dates being rejected.
- Missing relationship targets producing actionable verification errors.
- Hourly runner publication decisions for changed, unchanged, dry-run, missing-key, and failed-validation cases where shell behavior can be tested safely.

The existing API-client and resource-merge tests remain required. `npm test`, `npm run validate`, and a dry-run sync with a configured key are the minimum verification commands before operational use.

## README Changes

Update the README to:

- Correct the current update-frequency contradiction and state that the local runner is hourly.
- Distinguish source-aligned resources from the derived relationship index.
- Document chronology, relationship types, null handling, stable IDs, and verification guarantees.
- Explain that members and legislation are Congress.gov records and include source links for review.
- Document API-key setup, rate-limit considerations, overlap windows, dry runs, bootstrap, recovery, and failure handling.
- Document the exact `npm test`, `npm run validate`, `npm run sync:local`, and targeted verification commands.
- Avoid claiming coverage or fields that the API response does not provide.

## Acceptance Criteria

- A clean hourly run with a valid key completes tests, sync, index generation, verification, and publication or an explicit unchanged result.
- A missing or invalid key fails before network work with a clear, secret-free error.
- A failed API request or verification step leaves no publishable partial result and retains enough error detail for review.
- Generated JSON is valid, deterministic, source-linked, chronologically sortable, and relationship references are coherent.
- The representative member and legislation fixtures pass semantic verification.
- The README matches the actual commands and operational behavior.
- The existing hourly automation remains the single active recurring scheduler.

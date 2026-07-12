# Federal Legislative Data Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CourtGPT/congress-tracker` the single authoritative, locally scheduled repository for Congress.gov, House legislative documents, federal public laws, and the U.S. Code while eliminating duplicate Codex/GitHub scheduling and preserving provenance.

**Architecture:** Keep `congress-tracker` as the canonical public data repository because it already has the validated Congress.gov pipeline and the working macOS `launchd` publisher. Add source-specific adapters and manifests under one data contract: Congress.gov list/detail data, House XML documents, enacted public-law records, and OLRC U.S. Code snapshots remain separately identified but are published together. Retain `caselaw-access` and `claude-for-legal` as separate products because they are case-law and agent-tool repositories, not legislative data sources.

**Tech Stack:** Node.js 22, JSON Schema, Congress.gov API v3, House XML/USLM source files, OLRC U.S. Code downloads, macOS `launchd`, GitHub CLI/API, Node test runner.

---

## Current diagnosis and safety boundaries

- The Codex automation `hourly-congress-gov-sync` is gone and `$HOME/.codex/automations` contains no Congress sync definition.
- Five stale Codex threads with that title remained after the automation was deleted; all were idle or not loaded and have now been archived.
- The only active Congress scheduler is `com.courtgpt.congress-sync` under `~/Library/LaunchAgents`, running from `~/Library/Application Support/CourtGPT/congress-tracker-sync/repo` every 3,600 seconds. It has been exiting successfully.
- `congress-tracker` is currently aligned with `origin/main` at `8e0f0d3`, but its desktop worktree contains uncommitted bill-detail work. That work must be reviewed and preserved before any consolidation edit.
- No repository may be deleted. GitHub repositories may be archived only after a reviewed migration, a published canonical replacement, a rollback reference, and explicit approval of the exact repository list.

## Repository disposition

| Repository | Current role | Disposition |
|---|---|---|
| `CourtGPT/congress-tracker` | Active Congress.gov JSON feed and hourly publisher | Canonical destination |
| `CourtGPT/house-documents` | House XML concept/readiness repository; no verified feed or checked-in archive | Migrate useful schemas/docs, then archive only after approval |
| `CourtGPT/us-code` | OLRC U.S. Code JSON mirror with its own weekly GitHub schedule | Migrate data/importer and release metadata, then disable duplicate schedule and archive only after approval |
| `CourtGPT/caselaw-access` | CourtListener/public case-law data | Keep separate |
| `CourtGPT/claude-for-legal` | Legal workflow plugins and agent assets | Keep separate; do not mix with public-law data |

## Task 1: Lock down scheduler ownership and notification behavior

**Files:**
- Modify: `launchd/com.courtgpt.congress-sync.plist`
- Modify: `scripts/run-local-sync.sh`
- Modify: `README.md`
- Create: `scripts/doctor-local-scheduler.sh`
- Test: `test/scheduler-contract.test.js`

- [ ] **Step 1: Add a read-only scheduler doctor.** It must print the launchd label, runtime path, interval, last exit code, deployed Git SHA, Codex automation-file count, crontab presence, and whether an active sync process exists. It must exit nonzero if the runtime SHA differs from `origin/main`, the plist is missing, or the last exit code is nonzero.
- [ ] **Step 2: Make sync logs unambiguous.** Route Git fetch progress to standard output, prefix every runner phase with `[sync]`, and print `data unchanged` instead of committing when generated content is identical.
- [ ] **Step 3: Keep GitHub Actions recovery-only.** `congress-tracker/.github/workflows/update.yml` remains `workflow_dispatch` only. Convert `us-code/.github/workflows/update.yml` to manual recovery after the U.S. Code importer is moved; no scheduled GitHub workflow may publish the same canonical data.
- [ ] **Step 4: Add fixture tests for scheduler contract text and interval configuration.** Run `npm test`, `npm run validate`, `bash -n scripts/run-local-sync.sh scripts/doctor-local-scheduler.sh`, and `plutil -lint launchd/com.courtgpt.congress-sync.plist`.

## Task 2: Review and land the existing bill-detail work safely

**Files:**
- Review without reverting: `package.json`
- Review without reverting: `scripts/build-index.js`
- Review without reverting: `scripts/update.js`
- Review without reverting: `scripts/validate.js`
- Review without reverting: `schema/bill-detail.schema.json`
- Review without reverting: `scripts/fetch-bill-detail.js`
- Review without reverting: `scripts/sync-bill-detail.js`
- Review without reverting: `scripts/backfill-bill-detail.js`
- Review without reverting: `scripts/lib/bill-detail-validate.js`
- Review without reverting: `test/fetch-bill-detail.test.js`
- Review without reverting: `test/sync-bill-detail.test.js`

- [ ] **Step 1: Run the new bill-detail fixture tests and the existing suite before changing behavior.** Use `npm test`; record failures separately from the existing uncommitted changes.
- [ ] **Step 2: Validate the detail contract.** Require stable bill identity, provenance URL, sponsor/cosponsor/action/committee/summary/text counters, and explicit error status for failed detail fetches. Never silently replace a previously valid detail file with an error response.
- [ ] **Step 3: Bound the hourly detail budget.** Process only changed bills and cap detail requests below the Congress.gov hourly limit; run historical detail backfills in explicit batches with resumable offsets.
- [ ] **Step 4: Rebuild the index and validate a sampled detail batch.** Confirm that related-bill and subject relationships never point to unknown entities and that missing detail is represented as `null` or a status object rather than fabricated data.
- [ ] **Step 5: Commit this work separately from repository consolidation.** Do not mix the user’s existing bill-detail changes with source migration or GitHub archival.

## Task 3: Add the missing Congress.gov source families

**Files:**
- Modify: `scripts/sync-resources.js`
- Modify: `scripts/update.js`
- Modify: `scripts/validate.js`
- Modify: `scripts/build-index.js`
- Modify: `README.md`
- Create: `data/resources/amendments.json`
- Create: `data/resources/crs-reports.json`
- Create: `data/resources/bound-congressional-record.json`
- Create: `data/resources/congressional-record.json` only after overlap analysis
- Modify: `test/sync-resources.test.js`
- Create: `test/excluded-resource-recovery.test.js`

- [ ] **Step 1: Add amendments as two typed routes.** Fetch `/amendment/119/hamdt` and `/amendment/119/samdt`, preserve `type`, `number`, `congress`, `latestAction`, `updateDate`, and source URL, and key records by Congress/type/number.
- [ ] **Step 2: Add CRS reports.** Fetch `/crsreport` into `crs-reports.json`, preserve report ID/version/status/publish/update dates, and treat it as an incremental source with deterministic identity by report ID/version.
- [ ] **Step 3: Add bound Congressional Record as bootstrap-only.** Fetch `/bound-congressional-record` in a bounded full bootstrap, record the source count and retrieval timestamp, and skip it during hourly runs unless explicitly requested.
- [ ] **Step 4: Compare `/congressional-record` to `daily-congressional-record` before adding a second file.** If IDs/volume/issue/date are equivalent, retain one canonical collection with an alias in metadata; if distinct, store both with separate identity rules and a deduplication test.
- [ ] **Step 5: Keep bill summaries as a detail crawler, not a fake top-level collection.** The top-level `/summaries` route has no global collection count; collect per-bill summaries through the existing bill-detail queue with resumable checkpoints.
- [ ] **Step 6: Run a full bootstrap, then `npm test`, `npm run validate`, `npm run verify`, JSON parsing of every generated file, and a source-count comparison report before publishing.

## Task 4: Consolidate federal laws and U.S. Code

**Files:**
- Create: `data/federal-laws/manifest.json`
- Create: `data/federal-laws/public-laws.json`
- Create: `data/federal-laws/us-code/` title JSON files
- Create: `scripts/sync-us-code.js`
- Create: `scripts/validate-federal-laws.js`
- Create: `schema/federal-law.schema.json`
- Modify: `scripts/update.js`
- Modify: `scripts/validate.js`
- Modify: `scripts/build-index.js`
- Modify: `README.md`
- Modify: `us-code/.github/workflows/update.yml` only during the migration branch, not from the dirty canonical worktree

- [ ] **Step 1: Preserve the distinction between enacted laws and codified law.** Store Congress.gov public-law records separately from OLRC U.S. Code titles; do not call the 119th-Congress `/law/119` collection a complete federal-law database.
- [ ] **Step 2: Import the current `us-code` data and release metadata.** Preserve title/section identity, source URL, OLRC release point, effective dates, notes, and the original public-domain provenance.
- [ ] **Step 3: Add a manifest that records source, release point, generated time, file counts, and checksums.** The importer must fail closed on an incomplete title set or invalid section identity.
- [ ] **Step 4: Add cross-source links where authoritative data supports them.** Link public laws to U.S. Code sections only when the source explicitly provides the mapping; leave unmapped links null.
- [ ] **Step 5: Validate a complete title set and compare counts with the source manifest before the first canonical commit.

## Task 5: Consolidate House documents without inventing a feed

**Files:**
- Modify: `house-documents/source-manifest.json`
- Create: `scripts/sync-house-documents.js`
- Create: `schema/house-document.schema.json`
- Create: `data/house-documents/manifest.json`
- Create: `data/house-documents/` raw XML and normalized JSON directories
- Modify: `README.md`
- Create: `test/house-documents.test.js`

- [ ] **Step 1: Verify the authoritative House endpoint and representative XML fixtures.** The current repository explicitly says the feed is not verified; do not enable automation until identifiers, provenance terms, and fixture coverage pass.
- [ ] **Step 2: Import raw XML immutably and generate normalized JSON separately.** Keep source checksum, document type, Congress, chamber, publication date, and source URL in every manifest entry.
- [ ] **Step 3: Add an incremental catalog updater with retry, checksum comparison, and atomic writes.** A changed source document must create a data diff without rewriting unchanged XML.
- [ ] **Step 4: Validate bills, resolutions, amendments, roll-call votes, and committee reports against the House schema fixtures before publishing.

## Task 6: Publish one canonical repository and update GitHub metadata

**Files:**
- Modify: `README.md`
- Create: `docs/repository-migration.md`
- Create: `docs/source-catalog.json`
- Modify: GitHub descriptions/topics/homepage through `gh` only after the migration PR is reviewed

- [ ] **Step 1: Create a migration branch from the clean published `main` commit.** Do not branch from the dirty desktop worktree until Task 2 is committed separately.
- [ ] **Step 2: Import `us-code` and verified House data with source-specific manifests and tests.** Preserve history/provenance; do not flatten all sources into one indistinguishable JSON array.
- [ ] **Step 3: Update the canonical README with a source matrix, scheduler ownership, record counts, recovery commands, and the enacted-law versus codified-law distinction.
- [ ] **Step 4: Publish a release/checkpoint commit and verify clone, validation, and launchd runtime behavior from the published SHA.
- [ ] **Step 5: Archive `house-documents` and `us-code` only after explicit confirmation of those exact names.** Keep their README pointers and migration commit references; never delete their history.
- [ ] **Step 6: Leave `caselaw-access`, `claude-for-legal`, and unrelated profile repositories untouched.** They are not duplicates of the legislative data system.

## Task 7: Clean the GitHub profile with an approval gate

**Files:**
- Create: `docs/github-repository-inventory.md`
- Modify: GitHub repository descriptions/topics/pinned-repository selection only after approval

- [ ] **Step 1: Classify every CourtGPT repository as canonical, active product, archive candidate, or unrelated.** Include visibility, last push, open issues, workflow schedules, and local checkout state.
- [ ] **Step 2: Prepare a proposed archive list and show it for approval.** No `gh repo archive` or deletion command is allowed before the list is approved.
- [ ] **Step 3: Update descriptions and topics so the canonical federal-data repository is discoverable and the archived repositories point to it.
- [ ] **Step 4: Confirm public/private visibility and secrets before any profile cleanup.** Never expose API keys or credentials in migration commits.

## Task 8: Final verification and operations handoff

**Files:**
- Modify: `README.md`
- Modify: `launchd/com.courtgpt.congress-sync.plist`
- Modify: `scripts/doctor-local-scheduler.sh`
- Test: all repository tests and source-count audit scripts

- [ ] **Step 1: Run all tests and validators.** Expected: all Node tests pass, every generated JSON file parses, every source manifest checksum is valid, and semantic verification reports no dangling relationships.
- [ ] **Step 2: Run the scheduler doctor.** Expected: no Codex automation files, no crontab, one launchd agent, runtime SHA equals `origin/main`, hourly interval, and last exit code zero.
- [ ] **Step 3: Run one controlled live sync.** Expected: source request metrics, validation success, and either a data-only commit/push or an explicit unchanged result; no chat/thread notification is created.
- [ ] **Step 4: Verify GitHub default branch, release metadata, workflow schedules, and archive redirects.
- [ ] **Step 5: Mark the migration complete only after the approved repository archive actions and the final source-count report are attached to `docs/repository-migration.md`.

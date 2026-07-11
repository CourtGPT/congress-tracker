# Congress Tracker Data Pipeline Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the current repository. Do not create a branch, worktree, commit, or push unless the user explicitly requests it.

**Goal:** Make the Congress.gov pipeline produce verified, chronological JSON relationships among members, bills, committees, votes, and hearings while remaining safe to run hourly.

**Architecture:** Keep `data/resources/*.json` source-aligned. Add a small incremental bill-detail relation cache for sponsor/cosponsor links, then build `data/derived/index.json` as a deterministic consumer-oriented index. The wrapper runs tests, synchronization, index generation, and semantic verification before any generated-data publication decision.

**Tech Stack:** Node.js CommonJS, npm, built-in `node:test`, Bash, JSON, Congress.gov API v3.

---

## File Map

- Create `scripts/sync-bill-relations.js`: fetch and merge sponsor/cosponsor relation records for newly or recently updated bills.
- Create `scripts/build-index.js`: build the chronological entity and relationship index from source resources and relation records.
- Create `scripts/verify-data.js`: run semantic checks across resource exports, relation cache, metadata, and derived index.
- Create `test/sync-bill-relations.test.js`: fixture tests for bill URL parsing, relation merging, and API failures.
- Create `test/build-index.test.js`: fixture tests for entities, sponsor/cosponsor links, chronology, nulls, and deterministic ordering.
- Create `test/verify-data.test.js`: fixture tests for duplicate IDs, missing references, invalid URLs, Congress mismatches, chambers, and impossible dates.
- Create `data/derived/index.json`: generated output; do not hand-edit.
- Modify `scripts/update.js`: run relation sync, index generation, and metadata updates after resource sync.
- Modify `scripts/sync-resources.js`: use atomic writes and expose the selected resource results needed by downstream steps.
- Modify `scripts/lib/congress-api.js`: expose request metrics and redact API-key-bearing URLs in errors.
- Modify `scripts/validate.js`: keep structural checks and invoke semantic verification through a stable CLI path.
- Modify `scripts/run-local-sync.sh`: validate numeric configuration before network work and report pipeline stage failures clearly.
- Modify `package.json`: add `build:index` and `verify` commands.
- Modify `README.md`: document JSON layers, relationships, chronology, API limits, incremental relation coverage, recovery, and hourly operation.

### Task 1: Add failing relation-sync tests

**Files:**
- Create: `test/sync-bill-relations.test.js`
- Reference: `scripts/lib/congress-api.js`, `data/resources/bills.json`

- [ ] **Step 1: Add a bill URL parser fixture.** Assert that `https://api.congress.gov/v3/bill/119/hr/12?format=json` becomes `{ congress: 119, type: "hr", number: "12" }`, and malformed URLs are rejected.

- [ ] **Step 2: Add sponsor and cosponsor API fixtures.** Use a fake `fetchImpl` that returns a bill detail payload containing `sponsors` and a cosponsor collection payload. Assert the normalized output has string IDs, `role: "sponsor"` or `role: "cosponsor"`, a bill ID, member ID, source URL, and Congress.

- [ ] **Step 3: Add incremental merge fixtures.** Seed a temporary `bill-relations.json`, update one bill, and assert old relations for that bill are replaced while unrelated bill relations remain. Assert output is stable-sorted and written as a JSON array.

- [ ] **Step 4: Add failure fixtures.** Assert a non-OK detail response rejects and does not replace the existing cache; assert a missing bill identity is rejected with a bounded, secret-free message.

- [ ] **Step 5: Run the focused tests.**

Run: `node --test test/sync-bill-relations.test.js`
Expected: FAIL because `scripts/sync-bill-relations.js` does not exist yet.

### Task 2: Implement incremental bill relations

**Files:**
- Create: `scripts/sync-bill-relations.js`
- Modify: `scripts/lib/congress-api.js`
- Modify: `package.json`

- [ ] **Step 1: Implement `parseBillUrl(url)`.** Accept only Congress.gov API bill URLs with numeric Congress, lowercase-normalized type, and number. Return a stable bill key `${congress}:${type}:${number}`.

- [ ] **Step 2: Implement `syncBillRelations({ congress, mode, lookbackHours, dataDir, apiKey, fetchImpl })`.** Load bills, select all bills for `mode === "full"`, otherwise select bills whose `updateDate` or `updateDateIncludingText` is within the lookback window. For each selected bill, request the detail URL and `/cosponsors` URL, normalize sponsor/cosponsor records, and replace only that bill's cached relations.

- [ ] **Step 3: Bound relation work.** Honor `CONGRESS_RELATIONS_MAX_BILLS`. Default hourly behavior is the number of changed bills; full mode must require an explicit positive limit when more bills are selected than the configured request budget. Print counts, not API URLs or keys.

- [ ] **Step 4: Preserve atomicity.** Write the merged relation cache to a temporary file in the same directory and rename it only after all selected bill requests succeed. If any request fails, leave the prior cache untouched.

- [ ] **Step 5: Add `build:relations` or equivalent package entry only if useful for recovery.** The normal update path must call the exported function; the CLI must support `CONGRESS_RELATIONS_MODE=full` for an explicit bounded backfill.

- [ ] **Step 6: Run the focused tests.**

Run: `node --test test/sync-bill-relations.test.js`
Expected: PASS.

### Task 3: Add failing derived-index tests

**Files:**
- Create: `test/build-index.test.js`
- Reference: `scripts/sync-bill-relations.js`

- [ ] **Step 1: Add representative fixtures.** Include two members from different chambers, one bill with a sponsor and cosponsor relation, one committee relation, one vote, and dated actions.

- [ ] **Step 2: Assert index shape.** Assert `source`, `entities`, `relationships`, and `timeline` exist; entity IDs and relationship IDs are strings; optional absent fields are `null`.

- [ ] **Step 3: Assert relationship semantics.** Assert sponsor and cosponsor relations point to existing member and bill IDs, use allowed types, and retain source URLs.

- [ ] **Step 4: Assert chronology and determinism.** Assert timeline dates sort ascending with stable tie-breakers and two builds from identical fixtures are byte-for-byte equal after normalizing `generatedAt`.

- [ ] **Step 5: Run the focused tests.**

Run: `node --test test/build-index.test.js`
Expected: FAIL because `scripts/build-index.js` does not exist yet.

### Task 4: Implement the derived JSON index

**Files:**
- Create: `scripts/build-index.js`
- Create: `data/derived/index.json`
- Modify: `scripts/update.js`
- Modify: `package.json`

- [ ] **Step 1: Implement resource readers and stable IDs.** Read arrays from `data/resources`, preserve source values, and normalize IDs as strings. Use resource-specific adapters for members, bills, committees, votes, hearings, and relation records.

- [ ] **Step 2: Implement compact entities.** Emit only identity, display fields, Congress, chamber, key dates, and source URL; never copy complete raw source records into the index.

- [ ] **Step 3: Implement typed relations.** Emit `sponsored`, `cosponsored`, `referred_to`, `reported_by`, `scheduled_for`, `considered_in`, and `voted_on` only when source data or the relation cache supports them. Do not invent relationships from names or titles.

- [ ] **Step 4: Implement timeline events.** Include introduction, latest action, update, committee meeting, hearing, and vote dates when present. Use ISO UTC strings, preserve source URLs, and sort by date, event type, subject ID, and related IDs.

- [ ] **Step 5: Write atomically and support a fixed test timestamp.** Use `CONGRESS_INDEX_GENERATED_AT` in tests; production defaults to the current UTC timestamp. Ensure the output is pretty JSON with a trailing newline.

- [ ] **Step 6: Call the builder from `scripts/update.js`.** Run relation sync after resource sync, then build the index, and include relation/index counts in `data/metadata.json`.

- [ ] **Step 7: Add `npm run build:index` and run focused tests.**

Run: `CONGRESS_INDEX_GENERATED_AT=2026-07-11T00:00:00Z node --test test/build-index.test.js`
Expected: PASS.

### Task 5: Add failing semantic-verification tests

**Files:**
- Create: `test/verify-data.test.js`
- Reference: `scripts/validate.js`, `data/metadata.json`

- [ ] **Step 1: Add valid fixture coverage.** Assert that valid arrays, metadata counts, relation references, source URLs, and chronology pass.

- [ ] **Step 2: Add identity failures.** Assert duplicate member IDs and duplicate bill IDs fail with file and record context.

- [ ] **Step 3: Add consistency failures.** Assert cross-Congress records, chamber mismatch, invalid source URLs, malformed dates, impossible action ordering, and missing relation targets fail.

- [ ] **Step 4: Add secret-safety coverage.** Pass a fake API-key-bearing URL into an error path and assert the message contains neither the key nor the query string.

- [ ] **Step 5: Run the focused tests.**

Run: `node --test test/verify-data.test.js`
Expected: FAIL because `scripts/verify-data.js` does not exist yet.

### Task 6: Implement semantic verification and integrate validation

**Files:**
- Create: `scripts/verify-data.js`
- Modify: `scripts/validate.js`
- Modify: `scripts/update.js`
- Modify: `scripts/lib/congress-api.js`
- Modify: `package.json`

- [ ] **Step 1: Implement `verifyData({ dataDir, congress, selectedResources })`.** Return `{ checked, errors }`; check non-empty arrays, metadata names/counts, required identities, Congress values, member and bill fields, URL allowlist, date parsing/order, allowed relationship types, and known relation endpoints.

- [ ] **Step 2: Bound failures.** Collect at most 50 detailed errors, include a total count, and exit nonzero when any error exists. Redact `api_key` query values and never print authorization URLs.

- [ ] **Step 3: Preserve the existing structural validator.** `validate()` checks JSON arrays and file presence, then calls semantic verification. Keep selected-resource validation compatible with `CONGRESS_RESOURCES`.

- [ ] **Step 4: Add `npm run verify` and call verification after index generation.** `npm run update` must fail before publication if verification fails.

- [ ] **Step 5: Add request metrics.** Track request count and retry count in memory and print a final summary so the 5,000-request hourly budget is reviewable without exposing URLs.

- [ ] **Step 6: Run all tests.**

Run: `npm test`
Expected: PASS.

### Task 7: Harden the hourly wrapper

**Files:**
- Modify: `scripts/run-local-sync.sh`
- Modify: `scripts/update.js`
- Modify: `README.md`

- [ ] **Step 1: Add preflight checks.** Validate `CONGRESS` and `CONGRESS_LOOKBACK_HOURS` as positive integers before `git pull`; keep the required-key failure secret-free.

- [ ] **Step 2: Make stage output explicit.** Print stable stage names for tests, resource sync, relation sync, index build, validation, and publication. Preserve stderr and exit status on failure; do not add a persistent secret-bearing log file.

- [ ] **Step 3: Keep publication behavior safe.** Only `data/` changes may be staged by the wrapper; `CONGRESS_DRY_RUN=1` must skip commit/push while still running verification.

- [ ] **Step 4: Update README.** Correct the hourly frequency statement, document the two JSON layers, relation coverage and bounded historical backfill, chronology, source-link semantics, API-key setup, 5,000-request budget, six-hour overlap, dry run, recovery, and exact commands.

- [ ] **Step 5: Run shell syntax and documentation checks.**

Run: `bash -n scripts/run-local-sync.sh && git diff --check`
Expected: exit 0.

### Task 8: Generate, verify, and operationally confirm

**Files:**
- Generated: `data/resources/*.json`, `data/metadata.json`, `data/resources/bill-relations.json`, `data/derived/index.json`
- Inspect: `/Users/d/.codex/automations/hourly-congress-gov-sync/automation.toml`

- [ ] **Step 1: Run the non-network checks.**

Run: `npm test && npm run validate && npm run verify`
Expected: all commands pass.

- [ ] **Step 2: Confirm API configuration without printing the key.** Check that `.env.local` exists and contains a non-empty `CONGRESS_API_KEY`; never echo its value.

- [ ] **Step 3: Run the requested local sync when the worktree is clean.**

Run: `bash scripts/run-local-sync.sh`
Expected: either `Published updated Congress.gov data to origin/main` or `Congress.gov data is unchanged; no commit or push needed`; on failure, retain the complete command error and stage in the automation result.

- [ ] **Step 4: Inspect generated output.** Confirm all generated files parse as JSON, metadata counts match, representative members and bill relations resolve, dates are chronologically sortable, and no API key appears in `git diff`.

- [ ] **Step 5: Confirm hourly automation.** Read `/Users/d/.codex/automations/hourly-congress-gov-sync/automation.toml` and require `status = "ACTIVE"`, `kind = "cron"`, and `rrule = "FREQ=HOURLY;INTERVAL=1"`. Do not create a duplicate scheduler.

- [ ] **Step 6: Update the automation memory.** Record the run timestamp, whether data was published, counts, and any preserved failure details in `$CODEX_HOME/automations/hourly-congress-gov-sync/memory.md`.

## Self-Review

- Spec coverage: synchronization reliability, JSON contract, derived relationships, chronology, member/bill verification, testing, README, and hourly automation are covered by Tasks 1-8.
- Placeholder scan: no `TBD`, `TODO`, or unspecified “handle errors” steps; each task names files, behavior, commands, and expected outcomes.
- Type consistency: relation records use `billId`, `memberId`, `role`, `congress`, and `sourceUrl`; index relationships consume those exact fields; verification checks the same identifiers.
- Scope boundary: no frontend or independent external reconciliation is introduced; historical relation coverage is explicit and bounded rather than silently incomplete.

# Private Law Completion, Hierarchical JSON, and Daily Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the missing private law jurisdictions from authoritative sources, export every private law node into deterministic hierarchical JSON files, and publish validated public Congress/federal changes from a local daily scheduler only when content changes.

**Architecture:** The private `pioneer-model-training` repository remains the only place that can hold state/territory corpus data and database writes. Its exporter reads the private normalized tree and writes a private, year-partitioned JSON hierarchy with one file per node and stable child references. The public `congress-tracker` repository continues to publish Congress.gov and OLRC data, with per-law/per-section files, validation, checksum-based no-op behavior, and a local launchd daily publisher; GitHub Actions remains manual recovery only.

**Tech Stack:** Python scraper/dashboard tooling, PostgreSQL 17, SQLite dashboard state, Node.js/JSON validation, macOS launchd, Git.

---

### Task 1: Freeze the baseline and source-gap inventory

**Files:**
- Read: `/Users/d/Desktop/monorepo/pioneer-model-training/AGENTS.md`
- Read: `/Users/d/Desktop/monorepo/pioneer-model-training/source_registry.json`
- Read: `/Users/d/Desktop/monorepo/pioneer-model-training/dashboard/data/laws_dashboard.db`
- Read-only database: DigitalOcean `laws-db`
- Create: `reports/2026-07-12-law-coverage-baseline.json` in the private repo

- [ ] Run guarded aggregate queries for jurisdiction rows, blank content, missing provenance, orphan parents, and duplicate paths.
- [ ] Record the missing live jurisdictions (federal, American Samoa, Northern Mariana Islands) and dashboard gaps (Georgia, Mississippi, Puerto Rico, plus partial sources) without copying law text.
- [ ] Probe each missing jurisdiction's official source and store source URL, observed count, current-through signal, and access status in the private baseline report.
- [ ] Do not use CAPTCHA bypass, stealth, cookie injection, Lexis-authenticated scraping, or secondary text as authoritative replacement content.

### Task 2: Complete source adapters through the private dashboard runner

**Files:**
- Modify via Serena only: `/Users/d/Desktop/monorepo/pioneer-model-training/scripts/`
- Modify via Serena only: `/Users/d/Desktop/monorepo/pioneer-model-training/source_registry.json`
- Modify via Serena only: `/Users/d/Desktop/monorepo/pioneer-model-training/dashboard/`
- Test: `/Users/d/Desktop/monorepo/pioneer-model-training/tests/`

- [ ] Repair or add official-source adapters for American Samoa and CNMI first because they are absent from the live schema.
- [ ] Re-run official count and scrape jobs for Georgia, Mississippi, Puerto Rico, and other incomplete jurisdictions through `count_and_update.py` or its dashboard-aware equivalent.
- [ ] Keep blocked jurisdictions explicitly blocked when official access is unavailable; do not mark them complete from a secondary source.
- [ ] Reconcile staged JSONL counts/content against official counts and record unresolved gaps in the private report.

### Task 3: Build the private hierarchical JSON exporter

**Files:**
- Create via Serena: `/Users/d/Desktop/monorepo/pioneer-model-training/scripts/export_hierarchical_json.py`
- Create via Serena: `/Users/d/Desktop/monorepo/pioneer-model-training/scripts/validate_hierarchical_json.py`
- Create via Serena: `/Users/d/Desktop/monorepo/pioneer-model-training/tests/test_hierarchical_json.py`
- Create private output root: `/Users/d/Desktop/monorepo/pioneer-model-training/private-law-json/`

- [ ] Export paths as `private-law-json/<jurisdiction>/<year>/<title>/<chapter>/<article>/<part>/<section>/index.json`, using source-native level names and stable slugs.
- [ ] Put exactly one legal node in each `index.json`; parent files contain metadata and child path references, never duplicated child text.
- [ ] Sort child references by numeric/legal order, preserve title/chapter/article/section labels, and include source URL, breadcrumb, release/current-through metadata, content hash, and quality status.
- [ ] Write atomically and skip unchanged files by hash; remove stale generated files only after a complete validated export.
- [ ] Validate one-to-one node identities, parent references, deterministic ordering, source URLs, JSON syntax, and year partitioning.

### Task 4: Wire private exports to a daily local publisher

**Files:**
- Create/modify via Serena: `/Users/d/Desktop/monorepo/pioneer-model-training/scripts/run-daily-law-refresh.sh`
- Create/modify via Serena: `/Users/d/Desktop/monorepo/pioneer-model-training/scripts/install-daily-law-refresh.sh`
- Create/modify via Serena: `/Users/d/Desktop/monorepo/pioneer-model-training/scripts/doctor-daily-law-refresh.sh`
- Create/modify via Serena: `/Users/d/Desktop/monorepo/pioneer-model-training/launchd/com.courtgpt.private-laws-daily.plist`

- [ ] Acquire a lock, run the dashboard-aware refresh, export private hierarchical JSON, validate, and write an audit log.
- [ ] Commit/push only the private repository's intended private output branch when hashes change; no-op when unchanged.
- [ ] Schedule once daily with launchd, not Codex, ChatGPT, or a scheduled GitHub Action.
- [ ] Ensure the job exits nonzero on incomplete counts, blocked sources, validation errors, or dirty-worktree conflicts.

### Task 5: Harden the public daily Congress/federal publisher

**Files:**
- Modify: `/Users/d/Desktop/monorepo/public-repos/congress-tracker/scripts/run-local-sync.sh`
- Modify: `/Users/d/Desktop/monorepo/public-repos/congress-tracker/scripts/run-local-us-code-sync.sh`
- Modify: `/Users/d/Desktop/monorepo/public-repos/congress-tracker/scripts/doctor-local-scheduler.sh`
- Modify: `/Users/d/Desktop/monorepo/public-repos/congress-tracker/README.md`
- Test: `/Users/d/Desktop/monorepo/public-repos/congress-tracker/test/`

- [ ] Add a daily local publication entry point that runs Congress validation and the appropriate federal refresh without changing the existing hourly Congress cadence.
- [ ] Preserve per-law/per-section stable file boundaries and no-op behavior.
- [ ] Ensure the publisher commits and pushes only validated generated data when `git status` shows a real data diff.
- [ ] Keep `.github/workflows/update.yml` manual-only and verify no Codex automation or crontab owns the feed.

### Task 6: Full verification and controlled publication

**Files:**
- Read-only review of both repositories and launchd state.

- [ ] Run private source counts, hierarchy export validation, public tests, `npm run validate`, `npm run verify`, and scheduler doctors.
- [ ] Confirm the private output root and database are outside the public repo and absent from Git tracking.
- [ ] Review generated diff size and choose normal Git, Git LFS, or release-artifact storage before publishing the approximately 824 MB federal tree.
- [ ] Commit and push only after the generated data diff, validation results, and storage choice are explicitly reviewable.

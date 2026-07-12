# U.S. Legal Data Platform and Awesome Legal Data Plan

> **Status:** Evidence-backed implementation plan. The first implementation tranche is non-destructive: manifests, schemas, audits, documentation, and safe updater contracts. No repository is deleted or archived until an exact list is approved.

## Goal

Create one auditable U.S. legal-data platform that combines the working federal legislative feed with the state/territory corpus and training metadata, publishes canonical hierarchical JSON, and updates locally from official sources. Add a maintained Awesome-style catalog of open legal datasets and repositories.

## Current evidence

- `CourtGPT/congress-tracker` is the only currently validated live federal publisher. Its local launchd runner is hourly and its U.S. Code runner is weekly; Codex automation and stale Codex sync threads have been removed.
- `pioneer-model-training` is the existing multi-jurisdiction corpus. It has 57 source-registry records, 144 JSONL data files plus progress/metadata artifacts, and a dashboard report. Its latest saved audit reports only 14 verified jurisdictions, 10 without JSONL, 13 with blank section content, one with duplicate paths, and stale/untrusted count rows. The older coverage report claims 51 verified jurisdictions, so the audit must be regenerated before any completeness claim.
- `pioneer-model-training` contains CAPTCHA/stealth/solver code and Lexis-dependent source entries. CAPTCHA bypass or solver services will not be used. Blocked sources must use official bulk/API/PDF alternatives, documented outreach, or remain explicitly unavailable.
- `pioneer-model-training` is a private GitHub repository and its local worktree contains user changes (`package.json`, `package-lock.json`, `source_registry.json`, `.cmux/`, `reports/`). Those changes must be preserved and reviewed before migration.
- `house-documents` does not yet have a verified canonical feed. `us-code` has useful local work and large uncommitted generated data on a feature branch; it must not be cleaned destructively.
- `caselaw-access` and `claude-for-legal` are separate case-law and agent-product repositories, not duplicates of the statutory corpus.

## Architecture decision

Keep `CourtGPT/congress-tracker` as the canonical public publication repository because it has the working hourly publisher and validated federal source pipeline. Integrate state/territory code and administrative-code source manifests and normalized release outputs through a shared data contract, but keep raw crawler caches, database dumps, CAPTCHA tooling, and incomplete legacy JSONL outside the canonical release tree.

The release layers are distinct:

1. `data/resources/` — Congress.gov legislative and congressional-record collections.
2. `data/federal-laws/us-code/` — codified U.S. Code from the Office of the Law Revision Counsel, partitioned by title and release point.
3. `data/federal-laws/public-laws/` — enacted public-law metadata and text where Congress/GovInfo provides it; never describe this as the complete codified Code.
4. `data/state-codes/<jurisdiction>/` — current state/territory codified law, partitioned by publication year and preserving each source's hierarchy.
5. `data/state-administrative-codes/<jurisdiction>/` — administrative rules/code only after an official source adapter and freshness signal are verified.
6. `data/manifests/` — source, schema, count, checksum, and release metadata.
7. `pioneer-model-training` — training-oriented source registry, validation reports, profiles, and database/export tooling; it consumes the canonical release manifests rather than being the live Git publisher.

## Canonical JSON contract

Every published legal node must include:

```json
{
  "id": "stable-source-qualified-id",
  "jurisdiction": "US-CA",
  "instrument": "state_code",
  "year": 2026,
  "level": "section",
  "label": "§ 123",
  "title": "…",
  "text": "…",
  "children": [],
  "hierarchy": {"title": "…", "chapter": "…", "article": "…", "section": "…"},
  "breadcrumb": ["California Codes", "…", "§ 123"],
  "citation": "…",
  "source": {
    "authority": "official",
    "url": "https://…",
    "canonical_url": "https://…",
    "retrieved_at": "2026-07-12T00:00:00Z",
    "source_version": "…",
    "checksum": "sha256:…"
  },
  "status": "current",
  "quality": {"content_present": true, "hierarchy_valid": true, "source_verified": true}
}
```

The exact native labels and nesting are preserved in `hierarchy`; normalization is additive, not destructive. Files are deterministically sorted by source hierarchy (title, subtitle, chapter, subchapter, article, part, section, subsection, paragraph) and then stable citation/id. Year partitions describe source currency; they do not silently turn a historical snapshot into current law.

## Work packages

### 1. Freeze and audit current state

**Repositories:** `pioneer-model-training`, `congress-tracker`, `house-documents`, `us-code`.

- Snapshot Git status, branches, remotes, scheduled jobs, workflows, manifests, and source counts.
- Regenerate one machine-readable coverage report from the dashboard and JSONL with a single timestamp and explicit count semantics.
- Separate verified, partially complete, stale, blocked, and untrusted records. Do not infer completeness from file size or scraper stdout.
- Inventory profile/training artifacts and make a profile manifest that records purpose, owner, source release, license, and whether it is safe for model training.

### 2. Establish the shared schema and provenance layer

**Target:** `congress-tracker`.

- Add JSON Schemas for legal nodes, source manifests, administrative-code sources, release manifests, and training profiles.
- Add deterministic canonicalization/sorting and validation commands.
- Add source URL, canonical URL, breadcrumb, hierarchy path, retrieval time, effective/current dates, release point, checksum, license/terms, and quality flags.
- Fail closed when a required hierarchy level, source identity, or completeness check is missing.

### 3. Consolidate federal sources

- Keep Congress.gov enacted-law records separate from OLRC U.S. Code titles.
- Keep the existing Congress hourly runner and OLRC weekly runner under local launchd ownership only.
- Migrate only verified `us-code` data/import logic; do not duplicate the independent GitHub publisher.
- Verify House XML/GovInfo endpoints with fixtures before enabling a House updater. Until then, keep `house-documents` as a readiness/source-manifest repository.

### 4. State and territory codified-law refresh

- Convert verified JSONL snapshots into canonical hierarchical JSON; retain JSONL only as a migration input or explicitly labeled archive.
- Build one adapter interface with per-jurisdiction source manifests, parser version, official count endpoint, current-through signal, and retry/rate-limit policy.
- Repair false counts, blank content, duplicate paths, and stale progress records before marking a jurisdiction current.
- For Arkansas, Colorado, Georgia, Mississippi, Tennessee, Puerto Rico, U.S. Virgin Islands, and other blocked/unverified sources, use official bulk/PDF/API or state-authorized alternatives. Justia is discovery/cross-reference fallback only, never authoritative replacement text.

### 5. State administrative-code coverage

- Create an explicit 50-state + DC/territory matrix with the official rulemaking/code publisher, source URL, publication format, current-through signal, update cadence, license/terms, and adapter status.
- Start with official bulk/API/XML/PDF sources and source-controlled publishers where the government designates the mirror. Do not claim all states are covered until every row has a verified source and count.
- Store administrative rules separately from statutes and session laws because their hierarchy, effective dates, and update semantics differ.
- Use a blocked-source queue with reason, last probe, next action, and no silent fallback.

### 6. Live local update orchestration

- One local scheduler per source family, shared lock, bounded concurrency, atomic writes, checksum comparison, and a no-op path when data is unchanged.
- Congress: hourly. U.S. Code: weekly or on OLRC release change. State codes/admin codes: source-specific cadence from each manifest; daily checks may be cheap metadata probes, with full refresh only on change.
- Commit only validated data/manifests and push only when a diff exists. Log run id, source, counts, changed files, validation result, commit SHA, and push result.
- No Codex/ChatGPT automation and no scheduled GitHub Action publisher for the canonical feeds.

### 7. Awesome-style open legal-data catalog

**Target:** `awesome-legal-data/README.md` (repository location to be decided after profile inventory).

- Use the conventions of `openlegaldata/awesome-legal-data`: short introduction, topic sections, one-line entries, official links, license/terms, jurisdiction, format/API, freshness, and contribution guidance.
- Include primary government sources, open datasets, case-law archives, legislation APIs, regulatory feeds, legal NLP datasets, parsers, and mirrors.
- Candidate entries must be verified for existence, source provenance, and license/terms before listing. Tag secondary/aggregated or stale sources explicitly.
- Add a machine-readable catalog companion so the README is generated deterministically and kept current.

### 8. GitHub profile cleanup (approval gated)

- Update descriptions/topics/homepage links and cross-repository migration notices.
- Keep `caselaw-access` and `claude-for-legal` separate.
- Propose, but do not execute, an exact archive list for `house-documents`, `us-code`, or any other duplicate after migration verification. No deletion.
- Do not expose private `pioneer-model-training` data or credentials in a public repository.

## Verification gates

Before publishing any new release:

- Every release JSON file parses and validates against the schema.
- Hierarchy paths are unique where required; parent references resolve; ordering is deterministic.
- Every record has official source URL, breadcrumb, retrieval/version metadata, and a quality status.
- A source count report explains expected, fetched, valid, missing, blank, duplicate, blocked, and stale records.
- The local scheduler doctor shows no Codex automation, no unintended GitHub schedule, one active local owner per feed, last exit zero, and runtime SHA equal to the published branch.
- A dry-run confirms no commit is created when checksums are unchanged.
- No CAPTCHA solver, stealth browser, cookie injection, or access-control circumvention is part of the production path.

## Immediate implementation tranche

1. Preserve and document the current dirty worktrees; do not reset or delete them.
2. Add the shared schemas/manifests, source-quality audit, and training-profile manifest.
3. Create the initial verified source catalog and Awesome-style README from validated repositories and official endpoints.
4. Convert one representative federal title, one state-code source, and one administrative-code source through the canonical JSON validator before scaling.
5. Run the full audit and publish a reviewable branch/commit. Archive/rename/merge GitHub repositories only after the migration report and exact archive list are approved.

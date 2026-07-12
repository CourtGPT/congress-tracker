# State-law scraper boundary

This directory contains the public, code-only boundary for state and territory law refreshes.

The proprietary state-law database, JSONL/JSON corpus, checkpoints, browser profiles, credentials, and dashboard remain in the private `pioneer-model-training` repository. The bridge requires `STATE_LAWS_PRIVATE_OUTPUT_DIR` and refuses to write under this public repository. It also refuses database credentials so a public scheduled job cannot mutate or expose the private law database.

Example:

```bash
PIONEER_LAW_REPO=/private/path/pioneer-model-training \
STATE_LAWS_PRIVATE_OUTPUT_DIR=/private/path/state-law-output \
scripts/state-laws/run-private-adapter.sh alabama --all --validate
```

Only adapters listed in `adapter-registry.json` are exposed here. The bridge includes the two currently missing territory candidates, American Samoa and the Northern Mariana Islands, but it does not mark either source as complete until the private run passes count, freshness, and content checks. The private registry remains authoritative for all jurisdictions and source-readiness status. LexisNexis-authenticated, CAPTCHA-protected, or otherwise blocked sources are not silently enabled by this bridge.

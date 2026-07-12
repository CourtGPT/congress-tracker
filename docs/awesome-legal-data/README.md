# Awesome Legal Data

An evidence-oriented catalog of open legal data, official legal-information sources, and software for collecting or structuring legal text.

This catalog is intentionally conservative: a link is not treated as authoritative merely because it is popular. Each entry should identify its jurisdiction, data type, format/API, license or terms, provenance, and freshness. Secondary mirrors are labeled as secondary and must not silently replace a government source.

## U.S. primary and government sources

- [Congress.gov API](https://api.congress.gov/) — U.S. bills, laws, amendments, committees, nominations, treaties, and congressional records; API key required; source used by [CourtGPT/congress-tracker](https://github.com/CourtGPT/congress-tracker).
- [Office of the Law Revision Counsel — U.S. Code](https://uscode.house.gov/) — official codified federal law releases and downloads.
- [GovInfo](https://www.govinfo.gov/) — official U.S. government publications and bulk data, including bills, public laws, and Federal Register collections.
- [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1) — rules, proposed rules, notices, and presidential documents; verify current access and terms at request time.
- [Regulations.gov API](https://open.gsa.gov/api/regulationsgov/) — regulatory dockets, documents, and comments; API key required.
- [D.C. Council law XML](https://github.com/DCCouncil/law-xml) — official District of Columbia statutes and code in XML.
- [D.C. Council law HTML](https://github.com/DCCouncil/law-html) — official D.C. law publication output in HTML.

## U.S. case law and court data

- [CourtListener](https://github.com/freelawproject/courtlistener) — open-source platform and archive for opinions, oral arguments, judges, financial records, and federal filings.
- [Caselaw Access Project](https://case.law/) — Harvard Law School Library project providing bulk access and APIs for U.S. case law; review the current license and access terms for each dataset.
- [CourtGPT/caselaw-access](https://github.com/CourtGPT/caselaw-access) — CourtGPT’s separate case-law data product; it is not a statutory-code source.

## Legal-data projects and datasets

- [Open Legal Data / awesome-legal-data](https://github.com/openlegaldata/awesome-legal-data) — broad catalog of legal datasets and legal-text processing resources.
- [Open Legal AI — Awesome Open Legal Datasets](https://github.com/openlegalai/Awesome-Open-Legal-Datasets) — curated legal dataset list.
- [Free Law Project](https://free.law/) — open-source legal research infrastructure and data projects.
- [OpenStates](https://openstates.org/) — state legislative data and API services; treat as an aggregation layer and trace citations to state sources.
- [State Decoded](https://statedecoded.com/) — open-source framework for publishing searchable state legal codes; deployments vary in authority and freshness.
- [rfeir/lab50](https://github.com/rfeir/lab50) — historical state statutes, session laws, administrative codes, and regulatory materials; clearly label historical and research-only coverage.

## Legal NLP and training datasets

- [CUAD](https://github.com/TheAtticusProject/cuad) — contract understanding and clause-extraction benchmark; not a source of current law.
- [LEDGAR](https://github.com/ledgar-legal/ledgar) — legal contract clause classification dataset derived from SEC filings; check the repository’s current terms before redistribution.
- [LegalBench](https://github.com/HazyResearch/legalbench) — legal reasoning benchmark and task suite; benchmark data is not a substitute for primary legal sources.

## Collection and parsing tools

- [CourtListener](https://github.com/freelawproject/courtlistener) — searchable legal-data application and ingestion stack.
- [Akoma Ntoso](https://akomantoso.org/) — open standard for machine-readable legislative, judicial, and legal documents.
- [LegalRuleML](https://www.oasis-open.org/standard/legalruleml/) — OASIS standard for representing legal rules and norms.
- [USLM](https://uscode.house.gov/advancedSearch.xhtml) — U.S. Legislative Markup format used by federal legislative publishing workflows.

## This platform

- [CourtGPT/congress-tracker](https://github.com/CourtGPT/congress-tracker) — locally scheduled Congress.gov JSON feed, federal public-law metadata, OLRC U.S. Code integration, source manifests, and validation.
- [CourtGPT/pioneer-model-training](https://github.com/CourtGPT/pioneer-model-training) — private training-corpus preparation and jurisdiction/source audit project; its data is not automatically public.

## Inclusion rules

1. Prefer a primary government source or a project with clear provenance and a maintained license/terms page.
2. Record jurisdiction, instrument type, format/API, update cadence, access requirements, license/terms, and last verification date.
3. Label mirrors, aggregators, historical snapshots, synthetic data, and research-only datasets explicitly.
4. Never describe a partial or blocked corpus as a complete current-law database.
5. Do not include CAPTCHA bypasses, credential-sharing, cookie injection, or other access-control circumvention tools.


# Congress Tracker

Track US congressional activity across the official [Congress.gov API](https://api.congress.gov) with hourly incremental updates.

## Overview

This repository maintains a comprehensive database of US congressional activity in structured JSON format. Track legislation from introduction to enactment, monitor voting records, and stay informed about committee activities.

## Data Sources

- **Primary**: [Congress.gov API](https://api.congress.gov/)
- **Rate Limit**: 5,000 requests/hour
- **Update Frequency**: Daily (00:00 UTC)
- **License**: Public Domain (US Government work)

## Repository Structure

```
congress-tracker/
├── README.md
├── data/
│   ├── resources/                  # Canonical JSON exports from Congress.gov
│   └── metadata.json               # Source, API version, and resource counts
├── schema/
├── scripts/
│   ├── fetch-bills.js
│   ├── fetch-members.js
│   ├── fetch-votes.js
│   ├── fetch-committees.js
│   ├── sync-resources.js        # All top-level Congress.gov collections
│   ├── update.js
│   └── backfill.js              # Historical bills/votes backfill
└── .github/workflows/
    └── update.yml               # Hourly automated update PRs
```

## Current Coverage

- **Historical Backfill**: Explicit command for requested Congress ranges
- **Current Congress**: Configurable with `CONGRESS` (default 119)
- **Coverage**: Generated from the current Congress.gov API response at each successful run

## Data Format

### Bill
```json
{
  "billNumber": "H.R. 1",
  "congress": 119,
  "title": "For the People Act of 2025",
  "sponsor": "Rep. Smith, John",
  "cosponsors": 42,
  "committees": "House Judiciary",
  "latestAction": "Referred to the House Committee on the Judiciary",
  "introducedDate": "2025-01-15",
  "status": "Introduced",
  "url": "https://www.congress.gov/bill/119th-congress/house-bill/1",
  "policyArea": "Government Operations and Politics"
}
```

### Member
```json
{
  "bioguideId": "S001234",
  "name": "Smith, John",
  "party": "Democratic",
  "state": "CA",
  "district": "12",
  "chamber": "House",
  "servedSince": 2019
}
```

## Usage

### Download Latest Data

```bash
git clone https://github.com/CourtGPT/congress-tracker.git
cd congress-tracker/data/resources
```

### API Endpoints

The synchronizer covers the Congress.gov API's public top-level collections: bills and resolutions, amendments, summaries, laws, Congresses, members, House votes, committees, committee reports/prints/meetings, hearings, Congressional Records, House/Senate communications, House requirements, nominations, CRS reports, and treaties.

## Automation

GitHub Actions checks Congress.gov every hour at minute 0 and supports manual `hourly` or `full` dispatches. The workflow uses the `CONGRESS_API_KEY` repository secret, follows pagination with bounded retries, uses a six-hour overlap window for incremental resources, merges updates into the existing database, normalizes records deterministically, validates every resource export, and opens or updates a pull request only when generated data changes. A no-change run creates no commit.

The generated database is stored in `data/resources/` and covers bills, amendments, summaries, laws, Congresses, members, House votes, committees, committee reports/prints/meetings, hearings, Congressional Records, communications, requirements, nominations, CRS reports, and treaties. Current-Congress collections use `CONGRESS` (default `119`); historical bootstrap is available through manual `full` mode and the backfill command.

## Historical Backfill

Run the backfill script to populate historical data:

```bash
npm install
CONGRESS_API_KEY=your_key node scripts/backfill.js --start=114 --end=119
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Related Projects

- [us-code](https://github.com/CourtGPT/us-code) - United States Code
- [house-documents](https://github.com/CourtGPT/house-documents) - House XML documents
- [caselaw-access](https://github.com/CourtGPT/caselaw-access) - Case law dataset

## About CourtGPT

[CourtGPT](https://courtgpt.ai) - Open-source legal data tools. Follow us on [X @courtgpt](https://x.com/courtgpt).

---

**Disclaimer**: This data is provided for informational and research purposes. Official congressional information is available at [Congress.gov](https://congress.gov).

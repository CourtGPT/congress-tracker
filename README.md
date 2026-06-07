# Congress Tracker

Track US congressional activity - bills, votes, members, and committees. Data sourced from the official [Congress.gov API](https://api.congress.gov) with daily automated updates.

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
│   ├── congress/
│   │   ├── 118/                    # 118th Congress (2023-2024)
│   │   │   ├── bills/
│   │   │   │   ├── hr/             # House bills
│   │   │   │   ├── s/              # Senate bills
│   │   │   │   └── hjres/          # Joint resolutions
│   │   │   ├── members.json
│   │   │   ├── committees.json
│   │   │   └── votes.json
│   │   └── 119/                    # 119th Congress (2025-2026)
│   └── amendments/
├── schema/
├── scripts/
│   ├── fetch-bills.js
│   ├── fetch-members.js
│   ├── fetch-votes.js
│   └── backfill.js              # Historical backfill
└── .github/workflows/
    └── daily-update.yml         # Daily automated updates
```

## Current Coverage

- **Historical Backfill**: Last 5 years (114th-119th Congress)
- **Current Congress**: 119th (2025-2026)
- **Total Bills Tracked**: ~50,000+
- **Members**: 537 (435 House + 100 Senate + 2 Delegates)
- **Committees**: 228 (117 House + 83 Senate + 28 Joint)

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
cd congress-tracker/data/congress/119/bills/hr
```

### API Endpoints

The Congress.gov API provides access to:
- Bills and resolutions
- Member profiles
- Committee information
- Roll call votes
- Bill text and summaries
- Amendments

## Automation

Daily automated updates via GitHub Actions:
1. Fetch new bills and updates from Congress.gov API
2. Update member and committee information
3. Process roll call votes
4. Commit changes with timestamp

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

const fs = require('fs');
const path = require('path');
const { paginate, requireApiKey, stableSort } = require('./lib/congress-api');

async function fetchCommittees({ apiKey = requireApiKey(), fetchImpl = fetch } = {}) {
  const committees = await paginate('/committee', { apiKey, fetchImpl });
  if (!committees.length) throw new Error('Congress.gov returned no committees');
  const normalized = stableSort(committees.map((committee) => ({
    systemCode: committee.systemCode || committee.committeeCode || '',
    name: committee.name || '',
    chamber: committee.chamber || null,
    url: committee.url || null,
    source: 'Congress.gov API',
  })), ['systemCode', 'name']);
  const output = path.join(__dirname, '..', 'data', 'committees.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized.length;
}

if (require.main === module) fetchCommittees().then((count) => console.log(`Fetched ${count} committees`)).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { fetchCommittees };

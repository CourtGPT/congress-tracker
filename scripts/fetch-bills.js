const fs = require('fs');
const path = require('path');
const { paginate, requireApiKey, stableSort } = require('./lib/congress-api');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchBills(congress = Number(process.env.CONGRESS || 119), { apiKey = requireApiKey(), fetchImpl = fetch } = {}) {
  const records = await paginate(`/bill/${congress}`, { apiKey, fetchImpl });
  if (!records.length) throw new Error(`Congress.gov returned no bills for Congress ${congress}`);
  const byType = new Map();
  for (const bill of records) {
    const type = String(bill.type || 'unknown').toLowerCase();
    const normalized = {
      billNumber: `${bill.type || 'UNKNOWN'} ${bill.number || ''}`.trim(),
      congress,
      title: bill.title || '',
      introducedDate: bill.introducedDate || null,
      latestAction: bill.latestAction || null,
      updateDate: bill.updateDate || bill.lastModified || null,
      url: bill.url || `https://www.congress.gov/bill/${congress}th-congress/${String(bill.type || '').toLowerCase()}/${bill.number}`,
      source: 'Congress.gov API',
    };
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(normalized);
  }
  const counts = {};
  for (const [type, values] of byType.entries()) {
    const sorted = stableSort(values, ['billNumber', 'url']);
    writeJson(path.join(__dirname, '..', 'data', 'congress', String(congress), 'bills', `${type}.json`), sorted);
    counts[type] = sorted.length;
  }
  return counts;
}

if (require.main === module) fetchBills().then((counts) => console.log(`Fetched ${JSON.stringify(counts)}`)).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { fetchBills };

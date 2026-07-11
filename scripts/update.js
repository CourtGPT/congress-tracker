const fs = require('fs');
const path = require('path');
const { requireApiKey } = require('./lib/congress-api');
const { RESOURCE_CONFIG, syncAll } = require('./sync-resources');

async function update() {
  const apiKey = requireApiKey();
  const congress = Number(process.env.CONGRESS || 119);
  const results = await syncAll({ apiKey, congress });
  const metadataPath = path.join(__dirname, '..', 'data', 'metadata.json');
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.writeFileSync(metadataPath, `${JSON.stringify({
    source: 'Congress.gov API',
    sourceUrl: 'https://api.congress.gov/',
    apiVersion: 'v3',
    congress,
    lookbackHours: Number(process.env.CONGRESS_LOOKBACK_HOURS || 6),
    resources: results.map((result) => result.name),
    counts: Object.fromEntries(results.map((result) => [result.name, result.count])),
  }, null, 2)}\n`);
  return results;
}

if (require.main === module) {
  update().then((results) => console.log(`Updated ${results.length} Congress.gov resources`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { update };

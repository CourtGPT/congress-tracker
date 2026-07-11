const fs = require('fs');
const path = require('path');
const { getMetrics, requireApiKey, resetMetrics } = require('./lib/congress-api');
const { buildIndex } = require('./build-index');
const { syncAll } = require('./sync-resources');
const { syncBillRelations } = require('./sync-bill-relations');
const { verifyData } = require('./verify-data');

function writeAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function resourceSnapshot(dataDir) {
  const resourceDir = path.join(dataDir, 'resources');
  const names = fs.readdirSync(resourceDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort();
  const counts = Object.fromEntries(names.map((name) => [name, JSON.parse(fs.readFileSync(path.join(resourceDir, `${name}.json`), 'utf8')).length]));
  return { names, counts };
}

async function update() {
  resetMetrics();
  const apiKey = requireApiKey();
  const congress = Number(process.env.CONGRESS || 119);
  const dataDir = path.join(__dirname, '..', 'data');
  const results = await syncAll({ apiKey, congress });
  const selectedResources = process.env.CONGRESS_RESOURCES
    ? new Set(process.env.CONGRESS_RESOURCES.split(',').map((name) => name.trim()).filter(Boolean))
    : null;
  const relations = !selectedResources || selectedResources.has('bills')
    ? await syncBillRelations({ apiKey, congress, dataDir, mode: process.env.CONGRESS_RELATIONS_MODE || 'hourly' })
    : { bills: 0, relations: 0, fetched: 0, skipped: true };
  const index = buildIndex({ dataDir, congress });
  const snapshot = resourceSnapshot(dataDir);
  const metadataPath = path.join(dataDir, 'metadata.json');
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  writeAtomic(metadataPath, {
    source: 'Congress.gov API',
    sourceUrl: 'https://api.congress.gov/',
    apiVersion: 'v3',
    congress,
    lookbackHours: Number(process.env.CONGRESS_LOOKBACK_HOURS || 6),
    resources: snapshot.names,
    counts: snapshot.counts,
    derived: { index: index.counts, billRelations: relations },
    requestMetrics: getMetrics(),
  });
  const verification = verifyData({ dataDir, congress, selectedResources });
  if (verification.errors.length) throw new Error(`Semantic verification failed:\n${verification.errors.join('\n')}`);
  console.log(`Request metrics: ${getMetrics().requests} requests, ${getMetrics().retries} retries`);
  return { results, relations, index, verification };
}

if (require.main === module) {
  update().then(({ results }) => console.log(`Updated ${results.length} Congress.gov resources`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { update };

const fs = require('fs');
const path = require('path');
const { paginate, requireApiKey, stableSort } = require('./lib/congress-api');

const DATA_DIR = path.join(__dirname, '..', 'data', 'resources');
const DEFAULT_LOOKBACK_HOURS = 6;
const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];

const RESOURCE_CONFIG = [
  { name: 'bills', paths: BILL_TYPES.map((type) => `/bill/${'${congress}'}/${type}`), incremental: true },
  { name: 'amendments', path: '/amendment', incremental: true },
  { name: 'summaries', path: '/summaries', incremental: true },
  { name: 'laws', path: '/law/${congress}', congress: true },
  { name: 'congresses', path: '/congress', bootstrapOnly: true },
  { name: 'members', path: '/member', incremental: true },
  { name: 'house-votes', path: '/house-vote/${congress}', congress: true },
  { name: 'committees', path: '/committee', incremental: true },
  { name: 'committee-reports', path: '/committee-report', incremental: true },
  { name: 'committee-prints', path: '/committee-print', incremental: true },
  { name: 'committee-meetings', path: '/committee-meeting/${congress}', congress: true },
  { name: 'hearings', path: '/hearing/${congress}', congress: true },
  { name: 'congressional-record', path: '/congressional-record', dailyQuery: true },
  { name: 'daily-congressional-record', path: '/daily-congressional-record' },
  { name: 'bound-congressional-record', path: '/bound-congressional-record', bootstrapOnly: true },
  { name: 'house-communications', path: '/house-communication/${congress}', congress: true },
  { name: 'house-requirements', path: '/house-requirement', bootstrapOnly: true },
  { name: 'senate-communications', path: '/senate-communication/${congress}', congress: true },
  { name: 'nominations', path: '/nomination/${congress}', congress: true, incremental: true },
  { name: 'crs-reports', path: '/crsreport', incremental: true },
  { name: 'treaties', path: '/treaty/${congress}', congress: true, incremental: true },
];

function replaceCongress(route, congress) {
  return route.replaceAll('${congress}', String(congress));
}

function lookbackDate(hours = DEFAULT_LOOKBACK_HOURS) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function resourceKey(record) {
  return String(record.url || record.id || record.number || record.systemCode || record.name || JSON.stringify(record));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function loadRecords(outputPath) {
  if (!fs.existsSync(outputPath)) return [];
  const value = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${outputPath} must contain a JSON array`);
  return value;
}

function writeAtomic(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, outputPath);
}

function mergeRecords(existing, incoming) {
  const merged = new Map(existing.map((record) => [resourceKey(record), record]));
  for (const record of incoming) merged.set(resourceKey(record), record);
  return stableSort([...merged.values()], ['updateDate', 'url', 'id', 'number']);
}

function dailyQuery(date = new Date()) {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

async function syncResource(config, { congress, apiKey, fetchImpl = fetch, mode = 'hourly', lookbackHours = DEFAULT_LOOKBACK_HOURS, dataDir = DATA_DIR } = {}) {
  const outputPath = path.join(dataDir, `${config.name}.json`);
  if (mode === 'hourly' && config.bootstrapOnly && fs.existsSync(outputPath)) {
    return { name: config.name, count: loadRecords(outputPath).length, skipped: true };
  }
  const query = config.incremental && mode !== 'full' ? { fromDateTime: lookbackDate(lookbackHours) } : (config.dailyQuery ? dailyQuery() : {});
  const existing = loadRecords(outputPath);
  if (mode === 'hourly' && !existing.length && config.incremental) {
    throw new Error(`No existing ${config.name} snapshot; run the manual full bootstrap before hourly sync`);
  }
  const maxPages = mode === 'full' ? Number(process.env.CONGRESS_MAX_PAGES || 1000) : 100;
  const routes = config.paths || [config.path];
  const records = [];
  for (const route of routes) {
    records.push(...await paginate(replaceCongress(route, congress), { apiKey, fetchImpl, query, maxPages }));
  }
  const scopedRecords = config.congress || config.name === 'bills'
    ? records.filter((record) => record.congress === undefined || String(record.congress) === String(congress))
    : records;
  if (!scopedRecords.length && !existing.length) throw new Error(`Congress.gov returned no records for ${config.name}`);
  const merged = mergeRecords(existing, scopedRecords);
  writeAtomic(outputPath, merged.map(canonical));
  return { name: config.name, count: merged.length, fetched: scopedRecords.length, skipped: false };
}

async function syncAll({ congress = Number(process.env.CONGRESS || 119), apiKey = requireApiKey(), fetchImpl = fetch, mode = process.env.CONGRESS_SYNC_MODE || 'hourly', lookbackHours = Number(process.env.CONGRESS_LOOKBACK_HOURS || DEFAULT_LOOKBACK_HOURS), dataDir = DATA_DIR } = {}) {
  if (!Number.isInteger(congress) || congress < 1) throw new Error('CONGRESS must be a positive integer');
  const selectedNames = process.env.CONGRESS_RESOURCES ? new Set(process.env.CONGRESS_RESOURCES.split(',').map((name) => name.trim()).filter(Boolean)) : null;
  const configs = selectedNames ? RESOURCE_CONFIG.filter((config) => selectedNames.has(config.name)) : RESOURCE_CONFIG;
  if (!configs.length) throw new Error('CONGRESS_RESOURCES did not select any known resources');
  const results = [];
  for (const config of configs) {
    results.push(await syncResource(config, { congress, apiKey, fetchImpl, mode, lookbackHours, dataDir }));
  }
  return results;
}

if (require.main === module) {
  syncAll().then((results) => console.log(`Synchronized ${results.length} Congress.gov resources`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { BILL_TYPES, DEFAULT_LOOKBACK_HOURS, RESOURCE_CONFIG, canonical, mergeRecords, syncAll, syncResource };

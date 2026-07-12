const fs = require('fs');
const path = require('path');
const { getMetrics, requireApiKey } = require('./lib/congress-api');
const {
  BILL_DETAIL_DIRNAME,
  buildBillId,
  fetchBillDetail,
  readDetailIfExists,
} = require('./fetch-bill-detail');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_LOOKBACK_HOURS = 6;
const DEFAULT_RPS = 4;
const DEFAULT_BATCH = 250;

function readBillsList(dataDir) {
  const filePath = path.join(dataDir, 'resources', 'bills.json');
  if (!fs.existsSync(filePath)) return [];
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${filePath} must contain a JSON array`);
  return value;
}

function withinLookback(bill, sinceIso) {
  if (!sinceIso) return true;
  const update = bill?.updateDateIncludingText || bill?.updateDate;
  if (!update) return false;
  return new Date(update).getTime() >= new Date(sinceIso).getTime();
}

function makeThrottle(rps) {
  const intervalMs = Math.max(0, Math.floor(1000 / Math.max(1, rps)));
  let lastDispatch = 0;
  const queue = [];
  let active = false;
  const run = async () => {
    if (active) return;
    active = true;
    while (queue.length) {
      const task = queue.shift();
      const now = Date.now();
      const delay = intervalMs - (now - lastDispatch);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      lastDispatch = Date.now();
      try {
        task.resolve(await task.fn());
      } catch (error) {
        task.reject(error);
      }
    }
    active = false;
  };
  return (fn) => {
    const promise = new Promise((resolve, reject) => queue.push({ fn, resolve, reject }));
    run();
    return promise;
  };
}

function shouldFetchDetail(bill, detail, options) {
  if (!detail) return true;
  if (options.force) return true;
  const incomingUpdate = bill?.updateDateIncludingText || bill?.updateDate || null;
  if (!incomingUpdate) return false;
  const existingUpdate = detail?.updateDateIncludingText || detail?.updateDate || null;
  if (!existingUpdate) return true;
  return new Date(incomingUpdate).getTime() > new Date(existingUpdate).getTime();
}

async function syncBillDetail({
  apiKey = requireApiKey(),
  fetchImpl = fetch,
  dataDir = DEFAULT_DATA_DIR,
  mode = process.env.CONGRESS_BILL_DETAIL_MODE || 'hourly',
  lookbackHours = Number(process.env.CONGRESS_BILL_DETAIL_LOOKBACK_HOURS || DEFAULT_LOOKBACK_HOURS),
  rps = Number(process.env.CONGRESS_BILL_DETAIL_RPS || DEFAULT_RPS),
  batchSize = Number(process.env.CONGRESS_BILL_DETAIL_BATCH || DEFAULT_BATCH),
  offset = Number(process.env.CONGRESS_BILL_DETAIL_OFFSET || 0),
  sinceIso = null,
  force = process.env.CONGRESS_BILL_DETAIL_FORCE === '1',
  billsFilter = null,
} = {}) {
  const bills = readBillsList(dataDir);
  if (!bills.length) {
    return { fetched: 0, skipped: 0, total: 0, mode, stopped: false };
  }
  const effectiveSinceIso = mode === 'hourly'
    ? sinceIso || new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString()
    : null;

  const candidates = bills.filter((bill) => {
    if (mode === 'hourly' && !withinLookback(bill, effectiveSinceIso)) return false;
    if (billsFilter && !billsFilter(bill)) return false;
    return true;
  });

  const ordered = candidates
    .map((bill) => ({ bill, billId: buildBillId(bill) }))
    .filter(({ billId }) => billId)
    .slice(offset, mode === 'hourly' ? undefined : offset + batchSize);

  const throttle = makeThrottle(rps);
  const startedAt = Date.now();
  let fetched = 0;
  let skipped = 0;
  let errors = 0;
  const errorSamples = [];

  await Promise.all(
    ordered.map(async ({ bill, billId }) => {
      const existing = readDetailIfExists(billId, dataDir);
      if (!shouldFetchDetail(bill, existing, { force })) {
        skipped += 1;
        return;
      }
      try {
        await throttle(() => fetchBillDetail(bill, { apiKey, fetchImpl, dataDir }));
        fetched += 1;
      } catch (error) {
        errors += 1;
        if (errorSamples.length < 3) errorSamples.push(`${billId}: ${error.message}`);
      }
    }),
  );

  const elapsedMs = Date.now() - startedAt;
  const detailDir = path.join(dataDir, 'resources', BILL_DETAIL_DIRNAME);
  const totalFiles = fs.existsSync(detailDir) ? fs.readdirSync(detailDir).filter((file) => file.endsWith('.json')).length : 0;
  const metrics = getMetrics();
  return {
    mode,
    fetched,
    skipped,
    errors,
    errorSamples,
    candidates: candidates.length,
    processed: ordered.length,
    offset,
    batchSize,
    rps,
    elapsedMs,
    detailFiles: totalFiles,
    requests: metrics.requests,
    retries: metrics.retries,
  };
}

if (require.main === module) {
  syncBillDetail()
    .then((result) => {
      console.log(
        `Bill-detail ${result.mode}: fetched=${result.fetched} skipped=${result.skipped} ` +
        `errors=${result.errors} processed=${result.processed}/${result.candidates} ` +
        `elapsed=${result.elapsedMs}ms requests=${result.requests} retries=${result.retries} ` +
        `detailFiles=${result.detailFiles}`,
      );
      if (result.errors) {
        for (const sample of result.errorSamples) console.error(`  ${sample}`);
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_BATCH,
  DEFAULT_LOOKBACK_HOURS,
  DEFAULT_RPS,
  makeThrottle,
  readBillsList,
  shouldFetchDetail,
  syncBillDetail,
  withinLookback,
};

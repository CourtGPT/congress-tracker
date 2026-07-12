const fs = require('fs');
const path = require('path');
const { requireApiKey } = require('./lib/congress-api');
const { BILL_DETAIL_DIRNAME, buildBillId } = require('./fetch-bill-detail');
const { syncBillDetail } = require('./sync-bill-detail');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_BATCH = 250;
const DEFAULT_RPS = 4;

function countDetailFiles(dataDir) {
  const dir = path.join(dataDir, 'resources', BILL_DETAIL_DIRNAME);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((file) => file.endsWith('.json')).length;
}

async function backfill({
  apiKey = requireApiKey(),
  fetchImpl = fetch,
  dataDir = DEFAULT_DATA_DIR,
  batchSize = Number(process.env.CONGRESS_BILL_DETAIL_BATCH || DEFAULT_BATCH),
  rps = Number(process.env.CONGRESS_BILL_DETAIL_RPS || DEFAULT_RPS),
  startOffset = Number(process.env.CONGRESS_BILL_DETAIL_OFFSET || 0),
  targetTotal = Number(process.env.CONGRESS_BILL_DETAIL_TARGET || Infinity),
} = {}) {
  const billsPath = path.join(dataDir, 'resources', 'bills.json');
  if (!fs.existsSync(billsPath)) throw new Error(`Missing bills index at ${billsPath}`);
  const bills = JSON.parse(fs.readFileSync(billsPath, 'utf8'));
  const total = bills.length;
  let offset = startOffset;
  let cumulativeFetched = 0;
  let cumulativeSkipped = 0;
  let cumulativeErrors = 0;
  const startedAt = Date.now();

  while (offset < Math.min(total, targetTotal)) {
    const result = await syncBillDetail({
      apiKey,
      fetchImpl,
      dataDir,
      mode: 'full',
      batchSize,
      offset,
      rps,
    });
    cumulativeFetched += result.fetched;
    cumulativeSkipped += result.skipped;
    cumulativeErrors += result.errors;
    const elapsedMs = Date.now() - startedAt;
    const processed = offset + result.processed;
    const rate = processed ? processed / (elapsedMs / 1000) : 0;
    const remainingBills = Math.max(0, Math.min(total, targetTotal) - processed);
    const etaSeconds = rate ? remainingBills / rate : 0;
    const etaLabel = Number.isFinite(etaSeconds) ? `${Math.ceil(etaSeconds / 60)}m` : 'unknown';
    console.log(
      `backfill: offset=${offset} processed=${result.processed} ` +
      `fetched=${result.fetched} skipped=${result.skipped} errors=${result.errors} ` +
      `total=${processed}/${total} elapsed=${(elapsedMs / 1000).toFixed(1)}s eta=${etaLabel}`,
    );
    if (result.processed === 0) break;
    offset += result.processed;
    if (result.fetched === 0 && result.skipped > 0) {
      // Whole batch skipped — most likely caught up; continue advancing to detect remaining work.
      continue;
    }
    if (result.errors >= result.processed) {
      console.error('backfill: every bill in the batch errored; stopping for manual review');
      break;
    }
  }

  const detailFiles = countDetailFiles(dataDir);
  return {
    offset,
    totalFetched: cumulativeFetched,
    totalSkipped: cumulativeSkipped,
    totalErrors: cumulativeErrors,
    detailFiles,
  };
}

if (require.main === module) {
  backfill()
    .then((summary) => {
      console.log(
        `Backfill complete: fetched=${summary.totalFetched} skipped=${summary.totalSkipped} ` +
        `errors=${summary.totalErrors} detailFiles=${summary.detailFiles}`,
      );
      if (summary.totalErrors) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { backfill, countDetailFiles };
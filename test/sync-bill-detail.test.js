const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BILL_DETAIL_DIRNAME,
  normalizeBillDetail,
} = require('../scripts/fetch-bill-detail');
const {
  DEFAULT_RPS,
  makeThrottle,
  shouldFetchDetail,
  syncBillDetail,
  withinLookback,
} = require('../scripts/sync-bill-detail');

function fixtureDataDir() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-bd-sync-'));
  const resourceDir = path.join(dataDir, 'resources');
  fs.mkdirSync(resourceDir, { recursive: true });
  const bills = [
    { congress: 119, type: 'HR', number: '1', title: 'A', originChamber: 'House', updateDate: '2026-07-12', updateDateIncludingText: '2026-07-12', latestAction: { actionDate: '2026-07-12' }, url: 'https://api.congress.gov/v3/bill/119/hr/1' },
    { congress: 119, type: 'HR', number: '2', title: 'B', originChamber: 'House', updateDate: '2026-07-12', updateDateIncludingText: '2026-07-12', latestAction: { actionDate: '2026-07-12' }, url: 'https://api.congress.gov/v3/bill/119/hr/2' },
    { congress: 119, type: 'HR', number: '3', title: 'C', originChamber: 'House', updateDate: '2025-01-01', updateDateIncludingText: '2025-01-01', latestAction: { actionDate: '2025-01-01' }, url: 'https://api.congress.gov/v3/bill/119/hr/3' },
    { congress: 119, type: 'S', number: '100', title: 'D', originChamber: 'Senate', updateDate: '2026-07-12', updateDateIncludingText: '2026-07-12', latestAction: { actionDate: '2026-07-12' }, url: 'https://api.congress.gov/v3/bill/119/s/100' },
  ];
  fs.writeFileSync(path.join(resourceDir, 'bills.json'), `${JSON.stringify(bills, null, 2)}\n`);
  return dataDir;
}

function response(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  };
}

function payloadFor(bill) {
  return {
    bill: {
      congress: bill.congress,
      type: bill.type,
      number: bill.number,
      title: bill.title,
      originChamber: bill.originChamber,
      originChamberCode: bill.originChamber === 'Senate' ? 'S' : 'H',
      introducedDate: '2025-01-01',
      updateDate: bill.updateDate,
      updateDateIncludingText: bill.updateDateIncludingText,
      latestAction: { actionDate: bill.updateDate, text: 'Introduced' },
      url: bill.url,
      actions: { count: 1, items: [{ actionDate: bill.updateDate, text: 'Introduced', type: 'IntroReferral', sourceSystem: { name: 'House' }, actionCode: '1000' }] },
      sponsors: [{ bioguideId: 'M000001', firstName: 'A', lastName: 'B', party: 'X', state: 'CA' }],
      cosponsors: { count: 0, items: [] },
      committees: { count: 0, items: [] },
      relatedBills: { count: 0, items: [] },
      amendments: { count: 0, items: [] },
      summaries: { count: 0, items: [] },
      textVersions: { count: 0, items: [] },
      cboCostEstimates: { count: 0, items: [] },
      policyArea: { name: 'Other' },
      subjects: { legislativeSubjects: [], policyArea: { name: 'Other' } },
      laws: [],
    },
  };
}

test('makeThrottle spaces calls at the requested rate', async () => {
  const throttle = makeThrottle(50); // 20ms between calls
  const calls = [];
  const record = () => { calls.push(Date.now()); };
  await Promise.all([
    throttle(record),
    throttle(record),
    throttle(record),
    throttle(record),
  ]);
  assert.equal(calls.length, 4);
  for (let i = 1; i < calls.length; i += 1) {
    assert.ok(calls[i] - calls[i - 1] >= 18, `expected ≥18ms gap, got ${calls[i] - calls[i - 1]}`);
  }
});

test('makeThrottle rejects when the underlying function rejects', async () => {
  const throttle = makeThrottle(1000);
  await assert.rejects(throttle(async () => { throw new Error('boom'); }), /boom/u);
});

test('withinLookback filters by updateDate', () => {
  assert.equal(withinLookback({ updateDate: '2026-07-12T00:00:00Z', updateDateIncludingText: '2026-07-12T00:00:00Z' }, '2026-07-11T00:00:00Z'), true);
  assert.equal(withinLookback({ updateDate: '2025-01-01T00:00:00Z', updateDateIncludingText: '2025-01-01T00:00:00Z' }, '2026-07-11T00:00:00Z'), false);
  assert.equal(withinLookback({}, '2026-07-11T00:00:00Z'), false);
  assert.equal(withinLookback({}, null), true);
});

test('shouldFetchDetail skips when existing detail matches updateDate', () => {
  const bill = { updateDate: '2026-07-12', updateDateIncludingText: '2026-07-12' };
  const existing = { updateDate: '2026-07-12', updateDateIncludingText: '2026-07-12' };
  assert.equal(shouldFetchDetail(bill, existing, {}), false);
  assert.equal(shouldFetchDetail(bill, { updateDate: '2026-07-11', updateDateIncludingText: '2026-07-11' }, {}), true);
  assert.equal(shouldFetchDetail(bill, null, {}), true);
  assert.equal(shouldFetchDetail(bill, existing, { force: true }), true);
});

test('syncBillDetail hourly mode fetches only bills within the lookback window', async () => {
  const dataDir = fixtureDataDir();
  const seen = new Set();
  const fetchImpl = async (url) => {
    const match = url.match(/\/bill\/(\d+)\/([^/]+)\/(\d+)/u);
    const billId = `${match[1]}-${match[2]}-${match[3]}`;
    seen.add(billId);
    return response(payloadFor({
      congress: Number(match[1]),
      type: match[2].toUpperCase(),
      number: match[3],
      updateDate: '2026-07-12',
      updateDateIncludingText: '2026-07-12',
      originChamber: match[2] === 's' ? 'Senate' : 'House',
      url,
    }));
  };
  const result = await syncBillDetail({
    apiKey: 'test-key',
    fetchImpl,
    dataDir,
    mode: 'hourly',
    lookbackHours: 24,
    rps: 1000,
    sinceIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.ok(result.fetched >= 3, `expected at least 3 fetched, got ${result.fetched}`);
  assert.equal(seen.has('119-hr-3'), false, 'old bill should be filtered out by lookback window');
  const detailFiles = fs.readdirSync(path.join(dataDir, 'resources', BILL_DETAIL_DIRNAME));
  assert.equal(detailFiles.length, result.fetched);
});

test('syncBillDetail full mode honors offset and batch size', async () => {
  const dataDir = fixtureDataDir();
  const fetchImpl = async (url) => {
    const match = url.match(/\/bill\/(\d+)\/([^/]+)\/(\d+)/u);
    return response(payloadFor({
      congress: Number(match[1]),
      type: match[2].toUpperCase(),
      number: match[3],
      updateDate: '2026-07-12',
      updateDateIncludingText: '2026-07-12',
      originChamber: match[2] === 's' ? 'Senate' : 'House',
      url,
    }));
  };
  const first = await syncBillDetail({
    apiKey: 'test-key', fetchImpl, dataDir, mode: 'full', batchSize: 2, offset: 0, rps: 1000,
  });
  assert.equal(first.processed, 2);
  assert.equal(first.fetched, 2);
  const second = await syncBillDetail({
    apiKey: 'test-key', fetchImpl, dataDir, mode: 'full', batchSize: 2, offset: 2, rps: 1000,
  });
  assert.equal(second.processed, 2);
  assert.equal(second.fetched, 2);
});

test('syncBillDetail full mode is idempotent: re-run with same offset reports no fetched', async () => {
  const dataDir = fixtureDataDir();
  const fetchImpl = async (url) => {
    const match = url.match(/\/bill\/(\d+)\/([^/]+)\/(\d+)/u);
    return response(payloadFor({
      congress: Number(match[1]),
      type: match[2].toUpperCase(),
      number: match[3],
      updateDate: '2026-07-12',
      updateDateIncludingText: '2026-07-12',
      originChamber: match[2] === 's' ? 'Senate' : 'House',
      url,
    }));
  };
  const first = await syncBillDetail({
    apiKey: 'test-key', fetchImpl, dataDir, mode: 'full', batchSize: 100, offset: 0, rps: 1000,
  });
  assert.equal(first.fetched, 4);
  const second = await syncBillDetail({
    apiKey: 'test-key', fetchImpl, dataDir, mode: 'full', batchSize: 100, offset: 0, rps: 1000,
  });
  assert.equal(second.fetched, 0);
  assert.ok(second.skipped >= 4);
});

test('syncBillDetail hourly skips bills already up to date', async () => {
  const dataDir = fixtureDataDir();
  const fetchImpl = async (url) => {
    const match = url.match(/\/bill\/(\d+)\/([^/]+)\/(\d+)/u);
    return response(payloadFor({
      congress: Number(match[1]),
      type: match[2].toUpperCase(),
      number: match[3],
      updateDate: '2026-07-12',
      updateDateIncludingText: '2026-07-12',
      originChamber: match[2] === 's' ? 'Senate' : 'House',
      url,
    }));
  };
  await syncBillDetail({
    apiKey: 'test-key', fetchImpl, dataDir, mode: 'hourly', lookbackHours: 24, sinceIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), rps: 1000,
  });
  const second = await syncBillDetail({
    apiKey: 'test-key', fetchImpl, dataDir, mode: 'hourly', lookbackHours: 24, sinceIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), rps: 1000,
  });
  assert.equal(second.fetched, 0);
});

test('DEFAULT_RPS is a positive number', () => {
  assert.ok(typeof DEFAULT_RPS === 'number' && DEFAULT_RPS > 0);
});

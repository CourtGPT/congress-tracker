const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBillUrl, syncBillRelations } = require('../scripts/sync-bill-relations');

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

function writeBills(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'resources', 'bills.json'), `${JSON.stringify([
    {
      congress: 119,
      number: '12',
      type: 'HR',
      title: 'A bill',
      updateDate: '2026-07-11',
      url: 'https://api.congress.gov/v3/bill/119/hr/12?format=json',
    },
    {
      congress: 119,
      number: '99',
      type: 'HR',
      title: 'An older bill',
      updateDate: '2025-01-01',
      url: 'https://api.congress.gov/v3/bill/119/hr/99?format=json',
    },
  ], null, 2)}\n`);
}

test('parses Congress.gov bill URLs into stable identities', () => {
  assert.deepEqual(parseBillUrl('https://api.congress.gov/v3/bill/119/hr/12?format=json'), {
    congress: 119,
    type: 'hr',
    number: '12',
    billId: '119:hr:12',
  });
  assert.throws(() => parseBillUrl('https://example.com/bill/119/hr/12'), /Congress.gov bill URL/);
});

test('fetches and normalizes sponsors and cosponsors for changed bills', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-relations-'));
  writeBills(dataDir);
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return url.includes('/cosponsors')
      ? response(200, { cosponsors: [{ bioguideId: 'C000001', name: 'Cosponsor, Casey' }] })
      : response(200, { sponsors: [{ bioguideId: 'S000001', fullName: 'Sponsor, Sam' }] });
  };

  const result = await syncBillRelations({
    congress: 119,
    apiKey: 'test-key',
    dataDir,
    fetchImpl,
    now: new Date('2026-07-11T12:00:00Z'),
    lookbackHours: 24,
  });

  const relations = JSON.parse(fs.readFileSync(path.join(dataDir, 'resources', 'bill-relations.json'), 'utf8'));
  assert.equal(result.bills, 1);
  assert.equal(relations.length, 2);
  assert.deepEqual(relations.map(({ role, memberId }) => ({ role, memberId })), [
    { role: 'cosponsor', memberId: 'C000001' },
    { role: 'sponsor', memberId: 'S000001' },
  ]);
  assert.equal(requests.length, 2);
  assert.ok(relations.every((relation) => !relation.sourceUrl.includes('test-key')));
});

test('replaces changed-bill relations while preserving unrelated bills', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-relations-'));
  writeBills(dataDir);
  const relationPath = path.join(dataDir, 'resources', 'bill-relations.json');
  fs.writeFileSync(relationPath, `${JSON.stringify([
    { billId: '119:hr:12', memberId: 'OLD', role: 'cosponsor', congress: 119, sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/12' },
    { billId: '119:hr:99', memberId: 'KEEP', role: 'sponsor', congress: 119, sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/99' },
  ], null, 2)}\n`);
  const fetchImpl = async (url) => url.includes('/cosponsors')
    ? response(200, { cosponsors: [{ bioguideId: 'NEW' }] })
    : response(200, { sponsors: [{ bioguideId: 'SPONSOR' }] });

  await syncBillRelations({
    congress: 119,
    apiKey: 'test-key',
    dataDir,
    fetchImpl,
    now: new Date('2026-07-11T12:00:00Z'),
    lookbackHours: 24,
  });

  const relations = JSON.parse(fs.readFileSync(relationPath, 'utf8'));
  assert.deepEqual(relations.map(({ billId, memberId }) => ({ billId, memberId })), [
    { billId: '119:hr:12', memberId: 'NEW' },
    { billId: '119:hr:12', memberId: 'SPONSOR' },
    { billId: '119:hr:99', memberId: 'KEEP' },
  ]);
});

test('leaves the relation cache untouched when a selected bill fails', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-relations-'));
  writeBills(dataDir);
  const relationPath = path.join(dataDir, 'resources', 'bill-relations.json');
  const original = '[{"billId":"119:hr:99","memberId":"KEEP","role":"sponsor"}]\n';
  fs.writeFileSync(relationPath, original);

  await assert.rejects(() => syncBillRelations({
    congress: 119,
    apiKey: 'test-key',
    dataDir,
    fetchImpl: async () => response(400, {}),
    now: new Date('2026-07-11T12:00:00Z'),
    lookbackHours: 24,
  }), /HTTP 400/);
  assert.equal(fs.readFileSync(relationPath, 'utf8'), original);
});

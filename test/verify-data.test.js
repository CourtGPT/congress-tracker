const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIndex } = require('../scripts/build-index');
const { verifyData } = require('../scripts/verify-data');

function validDataDir() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-verify-'));
  const resourceDir = path.join(dataDir, 'resources');
  fs.mkdirSync(resourceDir, { recursive: true });
  const resources = {
    members: [{ bioguideId: 'M000001', name: 'Member, One', chamber: 'House', state: 'CA', url: 'https://www.congress.gov/member/member-one/M000001' }],
    bills: [{ congress: 119, type: 'HR', number: '1', title: 'A bill', originChamber: 'House', introducedDate: '2026-01-02', latestAction: { actionDate: '2026-01-03', text: 'Referred.' }, url: 'https://api.congress.gov/v3/bill/119/hr/1?format=json' }],
    'bill-relations': [{ billId: '119:hr:1', memberId: 'M000001', role: 'cosponsor', congress: 119, sourceUrl: 'https://api.congress.gov/v3/bill/119/hr/1/cosponsors' }],
  };
  for (const [name, records] of Object.entries(resources)) fs.writeFileSync(path.join(resourceDir, `${name}.json`), `${JSON.stringify(records, null, 2)}\n`);
  fs.writeFileSync(path.join(dataDir, 'metadata.json'), `${JSON.stringify({ source: 'Congress.gov API', sourceUrl: 'https://api.congress.gov/', apiVersion: 'v3', congress: 119, resources: Object.keys(resources), counts: Object.fromEntries(Object.entries(resources).map(([name, records]) => [name, records.length])) }, null, 2)}\n`);
  buildIndex({ dataDir, congress: 119, generatedAt: '2026-07-11T00:00:00Z' });
  return dataDir;
}

function readResource(dataDir, name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'resources', `${name}.json`), 'utf8'));
}

function writeResource(dataDir, name, records) {
  fs.writeFileSync(path.join(dataDir, 'resources', `${name}.json`), `${JSON.stringify(records, null, 2)}\n`);
}

test('accepts valid resources, metadata, and derived references', () => {
  const result = verifyData({ dataDir: validDataDir(), congress: 119 });
  assert.deepEqual(result.errors, []);
  assert.ok(result.checked > 0);
});

test('rejects duplicate identities and dangling relationship targets', () => {
  const dataDir = validDataDir();
  const members = readResource(dataDir, 'members');
  writeResource(dataDir, 'members', [...members, members[0]]);
  const relations = readResource(dataDir, 'bill-relations');
  writeResource(dataDir, 'bill-relations', [...relations, { ...relations[0], memberId: 'MISSING' }]);
  const result = verifyData({ dataDir, congress: 119 });
  assert.ok(result.errors.some((error) => /duplicate member ID/u.test(error)));
  assert.ok(result.errors.some((error) => /unknown member ID MISSING/u.test(error)));
});

test('rejects Congress and chamber mismatches, invalid URLs, and impossible dates', () => {
  const dataDir = validDataDir();
  const bills = readResource(dataDir, 'bills');
  writeResource(dataDir, 'bills', [{ ...bills[0], congress: 118, originChamber: 'Senate', type: 'HR', introducedDate: '2026-01-04', latestAction: { actionDate: '2026-01-03', text: 'Impossible.' }, url: 'https://example.com/bill/118/hr/1' }]);
  const result = verifyData({ dataDir, congress: 119 });
  assert.ok(result.errors.some((error) => /Congress 118/u.test(error)));
  assert.ok(result.errors.some((error) => /chamber mismatch/u.test(error)));
  assert.ok(result.errors.some((error) => /source URL/u.test(error)));
  assert.ok(result.errors.some((error) => /before introduction/u.test(error)));
});

test('redacts API keys from verification errors', () => {
  const dataDir = validDataDir();
  const relations = readResource(dataDir, 'bill-relations');
  writeResource(dataDir, 'bill-relations', [{ ...relations[0], sourceUrl: 'https://api.congress.gov/v3/bill/119/hr/1/cosponsors?api_key=secret-key' }]);
  const result = verifyData({ dataDir, congress: 119 });
  const message = result.errors.join('\n');
  assert.doesNotMatch(message, /secret-key/);
  assert.doesNotMatch(message, /api_key=/);
});

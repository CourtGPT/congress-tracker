const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIndex } = require('../scripts/build-index');

function fixtureDataDir() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-index-'));
  const resourceDir = path.join(dataDir, 'resources');
  fs.mkdirSync(resourceDir, { recursive: true });
  const resources = {
    members: [{ bioguideId: 'M000001', name: 'Member, One', party: 'Independent', state: 'CA', chamber: 'House', url: 'https://www.congress.gov/member/member-one/M000001' }],
    bills: [{ congress: 119, type: 'HR', number: '1', title: 'A bill', originChamber: 'House', introducedDate: '2026-01-02', updateDate: '2026-01-03', latestAction: { actionDate: '2026-01-04', text: 'Referred to committee.' }, committees: [{ systemCode: 'HSJU', name: 'Judiciary' }], url: 'https://api.congress.gov/v3/bill/119/hr/1?format=json' }],
    committees: [{ systemCode: 'HSJU', name: 'Judiciary', chamber: 'House', url: 'https://api.congress.gov/v3/committee/hsju00' }],
    'house-votes': [{ congress: 119, rollNumber: '12', date: '2026-01-05', description: 'On passage of H.R. 1', bill: { congress: 119, type: 'HR', number: '1' }, url: 'https://api.congress.gov/v3/house-vote/119/12' }],
    'bill-relations': [{ billId: '119:hr:1', memberId: 'M000001', memberName: 'Member, One', role: 'cosponsor', congress: 119, billUrl: 'https://api.congress.gov/v3/bill/119/hr/1?format=json', sourceUrl: 'https://api.congress.gov/v3/bill/119/hr/1/cosponsors' }],
  };
  for (const [name, records] of Object.entries(resources)) fs.writeFileSync(path.join(resourceDir, `${name}.json`), `${JSON.stringify(records, null, 2)}\n`);
  return dataDir;
}

test('builds compact entities, typed relations, and chronological events', () => {
  const index = buildIndex({ dataDir: fixtureDataDir(), congress: 119, generatedAt: '2026-07-11T00:00:00Z' });
  assert.equal(index.generatedAt, '2026-07-11T00:00:00Z');
  assert.equal(index.source.congress, 119);
  assert.equal(index.entities.members.M000001.name, 'Member, One');
  assert.equal(index.entities.members.M000001.district, null);
  assert.equal(index.entities.bills['119:hr:1'].title, 'A bill');
  assert.equal(index.entities.committees.HSJU.name, 'Judiciary');
  assert.ok(index.entities.votes['119:12']);
  assert.deepEqual(index.relationships.filter(({ type }) => type === 'cosponsored'), [{
    type: 'cosponsored',
    from: 'M000001',
    to: '119:hr:1',
    congress: 119,
    sourceUrl: 'https://api.congress.gov/v3/bill/119/hr/1/cosponsors',
  }]);
  assert.deepEqual(index.timeline.map(({ date, type }) => ({ date, type })), [
    { date: '2026-01-02T00:00:00Z', type: 'introduced' },
    { date: '2026-01-03T00:00:00Z', type: 'updated' },
    { date: '2026-01-04T00:00:00Z', type: 'action' },
    { date: '2026-01-05T00:00:00Z', type: 'vote' },
  ]);
});

test('produces deterministic output for a fixed generation timestamp', () => {
  const dataDir = fixtureDataDir();
  const first = buildIndex({ dataDir, congress: 119, generatedAt: '2026-07-11T00:00:00Z' });
  const second = buildIndex({ dataDir, congress: 119, generatedAt: '2026-07-11T00:00:00Z' });
  assert.deepEqual(second, first);
});

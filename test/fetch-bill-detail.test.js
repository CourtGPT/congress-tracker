const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BILL_DETAIL_DIRNAME,
  buildBillId,
  detailOutputPath,
  normalizeBillDetail,
  normalizePerson,
  normalizeSubjects,
  normalizeAction,
} = require('../scripts/fetch-bill-detail');
const { validateBillDetail } = require('../scripts/lib/bill-detail-validate');

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const FIXTURE_PAYLOAD = {
  bill: {
    congress: 119,
    type: 'HR',
    number: '1',
    title: 'A bill for the people',
    originChamber: 'House',
    originChamberCode: 'H',
    introducedDate: '2025-01-03',
    updateDate: '2025-01-04',
    updateDateIncludingText: '2025-01-04',
    latestAction: { actionDate: '2025-01-03', text: 'Introduced in House' },
    url: 'https://api.congress.gov/v3/bill/119/hr/1?format=json',
    actions: {
      count: 2,
      items: [
        { actionDate: '2025-01-03', text: 'Introduced in House', type: 'IntroReferral', sourceSystem: { name: 'House' }, actionCode: '1000' },
        { actionDate: '2025-01-04', text: 'Referred to the House Committee on Oversight.', type: 'Referral', sourceSystem: { name: 'House' }, actionCode: '1100' },
      ],
    },
    sponsors: [
      { bioguideId: 'M000001', firstName: 'Jane', lastName: 'Doe', party: 'Democratic', state: 'CA', url: 'https://api.congress.gov/v3/member/M000001' },
    ],
    cosponsors: {
      count: 2,
      items: [
        { bioguideId: 'M000002', firstName: 'John', lastName: 'Smith', party: 'Republican', state: 'TX', sponsorshipDate: '2025-01-04' },
        { bioguideId: 'M000003', firstName: 'Lee', lastName: 'Park', party: 'Democratic', state: 'NY', sponsorshipDate: '2025-01-05' },
      ],
    },
    committees: {
      count: 1,
      items: [{ systemCode: 'HSGO', name: 'Oversight', chamber: 'House', referralDate: '2025-01-04', activity: 'Referral' }],
    },
    relatedBills: { count: 0, items: [] },
    amendments: { count: 0, items: [] },
    summaries: { count: 1, items: [{ versionCode: '00', actionDate: '2025-01-04', actionDesc: 'Introduced in House', text: 'This bill would do X.', updateDate: '2025-01-04' }] },
    textVersions: { count: 1, items: [{ type: 'Introduced', date: '2025-01-03', formats: [{ type: 'PDF', url: 'https://example.com/hr1.pdf' }] }] },
    cboCostEstimates: { count: 0, items: [] },
    policyArea: { name: 'Government Operations and Politics' },
    subjects: {
      legislativeSubjects: [{ name: 'Congressional oversight', updateDate: '2025-01-04' }],
      policyArea: { name: 'Government Operations and Politics' },
    },
    laws: [],
  },
};

test('buildBillId builds stable id from congress/type/number', () => {
  assert.equal(buildBillId({ congress: 119, type: 'HR', number: '1' }), '119-hr-1');
  assert.equal(buildBillId({ congress: '119', type: 's', number: '100' }), '119-s-100');
  assert.equal(buildBillId({}), null);
});

test('detailOutputPath builds path under data/resources/bills-detail', () => {
  const dataDir = '/tmp/example';
  assert.equal(detailOutputPath('119-hr-1', dataDir), path.join(dataDir, 'resources', BILL_DETAIL_DIRNAME, '119-hr-1.json'));
});

test('normalizeBillDetail flattens Congress.gov payload and preserves fields', () => {
  const detail = normalizeBillDetail(FIXTURE_PAYLOAD);
  assert.equal(detail.billId, '119-hr-1');
  assert.equal(detail.congress, 119);
  assert.equal(detail.type, 'HR');
  assert.equal(detail.typeCode, 'hr');
  assert.equal(detail.number, '1');
  assert.equal(detail.title, 'A bill for the people');
  assert.equal(detail.originChamberCode, 'H');
  assert.equal(detail.actions.count, 2);
  assert.equal(detail.actions.items[0].text, 'Introduced in House');
  assert.equal(detail.sponsors[0].bioguideId, 'M000001');
  assert.equal(detail.sponsors[0].fullName, 'Jane Doe');
  assert.equal(detail.cosponsors.count, 2);
  assert.equal(detail.cosponsors.withdrawnCount, 0);
  assert.equal(detail.committees.count, 1);
  assert.equal(detail.committees.items[0].systemCode, 'HSGO');
  assert.equal(detail.summaries.count, 1);
  assert.equal(detail.summaries.latest, 'This bill would do X.');
  assert.equal(detail.textVersions.count, 1);
  assert.equal(detail.textVersions.items[0].formats[0].type, 'PDF');
  assert.equal(detail.policyArea.name, 'Government Operations and Politics');
  assert.equal(detail.subjects.legislativeSubjects[0].name, 'Congressional oversight');
  assert.equal(detail.laws.length, 0);
  assert.equal(detail.sourceUrl, 'https://api.congress.gov/v3/bill/119/hr/1?format=json');
});

test('normalizeBillDetail throws when payload lacks identity', () => {
  assert.throws(() => normalizeBillDetail({ bill: {} }), /missing congress\/type\/number/u);
});

test('normalizePerson fills missing fullName from firstName+lastName', () => {
  assert.equal(normalizePerson({ bioguideId: 'M1', firstName: 'Ada', lastName: 'Lovelace' }).fullName, 'Ada Lovelace');
  assert.equal(normalizePerson({ bioguideId: 'M1', fullName: 'Custom Name', firstName: 'Ada', lastName: 'Lovelace' }).fullName, 'Custom Name');
  assert.equal(normalizePerson({ bioguideId: 'M1' }).fullName, null);
});

test('normalizeSubjects accepts a missing object and returns empty defaults', () => {
  assert.deepEqual(normalizeSubjects(undefined), { legislativeSubjects: [], policyArea: null });
  assert.deepEqual(normalizeSubjects(null), { legislativeSubjects: [], policyArea: null });
  assert.equal(normalizeSubjects({ legislativeSubjects: [], policyArea: { name: 'X' } }).policyArea.name, 'X');
});

test('normalizeAction preserves required keys and tolerates missing fields', () => {
  const action = normalizeAction({ actionDate: '2025-01-03', text: 'x', type: 'IntroReferral', sourceSystem: { name: 'House' }, actionCode: '1000' });
  assert.deepEqual(action, {
    actionDate: '2025-01-03',
    text: 'x',
    type: 'IntroReferral',
    sourceSystem: 'House',
    actionCode: '1000',
  });
  assert.equal(normalizeAction(null), null);
});

test('normalized bill detail passes the bill-detail validator', () => {
  const detail = normalizeBillDetail(FIXTURE_PAYLOAD);
  const errors = validateBillDetail(detail);
  assert.deepEqual(errors, []);
});

test('bill-detail validator rejects missing required keys', () => {
  const detail = normalizeBillDetail(FIXTURE_PAYLOAD);
  delete detail.billId;
  const errors = validateBillDetail(detail);
  assert.ok(errors.some((error) => error.includes('billId')), `expected billId error, got: ${errors.join(' | ')}`);
});

test('bill-detail validator rejects mismatched wrappers', () => {
  const detail = normalizeBillDetail(FIXTURE_PAYLOAD);
  detail.actions.count = 99;
  const errors = validateBillDetail(detail);
  assert.ok(errors.some((error) => error.includes('actions.count')));
});

test('bill-detail validator rejects bad originChamberCode', () => {
  const detail = normalizeBillDetail(FIXTURE_PAYLOAD);
  detail.originChamberCode = 'X';
  const errors = validateBillDetail(detail);
  assert.ok(errors.some((error) => error.includes('originChamberCode')));
});

test('fetchBillDetail writes canonical JSON to bills-detail dir', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-bd-'));
  const fetchImpl = async () => response(200, FIXTURE_PAYLOAD);
  const { fetchBillDetail } = require('../scripts/fetch-bill-detail');
  const detail = await fetchBillDetail({ congress: 119, type: 'hr', number: '1' }, { apiKey: 'test-key', fetchImpl, dataDir });
  const written = JSON.parse(fs.readFileSync(path.join(dataDir, 'resources', BILL_DETAIL_DIRNAME, '119-hr-1.json'), 'utf8'));
  assert.equal(written.billId, '119-hr-1');
  assert.deepEqual(written, detail);
});

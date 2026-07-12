const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { RESOURCE_CONFIG, syncResource } = require('../scripts/sync-resources');

function response(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  };
}

test('merges overlapping incremental resource windows deterministically', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-resources-'));
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return response({ bills: [{ url: 'https://api.congress.gov/v3/bill/119/hr/1', number: '1', updateDate: '2026-07-11T10:00:00Z', title: 'Updated' }] });
  };
  const config = RESOURCE_CONFIG.find((resource) => resource.name === 'bills');
  await syncResource(config, { congress: 119, apiKey: 'test-key', fetchImpl, dataDir, mode: 'full', lookbackHours: 6 });
  const second = await syncResource(config, { congress: 119, apiKey: 'test-key', fetchImpl, dataDir, mode: 'hourly', lookbackHours: 6 });
  const records = JSON.parse(fs.readFileSync(path.join(dataDir, 'bills.json'), 'utf8'));
  assert.equal(second.count, 1);
  assert.equal(records[0].title, 'Updated');
  assert.ok(urls.some((url) => /fromDateTime=/.test(url)));
  assert.ok(urls.every((url) => /limit=250/.test(url)));
});

test('skips bootstrap-only resources during hourly runs after bootstrap', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-bootstrap-'));
  const config = RESOURCE_CONFIG.find((resource) => resource.name === 'congresses');
  fs.writeFileSync(path.join(dataDir, 'congresses.json'), '[{"name":"119th Congress"}]\n');
  const result = await syncResource(config, { congress: 119, apiKey: 'test-key', fetchImpl: async () => { throw new Error('network should not be called'); }, dataDir, mode: 'hourly' });
  assert.equal(result.skipped, true);
  assert.equal(result.count, 1);
});

test('preserves committee report parts that share a source URL', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-committee-reports-'));
  const config = RESOURCE_CONFIG.find((resource) => resource.name === 'committee-reports');
  const fetchImpl = async () => response({ reports: [
    { url: 'https://api.congress.gov/v3/committee-report/119/HRPT/106', cmte_rpt_id: 298918, part: 1, citation: 'H. Rept. 119-106,Book 1' },
    { url: 'https://api.congress.gov/v3/committee-report/119/HRPT/106', cmte_rpt_id: 304230, part: 2, citation: 'H. Rept. 119-106,Book 2' },
  ] });

  const result = await syncResource(config, { congress: 119, apiKey: 'test-key', fetchImpl, dataDir, mode: 'full' });
  const records = JSON.parse(fs.readFileSync(path.join(dataDir, 'committee-reports.json'), 'utf8'));

  assert.equal(result.count, 2);
  assert.deepEqual(records.map((record) => record.part), [1, 2]);
});

test('syncs House and Senate amendments through separate Congress-scoped routes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-amendments-'));
  const config = RESOURCE_CONFIG.find((resource) => resource.name === 'amendments');
  const routes = [];
  const fetchImpl = async (url) => {
    routes.push(url);
    return response({ amendments: [
      { congress: 119, type: url.includes('/hamdt') ? 'HAMDT' : 'SAMDT', number: '1', url },
      { congress: 118, type: 'HAMDT', number: '99', url: `${url}/old` },
    ] });
  };

  const result = await syncResource(config, { congress: 119, apiKey: 'test-key', fetchImpl, dataDir, mode: 'full' });
  const records = JSON.parse(fs.readFileSync(path.join(dataDir, 'amendments.json'), 'utf8'));

  assert.equal(routes.length, 2);
  assert.equal(result.count, 2);
  assert.deepEqual(records.map((record) => record.type), ['HAMDT', 'SAMDT']);
});

test('skips the bound Congressional Record during hourly runs after bootstrap', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-bound-record-'));
  const config = RESOURCE_CONFIG.find((resource) => resource.name === 'bound-congressional-record');
  fs.writeFileSync(path.join(dataDir, 'bound-congressional-record.json'), '[{"volumeNumber":93,"url":"https://api.congress.gov/v3/bound-congressional-record/1947/3/17"}]\n');
  const result = await syncResource(config, { congress: 119, apiKey: 'test-key', fetchImpl: async () => { throw new Error('network should not be called'); }, dataDir, mode: 'hourly' });
  assert.equal(result.skipped, true);
  assert.equal(result.count, 1);
});

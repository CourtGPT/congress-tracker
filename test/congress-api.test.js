const test = require('node:test');
const assert = require('node:assert/strict');
const { paginate, requestJson, requireApiKey } = require('../scripts/lib/congress-api');

function response(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] || null },
    json: async () => payload,
  };
}

test('paginates through Congress.gov next links', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return urls.length === 1
      ? response(200, { bills: [{ number: '1' }], pagination: { next: 'https://api.congress.gov/v3/bill/119?offset=250' } })
      : response(200, { bills: [{ number: '2' }] });
  };
  const result = await paginate('/bill/119', { apiKey: 'test-key', fetchImpl });
  assert.deepEqual(result, [{ number: '1' }, { number: '2' }]);
  assert.match(urls[0], /api_key=test-key/);
  assert.match(urls[0], /limit=250/);
});

test('paginates nested Congressional Record result sets', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const offset = new URL(url).searchParams.get('offset');
    return response(200, offset
      ? { Results: { IndexStart: 21, SetSize: 20, TotalCount: 21, Issues: [{ issueNumber: '2' }] } }
      : { Results: { IndexStart: 1, SetSize: 20, TotalCount: 21, Issues: [{ issueNumber: '1' }] } });
  };
  const result = await paginate('/congressional-record', { apiKey: 'test-key', fetchImpl });
  assert.deepEqual(result, [{ issueNumber: '1' }, { issueNumber: '2' }]);
  assert.match(urls[1], /offset=20/);
});

test('retries rate-limited responses', async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return attempts === 1 ? response(429, {}, { 'retry-after': '0' }) : response(200, { ok: true });
  };
  await assert.doesNotReject(() => requestJson('https://api.congress.gov/v3/member', { apiKey: 'test-key', fetchImpl }));
  assert.equal(attempts, 2);
});

test('requires the API key', () => {
  assert.throws(() => requireApiKey({}), /CONGRESS_API_KEY/);
});

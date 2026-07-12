const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest } = require('../scripts/validate-legal-manifests');

function manifest(records, summary = {}) {
  return {
    manifest_id: 'test',
    records,
    summary: { records: records.length, candidate: 0, verified: 0, blocked: 0, missing: 0, unverified: 0, ...summary },
  };
}

function record(overrides = {}) {
  return {
    jurisdiction: 'CA',
    instrument: 'administrative_code',
    source_name: 'California Code of Regulations',
    source_url: 'https://example.gov/rules',
    official_source_urls: ['https://example.gov/rules'],
    fallback_urls: [],
    authority: 'unknown',
    status: 'candidate',
    parser: { method: 'pending-source-verification', output_format: 'pending' },
    freshness: { cadence: 'source-specific', current_through_signal: null },
    ...overrides,
  };
}

test('accepts a candidate administrative-code manifest', () => {
  assert.deepEqual(validateManifest(manifest([record()], { candidate: 1 })), []);
});

test('rejects duplicate jurisdictions and stale summary counts', () => {
  const errors = validateManifest(manifest([record(), record()], { candidate: 1 }));
  assert.ok(errors.some((error) => /unique jurisdiction/u.test(error)));
  assert.ok(errors.some((error) => /summary\.candidate/u.test(error)));
});

test('rejects a secondary URL presented as verified official text', () => {
  const errors = validateManifest(manifest([record({ status: 'verified', authority: 'secondary' })], { verified: 1 }));
  assert.ok(errors.some((error) => /official or official mirror/u.test(error)));
});

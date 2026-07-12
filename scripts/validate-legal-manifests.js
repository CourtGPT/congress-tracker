#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MANIFEST = path.join(__dirname, '..', 'data', 'manifests', 'state-administrative-codes.json');

const VALID_STATUSES = new Set(['verified', 'candidate', 'blocked', 'missing', 'stale', 'unverified']);
const VALID_AUTHORITIES = new Set(['official', 'official_mirror', 'secondary', 'unknown']);

function isUrl(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.hostname);
  } catch {
    return false;
  }
}

function validateRecord(record, index) {
  const errors = [];
  const label = `records[${index}]`;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return [`${label} must be an object`];
  for (const key of ['jurisdiction', 'instrument', 'source_name', 'status']) {
    if (typeof record[key] !== 'string' || record[key].length === 0) errors.push(`${label}.${key} is required`);
  }
  if (record.instrument !== 'administrative_code') errors.push(`${label}.instrument must be administrative_code`);
  if (record.source_url !== null && !isUrl(record.source_url)) errors.push(`${label}.source_url must be an absolute URL or null`);
  if (!Array.isArray(record.official_source_urls)) errors.push(`${label}.official_source_urls must be an array`);
  if (!Array.isArray(record.fallback_urls)) errors.push(`${label}.fallback_urls must be an array`);
  if (!VALID_STATUSES.has(record.status)) errors.push(`${label}.status is invalid`);
  if (!VALID_AUTHORITIES.has(record.authority)) errors.push(`${label}.authority is invalid`);
  if (record.status === 'verified' && (record.authority === 'secondary' || record.authority === 'unknown')) {
    errors.push(`${label}.verified records must identify an official or official mirror authority`);
  }
  if (record.status === 'verified' && !record.source_url) errors.push(`${label}.verified records require source_url`);
  if (!record.parser || typeof record.parser !== 'object') errors.push(`${label}.parser is required`);
  if (!record.freshness || typeof record.freshness !== 'object') errors.push(`${label}.freshness is required`);
  return errors;
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be an object'];
  if (typeof manifest.manifest_id !== 'string' || !manifest.manifest_id) errors.push('manifest_id is required');
  if (!Array.isArray(manifest.records)) errors.push('records must be an array');
  if (!manifest.summary || typeof manifest.summary !== 'object') errors.push('summary is required');
  const records = Array.isArray(manifest.records) ? manifest.records : [];
  records.forEach((record, index) => errors.push(...validateRecord(record, index)));
  const jurisdictions = new Set(records.map((record) => record.jurisdiction));
  if (jurisdictions.size !== records.length) errors.push('records must have unique jurisdiction identifiers');
  if (manifest.summary && manifest.summary.records !== records.length) errors.push('summary.records does not match records.length');
  for (const status of ['candidate', 'verified', 'blocked', 'missing', 'unverified']) {
    if (manifest.summary && manifest.summary[status] !== undefined) {
      const count = records.filter((record) => record.status === status).length;
      if (manifest.summary[status] !== count) errors.push(`summary.${status} does not match record statuses`);
    }
  }
  return errors;
}

function validateLegalManifest(file = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { file, errors: validateManifest(manifest), records: manifest.records?.length || 0 };
}

if (require.main === module) {
  const result = validateLegalManifest(process.argv[2] || DEFAULT_MANIFEST);
  if (result.errors.length > 0) {
    console.error(`Legal manifest validation failed: ${result.file}`);
    result.errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log(`Validated legal source manifest: ${result.records} records`);
  }
}

module.exports = { validateLegalManifest, validateManifest, validateRecord };

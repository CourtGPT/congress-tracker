const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const LAW_TYPES = new Set(['Public Law', 'Private Law']);

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateSourceUrl(value, context, errors) {
  if (!value) {
    errors.push(`${context} is missing sourceUrl`);
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['api.congress.gov', 'www.congress.gov', 'congress.gov'].includes(url.hostname)) {
      errors.push(`${context} has an invalid Congress.gov sourceUrl`);
    }
  } catch {
    errors.push(`${context} has an invalid sourceUrl`);
  }
}

function validateIndividualLaws(dataDir = DEFAULT_DATA_DIR, congress = Number(process.env.CONGRESS || 119)) {
  const lawDir = path.join(dataDir, 'congress', String(congress), 'legislation', 'laws');
  const indexPath = path.join(lawDir, 'index.json');
  if (!fs.existsSync(indexPath)) throw new Error(`Missing individual-law index: ${indexPath}`);

  const index = loadJson(indexPath);
  const errors = [];
  if (Number(index.congress) !== congress) errors.push(`index congress ${index.congress} does not match ${congress}`);
  if (!Array.isArray(index.records) || index.records.length === 0) errors.push('index records must be a non-empty array');
  const files = fs.readdirSync(lawDir).filter((file) => file.endsWith('.json') && file !== 'index.json').sort();
  if (Array.isArray(index.records) && index.records.length !== files.length) {
    errors.push(`index records ${index.records.length} does not match law files ${files.length}`);
  }

  const repoRoot = path.resolve(dataDir, '..');
  const listedPaths = new Set();
  const identities = new Set();
  for (const [position, record] of (Array.isArray(index.records) ? index.records : []).entries()) {
    const context = `index.records[${position}]`;
    for (const field of ['lawId', 'lawType', 'path', 'contentHash']) {
      if (!record?.[field]) errors.push(`${context} is missing ${field}`);
    }
    if (!LAW_TYPES.has(record?.lawType)) errors.push(`${context} has invalid lawType ${record?.lawType}`);
    validateSourceUrl(record?.sourceUrl, context, errors);
    const identity = `${record?.lawType}:${record?.lawId}`;
    if (identities.has(identity)) errors.push(`duplicate law identity ${identity}`);
    identities.add(identity);
    if (typeof record?.path !== 'string' || !record.path.startsWith('data/congress/')) {
      errors.push(`${context} path must be repo-relative under data/congress/`);
      continue;
    }
    const repoRelativePath = path.resolve(repoRoot, record.path);
    const dataRelativePath = path.resolve(dataDir, record.path.slice('data/'.length));
    const filePath = fs.existsSync(repoRelativePath) ? repoRelativePath : dataRelativePath;
    if (!filePath.startsWith(`${lawDir}${path.sep}`) || !fs.existsSync(filePath)) {
      errors.push(`${context} path does not resolve inside the law directory`);
      continue;
    }
    listedPaths.add(path.basename(filePath));
    let payload;
    try {
      payload = loadJson(filePath);
    } catch (error) {
      errors.push(`${path.basename(filePath)} is not valid JSON: ${error.message}`);
      continue;
    }
    if (payload.lawId !== record.lawId || payload.lawType !== record.lawType) {
      errors.push(`${path.basename(filePath)} identity does not match its index record`);
    }
    if (!payload.sourceRecord || typeof payload.sourceRecord !== 'object') errors.push(`${path.basename(filePath)} is missing sourceRecord`);
    validateSourceUrl(payload.sourceUrl, path.basename(filePath), errors);
    const hash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
    if (hash !== record.contentHash) errors.push(`${path.basename(filePath)} contentHash does not match its payload`);
  }

  for (const file of files) if (!listedPaths.has(file)) errors.push(`${file} is not listed in index.json`);
  if (errors.length) throw new Error(`Individual-law validation failed:\n${errors.slice(0, 50).join('\n')}`);
  return { congress, count: files.length };
}

if (require.main === module) {
  try {
    const result = validateIndividualLaws();
    console.log(`Validated ${result.count} individual Congress laws for Congress ${result.congress}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateIndividualLaws };

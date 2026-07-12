const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function writeIfChanged(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content);
  fs.renameSync(temporaryPath, filePath);
  return true;
}

function slug(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function lawFileName(law) {
  return `${slug(law.type)}-${slug(law.number)}.json`;
}

function lawPayload(record, law) {
  return {
    lawId: String(law.number),
    lawType: law.type || null,
    congress: record.congress ?? null,
    number: law.number || null,
    title: record.title || null,
    bill: {
      type: record.type || null,
      number: record.number || null,
      originChamber: record.originChamber || null,
      originChamberCode: record.originChamberCode || null,
    },
    latestAction: record.latestAction || null,
    updateDate: record.updateDate || null,
    updateDateIncludingText: record.updateDateIncludingText || null,
    sourceUrl: record.url || null,
    sourceResource: 'Congress.gov API v3 / law',
    sourceRecord: record,
  };
}

function splitCongressLaws({ dataDir = path.join(__dirname, '..', 'data'), congress = Number(process.env.CONGRESS || 119) } = {}) {
  const sourcePath = path.join(dataDir, 'resources', 'laws.json');
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing laws resource: ${sourcePath}`);
  const records = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!Array.isArray(records)) throw new Error(`${sourcePath} must contain an array`);
  const outputDir = path.join(dataDir, 'congress', String(congress), 'legislation', 'laws');
  const expected = new Map();
  for (const record of records) {
    for (const law of record.laws || []) {
      if (!law?.number || !law?.type) continue;
      const key = `${law.type}:${law.number}`;
      if (expected.has(key)) throw new Error(`Duplicate law identity: ${key}`);
      const payload = lawPayload(record, law);
      const fileName = lawFileName(law);
      expected.set(key, { fileName, payload });
    }
  }
  fs.mkdirSync(outputDir, { recursive: true });
  let changed = 0;
  for (const { fileName, payload } of expected.values()) {
    if (writeIfChanged(path.join(outputDir, fileName), payload)) changed += 1;
  }
  for (const fileName of fs.readdirSync(outputDir).filter((file) => file.endsWith('.json') && file !== 'index.json')) {
    if (![...expected.values()].some(({ fileName: expectedName }) => expectedName === fileName)) fs.unlinkSync(path.join(outputDir, fileName));
  }
  const indexPath = path.join(outputDir, 'index.json');
  let previousIndex = null;
  if (fs.existsSync(indexPath)) {
    try { previousIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { previousIndex = null; }
  }
  const indexRecords = [...expected.values()].map(({ fileName, payload }) => ({
    lawId: payload.lawId,
    lawType: payload.lawType,
    path: path.posix.join('data', 'congress', String(congress), 'legislation', 'laws', fileName),
    sourceUrl: payload.sourceUrl,
    updateDate: payload.updateDate,
    contentHash: `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
  })).sort((left, right) => `${left.lawType}:${left.lawId}`.localeCompare(`${right.lawType}:${right.lawId}`, undefined, { numeric: true }));
  const index = {
    schemaVersion: 1,
    congress,
    source: 'https://api.congress.gov/',
    sourceResource: 'law',
    generatedAt: previousIndex && JSON.stringify(previousIndex.records) === JSON.stringify(indexRecords) ? previousIndex.generatedAt : new Date().toISOString(),
    records: indexRecords,
  };
  if (writeIfChanged(indexPath, index)) changed += 1;
  return { count: expected.size, changed, outputDir };
}

if (require.main === module) {
  try {
    const result = splitCongressLaws();
    console.log(`Indexed ${result.count} individual laws (${result.changed} files changed)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { lawFileName, lawPayload, splitCongressLaws };

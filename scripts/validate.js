const fs = require('fs');
const path = require('path');
const { verifyData } = require('./verify-data');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readArray(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${filePath} must contain a non-empty JSON array`);
  return value;
}

function validate(dataDir = DATA_DIR) {
  const resourceDir = path.join(dataDir, 'resources');
  if (!fs.existsSync(resourceDir)) throw new Error(`Missing resource directory: ${resourceDir}`);
  const files = fs.readdirSync(resourceDir).filter((file) => file.endsWith('.json')).sort();
  const selectedResources = process.env.CONGRESS_RESOURCES
    ? new Set(process.env.CONGRESS_RESOURCES.split(',').map((name) => name.trim()).filter(Boolean))
    : null;
  const minimumFiles = selectedResources ? selectedResources.size : 10;
  if (files.length < minimumFiles) throw new Error(`Expected ${minimumFiles} resource exports, found ${files.length} files`);
  if (selectedResources) {
    for (const name of selectedResources) {
      if (!files.includes(`${name}.json`)) throw new Error(`Missing selected resource export: ${name}`);
    }
  }
  for (const file of files) readArray(path.join(resourceDir, file));
  const metadataPath = path.join(dataDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) throw new Error('Missing data/metadata.json');
  const result = verifyData({ dataDir, congress: Number(process.env.CONGRESS || 119), selectedResources });
  if (result.errors.length) throw new Error(`Semantic verification failed:\n${result.errors.join('\n')}`);
  return { resourceFiles: files.length, checked: result.checked };
}

if (require.main === module) {
  try {
    const result = validate();
    console.log(`Validated ${result.resourceFiles} resource files`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validate };

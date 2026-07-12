const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..', 'data', 'federal-laws');

function isAppendix(title) {
  return String(title?.title || '').toLowerCase().endsWith('a');
}

function validateTitle(title, filename) {
  const errors = [];
  for (const field of ['title', 'titleName', 'sourceRelease', 'sourceUrl', 'sections']) {
    if (title?.[field] === undefined || title?.[field] === null || title[field] === '') errors.push(`${filename}: missing ${field}`);
  }
  if (!Array.isArray(title?.sections)) return errors;
  if (!title.sections.length && !isAppendix(title)) errors.push(`${filename}: sections must be non-empty`);
  for (const [index, section] of title.sections.entries()) {
    for (const field of ['section', 'sectionName', 'text', 'sourceUrl']) {
      if (section?.[field] === undefined || section[field] === null) errors.push(`${filename}: sections[${index}] missing ${field}`);
    }
    if (section?.sourceUrl && !String(section.sourceUrl).startsWith('https://uscode.house.gov/')) errors.push(`${filename}: sections[${index}] has an invalid sourceUrl`);
  }
  if (title?.sourceUrl && !String(title.sourceUrl).startsWith('https://uscode.house.gov/')) errors.push(`${filename}: invalid sourceUrl`);
  return errors;
}

function validateFederalLaws(rootDir = DEFAULT_ROOT) {
  const titleDir = path.join(rootDir, 'us-code');
  const metadataPath = path.join(titleDir, 'metadata.json');
  if (!fs.existsSync(titleDir)) throw new Error(`Missing U.S. Code directory: ${titleDir}`);
  if (!fs.existsSync(metadataPath)) throw new Error(`Missing U.S. Code metadata: ${metadataPath}`);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const files = fs.readdirSync(titleDir).filter((file) => /^title-.*\.json$/u.test(file)).sort();
  if (!files.length) throw new Error('No U.S. Code title JSON files found');
  const errors = [];
  let sectionCount = 0;
  for (const file of files) {
    const title = JSON.parse(fs.readFileSync(path.join(titleDir, file), 'utf8'));
    errors.push(...validateTitle(title, file));
    sectionCount += Array.isArray(title.sections) ? title.sections.length : 0;
  }
  if (Number(metadata.titleCount) !== files.length) errors.push(`metadata titleCount ${metadata.titleCount} does not match ${files.length}`);
  if (Number(metadata.sectionCount) !== sectionCount) errors.push(`metadata sectionCount ${metadata.sectionCount} does not match ${sectionCount}`);
  if (errors.length) throw new Error(`Federal-law validation failed:\n${errors.slice(0, 50).join('\n')}`);
  return { titleCount: files.length, sectionCount };
}

if (require.main === module) {
  try {
    const result = validateFederalLaws();
    console.log(`Validated ${result.titleCount} U.S. Code titles and ${result.sectionCount} sections`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { isAppendix, validateFederalLaws, validateTitle };

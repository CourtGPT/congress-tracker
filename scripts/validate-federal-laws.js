const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..', 'data', 'federal-laws');

function isAppendix(title) {
  return String(title?.title || '').toLowerCase().endsWith('a');
}

function validateTitle(title, filename) {
  const errors = [];
  for (const field of ['title', 'titleName', 'sourceRelease', 'sourceUrl']) {
    if (title?.[field] === undefined || title?.[field] === null || title[field] === '') errors.push(`${filename}: missing ${field}`);
  }
  if (title?.sectionCount === undefined || !Number.isInteger(Number(title.sectionCount))) errors.push(`${filename}: missing numeric sectionCount`);
  if (title?.hierarchyPath === undefined || typeof title.hierarchyPath !== 'string') errors.push(`${filename}: missing hierarchyPath`);
  if (Array.isArray(title?.sections)) {
    if (!title.sections.length && !isAppendix(title)) errors.push(`${filename}: sections must be non-empty`);
    for (const [index, section] of title.sections.entries()) {
      for (const field of ['section', 'sectionName', 'sourceUrl', 'hierarchyPath']) {
        if (section?.[field] === undefined || section[field] === null) errors.push(`${filename}: sections[${index}] missing ${field}`);
      }
      if (section?.sourceUrl && !String(section.sourceUrl).startsWith('https://uscode.house.gov/')) errors.push(`${filename}: sections[${index}] has an invalid sourceUrl`);
    }
  }
  if (title?.sourceUrl && !String(title.sourceUrl).startsWith('https://uscode.house.gov/')) errors.push(`${filename}: invalid sourceUrl`);
  return errors;
}

function countSectionDirectories(rootDir) {
  if (!fs.existsSync(rootDir)) return 0;
  let count = 0;
  const pending = [rootDir];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('section-') && fs.existsSync(path.join(entryPath, 'index.json'))) count += 1;
        pending.push(entryPath);
      }
    }
  }
  return count;
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
  let treeSectionCount = 0;
  const treeDir = path.join(titleDir, 'tree');
  if (!fs.existsSync(treeDir)) errors.push('Missing U.S. Code hierarchy tree');
  for (const file of files) {
    const title = JSON.parse(fs.readFileSync(path.join(titleDir, file), 'utf8'));
    errors.push(...validateTitle(title, file));
    const titleSectionCount = Number(title.sectionCount || (Array.isArray(title.sections) ? title.sections.length : 0));
    sectionCount += titleSectionCount;
    if (title.hierarchyPath) {
      const hierarchyPath = path.join(treeDir, title.hierarchyPath);
      if (!fs.existsSync(hierarchyPath)) errors.push(`${file}: missing hierarchy root ${title.hierarchyPath}`);
      const titleTreeSectionCount = countSectionDirectories(path.dirname(hierarchyPath));
      treeSectionCount += titleTreeSectionCount;
      if (titleTreeSectionCount !== titleSectionCount) errors.push(`${file}: metadata sectionCount ${titleSectionCount} does not match tree section directories ${titleTreeSectionCount}`);
    }
  }
  if (Number(metadata.titleCount) !== files.length) errors.push(`metadata titleCount ${metadata.titleCount} does not match ${files.length}`);
  if (Number(metadata.sectionCount) !== sectionCount) errors.push(`metadata sectionCount ${metadata.sectionCount} does not match ${sectionCount}`);
  if (treeSectionCount !== sectionCount) errors.push(`tree section count ${treeSectionCount} does not match metadata section count ${sectionCount}`);
  if (errors.length) throw new Error(`Federal-law validation failed:\n${errors.slice(0, 50).join('\n')}`);
  return { titleCount: files.length, sectionCount, treeSectionCount };
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

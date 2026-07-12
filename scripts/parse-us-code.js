const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const ROOT_DIR = path.join(__dirname, '..');
const INPUT_DIR = process.env.US_CODE_XML_DIR || path.join(ROOT_DIR, '.cache', 'us-code', 'xml');
const OUTPUT_DIR = process.env.US_CODE_OUTPUT_DIR || path.join(ROOT_DIR, 'data', 'federal-laws', 'us-code');
const METADATA_PATH = process.env.US_CODE_METADATA_PATH || path.join(OUTPUT_DIR, 'metadata.json');
const RELEASE_PATH = process.env.US_CODE_RELEASE_PATH || path.join(ROOT_DIR, '.cache', 'us-code', 'release.json');

function scalar(node) {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(scalar).join('');
  if (typeof node !== 'object') return '';
  return [node._ || '', ...Object.entries(node).filter(([key]) => !['_', '$'].includes(key)).map(([, value]) => scalar(value))].join('');
}
function cleanText(value) { return scalar(value).replace(/\s+/gu, ' ').trim(); }
function first(node, key) { return node && node[key] && node[key][0]; }
function findAll(node, key, result = []) {
  if (!node || typeof node !== 'object') return result;
  for (const [name, value] of Object.entries(node)) {
    if (name === key && Array.isArray(value)) result.push(...value);
    if (name !== '$' && name !== '_') for (const child of Array.isArray(value) ? value : [value]) findAll(child, key, result);
  }
  return result;
}
function collectSections(node, sourceRelease, titleNumber) {
  const sections = [];
  for (const section of [...findAll(node, 'section'), ...findAll(node, 'courtRule')]) {
    const identifier = section.$?.identifier || '';
    const match = identifier.match(/\/s([^/]+)$/u);
    const numNode = first(section, 'num');
    const sectionNumber = match?.[1] || numNode?.$?.value || '';
    if (!sectionNumber) continue;
    const sourceIdentifier = identifier || `/us/usc/t${Number(titleNumber)}/s${sectionNumber}`;
    const notes = findAll(section, 'note').map(cleanText).filter(Boolean);
    sections.push({ section: sectionNumber, sectionName: cleanText(first(section, 'heading')) || `Section ${sectionNumber}`, text: cleanText(first(section, 'content')), notes, amendments: notes.filter((note) => /amend|public law|stat\./iu.test(note)), effectiveDate: null, sourceUrl: `https://uscode.house.gov/view.xhtml?req=${encodeURIComponent(sourceIdentifier)}`, sourceRelease, title: titleNumber });
  }
  return sections.sort((left, right) => left.section.localeCompare(right.section, undefined, { numeric: true }));
}
function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, ''); }

async function parseXmlFile(xmlPath, release) {
  const parsed = await xml2js.parseStringPromise(fs.readFileSync(xmlPath, 'utf8'), { explicitArray: true, trim: true });
  const document = parsed.uscDoc;
  if (!document) throw new Error(`Missing uscDoc root in ${xmlPath}`);
  const meta = first(document, 'meta') || {};
  const titleNode = findAll(first(document, 'main'), 'title')[0] || findAll(document, 'appendix')[0];
  if (!titleNode) throw new Error(`Missing title or appendix element in ${xmlPath}`);
  const titleNumber = String(first(meta, 'docNumber') || path.basename(xmlPath).match(/usc([0-9]+[A-Za-z]?)\.xml$/u)?.[1] || '').padStart(2, '0');
  const titleName = cleanText(first(titleNode, 'heading')) || cleanText(first(meta, 'dc:title')) || `Title ${titleNumber}`;
  const identifier = titleNode.$?.identifier || document.$?.identifier || `/us/usc/t${Number(titleNumber)}`;
  const sections = collectSections(document, release.releasePoint, titleNumber);
  if (!sections.length && !titleNumber.toLowerCase().endsWith('a')) throw new Error(`No sections found in ${xmlPath}`);
  return { title: titleNumber, titleName, sourceRelease: release.releasePoint, sourceUrl: `https://uscode.house.gov/view.xhtml?req=${encodeURIComponent(identifier)}`, sections };
}

async function parseXML({ inputDir = INPUT_DIR, outputDir = OUTPUT_DIR, metadataPath = METADATA_PATH, releasePath = RELEASE_PATH } = {}) {
  const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  const xmlFiles = fs.readdirSync(inputDir, { recursive: true }).filter((entry) => entry.toLowerCase().endsWith('.xml')).map((entry) => path.join(inputDir, entry)).sort();
  if (!xmlFiles.length) throw new Error(`No XML files found in ${inputDir}`);
  const stagingDir = `${outputDir}.staging`;
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  const titles = [];
  for (const xmlFile of xmlFiles) {
    const title = await parseXmlFile(xmlFile, release);
    fs.writeFileSync(path.join(stagingDir, `title-${title.title}-${slugify(title.titleName)}.json`), `${JSON.stringify(title, null, 2)}\n`);
    titles.push(title);
  }
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  const metadata = { ...release, titleCount: titles.length, sectionCount: titles.reduce((count, title) => count + title.sections.length, 0), parser: 'scripts/parse-us-code.js' };
  fs.writeFileSync(path.join(stagingDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.renameSync(stagingDir, outputDir);
  if (metadataPath !== path.join(outputDir, 'metadata.json')) fs.copyFileSync(path.join(outputDir, 'metadata.json'), metadataPath);
  return metadata;
}

if (require.main === module) parseXML().then((result) => console.log(`Parsed ${result.titleCount} titles and ${result.sectionCount} sections`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { collectSections, parseXML, parseXmlFile };

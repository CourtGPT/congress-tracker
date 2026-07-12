const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseXmlFile, writeNativeTree } = require('../scripts/parse-us-code');

const fixture = path.join(__dirname, 'fixtures', 'usc01-hierarchy.xml');

test('preserves the native U.S. Code hierarchy and section ancestry', async () => {
  const title = await parseXmlFile(fixture, { releasePoint: 'test-release' });
  assert.equal(title.structure.type, 'title');
  assert.equal(title.structure.children[0].type, 'chapter');
  assert.equal(title.structure.children[0].children[1].type, 'section');
  assert.equal(title.structure.children[0].children[1].children[0].type, 'subsection');
  assert.equal(title.structure.children[0].children[1].children[0].children[0].type, 'paragraph');
  const paragraph = title.sections.find((section) => section.section === '2');
  assert.deepEqual(paragraph.hierarchyPath.map((node) => node.type), ['title', 'chapter', 'section']);
  assert.equal(title.hierarchyNodeCount, 6);
});

test('writes source hierarchy as nested JSON directories with index files', async () => {
  const title = await parseXmlFile(fixture, { releasePoint: 'test-release' });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'us-code-tree-'));
  const relative = writeNativeTree(title.structure, root);
  assert.match(relative, /^title-01-general-provisions\/index\.json$/u);
  const section = path.join(root, 'title-01-general-provisions', 'chapter-1', 'section-2', 'index.json');
  assert.equal(fs.existsSync(section), true);
  const node = JSON.parse(fs.readFileSync(section, 'utf8'));
  assert.equal(node.children[0].children[0].identifier, '/us/usc/t1/s2/a/1');
  assert.equal(node.children[0].children[0].text, 'Paragraph one.');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { splitCongressLaws } = require('../scripts/split-congress-laws');
const { validateIndividualLaws } = require('../scripts/validate-individual-laws');

test('splits public and private laws into independent stable JSON files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'congress-laws-'));
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(root, 'resources', 'laws.json'), JSON.stringify([
    { congress: 119, type: 'S', number: '1', title: 'Public', updateDate: '2026-01-01', url: 'https://api.congress.gov/v3/bill/119/s/1', laws: [{ type: 'Public Law', number: '119-1' }] },
    { congress: 119, type: 'HR', number: '2', title: 'Private', updateDate: '2026-01-02', url: 'https://api.congress.gov/v3/bill/119/hr/2', laws: [{ type: 'Private Law', number: '119-1' }] },
  ]));
  const first = splitCongressLaws({ dataDir: root, congress: 119 });
  assert.equal(first.count, 2);
  assert.equal(fs.existsSync(path.join(root, 'congress/119/legislation/laws/public-law-119-1.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'congress/119/legislation/laws/private-law-119-1.json')), true);
  const second = splitCongressLaws({ dataDir: root, congress: 119 });
  assert.equal(second.changed, 0);
  assert.deepEqual(validateIndividualLaws(root, 119), { congress: 119, count: 2 });
});

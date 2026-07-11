const fs = require('fs');
const path = require('path');
const { requestJson, requireApiKey, stableSort } = require('./lib/congress-api');

const RESOURCE_DIR = path.join(__dirname, '..', 'data', 'resources');
const RELATION_FILE = path.join(RESOURCE_DIR, 'bill-relations.json');
const MAX_FULL_RELATION_BILLS_WITHOUT_LIMIT = 1000;

function parseBillUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid Congress.gov bill URL: ${value}`);
  }
  if (url.hostname !== 'api.congress.gov') throw new Error(`Invalid Congress.gov bill URL: ${value}`);
  const match = url.pathname.match(/^\/v3\/bill\/(\d+)\/([^/]+)\/([^/]+)$/u);
  if (!match) throw new Error(`Invalid Congress.gov bill URL: ${value}`);
  const [, congress, type, number] = match;
  return {
    congress: Number(congress),
    type: type.toLowerCase(),
    number,
    billId: `${congress}:${type.toLowerCase()}:${number}`,
  };
}

function billDetailUrl(url) {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.toString();
}

function collection(payload, name) {
  if (Array.isArray(payload?.[name])) return payload[name];
  const entry = Object.entries(payload || {}).find(([, value]) => Array.isArray(value));
  return entry ? entry[1] : [];
}

function memberId(member) {
  return String(member?.bioguideId || member?.memberId || member?.id || '').trim();
}

function relationRecord({ bill, billIdentity, member, role, sourceUrl }) {
  const id = memberId(member);
  if (!id) return null;
  return {
    billId: billIdentity.billId,
    memberId: id,
    memberName: member.name || member.fullName || member.directOrderName || null,
    role,
    congress: billIdentity.congress,
    billUrl: bill.url,
    sourceUrl,
  };
}

function relationKey(relation) {
  return `${relation.billId}|${relation.memberId}|${relation.role}`;
}

function readArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${filePath} must contain a JSON array`);
  return value;
}

function writeAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function changedBills(bills, { congress, mode, lookbackHours, now }) {
  const scoped = bills.filter((bill) => String(bill.congress ?? congress) === String(congress));
  if (mode === 'full') return scoped;
  const cutoff = now.getTime() - lookbackHours * 60 * 60 * 1000;
  return scoped.filter((bill) => {
    const date = Date.parse(bill.updateDateIncludingText || bill.updateDate || '');
    return Number.isFinite(date) && date >= cutoff;
  });
}

async function fetchRelationsForBill(bill, { apiKey, fetchImpl }) {
  const billIdentity = parseBillUrl(bill.url);
  const detailUrl = billDetailUrl(bill.url);
  const cosponsorUrl = `${detailUrl}/cosponsors`;
  const detail = await requestJson(detailUrl, { apiKey, fetchImpl });
  const cosponsors = await requestJson(cosponsorUrl, { apiKey, fetchImpl });
  const detailRecord = detail.bill || detail;
  const relations = [];
  for (const member of detailRecord.sponsors || []) {
    const relation = relationRecord({ bill, billIdentity, member, role: 'sponsor', sourceUrl: detailUrl });
    if (relation) relations.push(relation);
  }
  for (const member of collection(cosponsors, 'cosponsors')) {
    const relation = relationRecord({ bill, billIdentity, member, role: 'cosponsor', sourceUrl: cosponsorUrl });
    if (relation) relations.push(relation);
  }
  return relations;
}

async function syncBillRelations({
  congress = Number(process.env.CONGRESS || 119),
  apiKey = requireApiKey(),
  fetchImpl = fetch,
  mode = process.env.CONGRESS_RELATIONS_MODE || 'hourly',
  lookbackHours = Number(process.env.CONGRESS_LOOKBACK_HOURS || 6),
  dataDir = path.join(__dirname, '..', 'data'),
  now = new Date(),
  maxBills = Number(process.env.CONGRESS_RELATIONS_MAX_BILLS || 0),
  offset = Number(process.env.CONGRESS_RELATIONS_OFFSET || 0),
} = {}) {
  const resourceDir = path.join(dataDir, 'resources');
  const billsPath = path.join(resourceDir, 'bills.json');
  const relationPath = path.join(resourceDir, 'bill-relations.json');
  const bills = readArray(billsPath);
  const existing = readArray(relationPath);
  const allSelected = changedBills(bills, { congress, mode, lookbackHours, now });
  const selected = mode === 'full' && maxBills > 0 ? allSelected.slice(offset, offset + maxBills) : allSelected;
  if (mode === 'full' && selected.length > MAX_FULL_RELATION_BILLS_WITHOUT_LIMIT && maxBills <= 0) {
    throw new Error(`Full bill relation sync selected ${allSelected.length} bills; set CONGRESS_RELATIONS_MAX_BILLS to an explicit positive limit`);
  }
  if (mode === 'full' && maxBills > 0 && offset >= allSelected.length) {
    return { bills: 0, relations: existing.length, skipped: true, offset };
  }
  if (!selected.length) return { bills: 0, relations: existing.length, skipped: true };

  const fetched = [];
  for (const bill of selected) fetched.push(...await fetchRelationsForBill(bill, { apiKey, fetchImpl }));
  const selectedIds = new Set(selected.map((bill) => parseBillUrl(bill.url).billId));
  const merged = existing.filter((relation) => !selectedIds.has(relation.billId));
  const byKey = new Map([...merged, ...fetched].map((relation) => [relationKey(relation), relation]));
  const output = stableSort([...byKey.values()], ['billId', 'role', 'memberId']);
  writeAtomic(relationPath, output);
  return { bills: selected.length, relations: output.length, fetched: fetched.length, skipped: false, offset };
}

if (require.main === module) {
  syncBillRelations()
    .then((result) => console.log(`Synchronized bill relations for ${result.bills} bills (${result.relations} relations)`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { parseBillUrl, syncBillRelations };

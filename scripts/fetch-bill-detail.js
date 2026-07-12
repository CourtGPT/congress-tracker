const fs = require('fs');
const path = require('path');
const { requestJson, requireApiKey } = require('./lib/congress-api');

const BASE_URL = 'https://api.congress.gov/v3';
const BILL_DETAIL_DIRNAME = 'bills-detail';

function buildBillId(record) {
  const congress = String(record?.congress || '').trim();
  const type = String(record?.type || '').toLowerCase().trim();
  const number = String(record?.number || '').trim();
  if (!congress || !type || !number) return null;
  return `${congress}-${type}-${number}`;
}

function detailUrl(billId, apiKey) {
  if (!billId) return null;
  const [congress, type, number] = billId.split('-');
  const url = new URL(`${BASE_URL}/bill/${congress}/${type}/${number}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  return url.toString();
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    const wrapped = Object.values(value).find((entry) => Array.isArray(entry));
    if (wrapped) return wrapped;
  }
  return [];
}

function countWrapper(items) {
  const list = Array.isArray(items) ? items : [];
  return { count: list.length, items: list };
}

function normalizePerson(record) {
  if (!record) return null;
  return {
    bioguideId: record.bioguideId || null,
    firstName: record.firstName || null,
    lastName: record.lastName || null,
    fullName: record.fullName || [record.firstName, record.lastName].filter(Boolean).join(' ').trim() || null,
    party: record.party || record.partyName || null,
    state: record.state || null,
    district: record.district ?? null,
    isOriginalCosponsor: record.isOriginalCosponsor ?? false,
    sponsorshipDate: record.sponsorshipDate || record.sponsorshipWithdrawnDate || null,
    withdrawnDate: record.sponsorshipWithdrawnDate || null,
    sourceUrl: record.url || null,
  };
}

function normalizeAction(record) {
  if (!record) return null;
  let sourceSystem = record.sourceSystem;
  if (sourceSystem && typeof sourceSystem === 'object') sourceSystem = sourceSystem.name || null;
  return {
    actionDate: record.actionDate || null,
    text: record.text || null,
    type: record.type || null,
    sourceSystem,
    actionCode: record.actionCode || null,
  };
}

function normalizeCommittee(record) {
  if (!record) return null;
  return {
    systemCode: record.systemCode || null,
    name: record.name || null,
    chamber: record.chamber || null,
    type: record.type || null,
    referralDate: record.referralDate || null,
    activity: record.activity || null,
    url: record.url || null,
  };
}

function normalizeRelatedBill(record) {
  if (!record) return null;
  const relationDetails = asArray(record.relationshipDetails).map((entry) => ({
    type: entry?.type || entry?.identifiedBy || null,
    identifiedBy: entry?.identifiedBy || null,
  }));
  return {
    congress: record.congress ?? null,
    type: record.type ? String(record.type).toLowerCase() : null,
    number: record.number ? String(record.number) : null,
    title: record.title || null,
    latestAction: record.latestAction?.text || null,
    relationshipDetails: relationDetails,
    url: record.url || null,
  };
}

function normalizeAmendment(record) {
  if (!record) return null;
  return {
    congress: record.congress ?? null,
    type: record.type || null,
    number: record.number ? String(record.number) : null,
    description: record.description || null,
    purpose: record.purpose || null,
    latestAction: record.latestAction?.text || null,
    url: record.url || null,
  };
}

function normalizeSummary(record) {
  if (!record) return null;
  return {
    versionCode: record.versionCode || null,
    actionDate: record.actionDate || null,
    actionDesc: record.actionDesc || null,
    text: record.text || null,
    updateDate: record.updateDate || null,
  };
}

function normalizeTextVersion(record) {
  if (!record) return null;
  const formats = asArray(record.formats).map((entry) => ({
    type: entry?.type || null,
    url: entry?.url || null,
  }));
  return {
    type: record.type || null,
    date: record.date || null,
    formats,
  };
}

function normalizeCboEstimate(record) {
  if (!record) return null;
  return {
    pubDate: record.pubDate || null,
    title: record.title || null,
    description: record.description || null,
    url: record.url || null,
  };
}

function normalizeSubjects(record) {
  if (!record) return { legislativeSubjects: [], policyArea: null };
  const legislativeSubjects = asArray(record.legislativeSubjects).map((entry) => ({
    name: entry?.name || null,
    updateDate: entry?.updateDate || null,
  }));
  return {
    legislativeSubjects,
    policyArea: record.policyArea ? { name: record.policyArea.name || null } : null,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function normalizeBillDetail(payload) {
  const bill = payload?.bill || payload || {};
  const billId = buildBillId(bill);
  if (!billId) throw new Error('Bill detail payload missing congress/type/number');

  const actions = asArray(bill.actions?.items).map(normalizeAction).filter(Boolean);
  const sponsors = asArray(bill.sponsors).map(normalizePerson).filter(Boolean);
  const cosponsors = asArray(bill.cosponsors?.items).map(normalizePerson).filter(Boolean);
  const committees = asArray(bill.committees?.items).map(normalizeCommittee).filter(Boolean);
  const relatedBills = asArray(bill.relatedBills?.items).map(normalizeRelatedBill).filter(Boolean);
  const amendments = asArray(bill.amendments?.items).map(normalizeAmendment).filter(Boolean);
  const summaries = asArray(bill.summaries?.items).map(normalizeSummary).filter(Boolean);
  const textVersions = asArray(bill.textVersions?.items).map(normalizeTextVersion).filter(Boolean);
  const cboEstimates = asArray(bill.cboCostEstimates?.items).map(normalizeCboEstimate).filter(Boolean);
  const latestSummary = summaries[summaries.length - 1] || null;

  return {
    billId,
    congress: Number(bill.congress),
    type: String(bill.type).toUpperCase(),
    typeCode: String(bill.type).toLowerCase(),
    number: String(bill.number),
    title: bill.title || null,
    originChamber: bill.originChamber || bill.originChamberCode || null,
    originChamberCode: bill.originChamberCode || null,
    introducedDate: bill.introducedDate || null,
    latestAction: bill.latestAction
      ? { actionDate: bill.latestAction.actionDate || null, text: bill.latestAction.text || null }
      : null,
    updateDate: bill.updateDate || null,
    updateDateIncludingText: bill.updateDateIncludingText || null,
    actions: countWrapper(actions),
    sponsors,
    cosponsors: {
      count: cosponsors.length,
      items: cosponsors,
      withdrawnCount: cosponsors.filter((entry) => entry.withdrawnDate).length,
    },
    committees: countWrapper(committees),
    relatedBills: countWrapper(relatedBills),
    amendments: countWrapper(amendments),
    summaries: {
      count: summaries.length,
      items: summaries,
      latest: latestSummary?.text || null,
    },
    textVersions: countWrapper(textVersions),
    cboCostEstimates: countWrapper(cboEstimates),
    policyArea: bill.policyArea ? { name: bill.policyArea.name || null } : null,
    subjects: normalizeSubjects(bill.subjects),
    laws: asArray(bill.laws).map((entry) => ({ number: entry?.number || null, type: entry?.type || null })),
    sourceUrl: bill.url || null,
  };
}

function detailOutputPath(billId, dataDir) {
  return path.join(dataDir, 'resources', BILL_DETAIL_DIRNAME, `${billId}.json`);
}

function writeAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(canonical(value), null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function readDetailIfExists(billId, dataDir) {
  const filePath = detailOutputPath(billId, dataDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchBillDetail(bill, { apiKey = requireApiKey(), fetchImpl = fetch, dataDir = path.join(__dirname, '..', 'data') } = {}) {
  const billId = buildBillId(bill);
  if (!billId) throw new Error('Bill record missing congress/type/number for detail fetch');
  const url = detailUrl(billId, apiKey);
  if (!url) throw new Error(`Unable to build detail URL for ${billId}`);
  const payload = await requestJson(url, { apiKey, fetchImpl });
  const detail = normalizeBillDetail(payload);
  writeAtomic(detailOutputPath(billId, dataDir), detail);
  return detail;
}

module.exports = {
  BILL_DETAIL_DIRNAME,
  buildBillId,
  canonical,
  detailOutputPath,
  fetchBillDetail,
  normalizeBillDetail,
  normalizeAction,
  normalizeAmendment,
  normalizeCboEstimate,
  normalizeCommittee,
  normalizePerson,
  normalizeRelatedBill,
  normalizeSubjects,
  normalizeSummary,
  normalizeTextVersion,
  readDetailIfExists,
};

if (require.main === module) {
  fetchBillDetail({ congress: process.env.CONGRESS || 119, type: process.env.BILL_TYPE || 'hr', number: process.env.BILL_NUMBER || '1' })
    .then((detail) => console.log(`Fetched ${detail.billId}`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
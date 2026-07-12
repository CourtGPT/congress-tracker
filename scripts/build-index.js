const fs = require('fs');
const path = require('path');
const { stableSort } = require('./lib/congress-api');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const ALLOWED_RELATION_TYPES = new Set(['sponsored', 'cosponsored', 'referred_to', 'reported_by', 'scheduled_for', 'considered_in', 'voted_on', 'related_to', 'subject_of']);

function readResource(dataDir, name) {
  const filePath = path.join(dataDir, 'resources', `${name}.json`);
  if (!fs.existsSync(filePath)) return [];
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${filePath} must contain a JSON array`);
  return value;
}

function readBillDetail(billId, dataDir) {
  const filePath = path.join(dataDir, 'resources', 'bills-detail', `${billId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readAllBillDetails(dataDir) {
  const dir = path.join(dataDir, 'resources', 'bills-detail');
  if (!fs.existsSync(dir)) return new Map();
  const result = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const value = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (value && value.billId) result.set(value.billId, value);
    } catch {
      continue;
    }
  }
  return result;
}

function billDetailId(record) {
  if (!record) return null;
  const congress = record.congress;
  const type = String(record.typeCode || record.type || '').toLowerCase();
  const number = String(record.number || '').trim();
  if (!congress || !type || !number) return null;
  return `${congress}-${type}-${number}`;
}

function writeAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function isoDate(value) {
  if (!value) return null;
  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(stringValue)) return `${stringValue}T00:00:00Z`;
  const timestamp = Date.parse(stringValue);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function sourceUrl(record) {
  return record?.url || null;
}

function memberId(record) {
  return String(record?.bioguideId || record?.memberId || record?.id || '').trim() || null;
}

function billIdentity(record) {
  const congress = record?.congress;
  const type = String(record?.type || '').toLowerCase();
  const number = String(record?.number || '').trim();
  if (congress && type && number) return { congress: Number(congress), type, number, billId: `${congress}:${type}:${number}` };
  const match = String(record?.url || '').match(/\/bill\/(\d+)\/([^/]+)\/(\d+)(?:\?|$)/u);
  if (!match) return null;
  return { congress: Number(match[1]), type: match[2].toLowerCase(), number: match[3], billId: `${match[1]}:${match[2].toLowerCase()}:${match[3]}` };
}

function committeeId(record) {
  return String(record?.systemCode || record?.committeeCode || record?.id || record?.name || '').trim() || null;
}

function voteId(record, congress) {
  if (record?.identifier !== undefined && record?.identifier !== null) return `${record?.congress || congress}:${record.identifier}`;
  const number = record?.rollCallNumber || record?.rollNumber || record?.number || record?.id;
  return number === undefined || number === null ? null : `${record?.congress || congress}:${number}`;
}

function sortObject(value) {
  return Object.fromEntries(Object.keys(value).sort((left, right) => left.localeCompare(right, 'en', { numeric: true })).map((key) => [key, value[key]]));
}

function addTimeline(timeline, { date, type, subjectId, relatedIds = [], title = null, sourceUrl: url = null }) {
  const normalizedDate = isoDate(date);
  if (!normalizedDate || !subjectId) return;
  timeline.push({ date: normalizedDate, type, subjectId: String(subjectId), relatedIds: relatedIds.filter(Boolean).map(String).sort(), title, sourceUrl: url });
}

function buildIndex({ dataDir = DEFAULT_DATA_DIR, congress = Number(process.env.CONGRESS || 119), generatedAt = process.env.CONGRESS_INDEX_GENERATED_AT || new Date().toISOString(), outputPath = path.join(dataDir, 'derived', 'index.json') } = {}) {
  const members = readResource(dataDir, 'members');
  const bills = readResource(dataDir, 'bills');
  const committees = readResource(dataDir, 'committees');
  const votes = readResource(dataDir, 'house-votes');
  const hearings = readResource(dataDir, 'hearings');
  const billRelations = readResource(dataDir, 'bill-relations');
  const billDetails = readAllBillDetails(dataDir);
  const entities = { members: {}, bills: {}, committees: {}, votes: {}, hearings: {}, billDetail: {} };
  const relationships = [];
  const timeline = [];

  for (const member of members) {
    const id = memberId(member);
    if (!id) continue;
    entities.members[id] = {
      id,
      name: member.name || member.directOrderName || null,
      party: member.party || member.partyName || null,
      state: member.state || null,
      district: member.district ?? null,
      chamber: member.chamber || null,
      servedSince: member.servedSince ?? member.startYear ?? null,
      congress: member.congress ?? null,
      sourceUrl: sourceUrl(member),
    };
  }

  for (const bill of bills) {
    const identity = billIdentity(bill);
    if (!identity) continue;
    const detailId = billDetailId({ ...bill, typeCode: identity.type }) || `${identity.congress}-${identity.type}-${identity.number}`;
    const detail = billDetails.get(detailId) || null;
    const sponsorCount = detail ? detail.sponsors.length : 0;
    const cosponsorCount = detail && detail.cosponsors ? detail.cosponsors.count : 0;
    const actionCount = detail ? detail.actions.count : 0;
    const latestActionText = detail?.latestAction?.text || bill.latestAction?.text || null;
    const latestActionDate = isoDate(detail?.latestAction?.actionDate || bill.latestAction?.actionDate);
    entities.bills[identity.billId] = {
      id: identity.billId,
      billNumber: `${identity.type.toUpperCase()} ${identity.number}`,
      congress: identity.congress,
      type: identity.type.toUpperCase(),
      number: identity.number,
      title: bill.title || detail?.title || null,
      chamber: bill.originChamber || detail?.originChamber || null,
      introducedDate: isoDate(bill.introducedDate || bill.introductionDate || detail?.introducedDate),
      latestActionDate,
      latestAction: latestActionText,
      sponsorCount,
      cosponsorCount,
      actionCount,
      policyArea: detail?.policyArea?.name || null,
      subjectCount: detail?.subjects?.legislativeSubjects?.length || 0,
      relatedBillCount: detail?.relatedBills?.count || 0,
      sourceUrl: sourceUrl(bill) || detail?.sourceUrl || null,
    };
    if (detail) {
      entities.billDetail[detailId] = {
        id: detailId,
        billId: detailId,
        updatedAt: detail.updateDate || null,
        sponsorCount: detail.sponsors.length,
        cosponsorCount: detail.cosponsors.count,
        committeeCount: detail.committees.count,
        actionCount: detail.actions.count,
        summaryCount: detail.summaries.count,
        textVersionCount: detail.textVersions.count,
      };
      for (const sponsor of detail.sponsors) {
        if (!sponsor?.bioguideId) continue;
        relationships.push({ type: 'sponsored', from: sponsor.bioguideId, to: detailId, congress: identity.congress, sourceUrl: sponsor.sourceUrl || detail.sourceUrl });
      }
      for (const cosponsor of detail.cosponsors.items) {
        if (!cosponsor?.bioguideId) continue;
        relationships.push({ type: 'cosponsored', from: cosponsor.bioguideId, to: detailId, congress: identity.congress, sourceUrl: detail.sourceUrl });
      }
      for (const committee of detail.committees.items) {
        const id = committee.systemCode || committeeId(committee);
        if (!id) continue;
        entities.committees[id] ||= { id, name: committee.name || null, chamber: committee.chamber || null, congress: committee.congress ?? identity.congress, sourceUrl: committee.url || null };
        relationships.push({ type: 'referred_to', from: detailId, to: id, congress: identity.congress, sourceUrl: committee.url || detail.sourceUrl });
      }
      for (const related of detail.relatedBills.items) {
        const relatedId = `${related.congress}-${related.type}-${related.number}`;
        relationships.push({ type: 'related_to', from: detailId, to: relatedId, congress: identity.congress, sourceUrl: related.url || detail.sourceUrl });
      }
      for (const action of detail.actions.items) {
        addTimeline(timeline, { date: action.actionDate, type: 'action', subjectId: detailId, title: action.text || null, sourceUrl: detail.sourceUrl });
      }
      if (detail.subjects?.policyArea?.name) {
        relationships.push({ type: 'subject_of', from: detailId, to: `policy:${detail.subjects.policyArea.name}`, congress: identity.congress, sourceUrl: detail.sourceUrl });
      }
    } else {
      for (const committee of Array.isArray(bill.committees) ? bill.committees : []) {
        const id = committeeId(committee);
        if (!id) continue;
        entities.committees[id] ||= { id, name: committee.name || null, chamber: committee.chamber || null, congress: committee.congress ?? identity.congress, sourceUrl: sourceUrl(committee) };
        relationships.push({ type: 'referred_to', from: identity.billId, to: id, congress: identity.congress, sourceUrl: sourceUrl(committee) || sourceUrl(bill) });
      }
    }
    addTimeline(timeline, { date: bill.introducedDate || bill.introductionDate || detail?.introducedDate, type: 'introduced', subjectId: identity.billId, title: bill.title || detail?.title || null, sourceUrl: sourceUrl(bill) || detail?.sourceUrl || null });
    addTimeline(timeline, { date: bill.updateDate || detail?.updateDate, type: 'updated', subjectId: identity.billId, title: bill.title || detail?.title || null, sourceUrl: sourceUrl(bill) || detail?.sourceUrl || null });
    addTimeline(timeline, { date: bill.latestAction?.actionDate || detail?.latestAction?.actionDate, type: 'action', subjectId: identity.billId, title: bill.latestAction?.text || detail?.latestAction?.text || null, sourceUrl: sourceUrl(bill) || detail?.sourceUrl || null });
  }

  for (const committee of committees) {
    const id = committeeId(committee);
    if (!id) continue;
    entities.committees[id] = { id, name: committee.name || null, chamber: committee.chamber || null, congress: committee.congress ?? null, sourceUrl: sourceUrl(committee) };
  }

  for (const vote of votes) {
    const id = voteId(vote, congress);
    if (!id) continue;
    const bill = vote.bill ? billIdentity(vote.bill) : billIdentity({ url: vote.billUrl });
    entities.votes[id] = { id, congress: vote.congress ?? congress, rollNumber: String(vote.rollCallNumber || vote.rollNumber || vote.number || id.split(':').pop()), date: isoDate(vote.startDate || vote.date || vote.voteDate), result: vote.result || null, voteType: vote.voteType || null, description: vote.description || vote.title || vote.name || null, sourceUrl: sourceUrl(vote) };
    addTimeline(timeline, { date: vote.startDate || vote.date || vote.voteDate, type: 'vote', subjectId: id, relatedIds: [bill?.billId], title: vote.description || vote.title || null, sourceUrl: sourceUrl(vote) });
    if (bill) relationships.push({ type: 'voted_on', from: id, to: bill.billId, congress: Number(vote.congress || congress), sourceUrl: sourceUrl(vote) });
  }

  for (const hearing of hearings) {
    const id = String(hearing.id || hearing.systemCode || hearing.url || '').trim();
    if (!id) continue;
    entities.hearings[id] = { id, congress: hearing.congress ?? congress, title: hearing.title || hearing.name || null, date: isoDate(hearing.date || hearing.hearingDate), sourceUrl: sourceUrl(hearing) };
    addTimeline(timeline, { date: hearing.date || hearing.hearingDate, type: 'hearing', subjectId: id, title: hearing.title || hearing.name || null, sourceUrl: sourceUrl(hearing) });
  }

  for (const relation of billRelations) {
    if (!ALLOWED_RELATION_TYPES.has(relation.role === 'sponsor' ? 'sponsored' : relation.role === 'cosponsor' ? 'cosponsored' : relation.role)) continue;
    const type = relation.role === 'sponsor' ? 'sponsored' : 'cosponsored';
    relationships.push({ type, from: String(relation.memberId), to: String(relation.billId), congress: Number(relation.congress || congress), sourceUrl: relation.sourceUrl || relation.billUrl || null });
  }

  const output = {
    generatedAt,
    source: { name: 'Congress.gov API', sourceUrl: 'https://api.congress.gov/', apiVersion: 'v3', congress },
    entities: Object.fromEntries(Object.entries(entities).map(([name, values]) => [name, sortObject(values)])),
    relationships: stableSort(relationships, ['type', 'from', 'to', 'sourceUrl']),
    timeline: stableSort(timeline, ['date', 'type', 'subjectId']),
  };
  output.counts = {
    entities: Object.fromEntries(Object.entries(output.entities).map(([name, values]) => [name, Object.keys(values).length])),
    relationships: output.relationships.length,
    timeline: output.timeline.length,
  };
  if (fs.existsSync(outputPath)) {
    const previous = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const comparable = (value) => JSON.stringify({ ...value, generatedAt: null });
    if (comparable(previous) === comparable(output)) output.generatedAt = previous.generatedAt;
  }
  writeAtomic(outputPath, output);
  return output;
}

if (require.main === module) {
  try {
    const index = buildIndex();
    console.log(`Built Congress.gov index with ${index.relationships.length} relationships and ${index.timeline.length} timeline events`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { ALLOWED_RELATION_TYPES, billDetailId, billIdentity, buildIndex, isoDate, memberId, readAllBillDetails, readBillDetail };

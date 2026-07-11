const fs = require('fs');
const path = require('path');
const { ALLOWED_RELATION_TYPES, billIdentity, isoDate, memberId } = require('./build-index');

const MAX_ERRORS = 50;
const HOUSE_TYPES = new Set(['hr', 'hjres', 'hconres', 'hres']);
const SENATE_TYPES = new Set(['s', 'sjres', 'sconres', 'sres']);

function redact(value) {
  return String(value)
    .replace(/([?&])api_key=[^&]*/giu, '$1[REDACTED]')
    .replace(/(CONGRESS_API_KEY=)[^\s]+/gu, '$1[REDACTED]');
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadResources(dataDir) {
  const resourceDir = path.join(dataDir, 'resources');
  if (!fs.existsSync(resourceDir)) throw new Error(`Missing resource directory: ${resourceDir}`);
  const resources = {};
  for (const file of fs.readdirSync(resourceDir).filter((name) => name.endsWith('.json')).sort()) {
    const name = file.slice(0, -'.json'.length);
    const value = loadJson(path.join(resourceDir, file));
    if (!Array.isArray(value) || value.length === 0) throw new Error(`${file} must contain a non-empty JSON array`);
    resources[name] = value;
  }
  return resources;
}

function addError(errors, message) {
  if (errors.length < MAX_ERRORS) errors.push(redact(message));
}

function checkUrl(errors, url, context) {
  if (!url) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    addError(errors, `${context} has an invalid source URL`);
    return;
  }
  if (parsed.protocol !== 'https:' || !['api.congress.gov', 'www.congress.gov', 'congress.gov'].includes(parsed.hostname)) {
    addError(errors, `${context} has an invalid source URL`);
  }
}

function checkDate(errors, value, context) {
  if (!value) return null;
  const normalized = isoDate(value);
  if (!normalized) addError(errors, `${context} has an invalid date`);
  return normalized;
}

function verifyData({ dataDir = path.join(__dirname, '..', 'data'), congress = Number(process.env.CONGRESS || 119), selectedResources = null } = {}) {
  const errors = [];
  const resources = loadResources(dataDir);
  const resourceNames = Object.keys(resources).sort();
  const metadataPath = path.join(dataDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) addError(errors, 'Missing data/metadata.json');
  const metadata = fs.existsSync(metadataPath) ? loadJson(metadataPath) : null;
  let checked = resourceNames.length;

  if (metadata) {
    const metadataNames = Array.isArray(metadata.resources) ? [...metadata.resources].sort() : [];
    if (JSON.stringify(metadataNames) !== JSON.stringify(resourceNames)) addError(errors, 'Metadata resources do not match resource exports');
    for (const name of resourceNames) {
      if (metadata.counts?.[name] !== resources[name].length) addError(errors, `Metadata count for ${name} does not match its resource export`);
    }
    if (Number(metadata.congress) !== congress) addError(errors, `Metadata Congress ${metadata.congress} does not match configured Congress ${congress}`);
  }

  const members = resources.members || [];
  const bills = resources.bills || [];
  const memberIds = new Set();
  for (const [index, member] of members.entries()) {
    checked += 1;
    const id = memberId(member);
    if (!id) addError(errors, `members[${index}] is missing a bioguide ID`);
    else if (memberIds.has(id)) addError(errors, `duplicate member ID ${id}`);
    else memberIds.add(id);
    if (!member.name && !member.directOrderName) addError(errors, `members[${index}] is missing a name`);
    if (member.chamber && !['House', 'Senate'].includes(member.chamber)) addError(errors, `members[${index}] has an invalid chamber`);
    checkUrl(errors, member.url, `members[${index}]`);
    if (member.congress !== undefined && Number(member.congress) !== congress) addError(errors, `members[${index}] Congress ${member.congress} does not match ${congress}`);
  }

  const billIds = new Set();
  for (const [index, bill] of bills.entries()) {
    checked += 1;
    const identity = billIdentity(bill);
    if (!identity) {
      addError(errors, `bills[${index}] is missing a bill identity`);
      continue;
    }
    if (billIds.has(identity.billId)) addError(errors, `duplicate bill ID ${identity.billId}`);
    else billIds.add(identity.billId);
    if (identity.congress !== congress) addError(errors, `bills[${index}] Congress ${identity.congress} does not match ${congress}`);
    checkUrl(errors, bill.url, `bills[${index}]`);
    const expectedChamber = HOUSE_TYPES.has(identity.type) ? 'House' : SENATE_TYPES.has(identity.type) ? 'Senate' : null;
    if (expectedChamber && bill.originChamber && bill.originChamber !== expectedChamber) addError(errors, `bills[${index}] chamber mismatch: ${identity.type} is ${expectedChamber}, source says ${bill.originChamber}`);
    const introduced = checkDate(errors, bill.introducedDate || bill.introductionDate, `bills[${index}].introducedDate`);
    const action = checkDate(errors, bill.latestAction?.actionDate, `bills[${index}].latestAction.actionDate`);
    checkDate(errors, bill.updateDate, `bills[${index}].updateDate`);
    if (introduced && action && action < introduced) addError(errors, `bills[${index}] latest action is before introduction`);
  }

  const relationResources = resources['bill-relations'] || [];
  const relationTypes = new Set(['sponsor', 'cosponsor']);
  for (const [index, relation] of relationResources.entries()) {
    checked += 1;
    if (!relationTypes.has(relation.role)) addError(errors, `bill-relations[${index}] has an invalid relationship type`);
    if (!memberIds.has(String(relation.memberId))) addError(errors, `unknown member ID ${relation.memberId} in bill-relations[${index}]`);
    if (!billIds.has(String(relation.billId))) addError(errors, `unknown bill ID ${relation.billId} in bill-relations[${index}]`);
    if (Number(relation.congress) !== congress) addError(errors, `bill-relations[${index}] Congress ${relation.congress} does not match ${congress}`);
    checkUrl(errors, relation.sourceUrl, `bill-relations[${index}]`);
  }

  const indexPath = path.join(dataDir, 'derived', 'index.json');
  if (fs.existsSync(indexPath)) {
    const index = loadJson(indexPath);
    const allEntities = new Map(Object.values(index.entities || {}).flatMap((group) => Object.keys(group).map((id) => [id, group[id]])));
    for (const [position, relation] of (index.relationships || []).entries()) {
      if (!ALLOWED_RELATION_TYPES.has(relation.type)) addError(errors, `derived relationship ${position} has an invalid type`);
      if (!allEntities.has(String(relation.from)) || !allEntities.has(String(relation.to))) addError(errors, `derived relationship ${position} references an unknown entity`);
      checkUrl(errors, relation.sourceUrl, `derived relationship ${position}`);
    }
    for (const [position, event] of (index.timeline || []).entries()) {
      checkDate(errors, event.date, `derived timeline[${position}].date`);
      if (!allEntities.has(String(event.subjectId))) addError(errors, `derived timeline[${position}] references an unknown subject`);
    }
  } else {
    addError(errors, 'Missing data/derived/index.json');
  }

  if (selectedResources) {
    for (const name of selectedResources) if (!resources[name]) addError(errors, `Missing selected resource export: ${name}`);
  }
  if (errors.length >= MAX_ERRORS) errors.push('Additional verification errors omitted after 50 entries');
  return { checked, errors };
}

if (require.main === module) {
  try {
    const selectedResources = process.env.CONGRESS_RESOURCES
      ? new Set(process.env.CONGRESS_RESOURCES.split(',').map((name) => name.trim()).filter(Boolean))
      : null;
    const result = verifyData({ selectedResources });
    if (result.errors.length) {
      for (const error of result.errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log(`Verified ${result.checked} Congress.gov data items`);
    }
  } catch (error) {
    console.error(redact(error.message));
    process.exitCode = 1;
  }
}

module.exports = { MAX_ERRORS, redact, verifyData };

const REQUIRED_TOP_LEVEL = [
  'billId',
  'congress',
  'type',
  'typeCode',
  'number',
  'title',
  'originChamber',
  'originChamberCode',
  'introducedDate',
  'latestAction',
  'updateDate',
  'updateDateIncludingText',
  'actions',
  'sponsors',
  'cosponsors',
  'committees',
  'relatedBills',
  'amendments',
  'summaries',
  'textVersions',
  'cboCostEstimates',
  'policyArea',
  'subjects',
  'laws',
  'sourceUrl',
];

const WRAPPER_REQUIRED = ['count', 'items'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value) {
  return value === null || typeof value === 'string';
}

function validateWrapper(wrapper, name, expectedItems) {
  const errors = [];
  if (!isObject(wrapper)) {
    errors.push(`${name} must be an object with count+items`);
    return errors;
  }
  for (const key of WRAPPER_REQUIRED) {
    if (!(key in wrapper)) errors.push(`${name} missing required key "${key}"`);
  }
  if (typeof wrapper.count !== 'number' || wrapper.count < 0) errors.push(`${name}.count must be a non-negative number`);
  if (!Array.isArray(wrapper.items)) errors.push(`${name}.items must be an array`);
  if (Array.isArray(wrapper.items) && wrapper.items.length !== wrapper.count) errors.push(`${name}.count (${wrapper.count}) does not match items.length (${wrapper.items.length})`);
  if (expectedItems && Array.isArray(wrapper.items)) {
    for (let i = 0; i < wrapper.items.length; i += 1) {
      const itemErrors = expectedItems(wrapper.items[i], `${name}.items[${i}]`);
      errors.push(...itemErrors);
    }
  }
  return errors;
}

function validatePerson(person, label) {
  const errors = [];
  if (!isObject(person)) {
    errors.push(`${label} must be an object`);
    return errors;
  }
  if (!isOptionalString(person.bioguideId)) errors.push(`${label}.bioguideId must be a string or null`);
  if (!isOptionalString(person.firstName)) errors.push(`${label}.firstName must be a string or null`);
  if (!isOptionalString(person.lastName)) errors.push(`${label}.lastName must be a string or null`);
  if (!isOptionalString(person.fullName)) errors.push(`${label}.fullName must be a string or null`);
  if (!isOptionalString(person.party)) errors.push(`${label}.party must be a string or null`);
  if (!isOptionalString(person.state)) errors.push(`${label}.state must be a string or null`);
  if (typeof person.isOriginalCosponsor !== 'boolean') errors.push(`${label}.isOriginalCosponsor must be boolean`);
  return errors;
}

function validateAction(action, label) {
  const errors = [];
  if (!isObject(action)) {
    errors.push(`${label} must be an object`);
    return errors;
  }
  if (!isOptionalString(action.actionDate)) errors.push(`${label}.actionDate must be a string or null`);
  if (!isOptionalString(action.text)) errors.push(`${label}.text must be a string or null`);
  if (!isOptionalString(action.type)) errors.push(`${label}.type must be a string or null`);
  if (!isOptionalString(action.sourceSystem)) errors.push(`${label}.sourceSystem must be a string or null`);
  if (!isOptionalString(action.actionCode)) errors.push(`${label}.actionCode must be a string or null`);
  return errors;
}

function validateBillDetail(detail) {
  const errors = [];
  if (!isObject(detail)) {
    return ['bill detail must be an object'];
  }
  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in detail)) errors.push(`Missing required top-level field: ${key}`);
  }
  if (typeof detail.billId !== 'string' || !/^[0-9]+-[a-z]+-[0-9]+$/.test(detail.billId)) {
    errors.push(`billId "${detail.billId}" must match /^[0-9]+-[a-z]+-[0-9]+$/`);
  }
  if (typeof detail.congress !== 'number' || detail.congress < 1) errors.push('congress must be a positive integer');
  if (typeof detail.type !== 'string' || !/^[A-Z]+$/.test(detail.type)) errors.push('type must be uppercase letters');
  if (typeof detail.typeCode !== 'string' || !/^[a-z]+$/.test(detail.typeCode)) errors.push('typeCode must be lowercase letters');
  if (typeof detail.number !== 'string' || !/^[0-9]+$/.test(detail.number)) errors.push('number must be digits');
  if (!isOptionalString(detail.title)) errors.push('title must be a string or null');
  if (detail.originChamberCode !== null && !['H', 'S'].includes(detail.originChamberCode)) {
    errors.push(`originChamberCode must be H, S, or null (got ${detail.originChamberCode})`);
  }
  if (detail.latestAction !== null) {
    if (!isObject(detail.latestAction)) {
      errors.push('latestAction must be an object or null');
    } else {
      if (!isOptionalString(detail.latestAction.actionDate)) errors.push('latestAction.actionDate must be a string or null');
      if (!isOptionalString(detail.latestAction.text)) errors.push('latestAction.text must be a string or null');
    }
  }
  errors.push(...validateWrapper(detail.actions, 'actions', validateAction));
  errors.push(...validateWrapper(detail.committees, 'committees'));
  errors.push(...validateWrapper(detail.relatedBills, 'relatedBills'));
  errors.push(...validateWrapper(detail.amendments, 'amendments'));
  errors.push(...validateWrapper(detail.textVersions, 'textVersions'));
  errors.push(...validateWrapper(detail.cboCostEstimates, 'cboCostEstimates'));
  if (!isObject(detail.cosponsors) || typeof detail.cosponsors.withdrawnCount !== 'number') {
    errors.push('cosponsors.withdrawnCount must be a number');
  }
  if (!Array.isArray(detail.sponsors)) errors.push('sponsors must be an array');
  if (Array.isArray(detail.sponsors)) {
    for (let i = 0; i < detail.sponsors.length; i += 1) errors.push(...validatePerson(detail.sponsors[i], `sponsors[${i}]`));
  }
  if (isObject(detail.cosponsors) && Array.isArray(detail.cosponsors.items)) {
    for (let i = 0; i < detail.cosponsors.items.length; i += 1) errors.push(...validatePerson(detail.cosponsors.items[i], `cosponsors.items[${i}]`));
  }
  if (!isObject(detail.subjects)) errors.push('subjects must be an object');
  if (!Array.isArray(detail.laws)) errors.push('laws must be an array');
  return errors;
}

module.exports = { REQUIRED_TOP_LEVEL, validateBillDetail, validatePerson, validateWrapper };
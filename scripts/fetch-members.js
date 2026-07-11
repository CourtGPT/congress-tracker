const fs = require('fs');
const path = require('path');
const { paginate, requireApiKey, stableSort } = require('./lib/congress-api');

async function fetchMembers({ apiKey = requireApiKey(), fetchImpl = fetch } = {}) {
  const members = await paginate('/member', { apiKey, fetchImpl });
  if (!members.length) throw new Error('Congress.gov returned no members');
  const normalized = stableSort(members.map((member) => ({
    bioguideId: member.bioguideId || member.memberId || '',
    name: member.name || member.directOrderName || '',
    party: member.partyName || null,
    state: member.state || null,
    district: member.district || null,
    chamber: member.chamber || null,
    servedSince: member.startYear || null,
    url: member.url || null,
    source: 'Congress.gov API',
  })), ['bioguideId', 'name']);
  const output = path.join(__dirname, '..', 'data', 'members.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized.length;
}

if (require.main === module) fetchMembers().then((count) => console.log(`Fetched ${count} members`)).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { fetchMembers };

const { RESOURCE_CONFIG, syncResource } = require('./sync-resources');
const { requireApiKey } = require('./lib/congress-api');

async function fetchVotes(congress = Number(process.env.CONGRESS || 119), { apiKey = requireApiKey(), fetchImpl = fetch } = {}) {
  const config = RESOURCE_CONFIG.find((resource) => resource.name === 'house-votes');
  return (await syncResource(config, { congress, apiKey, fetchImpl, mode: 'full' })).count;
}

if (require.main === module) fetchVotes().then((count) => console.log(`Fetched ${count} House votes`)).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { fetchVotes };

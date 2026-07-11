#!/usr/bin/env node

const { requireApiKey } = require('./lib/congress-api');
const { fetchBills } = require('./fetch-bills');
const { fetchVotes } = require('./fetch-votes');

async function backfill(startCongress, endCongress) {
  const apiKey = requireApiKey();
  if (!Number.isInteger(startCongress) || !Number.isInteger(endCongress) || startCongress < 1 || endCongress < startCongress) {
    throw new Error('Backfill range must be positive integers with --start <= --end');
  }
  const counts = {};
  for (let congress = startCongress; congress <= endCongress; congress += 1) {
    counts[congress] = {
      bills: await fetchBills(congress, { apiKey }),
      votes: await fetchVotes(congress, { apiKey }),
    };
  }
  return counts;
}

const args = process.argv.slice(2);
const startArg = args.find((arg) => arg.startsWith('--start='));
const endArg = args.find((arg) => arg.startsWith('--end='));
const start = startArg ? Number(startArg.split('=')[1]) : 114;
const end = endArg ? Number(endArg.split('=')[1]) : 119;

if (require.main === module) {
  backfill(start, end).then((counts) => console.log(`Backfilled Congress ${start} through ${end}: ${JSON.stringify(counts)}`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { backfill };

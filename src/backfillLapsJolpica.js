import fs from 'fs';
import yaml from 'js-yaml';
import { fetchAndSaveLaps } from './getLapsJolpica.js';

const DATA_DIR = 'data';
// jolpica has no lap-by-lap timing data before the 1996 season.
const FIRST_SEASON = 1996;
// Extra pacing between races on top of getLapsJolpica.js's own inter-page
// delay, so consecutive races don't start back-to-back with no gap. Matches
// getLapsJolpica.js's spacing since both draw from the same 500 req/hour
// sustained budget - see the comment there for the math.
const REQUEST_DELAY_MS = 8000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function listYears() {
  return fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map(d => Number(d.name))
    .filter(year => year >= FIRST_SEASON)
    .sort((a, b) => a - b);
}

// Reads round numbers for a season from its {year}-rounds.yaml file.
// Returns [] if the file doesn't exist (nothing to fetch for that year).
function listRounds(year) {
  const roundsPath = `${DATA_DIR}/${year}/${year}-rounds.yaml`;
  if (!fs.existsSync(roundsPath)) return [];
  const data = yaml.load(fs.readFileSync(roundsPath, 'utf8'));
  return data.rounds.map(r => r.round);
}

async function backfillAll() {
  const years = listYears();

  for (const year of years) {
    const rounds = listRounds(year);

    for (const round of rounds) {
      const filePath = `${DATA_DIR}/${year}/${year}-${round}-laps.yaml`;
      if (fs.existsSync(filePath)) {
        console.log(`Skip ${year} round ${round}: already have ${filePath}`);
        continue;
      }

      await sleep(REQUEST_DELAY_MS);
      try {
        const { data } = await fetchAndSaveLaps(year, round);
        console.log(`Saved ${year} round ${round}: ${data.laps.length} laps -> ${filePath}`);
      } catch (err) {
        console.error(`Skip ${year} round ${round}: ${err.message}`);
      }
    }
  }
}

backfillAll()
  .then(() => console.log('Done.'))
  .catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });

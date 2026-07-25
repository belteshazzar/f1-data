import fs from 'fs';
import yaml from 'js-yaml';

const BASE = 'https://api.jolpi.ca/ergast/f1';
const PAGE_LIMIT = 100;
// jolpica's unauthenticated limits are 4 req/sec burst AND 500 req/hour
// sustained. The sustained limit is the binding one for a long-running
// backfill: 3600s / 500 = 7.2s minimum average spacing between *any* two
// requests. 8s keeps us under that (~450 req/hour) with margin.
const REQUEST_DELAY_MS = 8000;
// If we still get rate-limited despite the pacing above, back off a full
// minute and retry once before giving up on that page.
const RETRY_DELAY_MS = 60000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLapsPage(year, round, offset, isRetry = false) {
  const url = `${BASE}/${year}/${round}/laps.json?limit=${PAGE_LIMIT}&offset=${offset}`;
  const res = await fetch(url);
  if (res.status === 429 && !isRetry) {
    await sleep(RETRY_DELAY_MS);
    return fetchLapsPage(year, round, offset, true);
  }
  if (!res.ok) throw new Error(`jolpica laps endpoint returned ${res.status}: ${url}`);
  return res.json();
}

// jolpica paginates by timing row (not by lap), so a lap can be split across
// a page boundary. Merge Timings when the trailing lap of the accumulator
// matches the leading lap of the new page.
function mergeLaps(accumulator, pageLaps) {
  for (const lap of pageLaps) {
    const last = accumulator[accumulator.length - 1];
    if (last && last.number === lap.number) {
      last.Timings.push(...lap.Timings);
    } else {
      accumulator.push({ number: lap.number, Timings: [...lap.Timings] });
    }
  }
}

// Fetches all laps for a race from the jolpica API, paginating politely,
// and saves them to data/{year}/{year}-{round}-laps.yaml.
export async function fetchAndSaveLaps(year, round) {
  const first = await fetchLapsPage(year, round, 0);
  const race = first.MRData.RaceTable.Races[0];
  if (!race) throw new Error(`No race found for ${year} round ${round}`);

  const total = Number(first.MRData.total);
  const accumulator = [];
  mergeLaps(accumulator, race.Laps);

  for (let offset = PAGE_LIMIT; offset < total; offset += PAGE_LIMIT) {
    await sleep(REQUEST_DELAY_MS);
    const page = await fetchLapsPage(year, round, offset);
    mergeLaps(accumulator, page.MRData.RaceTable.Races[0].Laps);
  }

  const laps = accumulator.map(lap => ({
    number: lap.number * 1,
    timings: lap.Timings.map(t => ({
      driverId: t.driverId,
      time: t.time,
      position: t.position * 1,
    })),
  }));

  const data = {
    season: year * 1,
    round: round * 1,
    session: 'Race',
    laps,
  };

  const filePath = `data/${year}/${year}-${round}-laps.yaml`;
  fs.mkdirSync(`data/${year}`, { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120 }));
  return { data, filePath };
}

// CLI entry point: node src/getLapsJolpica.js <year> <round>
const isMain = process.argv[1] && process.argv[1].endsWith('getLapsJolpica.js');
if (isMain) {
  const [year, round] = process.argv.slice(2);
  if (!year || !round) {
    console.error('Usage: node src/getLapsJolpica.js <year> <round>');
    process.exit(1);
  }
  fetchAndSaveLaps(year, round)
    .then(({ filePath, data }) => console.log(`Saved ${data.laps.length} laps: ${filePath}`))
    .catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}

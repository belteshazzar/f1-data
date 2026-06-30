import fs from 'fs';
import yaml from 'js-yaml';
import { lookupGp, lookupDatabasesExist } from './buildLookupDatabases.js';

const BASE = 'https://www.formula1.com';

// Returns all race page slugs from the season index, excluding pre-season testing.
async function fetchRaceSlugs(year) {
  const url = `${BASE}/en/racing/${year}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`f1.com season page returned ${res.status}: ${url}`);
  const html = await res.text();

  const seen = new Set();
  const slugs = [];
  for (const m of html.matchAll(/"\/en\/racing\/\d{4}\/([a-z][a-z0-9-]+)"/g)) {
    const slug = m[1];
    if (!seen.has(slug) && !slug.startsWith('pre-season')) {
      seen.add(slug);
      slugs.push(slug);
    }
  }
  if (slugs.length === 0) throw new Error(`No race slugs found on ${url}`);
  return slugs;
}

// Parses the ld+json SportsEvent block from a race page HTML string.
function parseRaceLdJson(html, url) {
  const match = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`No ld+json found at ${url}`);
  return JSON.parse(match[1]);
}

function subEventSessionName(fullName) {
  return fullName.split(' - ')[0].trim();
}

function subEventGpName(fullName) {
  return fullName.split(' - ').slice(1).join(' - ').trim();
}

// Fetches one race page and returns structured round data.
async function fetchRoundData(year, slug) {
  const url = `${BASE}/en/racing/${year}/${slug}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`f1.com race page returned ${res.status}: ${url}`);
  const html = await res.text();

  const ld = parseRaceLdJson(html, url);
  const subEvents = ld.subEvent ?? [];
  if (subEvents.length === 0) throw new Error(`No subEvents in ld+json at ${url}`);

  const name = subEventGpName(subEvents[0].name);

  const address = ld.location?.address ?? ld.location?.name ?? '';
  const [city = '', country = ''] = address.split(',').map(s => s.trim());

  const sessions = subEvents.map(e => {
    const [datePart, timePart] = e.startDate.split('T');
    return {
      name: subEventSessionName(e.name),
      date: datePart,
      time: timePart.replace('.000', ''),
    };
  });

  const raceStart = subEvents.find(e => subEventSessionName(e.name) === 'Race')?.startDate
    ?? subEvents.at(-1).startDate;

  return { slug, url, name, city, country, sessions, _raceStart: raceStart };
}

// Fetches the full season schedule from formula1.com, enriches each round with
// raceCode3 and circuit details from the lookup databases, and saves as
// data/{year}/{year}-rounds.yaml.  Returns { data, filePath, missing }.
export async function fetchAndSaveSeasonRoundsF1(year) {
  const slugs = await fetchRaceSlugs(year);

  // Fetch all race pages in parallel
  const rawRounds = await Promise.all(slugs.map(slug => fetchRoundData(year, slug)));

  // Sort into calendar order by race start time
  rawRounds.sort((a, b) => a._raceStart.localeCompare(b._raceStart));

  const dbAvailable = lookupDatabasesExist();
  const missing = [];

  const rounds = rawRounds.map(({ url, name, sessions }, i) => {
    const round = i + 1;
    let raceCode3 = null;
    let circuit   = null;

    if (dbAvailable) {
      const looked = lookupGp(name);
      raceCode3 = looked.raceCode3;
      circuit   = looked.circuit;
      if (!raceCode3 || !circuit) missing.push({ round, name, missingRaceCode3: !raceCode3, missingCircuit: !circuit });
    } else {
      missing.push({ round, name, missingRaceCode3: true, missingCircuit: true });
    }

    // Race first (matches existing rounds.yaml convention), then others in calendar order
    const race   = sessions.filter(s => s.name === 'Race');
    const others = sessions.filter(s => s.name !== 'Race');

    return { round, url, name, raceCode3, sessions: [...race, ...others], circuit };
  });

  const data = { season: year * 1, rounds };

  const filePath = `data/${year}/${year}-rounds.yaml`;
  fs.mkdirSync(`data/${year}`, { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120 }));
  return { data, filePath, missing };
}

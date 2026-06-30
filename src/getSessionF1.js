import fs from 'fs';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';
import { loadDrivers, loadConstructors, loadRounds } from './db.js';

// Maps our canonical session keys to f1.com sub-page names and scraper types.
const SESSION_DEFS = {
  'practice-1':        { page: 'practice/1',       type: 'practice', num: 1 },
  'practice-2':        { page: 'practice/2',       type: 'practice', num: 2 },
  'practice-3':        { page: 'practice/3',       type: 'practice', num: 3 },
  'qualifying':        { page: 'qualifying',        type: 'qualifying' },
  'sprint-qualifying': { page: 'sprint-qualifying', type: 'qualifying' },
  'race':              { page: 'race-result',       type: 'race' },
  'sprint':            { page: 'sprint-results',    type: 'race' },
  'race-grid':         { page: 'starting-grid',     type: 'grid' },
  'sprint-grid':       { page: 'sprint-grid',       type: 'grid' },
};

export const FETCHABLE_SESSIONS = Object.keys(SESSION_DEFS);

// Fetches the f1.com races index for a year and resolves the base URL for a
// specific round. One request only — used to build the session URL without
// downloading the session page itself.
async function resolveRaceBasePath(year, round) {
  const racesUrl = `https://www.formula1.com/en/results/${year}/races`;
  const res = await fetch(racesUrl);
  if (!res.ok) throw new Error(`f1.com races index returned ${res.status}`);
  const $index = cheerio.load(await res.text());

  let nth = round * 1 - 1;
  // 2023: Emilia-Romagna was cancelled but kept in the index table
  if (year * 1 === 2023 && round > 6) nth++;

  const anchor = $index(`div#results-table table tbody tr:nth(${nth})`).find('a')[0];
  if (!anchor) throw new Error(`Could not find race link for round ${round} in ${year}`);

  const racePath = anchor.attribs.href.split('/').slice(5, -1).join('/');
  return `${racesUrl}/${racePath}`;
}

// Returns the full formula1.com URL for a given session without downloading it.
export async function resolveF1Url(year, round, session) {
  const def = SESSION_DEFS[session];
  if (!def) throw new Error(`No f1.com mapping for session "${session}"`);
  const basePath = await resolveRaceBasePath(year, round);
  return `${basePath}/${def.page}`;
}

// Fetches the f1.com results page for a specific session and returns a loaded
// cheerio instance. Makes two requests: index → session page.
async function fetchF1Page(year, round, pageName) {
  const basePath = await resolveRaceBasePath(year, round);
  const sessionUrl = `${basePath}/${pageName}`;
  const res = await fetch(sessionUrl);
  if (!res.ok) throw new Error(`f1.com session page returned ${res.status}: ${sessionUrl}`);
  return { $: cheerio.load(await res.text()), url: sessionUrl };
}

function scrapePractice($, rows, drivers, constructors) {
  const results = [];
  rows.each(function(i) {
    const tds = $(this).find('td');
    const timeGap = $(tds[4]).text().trim();
    results.push({
      position:      $(tds[0]).text().trim() * 1,
      driverId:      drivers.forCode3($(tds[2]).find('span.md\\:hidden').text().trim()),
      constructorId: constructors.forKnownAs($(tds[3]).text().trim()),
      time:          i === 0 ? timeGap : '',
      gap:           i === 0 ? '' : timeGap,
      laps:          $(tds[5]).text().trim() * 1,
    });
  });
  return results;
}

function scrapeQualifying($, rows, drivers, constructors) {
  const results = [];
  rows.each(function() {
    const tds = $(this).find('td');
    const q1 = $(tds[4]).text().trim();
    const q2 = $(tds[5]).text().trim();
    const q3 = $(tds[6]).text().trim();
    const times = {};
    if (q1) times.q1 = q1;
    if (q2) times.q2 = q2;
    if (q3) times.q3 = q3;
    results.push({
      position:      $(tds[0]).text().trim() * 1,
      driverId:      drivers.forCode3($(tds[2]).find('span.md\\:hidden').text().trim()),
      constructorId: constructors.forKnownAs($(tds[3]).text().trim()),
      times,
      laps:          $(tds[7]).text().trim() * 1,
    });
  });
  return results;
}

function scrapeRace($, rows, drivers, constructors) {
  const results = [];
  let pos = 1;
  rows.each(function() {
    const tds = $(this).find('td');
    const posText  = $(tds[0]).text().trim();
    let time       = $(tds[5]).text().trim();
    let status;

    if (posText === 'NC') {
      status = time;
      time   = '';
    } else {
      status = 'Finished';
    }

    // Strip trailing 's' from gap times (e.g. "5.123s" → "5.123")
    if (time.length > 2 && time.endsWith('s') && !time.includes('lap')) {
      time = time.slice(0, -1);
    }

    results.push({
      position:      pos++,
      driverId:      drivers.forCode3($(tds[2]).find('span.md\\:hidden').text().trim()),
      constructorId: constructors.forKnownAs($(tds[3]).text().trim()),
      laps:          $(tds[4]).text().trim() * 1,
      time,
      status,
      points:        $(tds[6]).text().trim() * 1,
    });
  });
  return results;
}

function scrapeGrid($, rows, drivers, constructors) {
  const results = [];
  rows.each(function() {
    const tds = $(this).find('td');
    results.push({
      position:      $(tds[0]).text().trim() * 1,
      driverId:      drivers.forCode3($(tds[2]).find('span.md\\:hidden').text().trim()),
      constructorId: constructors.forKnownAs($(tds[3]).text().trim()),
    });
  });
  return results;
}

// Fetches a session from formula1.com, saves it to the data directory,
// and returns { data, filePath }.
export async function fetchAndSaveSession(year, round, session) {
  const def = SESSION_DEFS[session];
  if (!def) throw new Error(`No f1.com mapping for session "${session}"`);

  const rounds       = loadRounds(year);
  const drivers      = loadDrivers(year);
  const constructors = loadConstructors(year);

  const { $, url } = await fetchF1Page(year, round, def.page);

  const rows = $('div#results-table table > tbody > tr');
  if (rows.length === 0) throw new Error(`No results table found at ${url}`);

  let results;
  if      (def.type === 'practice')   results = scrapePractice($, rows, drivers, constructors);
  else if (def.type === 'qualifying') results = scrapeQualifying($, rows, drivers, constructors);
  else if (def.type === 'race')       results = scrapeRace($, rows, drivers, constructors);
  else if (def.type === 'grid')       results = scrapeGrid($, rows, drivers, constructors);

  const data = {
    season:  year * 1,
    round:   round * 1,
    session: session.replace(/-/g, ' '),
    results,
  };

  const filePath = `data/${year}/${year}-${round}-${session}.yaml`;
  fs.writeFileSync(filePath, yaml.dump(data));
  return { data, filePath };
}

// CLI entry point — maps legacy short codes to canonical session names.
const CLI_SESSION_MAP = {
  p1: 'practice-1', p2: 'practice-2', p3: 'practice-3',
  q:  'qualifying',  sq: 'sprint-qualifying',
  g:  'race-grid',   sg: 'sprint-grid',
  r:  'race',        s:  'sprint',
};

export default function getSession(values) {
  const session = CLI_SESSION_MAP[values.session];
  if (!session) throw new Error(`Invalid session code "${values.session}". Valid: ${Object.keys(CLI_SESSION_MAP).join(', ')}`);
  fetchAndSaveSession(values.year, values.round, session)
    .then(({ filePath }) => console.log(`Saved: ${filePath}`))
    .catch(err => console.error(`Error: ${err.message}`));
}

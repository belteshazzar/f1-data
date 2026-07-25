import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadDrivers, loadConstructors } from './db.js';

// Builds the same session-results YAML that getSessionF1.js scrapes from
// f1.com, but from accumulated live-timing state — so the file exists (and
// stays current) while the session is still running, and downloading the
// official results afterwards just overwrites it in place.
//
// Practice mirrors the flat f1.com practice table (time/gap/laps).
// Qualifying maps each line's BestLapTimes — an array of per-part bests,
// indexed 0..2 — onto the q1/q2/q3 splits of the scraped qualifying yaml.
// Races are still not written live: points/status don't come from
// TimingData as directly.

export function parseLapSeconds(value) {
  if (!value) return Infinity;
  const parts = value.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

// Which yaml file a live session belongs to, e.g. "practice-1" or
// "qualifying". Sprint variants share Type with their GP counterparts and
// are told apart by Name ("Sprint Qualifying" / "Sprint").
function sessionKey(info) {
  if (info.Type === 'Practice') return `practice-${info.Number}`;
  if (info.Type === 'Qualifying') return info.Name?.includes('Sprint') ? 'sprint-qualifying' : 'qualifying';
  if (info.Type === 'Race') return info.Name === 'Sprint' ? 'sprint' : 'race';
  return null;
}

// Where files for the current live session live — suffix is appended to the
// session stem, e.g. suffix '.yaml' -> data/2026/2026-11-practice-3.yaml,
// '-laps.yaml' -> data/2026/2026-11-practice-3-laps.yaml. Null until
// SessionInfo has arrived with enough to identify the session.
export function sessionFilePath(info, suffix) {
  const key = sessionKey(info ?? {});
  const year = Number(info?.StartDate?.slice(0, 4));
  const round = info?.Meeting?.Number;
  if (!key || !year || !round) return null;
  return path.join('data', String(year), `${year}-${round}-${key}${suffix}`);
}

// The season/round/session header shared by the results and laps files.
// Null until SessionInfo has arrived with enough to identify the session.
export function sessionMeta(info) {
  const key = sessionKey(info ?? {});
  const year = Number(info?.StartDate?.slice(0, 4));
  const round = info?.Meeting?.Number;
  if (!key || !year || !round) return null;
  return { season: year, round, session: key.replace(/-/g, ' ') };
}

// TLA -> driverId and TeamName -> constructorId, cached per year. Built by
// hand (rather than db.js's forCode3/forKnownAs) because those log misses to
// the console, which would garble the live board's redraw.
let lookups = null;
let lookupYear = null;

export function getLookups(year) {
  if (lookupYear === year) return lookups;
  const code3 = new Map();
  loadDrivers(year).forEach((d) => code3.set(d.driverCode3, d.driverId));
  const team = new Map();
  for (const c of Object.values(loadConstructors(year).asMap())) {
    for (const k of c.knownAs) team.set(k, c.constructorId);
  }
  lookupYear = year;
  lookups = { code3, team };
  return lookups;
}

let lastWritten = '';

// Rebuilds the results from live state and writes the yaml file if anything
// changed since the last write. Safe to call often and before the feed has
// populated — it's a no-op until SessionInfo and TimingData are known.
// Returns the file path once the session has been identified, else null.
export function writeSessionResults(state) {
  try {
    const info = state.sessionInfo;
    const lines = state.timingData.Lines;
    if (!info?.Meeting || !lines) return null;
    // Practice and qualifying only (see header comment); the laps log via
    // sessionFilePath/sessionMeta still covers races too.
    if (info.Type !== 'Practice' && info.Type !== 'Qualifying') return null;

    const key = sessionKey(info);
    const year = Number(info.StartDate?.slice(0, 4));
    const round = info.Meeting.Number;
    if (!key || !year || !round) return null;
    const lk = getLookups(year);

    const rows = Object.entries(lines)
      .map(([num, line]) => ({ num, line }))
      .filter(({ line }) => line.Position)
      .sort((a, b) => Number(a.line.Position) - Number(b.line.Position));
    if (rows.length === 0) return null;

    // Mirrors the f1.com practice table: P1 carries the outright time, every
    // other row carries its gap to P1's best.
    const leaderBest = parseLapSeconds(rows[0].line.BestLapTime?.Value);

    const results = rows.map(({ num, line }, i) => {
      const driver = state.driverList[num] ?? {};
      const row = {
        position: Number(line.Position),
        driverId: lk.code3.get(driver.Tla) ?? `${driver.Tla ?? num}_NOT_FOUND`,
        constructorId: lk.team.get(driver.TeamName) ?? `${driver.TeamName ?? num}_NOT_FOUND`,
      };
      if (info.Type === 'Qualifying') {
        const times = {};
        ['q1', 'q2', 'q3'].forEach((q, part) => {
          const value = line.BestLapTimes?.[part]?.Value;
          if (value) times[q] = value;
        });
        return { ...row, times, laps: line.NumberOfLaps ?? 0 };
      }
      const best = parseLapSeconds(line.BestLapTime?.Value);
      return {
        ...row,
        time: i === 0 && Number.isFinite(best) ? line.BestLapTime.Value : '',
        gap: i === 0 || !Number.isFinite(best) || !Number.isFinite(leaderBest)
          ? ''
          : `+${(best - leaderBest).toFixed(3)}s`,
        laps: line.NumberOfLaps ?? 0,
      };
    });

    const data = {
      season: year,
      round,
      session: key.replace(/-/g, ' '),
      results,
    };

    const text = yaml.dump(data);
    const filePath = sessionFilePath(info, '.yaml');
    if (text !== lastWritten) {
      fs.writeFileSync(filePath, text);
      lastWritten = text;
    }
    return filePath;
  } catch {
    return null; // never let a bad patch or missing lookup file kill the board
  }
}

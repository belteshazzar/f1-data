import { connect } from './liveTimingClient.js';
import { writeSessionResults, parseLapSeconds, sessionFilePath, sessionMeta, getLookups } from './liveSessionResults.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Merges a partial update into accumulated state. The feed sends full arrays
// as plain objects keyed by index (e.g. {"Sectors":{"1":{...}}}), which
// bracket-assignment onto the existing array/object handles the same way —
// so no special-casing of arrays vs. objects is needed.
function deepMerge(target, patch) {
  if (patch === null || typeof patch !== 'object') return patch;
  if (target === null || typeof target !== 'object') target = {};
  for (const key of Object.keys(patch)) {
    target[key] = deepMerge(target[key], patch[key]);
  }
  return target;
}

const state = {
  driverList: {},     // racingNumber -> { Tla, TeamName, TeamColour, ... }
  timingData: {},     // { Lines: { racingNumber -> {...} }, ... }
  timingAppData: {},  // { Lines: { racingNumber -> { Stints: [...] } } }
  sessionInfo: {},
  trackStatus: {},
};

// Heartbeat.Utc is the feed's own clock — proof the connection is actually
// still delivering data, unlike our local wall clock which keeps ticking
// even if the socket died. connectionStatus reflects the WS lifecycle
// itself (set via onStatusChange below).
let lastHeartbeatUtc = null;
let lastHeartbeatAt = 0;
let connectionStatus = 'connecting';

// Tracks the last time any part of a driver's sector was touched by an
// incoming patch, so the cell can flash briefly — this is what actually
// shows a car moving through minisectors in real time, since each crossing
// arrives as its own small patch well before the sector time is final.
const sectorTouch = {}; // `${racingNumber}:${sectorIdx}` -> timestamp
const FLASH_MS = 700;

function noteSectorTouch(patchLines) {
  if (!patchLines) return;
  for (const [num, line] of Object.entries(patchLines)) {
    if (!line?.Sectors) continue;
    for (const idx of Object.keys(line.Sectors)) {
      sectorTouch[`${num}:${idx}`] = Date.now();
    }
  }
}

// --- lap log ------------------------------------------------------------
// Every completed lap (any driver) is appended as a YAML list item to a
// file named after the session like the results yaml (e.g.
// data/2026/2026-11-practice-3-laps.yaml). Falls back to data/live/laps.yaml
// in the unlikely case laps arrive before SessionInfo identifies the session.

const FALLBACK_LAP_LOG = path.join('data', 'live', 'laps.yaml');

function lapLogPath() {
  return sessionFilePath(state.sessionInfo, '-laps.yaml') ?? FALLBACK_LAP_LOG;
}

// racingNumber -> `${lap}:${time}` of the last lap appended, so re-sent
// values (and the post-reconnect snapshot, which seeds this) never produce
// duplicate rows.
const loggedLapKey = {};

function seedLoggedLaps(lines) {
  for (const [num, line] of Object.entries(lines ?? {})) {
    if (line.LastLapTime?.Value) loggedLapKey[num] = `${line.NumberOfLaps ?? ''}:${line.LastLapTime.Value}`;
  }
}

// A completed lap shows up as a patch carrying a non-empty LastLapTime.Value
// (flag-only patches, e.g. PersonalFastest updates, carry no Value). Called
// after the patch is merged, so lap number and sector times are read from
// the accumulated state — sector patches for the lap arrive at or before
// the lap-time patch, never after.
// Starts a new laps file with the same season/round/session header as the
// results yaml, followed by the `laps:` key the appended entries sit under
// (YAML allows sequence items at the same indent as their key).
function ensureLapLogHeader(logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 0) return;
  const meta = sessionMeta(state.sessionInfo);
  if (meta) fs.appendFileSync(logPath, yaml.dump(meta) + 'laps:\n');
}

function logCompletedLaps(patchLines, timestamp) {
  const logPath = lapLogPath();
  const meta = sessionMeta(state.sessionInfo);
  const lk = meta ? getLookups(meta.season) : null;
  for (const [num, patchLine] of Object.entries(patchLines ?? {})) {
    const time = patchLine.LastLapTime?.Value;
    if (!time) continue;
    const line = state.timingData.Lines?.[num] ?? {};
    const key = `${line.NumberOfLaps ?? ''}:${time}`;
    if (loggedLapKey[num] === key) continue;
    loggedLapKey[num] = key;
    const sectors = line.Sectors ?? {};
    const stints = state.timingAppData.Lines?.[num]?.Stints;
    const stint = stints ? Object.values(stints).at(-1) : null;
    const tla = state.driverList[num]?.Tla;
    ensureLapLogHeader(logPath);
    // Dumped one entry at a time as a single-item list, so successive
    // appends build up one valid YAML sequence.
    fs.appendFileSync(logPath, yaml.dump([{
      utc: timestamp ?? new Date().toISOString(),
      driverId: lk?.code3.get(tla) ?? `${tla ?? num}_NOT_FOUND`,
      lap: line.NumberOfLaps ?? null,
      time,
      sectors: [sectors[0]?.Value || null, sectors[1]?.Value || null, sectors[2]?.Value || null],
      tyre: stint?.Compound?.toLowerCase() ?? null,
    }]));
  }
}

// --- deleted lap times ---------------------------------------------------
// Race control announces deletions as free-text messages, e.g.
//   "CAR 1 (VER) TIME 1:21.079 DELETED - TRACK LIMITS AT TURN 6 LAP 4 15:11:12"
// Each one becomes a `deleted: true` entry in the laps file, so the file
// stays append-only: the original lap entry remains, the deletion follows.

const seenRaceControlKeys = new Set();

function seedRaceControl(payload) {
  for (const key of Object.keys(payload?.Messages ?? {})) seenRaceControlKeys.add(key);
}

function logDeletedLaps(payload, timestamp) {
  const logPath = lapLogPath();
  const meta = sessionMeta(state.sessionInfo);
  const lk = meta ? getLookups(meta.season) : null;
  for (const [key, msg] of Object.entries(payload?.Messages ?? {})) {
    if (seenRaceControlKeys.has(key)) continue;
    seenRaceControlKeys.add(key);
    const text = msg?.Message ?? '';
    if (!text.includes(' DELETED')) continue;
    const tla = /\((\w{3})\)/.exec(text)?.[1];
    const time = /TIME ((?:\d+:)?\d+\.\d+)/.exec(text)?.[1];
    const lap = /LAP (\d+)/.exec(text)?.[1];
    const reason = /DELETED - (.+?)(?: LAP \d+)?(?: \d{2}:\d{2}:\d{2})?$/.exec(text)?.[1];
    if (!tla || !time) continue;
    ensureLapLogHeader(logPath);
    fs.appendFileSync(logPath, yaml.dump([{
      utc: msg.Utc ?? timestamp ?? null,
      driverId: lk?.code3.get(tla) ?? `${tla}_NOT_FOUND`,
      lap: lap ? Number(lap) : null,
      time,
      deleted: true,
      reason: reason?.toLowerCase() ?? null,
    }]));
  }
}

function applyUpdate(topic, payload, timestamp, isSnapshot = false) {
  if (topic === 'DriverList') state.driverList = deepMerge(state.driverList, payload);
  else if (topic === 'TimingData') {
    noteSectorTouch(payload.Lines);
    state.timingData = deepMerge(state.timingData, payload);
    if (isSnapshot) seedLoggedLaps(payload.Lines);
    else logCompletedLaps(payload.Lines, timestamp);
  } else if (topic === 'RaceControlMessages') {
    if (isSnapshot) seedRaceControl(payload);
    else logDeletedLaps(payload, timestamp);
  } else if (topic === 'TimingAppData') state.timingAppData = deepMerge(state.timingAppData, payload);
  else if (topic === 'SessionInfo') state.sessionInfo = deepMerge(state.sessionInfo, payload);
  else if (topic === 'TrackStatus') state.trackStatus = deepMerge(state.trackStatus, payload);
  else if (topic === 'Heartbeat') {
    lastHeartbeatUtc = payload.Utc;
    lastHeartbeatAt = Date.now();
  }
}

// --- rendering ---------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const INVERSE = '\x1b[7m';
const DIM = '\x1b[2m';
const MAGENTA = '\x1b[35m'; // overall fastest
const GREEN = '\x1b[32m';   // personal fastest
const GRAY = '\x1b[90m';

function teamColor(hex) {
  if (!hex || hex.length !== 6) return '';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function cell(text, width, wrap) {
  const padded = String(text ?? '').padEnd(width).slice(0, width);
  return wrap ? `${wrap}${padded}${RESET}` : padded;
}

function fmtSector(sector, flashed) {
  if (!sector || !sector.Value) return cell(flashed ? '...' : '', 9, flashed ? INVERSE : GRAY);
  let wrap = '';
  if (sector.OverallFastest) wrap = BOLD + MAGENTA;
  else if (sector.PersonalFastest) wrap = GREEN;
  if (flashed) wrap = INVERSE + wrap;
  return cell(sector.Value, 9, wrap);
}

function fmtLapTime(lapTime) {
  if (!lapTime || !lapTime.Value) return cell('', 10, GRAY);
  let wrap = '';
  if (lapTime.OverallFastest) wrap = BOLD + MAGENTA;
  else if (lapTime.PersonalFastest) wrap = GREEN;
  return cell(lapTime.Value, 10, wrap);
}

// BestLapTime carries no OverallFastest/PersonalFastest flags of its own
// (unlike LastLapTime/Sectors), so "fastest in the session" is worked out
// by comparing every driver's best against each other at render time
// (parseLapSeconds comes from liveSessionResults.js).
function fmtBestLap(bestLapTime, isOverallFastest) {
  if (!bestLapTime || !bestLapTime.Value) return cell('', 10, GRAY);
  return cell(bestLapTime.Value, 10, isOverallFastest ? BOLD + MAGENTA : '');
}

const COMPOUND_LETTER = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };

let prevLineCount = 0;

function render() {
  const lines = state.timingData.Lines ?? {};
  const rows = Object.entries(lines)
    .map(([num, line]) => ({ num, line }))
    .sort((a, b) => {
      const pa = Number(a.line.Position) || 999;
      const pb = Number(b.line.Position) || 999;
      return pa - pb;
    });

  const out = [];
  const meeting = state.sessionInfo.Meeting?.Name ?? '';
  const sessionName = state.sessionInfo.Name ?? '';
  const flag = state.trackStatus.Message ?? '';
  let flagWrap = '';
  const flagLower = flag.toLowerCase();
  if (flagLower.includes('red')) flagWrap = BOLD + '\x1b[31m';
  else if (flagLower.includes('yellow')) flagWrap = BOLD + '\x1b[33m';
  else if (flagLower.includes('clear') || flagLower.includes('green')) flagWrap = GREEN;

  // The feed's own heartbeat, not our local clock — proves data is still
  // actually arriving instead of the board having silently frozen.
  const heartbeatAgeMs = lastHeartbeatAt ? Date.now() - lastHeartbeatAt : Infinity;
  const stale = heartbeatAgeMs > 10000;
  const liveness = connectionStatus !== 'connected'
    ? `${BOLD}\x1b[31mRECONNECTING…${RESET}`
    : stale
      ? `${BOLD}\x1b[31mSTALE (no data ${Math.round(heartbeatAgeMs / 1000)}s)${RESET}`
      : `${GREEN}live${RESET} (feed clock ${lastHeartbeatUtc ?? '?'})`;

  out.push(`${BOLD}${meeting} — ${sessionName}${RESET}  [${flagWrap}${flag}${RESET}]  ${liveness}`);
  out.push(
    cell('POS', 4) + cell('DRIVER', 8) + cell('GAP', 9) + cell('INT', 9) +
    cell('LAST LAP', 10) + cell('BEST LAP', 10) + cell('S1', 9) + cell('S2', 9) + cell('S3', 9) +
    cell('TYRE', 6) + cell('LAPS', 5)
  );

  const bestOverall = Math.min(...rows.map(({ line }) => parseLapSeconds(line.BestLapTime?.Value)));

  const now = Date.now();
  for (const { num, line } of rows) {
    const driver = state.driverList[num] ?? {};
    const app = state.timingAppData.Lines?.[num];
    const stint = app?.Stints ? Object.values(app.Stints).at(-1) : null;
    const compound = stint?.Compound ? (COMPOUND_LETTER[stint.Compound] ?? stint.Compound[0]) : '-';
    // Stint.TotalLaps is laps on the *current tyre set* (resets each stop) —
    // NumberOfLaps is the driver's actual total for the session.
    const laps = line.NumberOfLaps ?? '';

    // Gap to leader, derived from best-lap times rather than the feed's own
    // TimeDiffToFastest — that field tracks race-style running gaps and is
    // largely unpopulated during qualifying, where "gap" means best-vs-best.
    const bestSeconds = parseLapSeconds(line.BestLapTime?.Value);
    let gap = '';
    if (line.Retired) gap = 'OUT';
    else if (Number.isFinite(bestSeconds)) gap = bestSeconds === bestOverall ? 'LEADER' : `+${(bestSeconds - bestOverall).toFixed(3)}`;

    const stats = line.Stats ? Object.values(line.Stats).at(-1) : null;
    const interval = line.Retired ? '' : (stats?.TimeDifftoPositionAhead || '');

    const sectors = line.Sectors ?? {};
    const flash = [0, 1, 2].map((i) => now - (sectorTouch[`${num}:${i}`] ?? 0) < FLASH_MS);

    const inPit = line.InPit ? `${DIM}(pit)${RESET}` : '';
    const isBestOverall = parseLapSeconds(line.BestLapTime?.Value) === bestOverall && Number.isFinite(bestOverall);

    out.push(
      cell(line.Position ?? '', 4) +
      cell(driver.Tla ?? num, 8, teamColor(driver.TeamColour)) +
      cell(gap, 9) +
      cell(interval, 9) +
      fmtLapTime(line.LastLapTime) +
      fmtBestLap(line.BestLapTime, isBestOverall) +
      fmtSector(sectors[0], flash[0]) +
      fmtSector(sectors[1], flash[1]) +
      fmtSector(sectors[2], flash[2]) +
      cell(compound, 6) +
      cell(laps, 5) + inPit
    );
  }

  const text = out.join('\n');
  const lineCount = out.length;
  // Move cursor up over the previous frame and clear it, instead of a full
  // screen clear, to avoid flicker.
  const rewind = prevLineCount > 0 ? `\x1b[${prevLineCount}A\x1b[J` : '';
  process.stdout.write(rewind + text + '\n');
  prevLineCount = lineCount;
}

function main() {
  process.stdout.write('\x1b[?25l'); // hide cursor
  const cleanup = () => {
    writeSessionResults(state); // flush the latest standings before exiting
    process.stdout.write('\x1b[?25h\n');
    process.exit(0);
  };
  process.on('SIGINT', cleanup);

  connect({
    topics: ['Heartbeat', 'DriverList', 'TimingData', 'TimingAppData', 'SessionInfo', 'TrackStatus', 'RaceControlMessages'],
    quiet: true,
    onSnapshot: (topic, payload) => applyUpdate(topic, payload, null, true),
    onUpdate: applyUpdate,
    onStatusChange: (status) => { connectionStatus = status; },
  });

  setInterval(render, 200);
  // Regenerate the session-results yaml (same shape getSessionF1.js writes)
  // from live state, rewriting the file only when the standings change.
  setInterval(() => writeSessionResults(state), 5000);
}

main();

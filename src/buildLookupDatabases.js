import fs from 'fs';
import yaml from 'js-yaml';

const DATA_DIR             = 'data';
const GP_LOOKUP_FILE       = `${DATA_DIR}/gp-lookup.yaml`;
const CIRCUITS_FILE        = `${DATA_DIR}/circuits.yaml`;
const DRIVERS_DB_FILE      = `${DATA_DIR}/drivers.yaml`;
const CONSTRUCTORS_DB_FILE = `${DATA_DIR}/constructors.yaml`;

// ── GP + circuit lookup (used by fetchSeasonRoundsF1) ─────────────────────────

export function lookupGp(gpName) {
  const gpLookup      = loadFile(GP_LOOKUP_FILE,  'entries');
  const circuitLookup = loadFile(CIRCUITS_FILE, 'circuits');
  const entry = gpLookup[gpName];
  if (!entry) return { raceCode3: null, circuit: null };
  const { raceCode3, circuitId } = entry;
  const circuitDetails = circuitId ? circuitLookup[circuitId] ?? null : null;
  return {
    raceCode3: raceCode3 ?? null,
    circuit:   circuitDetails ? { circuitId, ...circuitDetails } : null,
  };
}

export function lookupDatabasesExist() {
  return fs.existsSync(GP_LOOKUP_FILE) && fs.existsSync(CIRCUITS_FILE);
}

// ── Driver database ───────────────────────────────────────────────────────────

export function getDriversFromDb() {
  return loadFile(DRIVERS_DB_FILE, 'drivers');
}

export function driversDbExists() {
  return fs.existsSync(DRIVERS_DB_FILE);
}

// ── Constructor database ──────────────────────────────────────────────────────

export function getConstructorsFromDb() {
  return loadFile(CONSTRUCTORS_DB_FILE, 'constructors');
}

export function constructorsDbExists() {
  return fs.existsSync(CONSTRUCTORS_DB_FILE);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadFile(file, key) {
  if (!fs.existsSync(file)) return {};
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  return doc?.[key] ?? {};
}

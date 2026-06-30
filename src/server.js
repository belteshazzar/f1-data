import express from 'express';
import fs from 'fs';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';
import { fetchAndSaveSession, resolveF1Url, FETCHABLE_SESSIONS } from './getSessionF1.js';
import { fetchAndSaveSeasonRoundsF1 } from './fetchSeasonRoundsF1.js';
import { generateDriversTable } from './generateDriversTable.js';
import {
  getDriversFromDb, driversDbExists,
  getConstructorsFromDb, constructorsDbExists,
  lookupDatabasesExist,
} from './buildLookupDatabases.js';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use('/images', express.static('images'));

const PORT = process.env.PORT || 3000;
const DATA_DIR = 'data';

const CONSTRUCTOR_COLORS = {
  mclaren:      '#FF8000',
  red_bull:     '#3671C6',
  ferrari:      '#E8002D',
  mercedes:     '#27F4D2',
  aston_martin: '#229971',
  alpine:       '#0093CC',
  williams:     '#64C4FF',
  rb:           '#6692FF',
  haas:         '#B6BABD',
  sauber:       '#52E252',
};

function constructorColor(id) {
  return CONSTRUCTOR_COLORS[id] ?? '#888';
}

function loadYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function safeLoadYaml(filePath) {
  try {
    return loadYaml(filePath);
  } catch {
    return null;
  }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function getSeasons() {
  return fs.readdirSync(DATA_DIR)
    .filter(d => /^\d{4}$/.test(d) && fs.statSync(`${DATA_DIR}/${d}`).isDirectory())
    .sort((a, b) => Number(b) - Number(a));
}

function getSessionFiles(year, round) {
  const dir = `${DATA_DIR}/${year}`;
  if (!exists(dir)) return [];
  const prefix = `${year}-${round}-`;
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.yaml'))
    .map(f => f.slice(prefix.length, -5))
    .sort();
}

const SESSION_LABELS = {
  'practice-1':        'Practice 1',
  'practice-2':        'Practice 2',
  'practice-3':        'Practice 3',
  'qualifying':        'Qualifying',
  'sprint-qualifying': 'Sprint Qualifying',
  'sprint-grid':       'Sprint Grid',
  'sprint':            'Sprint',
  'race-grid':         'Race Grid',
  'race':              'Race',
};

const SESSION_ORDER = Object.keys(SESSION_LABELS);

function sessionLabel(key) {
  return SESSION_LABELS[key] ?? key;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title, body, breadcrumbs = []) {
  const crumbHtml = breadcrumbs.length
    ? `<nav class="breadcrumb"><a href="/">F1 Data</a>${breadcrumbs.map(([label, href]) =>
        href ? ` › <a href="${esc(href)}">${esc(label)}</a>` : ` › <span>${esc(label)}</span>`
      ).join('')}</nav>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — F1 Data</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0e0e0f;
  --surface: #1a1a1c;
  --surface2: #242427;
  --border: #2e2e32;
  --text: #e8e8ea;
  --muted: #888;
  --accent: #e10600;
  --link: #c8a84b;
  --link-hover: #f0cf72;
  --radius: 6px;
  --font: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --mono: 'Cascadia Code', 'Fira Code', 'Courier New', monospace;
}
body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.5; }
a { color: var(--link); text-decoration: none; }
a:hover { color: var(--link-hover); text-decoration: underline; }

header.site-header {
  background: var(--surface);
  border-bottom: 2px solid var(--accent);
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 52px;
}
header.site-header .logo {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.05em;
  text-decoration: none;
}
header.site-header .logo span { color: var(--accent); }
header.site-header .site-nav { display: flex; gap: 4px; margin-left: 8px; }
header.site-header .site-nav a {
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius);
  letter-spacing: 0.02em;
}
header.site-header .site-nav a:hover { color: var(--text); background: var(--surface2); text-decoration: none; }

nav.breadcrumb {
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  padding: 8px 24px;
  font-size: 13px;
  color: var(--muted);
}
nav.breadcrumb a { color: var(--link); }
nav.breadcrumb a:hover { color: var(--link-hover); }

main { padding: 24px; max-width: 1400px; margin: 0 auto; }

h1 { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
h2 { font-size: 16px; font-weight: 600; margin: 24px 0 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.card + .card { margin-top: 16px; }

.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.hub-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px 20px;
  display: block;
  color: var(--text);
  transition: border-color 0.15s, background 0.15s;
}
.hub-card:hover { border-color: var(--accent); background: var(--surface2); text-decoration: none; color: var(--text); }
.hub-card-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
.hub-card-meta  { font-size: 22px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.hub-card-sub   { font-size: 12px; color: var(--muted); }

.seasons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  margin-top: 16px;
}
.season-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 8px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  transition: border-color 0.15s, background 0.15s;
  display: block;
}
.season-card:hover {
  border-color: var(--accent);
  background: var(--surface2);
  color: var(--text);
  text-decoration: none;
}
.season-card-next {
  border-style: dashed;
  color: var(--muted);
  font-size: 15px;
}
.season-card-next:hover { color: var(--text); }

.season-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.season-nav a {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.season-nav a:hover {
  border-color: var(--accent);
  text-decoration: none;
  color: var(--text);
}

table { border-collapse: collapse; width: 100%; font-size: 13px; }
thead th {
  background: var(--surface2);
  border-bottom: 2px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
tbody tr { border-bottom: 1px solid var(--border); }
tbody tr:hover { background: var(--surface2); }
tbody td { padding: 7px 10px; vertical-align: middle; white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); }
.pos { font-weight: 700; width: 36px; }

.constructor-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  flex-shrink: 0;
  vertical-align: middle;
}

.flag { font-size: 16px; margin-right: 4px; }
.driver-code { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.status-dnf { color: #e05; font-weight: 600; }
.status-dns { color: #a04; }
.status-nc  { color: var(--muted); }

/* championship table */
.champ-table-wrap { overflow-x: auto; }
.champ-table td.race-cell {
  padding: 4px 6px;
  text-align: center;
  font-size: 12px;
  font-family: var(--mono);
  min-width: 34px;
}
.champ-table thead th.race-th {
  text-align: center;
  font-size: 11px;
  padding: 6px 4px;
  min-width: 34px;
}
.pos-1 { background: rgba(255,215,0,0.15); font-weight: 700; }
.pos-2 { background: rgba(192,192,192,0.12); }
.pos-3 { background: rgba(205,127,50,0.12); }
.pos-dnf { color: #e05; }
.pos-none { color: var(--border); }

.sessions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.session-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: block;
  color: var(--text);
}
.session-card:hover {
  border-color: var(--accent);
  text-decoration: none;
  background: var(--surface2);
}
.session-card .label { font-weight: 600; font-size: 14px; }
.session-card .date { color: var(--muted); font-size: 12px; margin-top: 4px; }

.rounds-table .round-num { font-weight: 700; color: var(--accent); width: 36px; }
.rounds-table .gp-name { font-weight: 600; }

.fetch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.btn-fetch {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font);
  white-space: nowrap;
}
.btn-fetch:hover { background: #bf0400; }
.btn-fetch:disabled { opacity: 0.55; cursor: not-allowed; }
.banner {
  padding: 10px 16px;
  border-radius: var(--radius);
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.4;
}
.banner-success { background: rgba(40,180,80,0.10); border: 1px solid rgba(40,180,80,0.3); color: #5c5; }
.banner-error   { background: rgba(220,50,50,0.10);  border: 1px solid rgba(220,50,50,0.35); color: #e66; }
.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}
</style>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/"><span>F1</span> Data</a>
  <nav class="site-nav">
    <a href="/seasons">Seasons</a>
    <a href="/data/drivers">Drivers</a>
    <a href="/data/constructors">Constructors</a>
  </nav>
</header>
${crumbHtml}
<main>${body}</main>
</body>
</html>`;
}

// ── Driver image fetch ────────────────────────────────────────────────────────

app.post('/driver-image/:driverId', async (req, res) => {
  const { driverId } = req.params;
  const back = req.body?.back ?? '/data/drivers';
  const db = getDriversFromDb();
  const driver = db[driverId];
  if (!driver?.url) return res.redirect(`${back}?imgError=${encodeURIComponent('Driver not found or has no Wikipedia URL')}`);

  try {
    const pageRes = await fetch(driver.url);
    if (!pageRes.ok) throw new Error(`Wikipedia returned ${pageRes.status}`);
    const $ = cheerio.load(await pageRes.text());

    const imgEl = $('.infobox.vcard img, .infobox img').first();
    if (!imgEl.length) throw new Error('No infobox image found on Wikipedia page');

    const thumbUrl = (imgEl.attr('src') ?? '').replace(/^\/\//, 'https://');
    if (thumbUrl.includes('Flag_of_') || thumbUrl.includes('flag_of_'))
      throw new Error('Infobox image is a flag');

    const pageHref  = imgEl.closest('a').attr('href') ?? '';
    const wikiPage  = pageHref ? `https://en.wikipedia.org${pageHref}` : '';

    // Wikipedia imageinfo API for license metadata
    const fileTitle = wikiPage ? decodeURIComponent(wikiPage.split('/wiki/').pop()) : '';
    let license = '', licenseUrl = '';
    if (fileTitle) {
      const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&titles=${encodeURIComponent(fileTitle)}&iiprop=extmetadata&format=json&origin=*`;
      const apiJson = await (await fetch(apiUrl)).json();
      const info = Object.values(apiJson.query?.pages ?? {})[0]?.imageinfo?.[0];
      license    = info?.extmetadata?.LicenseShortName?.value ?? '';
      licenseUrl = info?.extmetadata?.LicenseUrl?.value ?? '';
    }

    const imgRes = await fetch(thumbUrl);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    if (imgBuf.length < 3000) throw new Error(`Image only ${imgBuf.length} bytes — likely a placeholder`);

    const ext = (thumbUrl.split('.').pop() ?? 'jpg').replace(/[^a-z]/gi, '').toLowerCase();

    fs.writeFileSync(`images/drivers/${driverId}.${ext}`, imgBuf);
    fs.writeFileSync(`images/drivers/${driverId}.yaml`, yaml.dump({ url: thumbUrl, page: wikiPage, license, licenseUrl, ext }));

    // Backfill dateOfBirth and nationality into drivers.yaml if missing
    const dateOfBirth = $('.infobox.vcard .bday').first().text().trim();
    const nationality = $('.infobox.vcard tr')
      .filter((_, row) => $(row).find('th').text().trim() === 'Nationality')
      .find('td').first().text().trim().split(/[\n,]/)[0].trim();

    const driversFile = 'data/drivers.yaml';
    const driversDoc  = yaml.load(fs.readFileSync(driversFile, 'utf8'));
    const entry = driversDoc.drivers[driverId];
    if (entry) {
      let changed = false;
      if (!entry.dateOfBirth && dateOfBirth) { entry.dateOfBirth = dateOfBirth; changed = true; }
      if (!entry.nationality  && nationality)  { entry.nationality  = nationality;  changed = true; }
      if (changed) fs.writeFileSync(driversFile, yaml.dump(driversDoc, { lineWidth: -1 }));
    }

    res.redirect(`${back}?imgFetched=${encodeURIComponent(driverId)}`);
  } catch (err) {
    res.redirect(`${back}?imgError=${encodeURIComponent(err.message)}`);
  }
});

// ── Home ──────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const seasons    = getSeasons();
  const driversDb  = driversDbExists();
  const constrDb   = constructorsDbExists();
  const dbDrivers  = driversDb  ? getDriversFromDb()      : {};
  const dbConstr   = constrDb   ? getConstructorsFromDb()  : {};

  function hubCard(href, title, meta, sub) {
    return `<a class="hub-card" href="${href}">
      <div class="hub-card-title">${title}</div>
      <div class="hub-card-meta">${meta}</div>
      ${sub ? `<div class="hub-card-sub">${sub}</div>` : ''}
    </a>`;
  }

  const latestSeason = seasons[0] ?? '—';
  const driverCount  = Object.keys(dbDrivers).length;
  const constrCount  = Object.keys(dbConstr).length;

  res.send(layout('F1 Data', `
    <h1>Formula 1 Data</h1>
    <div class="hub-grid">
      ${hubCard('/seasons', 'Seasons', `${seasons.length} seasons`, `Latest: ${latestSeason}`)}
      ${hubCard('/data/drivers', 'Drivers', driversDb ? `${driverCount} drivers` : 'database not built', 'All-time driver records')}
      ${hubCard('/data/constructors', 'Constructors', constrDb ? `${constrCount} constructors` : 'database not built', 'All-time constructor records')}
    </div>
  `));
});

// ── Seasons ───────────────────────────────────────────────────────────────────

app.get('/seasons', (req, res) => {
  const seasons  = getSeasons();
  const nextYear = String(Math.max(...seasons.map(Number)) + 1);
  const nextCard = `<a class="season-card season-card-next" href="/${nextYear}">${esc(nextYear)} +</a>`;
  const cards    = seasons.map(y => `<a class="season-card" href="/${y}">${esc(y)}</a>`).join('');

  res.send(layout('Seasons', `
    <h1>Formula 1 Seasons</h1>
    <div class="seasons-grid">${nextCard}${cards}</div>
  `, [['Seasons', null]]));
});

// ── Database views ────────────────────────────────────────────────────────────

function letterNav(current, available, baseUrl) {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:20px">` +
    ALPHABET.map(l => {
      if (!available.has(l)) {
        return `<span style="padding:5px 9px;color:var(--border);font-weight:600;font-size:13px">${l}</span>`;
      }
      if (l === current) {
        return `<span style="padding:5px 9px;background:var(--accent);color:#fff;border-radius:4px;font-weight:700;font-size:13px">${l}</span>`;
      }
      return `<a href="${baseUrl}/${l.toLowerCase()}" style="padding:5px 9px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-weight:600;font-size:13px;color:var(--text)">${l}</a>`;
    }).join('') +
  `</div>`;
}

function firstAvailableLetter(letters) {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => letters.has(l)) ?? 'A';
}

app.get('/data/drivers', (req, res) => {
  if (!driversDbExists()) return res.redirect('/?dbError=' + encodeURIComponent('drivers.yaml not built yet.'));
  const db = getDriversFromDb();
  const available = new Set(Object.values(db).map(d => (d.familyName?.[0] ?? '').toUpperCase()).filter(Boolean));
  res.redirect(`/data/drivers/${firstAvailableLetter(available).toLowerCase()}`);
});

app.get('/data/drivers/:letter', (req, res) => {
  if (!driversDbExists()) return res.redirect('/?dbError=' + encodeURIComponent('drivers.yaml not built yet.'));
  const db       = getDriversFromDb();
  const letter   = req.params.letter.toUpperCase();
  const available = new Set(Object.values(db).map(d => (d.familyName?.[0] ?? '').toUpperCase()).filter(Boolean));

  if (!available.has(letter)) return res.redirect(`/data/drivers/${firstAvailableLetter(available).toLowerCase()}`);

  const entries = Object.entries(db)
    .filter(([, d]) => (d.familyName?.[0] ?? '').toUpperCase() === letter)
    .sort(([, a], [, b]) => a.familyName.localeCompare(b.familyName));

  const total = Object.keys(db).length;
  const back  = `/data/drivers/${letter.toLowerCase()}`;
  const { imgFetched, imgError } = req.query;

  const banner = imgFetched
    ? `<div class="banner banner-success">Image fetched for <strong>${esc(imgFetched)}</strong></div>`
    : imgError
    ? `<div class="banner banner-error"><strong>Image fetch failed:</strong> ${esc(decodeURIComponent(imgError))}</div>`
    : '';

  const rows = entries.map(([id, d]) => `<tr>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${esc(id)}</td>
    <td><span class="driver-code">${esc(d.driverCode3 ?? '')}</span></td>
    <td class="num" style="color:var(--muted)">${d.permanentNumber != null ? '#' + d.permanentNumber : ''}</td>
    <td style="display:flex;align-items:center;gap:6px">
      <img src="/images/drivers/${esc(id)}.png"
           onerror="if(this.src.endsWith('.png')){this.src='/images/drivers/${esc(id)}.jpg'}else{this.style.display='none'}"
           style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0" loading="lazy">
      ${esc(d.flag ?? '')} ${esc(d.givenName ?? '')} <strong>${esc(d.familyName ?? '')}</strong>
    </td>
    <td>${esc(d.nationality ?? '')}</td>
    <td style="color:var(--muted);font-size:12px">${d.dateOfBirth ?? ''}</td>
    <td class="num" style="color:var(--muted)">${d.lastSeen ?? ''}</td>
    <td><a href="${esc(d.url ?? '')}" target="_blank" rel="noopener" style="font-size:12px">Wikipedia ↗</a></td>
    <td>
      <form method="POST" action="/driver-image/${esc(id)}" style="margin:0"
          onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='…'">
        <input type="hidden" name="back" value="${esc(back)}">
        <button type="submit" style="font-size:11px;padding:2px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:3px;color:var(--muted);cursor:pointer">↓ img</button>
      </form>
    </td>
  </tr>`).join('');

  res.send(layout(`Drivers — ${letter}`, `
    ${banner}
    <h1>Drivers Database <span style="color:var(--muted);font-size:14px;font-weight:400">${total} total · ${entries.length} under ${letter}</span></h1>
    ${letterNav(letter, available, '/data/drivers')}
    <div class="card" style="padding:0">
      <table>
        <thead><tr>
          <th>driverId</th>
          <th>Code</th>
          <th class="num">#</th>
          <th>Name</th>
          <th>Nationality</th>
          <th>Born</th>
          <th class="num">Last seen</th>
          <th></th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, [['Drivers', null]]));
});

app.get('/data/constructors', (req, res) => {
  if (!constructorsDbExists()) return res.redirect('/?dbError=' + encodeURIComponent('constructors.yaml not built yet.'));
  const db = getConstructorsFromDb();
  const available = new Set(Object.values(db).map(c => (c.name?.[0] ?? '').toUpperCase()).filter(Boolean));
  res.redirect(`/data/constructors/${firstAvailableLetter(available).toLowerCase()}`);
});

app.get('/data/constructors/:letter', (req, res) => {
  if (!constructorsDbExists()) return res.redirect('/?dbError=' + encodeURIComponent('constructors.yaml not built yet.'));
  const db       = getConstructorsFromDb();
  const letter   = req.params.letter.toUpperCase();
  const available = new Set(Object.values(db).map(c => (c.name?.[0] ?? '').toUpperCase()).filter(Boolean));

  if (!available.has(letter)) return res.redirect(`/data/constructors/${firstAvailableLetter(available).toLowerCase()}`);

  const entries = Object.entries(db)
    .filter(([, c]) => (c.name?.[0] ?? '').toUpperCase() === letter)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));

  const total = Object.keys(db).length;

  const rows = entries.map(([id, c]) => `<tr>
    <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${esc(id)}</td>
    <td>${esc(c.flag ?? '')} <strong>${esc(c.name ?? '')}</strong></td>
    <td>${esc(c.nationality ?? '')}</td>
    <td class="num" style="color:var(--muted)">${c.years?.at(-1) ?? ''}</td>
    <td style="font-size:11px;color:var(--muted)">${(c.knownAs ?? []).map(a => esc(a)).join(', ')}</td>
    <td><a href="${esc(c.url ?? '')}" target="_blank" rel="noopener" style="font-size:12px">Wikipedia ↗</a></td>
  </tr>`).join('');

  res.send(layout(`Constructors — ${letter}`, `
    <h1>Constructors Database <span style="color:var(--muted);font-size:14px;font-weight:400">${total} total · ${entries.length} under ${letter}</span></h1>
    ${letterNav(letter, available, '/data/constructors')}
    <div class="card" style="padding:0">
      <table>
        <thead><tr>
          <th>constructorId</th>
          <th>Name</th>
          <th>Nationality</th>
          <th class="num">Last seen</th>
          <th>Known as</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, [['Constructors', null]]));
});

// Serve the lookup YAML files directly for inspection
app.get('/data/:file', (req, res) => {
  const { file } = req.params;
  if (!file.endsWith('.yaml') || file.includes('/')) return res.status(404).end();
  const filePath = `${DATA_DIR}/${file}`;
  if (!exists(filePath)) return res.status(404).end();
  res.type('text/plain; charset=utf-8').sendFile(filePath, { root: process.cwd() });
});

// ── Season overview ───────────────────────────────────────────────────────────

app.get('/:year', (req, res) => {
  const { year } = req.params;
  const { fetched, error, driversGenerated, constructorsGenerated, tableGenerated, tableError } = req.query;
  const roundsFile      = `${DATA_DIR}/${year}/${year}-rounds.yaml`;
  const driversFile     = `${DATA_DIR}/${year}/${year}-drivers.yaml`;
  const constructorsFile = `${DATA_DIR}/${year}/${year}-constructors.yaml`;
  const hasRounds       = exists(roundsFile);
  const hasDrivers      = exists(driversFile);
  const hasConstructors = exists(constructorsFile);

  const bannerHtml = fetched
    ? `<div class="banner banner-success">Rounds fetched from formula1.com and saved to <code>${year}-rounds.yaml</code>.</div>`
    : driversGenerated
    ? `<div class="banner banner-success">Generated <code>${year}-drivers.yaml</code> with ${esc(driversGenerated)} drivers.</div>`
    : constructorsGenerated
    ? `<div class="banner banner-success">Generated <code>${year}-constructors.yaml</code> with ${esc(constructorsGenerated)} constructors.</div>`
    : tableGenerated
    ? `<div class="banner banner-success">Championship table generated — <a href="/${year}/table"><code>${year}-table-drivers.yaml</code></a></div>`
    : error
    ? `<div class="banner banner-error"><strong>Fetch failed:</strong> ${esc(decodeURIComponent(error))}</div>`
    : tableError
    ? `<div class="banner banner-error"><strong>Table generation failed:</strong> ${esc(decodeURIComponent(tableError))}</div>`
    : '';

  const tableFile  = `${DATA_DIR}/${year}/${year}-table-drivers.yaml`;
  const hasTable   = exists(tableFile);

  const fetchForm = `
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <form class="fetch-bar" style="margin:0" method="POST" action="/${year}/fetch-rounds-f1"
        onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Fetching…'">
      <button class="btn-fetch" type="submit">↓ Fetch rounds from formula1.com</button>
      <a href="https://www.formula1.com/en/racing/${year}" target="_blank" rel="noopener"
         style="font-size:12px;font-family:var(--mono)">formula1.com/en/racing/${year} ↗</a>
    </form>
    <form method="POST" action="/${year}/generate-table"
        onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Generating…'">
      <button class="btn-fetch" type="submit"
          style="background:var(--surface2);border:1px solid var(--border);color:var(--text)">
        ⟳ ${hasTable ? 'Regenerate' : 'Generate'} championship table
      </button>
    </form>
  </div>`;

  // Setup cards for missing drivers / constructors files
  function setupCard(label, file, setupUrl, viewUrl) {
    if (exists(file)) {
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span style="color:#5c5;font-size:12px;font-weight:600">● ${esc(label)}</span>
        <a href="${esc(viewUrl)}" style="font-size:12px">View</a>
        <a href="${esc(setupUrl)}" style="font-size:12px;color:var(--muted)">Edit</a>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="color:#e66;font-size:12px;font-weight:600">● ${esc(label)} missing</span>
      <a href="${esc(setupUrl)}" class="btn-fetch" style="font-size:12px;padding:4px 12px;text-decoration:none">Set up from database →</a>
    </div>`;
  }

  const seasonSetup = `
    <div class="card" style="margin-bottom:16px;padding:12px 20px">
      ${setupCard('Drivers', driversFile, `/${year}/setup-drivers`, `/${year}/drivers`)}
      ${setupCard('Constructors', constructorsFile, `/${year}/setup-constructors`, `/${year}/constructors`)}
    </div>`;

  if (!hasRounds) {
    return res.send(layout(`${year} Season`, `
      <h1>${esc(year)} Formula 1 World Championship</h1>
      ${bannerHtml}
      ${seasonSetup}
      ${fetchForm}
      <div class="card empty-state">No rounds data yet for ${esc(year)}.</div>
    `, [[year, null]]));
  }

  const { rounds } = loadYaml(roundsFile);
  const now = new Date();

  const rows = rounds.map(r => {
    const raceSession = r.sessions?.find(s => s.name === 'Race');
    const date = raceSession ? new Date(`${raceSession.date}T${raceSession.time}`) : null;
    const dateStr = date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const past = date && date < now;

    const sessionFiles = getSessionFiles(year, r.round);
    const hasResults = sessionFiles.some(s => s === 'race');

    return `<tr>
      <td class="num round-num">${r.round}</td>
      <td><span class="flag">${r.circuit?.location?.flag ?? ''}</span><a href="/${year}/${r.round}">${esc(r.name)}</a></td>
      <td>${esc(r.circuit?.location?.locality ?? '')}, ${esc(r.circuit?.location?.country ?? '')}</td>
      <td>${esc(dateStr)}</td>
      <td>${hasResults ? `<a href="/${year}/${r.round}/race">Results</a>` : past ? '<span style="color:var(--muted)">—</span>' : ''}</td>
    </tr>`;
  }).join('');

  const nav = `<div class="season-nav">
    <a href="/${year}/table">Championship</a>
    <a href="/${year}/drivers">Drivers</a>
    <a href="/${year}/constructors">Constructors</a>
  </div>`;

  res.send(layout(`${year} Season`, `
    <h1>${esc(year)} Formula 1 World Championship</h1>
    ${nav}
    ${bannerHtml}
    ${(!hasDrivers || !hasConstructors) ? seasonSetup : ''}
    ${fetchForm}
    <div class="card">
      <table class="rounds-table">
        <thead><tr>
          <th class="num">Rd</th>
          <th>Grand Prix</th>
          <th>Circuit</th>
          <th>Date</th>
          <th>Results</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, [[year, null]]));
});

// ── Fetch rounds from f1.com ──────────────────────────────────────────────────

app.post('/:year/fetch-rounds-f1', async (req, res) => {
  const { year } = req.params;
  try {
    await fetchAndSaveSeasonRoundsF1(year);
    res.redirect(`/${year}?fetched=1`);
  } catch (err) {
    res.redirect(`/${year}?error=${encodeURIComponent(err.message)}`);
  }
});

app.post('/:year/generate-table', (req, res) => {
  const { year } = req.params;
  const from = req.body?.from;
  try {
    generateDriversTable({ year });
    res.redirect(from === 'table' ? `/${year}/table` : `/${year}?tableGenerated=1`);
  } catch (err) {
    res.redirect(from === 'table' ? `/${year}/table?tableError=${encodeURIComponent(err.message)}` : `/${year}?tableError=${encodeURIComponent(err.message)}`);
  }
});

// ── Setup drivers from database ───────────────────────────────────────────────

app.get('/:year/setup-drivers', (req, res) => {
  const { year } = req.params;

  if (!driversDbExists()) {
    return res.redirect(`/?dbError=${encodeURIComponent('Build the lookup databases first — drivers.yaml is missing.')}`);
  }

  const dbDrivers  = getDriversFromDb();
  const prevYear   = String(year * 1 - 1);
  const prevFile   = `${DATA_DIR}/${prevYear}/${prevYear}-drivers.yaml`;
  const curFile    = `${DATA_DIR}/${year}/${year}-drivers.yaml`;

  // Pre-select: current year's file if it exists, else previous year's
  let preselected = new Set();
  const seedFile = exists(curFile) ? curFile : exists(prevFile) ? prevFile : null;
  if (seedFile) {
    const doc = loadYaml(seedFile);
    preselected = new Set(doc.drivers?.map(d => d.driverId) ?? []);
  }

  // Sort: lastSeen DESC then family name
  const sorted = Object.entries(dbDrivers)
    .sort(([, a], [, b]) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.familyName.localeCompare(b.familyName));

  const rows = sorted.map(([id, d]) => {
    const checked  = preselected.has(id) ? 'checked' : '';
    const yearTag  = d.lastSeen === year * 1      ? `<span style="color:#5c5;font-size:11px">${d.lastSeen}</span>`
                   : d.lastSeen === year * 1 - 1  ? `<span style="color:var(--muted);font-size:11px">${d.lastSeen}</span>`
                   : d.lastSeen                   ? `<span style="color:#664;font-size:11px">${d.lastSeen}</span>`
                   : '';
    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" name="driverIds" value="${esc(id)}" ${checked}>
      <span style="font-family:var(--mono);font-size:12px;color:var(--muted);width:32px">${esc(d.driverCode3 ?? '')}</span>
      <span style="width:30px;text-align:right;color:var(--muted);font-size:12px">${d.permanentNumber != null ? '#' + d.permanentNumber : ''}</span>
      <span>${esc(d.flag ?? '')} ${esc(d.givenName ?? '')} <strong>${esc(d.familyName ?? '')}</strong></span>
      <span style="color:var(--muted);font-size:12px">${esc(d.nationality ?? '')}</span>
      <span style="margin-left:auto">${yearTag}</span>
    </label>`;
  }).join('');

  const overwriteWarning = exists(curFile)
    ? `<div class="banner banner-error" style="margin-bottom:16px">This will overwrite the existing <code>${year}-drivers.yaml</code>.</div>` : '';

  res.send(layout(`${year} Driver Setup`, `
    <h1>Set up ${esc(year)} Drivers</h1>
    <p style="color:var(--muted);margin-bottom:16px;font-size:13px">
      Select drivers entered in the ${esc(year)} championship. All biographical data is populated from
      <a href="/data/drivers.yaml" target="_blank">drivers.yaml</a>.
      Drivers not in the database must be added there first.
    </p>
    ${overwriteWarning}
    <form method="POST" action="/${year}/generate-drivers">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
        <button class="btn-fetch" type="submit">Generate ${year}-drivers.yaml</button>
        <a href="/${year}" style="font-size:13px;color:var(--muted)">Cancel</a>
        <span style="font-size:12px;color:var(--muted);margin-left:auto">${sorted.length} drivers in database · year column = last seen</span>
      </div>
      <div class="card" style="padding:0;max-height:65vh;overflow-y:auto">${rows}</div>
    </form>
  `, [[year, `/${year}`], ['Setup Drivers', null]]));
});

app.post('/:year/generate-drivers', (req, res) => {
  const { year } = req.params;
  const selectedIds = [req.body.driverIds].flat().filter(Boolean);
  const dbDrivers   = getDriversFromDb();

  const drivers = selectedIds.map(id => {
    const { lastSeen, ...rest } = dbDrivers[id] ?? {};
    return dbDrivers[id] ? { driverId: id, ...rest } : null;
  }).filter(Boolean);

  const filePath = `${DATA_DIR}/${year}/${year}-drivers.yaml`;
  fs.mkdirSync(`${DATA_DIR}/${year}`, { recursive: true });
  fs.writeFileSync(filePath, yaml.dump({ season: year * 1, drivers }, { lineWidth: 120 }));
  res.redirect(`/${year}?driversGenerated=${drivers.length}`);
});

// ── Setup constructors from database ──────────────────────────────────────────

app.get('/:year/setup-constructors', (req, res) => {
  const { year } = req.params;

  if (!constructorsDbExists()) {
    return res.redirect(`/?dbError=${encodeURIComponent('Build the lookup databases first — constructors.yaml is missing.')}`);
  }

  const dbConstructors = getConstructorsFromDb();
  const prevYear       = String(year * 1 - 1);
  const prevFile       = `${DATA_DIR}/${prevYear}/${prevYear}-constructors.yaml`;
  const curFile        = `${DATA_DIR}/${year}/${year}-constructors.yaml`;

  let preselected = new Set();
  const seedFile = exists(curFile) ? curFile : exists(prevFile) ? prevFile : null;
  if (seedFile) {
    const doc = loadYaml(seedFile);
    preselected = new Set(doc.constructors?.map(c => c.constructorId) ?? []);
  }

  const sorted = Object.entries(dbConstructors)
    .sort(([, a], [, b]) => (b.years?.at(-1) ?? 0) - (a.years?.at(-1) ?? 0) || a.name.localeCompare(b.name));

  const rows = sorted.map(([id, c]) => {
    const checked  = preselected.has(id) ? 'checked' : '';
    const lastYear = c.years?.at(-1);
    const yearTag  = lastYear === year * 1     ? `<span style="color:#5c5;font-size:11px">${lastYear}</span>`
                   : lastYear === year * 1 - 1 ? `<span style="color:var(--muted);font-size:11px">${lastYear}</span>`
                   : lastYear                  ? `<span style="color:#664;font-size:11px">${lastYear}</span>`
                   : '';
    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" name="constructorIds" value="${esc(id)}" ${checked}>
      <span>${esc(c.flag ?? '')} <strong>${esc(c.name ?? id)}</strong></span>
      <span style="color:var(--muted);font-size:12px">${esc(c.nationality ?? '')}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">${esc(id)}</span>
      <span style="margin-left:auto">${yearTag}</span>
    </label>`;
  }).join('');

  const overwriteWarning = exists(curFile)
    ? `<div class="banner banner-error" style="margin-bottom:16px">This will overwrite the existing <code>${year}-constructors.yaml</code>.</div>` : '';

  res.send(layout(`${year} Constructor Setup`, `
    <h1>Set up ${esc(year)} Constructors</h1>
    <p style="color:var(--muted);margin-bottom:16px;font-size:13px">
      Select constructors entered in the ${esc(year)} championship. All data (including accumulated
      <code>knownAs</code> aliases) is populated from
      <a href="/data/constructors.yaml" target="_blank">constructors.yaml</a>.
    </p>
    ${overwriteWarning}
    <form method="POST" action="/${year}/generate-constructors">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
        <button class="btn-fetch" type="submit">Generate ${year}-constructors.yaml</button>
        <a href="/${year}" style="font-size:13px;color:var(--muted)">Cancel</a>
        <span style="font-size:12px;color:var(--muted);margin-left:auto">${sorted.length} constructors in database · year column = last seen</span>
      </div>
      <div class="card" style="padding:0;max-height:65vh;overflow-y:auto">${rows}</div>
    </form>
  `, [[year, `/${year}`], ['Setup Constructors', null]]));
});

app.post('/:year/generate-constructors', (req, res) => {
  const { year }      = req.params;
  const selectedIds   = [req.body.constructorIds].flat().filter(Boolean);
  const dbConstructors = getConstructorsFromDb();

  const constructors = selectedIds.map(id =>
    dbConstructors[id] ? { constructorId: id, ...dbConstructors[id] } : null
  ).filter(Boolean);

  const filePath = `${DATA_DIR}/${year}/${year}-constructors.yaml`;
  fs.mkdirSync(`${DATA_DIR}/${year}`, { recursive: true });
  fs.writeFileSync(filePath, yaml.dump({ season: year * 1, constructors }, { lineWidth: 120 }));
  res.redirect(`/${year}?constructorsGenerated=${constructors.length}`);
});

// ── Drivers ───────────────────────────────────────────────────────────────────

app.get('/:year/drivers', (req, res) => {
  const { year } = req.params;
  const file = `${DATA_DIR}/${year}/${year}-drivers.yaml`;
  if (!exists(file)) return res.status(404).send(layout('Not found', '<p>Not found.</p>'));

  const { drivers } = loadYaml(file);
  const rows = drivers.map(d => `<tr>
    <td>${esc(d.flag ?? '')} ${esc(d.nationality ?? '')}</td>
    <td><strong>${esc(d.givenName)} ${esc(d.familyName)}</strong></td>
    <td class="driver-code">${esc(d.driverCode3)}</td>
    <td class="num">${d.permanentNumber ?? ''}</td>
    <td>${d.dateOfBirth ?? ''}</td>
    <td><a href="${esc(d.url)}" target="_blank" rel="noopener">Wikipedia ↗</a></td>
  </tr>`).join('');

  res.send(layout(`${year} Drivers`, `
    <h1>${esc(year)} Drivers</h1>
    <div class="card">
      <table>
        <thead><tr>
          <th>Nationality</th>
          <th>Name</th>
          <th>Code</th>
          <th class="num">#</th>
          <th>Born</th>
          <th>Link</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, [[year, `/${year}`], ['Drivers', null]]));
});

// ── Constructors ──────────────────────────────────────────────────────────────

app.get('/:year/constructors', (req, res) => {
  const { year } = req.params;
  const file = `${DATA_DIR}/${year}/${year}-constructors.yaml`;
  if (!exists(file)) return res.status(404).send(layout('Not found', '<p>Not found.</p>'));

  const { constructors } = loadYaml(file);
  const rows = constructors.map(c => {
    const color = constructorColor(c.constructorId);
    return `<tr>
      <td><span class="constructor-dot" style="background:${color}"></span>${esc(c.flag ?? '')} ${esc(c.name)}</td>
      <td>${esc(c.nationality)}</td>
      <td style="color:var(--muted);font-size:12px">${c.knownAs?.join(', ') ?? ''}</td>
      <td><a href="${esc(c.url)}" target="_blank" rel="noopener">Wikipedia ↗</a></td>
    </tr>`;
  }).join('');

  res.send(layout(`${year} Constructors`, `
    <h1>${esc(year)} Constructors</h1>
    <div class="card">
      <table>
        <thead><tr>
          <th>Name</th>
          <th>Nationality</th>
          <th>Also known as</th>
          <th>Link</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, [[year, `/${year}`], ['Constructors', null]]));
});

// ── Championship table ────────────────────────────────────────────────────────

app.get('/:year/table', (req, res) => {
  const { year } = req.params;
  const file = `${DATA_DIR}/${year}/${year}-table-drivers.yaml`;
  if (!exists(file)) return res.status(404).send(layout('Not found', '<p>Championship table not found.</p>'));

  const data = loadYaml(file);
  const races = data.races ?? [];
  const drivers = data.drivers ?? [];

  const yr = year * 1;
  const prevYear = exists(`${DATA_DIR}/${yr - 1}/${yr - 1}-table-drivers.yaml`) ? yr - 1 : null;
  const nextYear = exists(`${DATA_DIR}/${yr + 1}/${yr + 1}-table-drivers.yaml`) ? yr + 1 : null;

  const sorted = [...drivers].sort((a, b) => {
    const aStanding = a.results?.[a.results.length - 1]?.standing ?? 999;
    const bStanding = b.results?.[b.results.length - 1]?.standing ?? 999;
    return aStanding - bStanding;
  });

  // Race column headers
  const raceHeaders = races.map(r => {
    const href = `/${year}/${r.round}/${r.type === 'sprint' ? 'sprint' : 'race'}`;
    return `<th class="race-th"><a href="${href}" title="${esc(r.name)}">${esc(r.raceCode3)}<br><small style="font-weight:400;color:var(--muted)">${r.type === 'sprint' ? 'S' : ''}</small></a></th>`;
  }).join('');

  const driverRows = sorted.map((d, idx) => {
    const finalResult = d.results?.[d.results.length - 1];
    const totalPoints = finalResult?.cumulative ?? 0;
    const color = d.results?.find(r => r.constructorId)
      ? constructorColor(d.results.find(r => r.constructorId).constructorId)
      : '#888';

    const raceCells = races.map((_, i) => {
      const r = d.results?.[i];
      if (!r || r.position === 0) return `<td class="race-cell pos-none">·</td>`;
      const pos = r.position;
      let cls = 'race-cell';
      if (pos === 1) cls += ' pos-1';
      else if (pos === 2) cls += ' pos-2';
      else if (pos === 3) cls += ' pos-3';
      const isDnf = r.status && r.status !== 'Finished' && pos > 0;
      if (isDnf) cls += ' pos-dnf';
      const label = isDnf ? 'R' : pos;
      return `<td class="${cls}" title="${esc(r.status ?? '')}">${label}</td>`;
    }).join('');

    return `<tr>
      <td class="num pos">${idx + 1}</td>
      <td>
        <span class="constructor-dot" style="background:${color}"></span>
        <span class="flag">${esc(d.flag ?? '')}</span>
        ${esc(d.givenName)} <strong>${esc(d.familyName)}</strong>
      </td>
      <td class="num" style="font-weight:700;font-size:15px">${totalPoints}</td>
      ${raceCells}
    </tr>`;
  }).join('');

  const prevLink = prevYear ? `<a href="/${prevYear}/table" style="font-size:13px;color:var(--accent)">← ${prevYear}</a>` : '';
  const nextLink = nextYear ? `<a href="/${nextYear}/table" style="font-size:13px;color:var(--accent)">${nextYear} →</a>` : '';

  res.send(layout(`${year} Championship`, `
    <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:16px">
      ${prevLink}
      <h1 style="margin:0">${esc(year)} Drivers Championship</h1>
      ${nextLink}
      <form method="POST" action="/${year}/generate-table" style="margin:0"
          onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Generating…'">
        <input type="hidden" name="from" value="table">
        <button type="submit" class="btn-fetch"
            style="background:var(--surface2);border:1px solid var(--border);color:var(--text);font-size:12px;padding:4px 10px">
          ⟳ Regenerate
        </button>
      </form>
    </div>
    <div class="champ-table-wrap card">
      <table class="champ-table">
        <thead><tr>
          <th class="num">Pos</th>
          <th>Driver</th>
          <th class="num">Pts</th>
          ${raceHeaders}
        </tr></thead>
        <tbody>${driverRows}</tbody>
      </table>
    </div>
    <p style="margin-top:12px;color:var(--muted);font-size:12px">R = Retired &nbsp;·&nbsp; S = Sprint &nbsp;·&nbsp; · = Did not participate</p>
  `, [[year, `/${year}`], ['Championship', null]]));
});

// ── Round ─────────────────────────────────────────────────────────────────────

app.get('/:year/:round', (req, res) => {
  const { year, round } = req.params;
  const roundsFile = `${DATA_DIR}/${year}/${year}-rounds.yaml`;
  if (!exists(roundsFile)) return res.status(404).send(layout('Not found', '<p>Season not found.</p>'));

  const { rounds } = loadYaml(roundsFile);
  const roundNum = parseInt(round, 10);
  const roundData = rounds.find(r => r.round === roundNum);
  if (!roundData) return res.status(404).send(layout('Not found', '<p>Round not found.</p>'));

  const sessionFiles = getSessionFiles(year, round);
  const ordered = [...SESSION_ORDER.filter(s => sessionFiles.includes(s)), ...sessionFiles.filter(s => !SESSION_ORDER.includes(s))];

  const cards = ordered.map(s => {
    const sessionData = roundData.sessions?.find(rs => rs.name === sessionLabel(s));
    const dateStr = sessionData?.date
      ? new Date(sessionData.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      : '';
    return `<a class="session-card" href="/${year}/${round}/${s}">
      <div class="label">${esc(sessionLabel(s))}</div>
      ${dateStr ? `<div class="date">${esc(dateStr)}</div>` : ''}
    </a>`;
  }).join('');

  const { circuit, name } = roundData;
  const loc = circuit?.location;

  res.send(layout(`${year} Round ${round}`, `
    <h1>${esc(roundData.name)}</h1>
    <p style="color:var(--muted);margin-bottom:20px">
      ${esc(year)} · Round ${esc(String(roundNum))}
      ${loc ? `· <span class="flag">${loc.flag ?? ''}</span> ${esc(loc.locality)}, ${esc(loc.country)}` : ''}
      ${circuit ? `· <a href="${esc(circuit.url)}" target="_blank" rel="noopener">${esc(circuit.name)}</a>` : ''}
    </p>
    <h2>Sessions</h2>
    <div class="sessions-grid">${cards}</div>
  `, [[year, `/${year}`], [`Round ${round}`, null]]));
});

// ── Session helpers ───────────────────────────────────────────────────────────

function buildSessionTable(session, results, driverMap, constructorMap) {
  function driverName(id) {
    const d = driverMap[id];
    return d ? `${d.givenName} ${d.familyName}` : id;
  }
  function driverFlag(id) { return driverMap[id]?.flag ?? ''; }
  function cName(id) { return constructorMap[id]?.name ?? id; }

  if (session === 'race' || session === 'sprint') {
    const rows = results.map(r => {
      const color = constructorColor(r.constructorId);
      const finished = r.status === 'Finished';
      const statusCls = !finished ? (r.status === 'Disqualified' ? 'status-dns' : 'status-dnf') : '';
      const time = r.time
        ? `<span class="${statusCls}">${esc(r.time)}</span>`
        : `<span class="${statusCls}">${esc(r.status ?? '')}</span>`;
      return `<tr>
        <td class="num pos">${r.position}</td>
        <td><span class="flag">${esc(driverFlag(r.driverId))}</span>${esc(driverName(r.driverId))}</td>
        <td><span class="constructor-dot" style="background:${color}"></span>${esc(cName(r.constructorId))}</td>
        <td class="num">${r.laps ?? ''}</td>
        <td class="num">${time}</td>
        <td class="num">${finished ? '' : `<span class="${statusCls}">${esc(r.status ?? '')}</span>`}</td>
        <td class="num" style="font-weight:600">${r.points > 0 ? r.points : ''}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th class="num">Pos</th><th>Driver</th><th>Constructor</th>
      <th class="num">Laps</th><th class="num">Time</th><th class="num">Status</th><th class="num">Pts</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  if (session === 'qualifying' || session === 'sprint-qualifying') {
    const hasQ2 = results.some(r => r.times?.q2);
    const hasQ3 = results.some(r => r.times?.q3);
    const rows = results.map(r => {
      const color = constructorColor(r.constructorId);
      return `<tr>
        <td class="num pos">${r.position}</td>
        <td><span class="flag">${esc(driverFlag(r.driverId))}</span>${esc(driverName(r.driverId))}</td>
        <td><span class="constructor-dot" style="background:${color}"></span>${esc(cName(r.constructorId))}</td>
        <td class="num">${esc(r.times?.q1 ?? '')}</td>
        ${hasQ2 ? `<td class="num">${esc(r.times?.q2 ?? '')}</td>` : ''}
        ${hasQ3 ? `<td class="num">${esc(r.times?.q3 ?? '')}</td>` : ''}
        <td class="num">${r.laps ?? ''}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th class="num">Pos</th><th>Driver</th><th>Constructor</th>
      <th class="num">Q1</th>${hasQ2 ? '<th class="num">Q2</th>' : ''}${hasQ3 ? '<th class="num">Q3</th>' : ''}
      <th class="num">Laps</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  if (session === 'practice-1' || session === 'practice-2' || session === 'practice-3') {
    const rows = results.map(r => {
      const color = constructorColor(r.constructorId);
      return `<tr>
        <td class="num pos">${r.position}</td>
        <td><span class="flag">${esc(driverFlag(r.driverId))}</span>${esc(driverName(r.driverId))}</td>
        <td><span class="constructor-dot" style="background:${color}"></span>${esc(cName(r.constructorId))}</td>
        <td class="num">${esc(r.time ?? '')}</td>
        <td class="num" style="color:var(--muted)">${esc(r.gap ?? '')}</td>
        <td class="num">${r.laps ?? ''}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th class="num">Pos</th><th>Driver</th><th>Constructor</th>
      <th class="num">Time</th><th class="num">Gap</th><th class="num">Laps</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  if (session === 'race-grid' || session === 'sprint-grid') {
    const rows = results.map(r => {
      const color = constructorColor(r.constructorId);
      return `<tr>
        <td class="num pos">${r.position}</td>
        <td><span class="flag">${esc(driverFlag(r.driverId))}</span>${esc(driverName(r.driverId))}</td>
        <td><span class="constructor-dot" style="background:${color}"></span>${esc(cName(r.constructorId))}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th class="num">Grid</th><th>Driver</th><th>Constructor</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Generic fallback
  const rows = results.map(r => {
    const cells = Object.entries(r).map(([, v]) =>
      `<td>${esc(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))}</td>`
    ).join('');
    return `<tr>${cells}</tr>`;
  });
  const headers = results[0] ? Object.keys(results[0]).map(k => `<th>${esc(k)}</th>`).join('') : '';
  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// ── Session GET ───────────────────────────────────────────────────────────────

app.get('/:year/:round/:session', (req, res) => {
  const { year, round, session } = req.params;
  const { fetched, error } = req.query;
  const file = `${DATA_DIR}/${year}/${year}-${round}-${session}.yaml`;
  const isFetchable = FETCHABLE_SESSIONS.includes(session);

  if (!exists(file) && !isFetchable) {
    return res.status(404).send(layout('Not found', '<p>Session not found.</p>'));
  }

  const sessionName = sessionLabel(session);

  const roundsFile = `${DATA_DIR}/${year}/${year}-rounds.yaml`;
  const roundData = exists(roundsFile)
    ? loadYaml(roundsFile).rounds.find(r => r.round === parseInt(round, 10))
    : null;
  const gpName = roundData?.name ?? `Round ${round}`;

  const driversFile = `${DATA_DIR}/${year}/${year}-drivers.yaml`;
  const constructorsFile = `${DATA_DIR}/${year}/${year}-constructors.yaml`;
  const driverMap = {};
  const constructorMap = {};
  if (exists(driversFile)) loadYaml(driversFile).drivers.forEach(d => { driverMap[d.driverId] = d; });
  if (exists(constructorsFile)) loadYaml(constructorsFile).constructors.forEach(c => { constructorMap[c.constructorId] = c; });

  const bannerHtml = fetched
    ? `<div class="banner banner-success">Results fetched from formula1.com and saved to <code>${year}-${round}-${session}.yaml</code>.</div>`
    : error
    ? `<div class="banner banner-error"><strong>Fetch failed:</strong> ${esc(decodeURIComponent(error))}</div>`
    : '';

  const fetchButton = isFetchable
    ? `<form class="fetch-bar" method="POST" action="/${year}/${round}/${session}"
         onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Fetching…'">
         <button class="btn-fetch" type="submit">↓ Fetch from formula1.com</button>
         <a id="f1-url-link" data-resolve="/${year}/${round}/${session}/f1-url"
            href="#" target="_blank" rel="noopener"
            style="font-size:12px;color:var(--muted);font-family:var(--mono);word-break:break-all">resolving url…</a>
       </form>
       <script>
         (function() {
           const a = document.getElementById('f1-url-link');
           fetch(a.dataset.resolve)
             .then(r => r.json())
             .then(function(d) {
               if (d.url) { a.href = d.url; a.textContent = d.url; a.style.color = ''; }
               else { a.textContent = 'could not resolve url: ' + d.error; }
             })
             .catch(function() { a.textContent = 'could not resolve url'; });
         })();
       </script>`
    : '';

  let contentHtml;
  if (!exists(file)) {
    contentHtml = `<div class="card empty-state">No data yet — use the button above to fetch results from formula1.com.</div>`;
  } else {
    const data = loadYaml(file);
    const results = data.results ?? [];
    contentHtml = `<div class="card">${buildSessionTable(session, results, driverMap, constructorMap)}</div>`;
  }

  res.send(layout(`${year} ${gpName} – ${sessionName}`, `
    <h1>${esc(gpName)}</h1>
    <p style="color:var(--muted);margin-bottom:20px">${esc(year)} · Round ${esc(round)} · ${esc(sessionName)}</p>
    ${bannerHtml}
    ${fetchButton}
    ${contentHtml}
  `, [[year, `/${year}`], [gpName, `/${year}/${round}`], [sessionName, null]]));
});

// ── Session URL resolver ──────────────────────────────────────────────────────

app.get('/:year/:round/:session/f1-url', async (req, res) => {
  const { year, round, session } = req.params;
  try {
    const url = await resolveF1Url(year, round, session);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Session POST (fetch from formula1.com) ────────────────────────────────────

app.post('/:year/:round/:session', async (req, res) => {
  const { year, round, session } = req.params;
  try {
    await fetchAndSaveSession(year, round, session);
    res.redirect(`/${year}/${round}/${session}?fetched=1`);
  } catch (err) {
    res.redirect(`/${year}/${round}/${session}?error=${encodeURIComponent(err.message)}`);
  }
});

app.listen(PORT, () => {
  console.log(`F1 Data server running at http://localhost:${PORT}`);
});

# Formula 1 Data

Formula 1 season, round, and session results stored as YAML files.

## Running the server

```
npm run serve
```

Opens at `http://localhost:3000`.

## Site structure

| Page | Description |
|---|---|
| `/` | Home — links to Seasons, Drivers, Constructors |
| `/seasons` | All seasons grid |
| `/data/drivers` | All-time driver database, paginated A–Z |
| `/data/constructors` | All-time constructor database, paginated A–Z |
| `/:year` | Season overview — rounds table, setup and generate controls |
| `/:year/:round` | Round overview — session cards |
| `/:year/:round/:session` | Session results table |

## Typical workflow for a new season

1. Go to `/seasons` and click the next-year card (e.g. **2027 +**)
2. On the season page, use **Set up from database →** to generate `YYYY-drivers.yaml` and `YYYY-constructors.yaml` from the historical database, selecting the entered drivers and constructors
3. Click **↓ Fetch rounds from formula1.com** to populate `YYYY-rounds.yaml` with the calendar and circuit data
4. As each race weekend happens, open `/:year/:round/:session` and click **↓ Fetch from formula1.com** to pull results
5. Click **⟳ Generate championship table** on the season page to rebuild `YYYY-table-drivers.yaml`

## Typical workflow during a race weekend

1. Navigate to the season → round → session page
2. Click **↓ Fetch from formula1.com** on each session after it finishes (practice, qualifying, race, sprint sessions)
3. After the race (and any manual YAML edits), click **⟳ Generate championship table** on the season page

## Data files

Each season lives in `data/YYYY/`:

| File | Description |
|---|---|
| `YYYY-rounds.yaml` | Calendar, circuits, session times |
| `YYYY-drivers.yaml` | Drivers entered in the championship |
| `YYYY-constructors.yaml` | Constructors entered in the championship |
| `YYYY-table-drivers.yaml` | Drivers championship table (generated) |
| `YYYY-R-race.yaml` | Race results for round R |
| `YYYY-R-qualifying.yaml` | Qualifying results |
| `YYYY-R-sprint.yaml` | Sprint results |
| `YYYY-R-sprint-qualifying.yaml` | Sprint qualifying results |
| `YYYY-R-practice-1.yaml` | Practice 1 results |
| … | Practice 2, 3; race grid, sprint grid |

Shared lookup databases in `data/`:

| File | Description |
|---|---|
| `gp-lookup.yaml` | GP name → `raceCode3` and `circuitId` |
| `circuits.yaml` | Circuit details (coordinates, Wikipedia URL, flag) |
| `drivers.yaml` | All-time driver biographical database |
| `constructors.yaml` | All-time constructor database with all known aliases |

## Data sources

- **formula1.com** — session results and season calendars
- **Jolpica / Ergast API** — `https://api.jolpi.ca/ergast/f1/`

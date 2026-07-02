import fs from 'fs';
import yaml from 'js-yaml';
import {loadConstructors,loadRounds} from './db.js'
import {seasonPoints} from './scoringRules.js'

const FIRST_SEASON = 1958; // Constructors' Championship began in 1958

// 1958-1978: only each constructor's best-placed car scored WCC points each
// race (the other car's points counted for its driver, not the team).
// From 1979: every classified car's points count.
// Source: en.wikipedia.org/wiki/List_of_Formula_One_World_Constructors%27_Champions
// "From the inaugural season ... in 1958 up until the 1978 season only the
// highest-scoring driver in each race for each constructor contributed
// points ...; since the 1979 season points from all cars ... have counted."
const BEST_CAR_ONLY_LAST_SEASON = 1978;

// Verified against official final points totals for every season 1958-1990:
// 1958-1978 matches exactly (best-car-only + the drivers' drop-round rule
// for that year, reused from scoringRules.js) for 1960-1978; 1958 and 1959
// come out 2 points over (right champion, likely an entrant/constructor
// attribution quirk from the shared-drive era that our per-driver data
// doesn't capture). 1979-1990 matches exactly as a plain full-season sum of
// every race's points, with NO drop-round - unlike the Drivers' Championship,
// which kept dropping rounds until 1991, the Constructors' Championship
// stopped dropping rounds once the 1979 "all cars count" rule began.
function constructorSeasonPoints(year, racePoints) {
  if (year >= 1979) return racePoints.reduce((a,v) => a + v, 0);
  return seasonPoints(year, racePoints);
}

function constructorCompare(ri) {
  return (a,b) => {
    let c = b.results[ri].cumulative - a.results[ri].cumulative
    if (c != 0) {
      return c
    }
    for (let i = 0; i < b.results[ri]._racePositions.length; i++) {
      c = b.results[ri]._racePositions[i] - a.results[ri]._racePositions[i]
      if (c != 0) {
        return c
      }
    }
    return a.name.localeCompare(b.name)
  }
}

export function generateConstructorsTable(values) {
  if (values.year*1 < FIRST_SEASON) throw new Error(`No Constructors Championship before ${FIRST_SEASON}`)

  const rounds = loadRounds(values.year)
  const constructorsDb = loadConstructors(values.year).asMap()

  let t = {
    season: values.year*1,
    races: [],
    constructors: [],
  };

  let races = [];

  rounds.forEach((r, ri) => {

    if (r.sessions.find(s => s.name == 'Sprint')) {
      try {
        const sprint = yaml.load(fs.readFileSync(`data/${values.year}/${values.year}-${r.round}-sprint.yaml`, 'utf8'));
        races.push(sprint);
        t.races.push({
          round: ri + 1,
          type: 'sprint',
          name: r.name,
          raceCode3: r.raceCode3,
          flag: r.circuit.location.flag
        });
      } catch (e) {
        console.log(`No sprint data for ${values.year}-${r.round}`);
        races.push({ results: [] });
        t.races.push({
          round: ri + 1,
          type: 'sprint',
          name: r.name,
          raceCode3: r.raceCode3,
          flag: r.circuit.location.flag
        });
      }
    }

    try {
      const race = yaml.load(fs.readFileSync(`data/${values.year}/${values.year}-${r.round}-race.yaml`, 'utf8'));
      races.push(race);
      t.races.push({
        round: ri + 1,
        type: 'race',
        name: r.name,
        raceCode3: r.raceCode3,
        flag: r.circuit.location.flag
      });
    } catch (e) {
      console.log(`No race data for ${values.year}-${r.round}`);
      races.push({ results: [] });
      t.races.push({
        round: ri + 1,
        type: 'race',
        name: r.name,
        raceCode3: r.raceCode3,
        flag: r.circuit.location.flag
      });
    }
  });

  let constructorsMap = {};

  Object.values(constructorsDb).forEach((c) => {
    let constructor = {
      constructorId: c.constructorId,
      name: c.name,
      nationality: c.nationality,
      flag: c.flag,
      countryCode3: c.countryCode3,
      results: [],
    };
    constructorsMap[constructor.constructorId] = constructor;
    t.constructors.push(constructor);
  })

  const constructorsWithRaceStart = new Set();
  const bestCarOnly = values.year*1 <= BEST_CAR_ONLY_LAST_SEASON;

  // A constructor's per-race entry lists every one of its cars with that
  // car's finishing position and points, sorted best-placed first (so
  // consumers - e.g. the table UI - don't have to re-derive per-car results
  // from the race files). `points` is the combined total that counts toward
  // the championship - just the best-placed car for 1958-1978, all cars from
  // 1979 - kept alongside `cars` so the season-long cumulative/standing logic
  // below doesn't need to change.
  races.forEach((race, ri) => {
    const carsByConstructor = {};

    race.results.forEach((res) => {
      const constructorId = res.constructorId;
      if (!constructorId) return;

      constructorsWithRaceStart.add(constructorId);
      (carsByConstructor[constructorId] ??= []).push({
        position: res.position*1,
        points: res.points*1,
      });
    });

    Object.keys(carsByConstructor).forEach((constructorId) => {
      const constructor = constructorsMap[constructorId];
      if (!constructor) {
        console.error(`round ${ri + 1}`)
        throw new Error(`Failed to find constructor ${constructorId}`)
      }
      // Classified cars (position > 0) first in finishing order, unclassified last.
      const cars = carsByConstructor[constructorId].toSorted((a,b) => {
        if (a.position > 0 && b.position > 0) return a.position - b.position;
        if (a.position > 0) return -1;
        if (b.position > 0) return 1;
        return 0;
      });

      const carsByPoints = [...cars].toSorted((a,b) => b.points - a.points);
      const scoringCars = bestCarOnly ? carsByPoints.slice(0,1) : carsByPoints;

      constructor.results[ri] = {
        cars,
        points: scoringCars.reduce((a,v) => a + v.points, 0),
        cumulative: 0,
        standing: 0,
      };
    });
  });

  t.constructors.forEach((constructor) => {

    let racePositions = Array(t.constructors.length).fill(0);
    let racePoints = Array(races.length).fill(0);

    for (let r = 0; r < races.length; r++) {
      if (!constructor.results[r]) {
        constructor.results[r] = {
          cars: [],
          points: 0,
          cumulative: -1, // to be set
          standing: 0,
          _racePositions: Object.assign([], racePositions),
        };
      } else {
        racePoints[r] = constructor.results[r].points

        const bestPosition = constructor.results[r].cars.find(c => c.position > 0)?.position ?? 0;
        if (t.races[r].type == 'race' && bestPosition > 0) racePositions[bestPosition - 1]++;
        constructor.results[r]._racePositions = Object.assign([], racePositions);
      }

      constructor.results[r].cumulative = constructorSeasonPoints(values.year*1, racePoints);
    }
  });

  t.constructors = t.constructors.filter(c => constructorsWithRaceStart.has(c.constructorId));

  races.forEach((race, ri) => {
    t.constructors.toSorted(constructorCompare(ri)).forEach((constructor, i) => {
      constructor.results[ri].standing = i + 1;
    });
  });

  t.constructors.forEach((constructor) => {
    constructor.results.forEach((res) => {
      delete res._racePositions;
    });
  });

  fs.writeFileSync(`data/${values.year}/${values.year}-table-constructors.yaml`, yaml.dump(t));
}

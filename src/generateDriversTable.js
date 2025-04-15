import fs from 'fs';
import yaml from 'js-yaml';
import {loadDrivers,loadConstructors,loadRounds} from './db.js'

function statusFor(status) {
  if (status == 'Finished') return 'Finished'
  if (status == 'Lapped') return 'Finished'
  if (/^\+[0-9]+ Laps?$/.test(status)) return 'Finished'
  if (status == 'Not classified') return 'NC'
  if (status == 'Did not start') return 'DNS'
  if (status == 'Disqualified') return 'DSQ'
  if (status == 'Withdrew') return 'WD'

  return 'DNF'
}

function sumBest(racePoints,bestX) {
  return racePoints.toSorted((a,b) => b-a).slice(0,bestX).reduce((a,v) => a + v,0)
}

function sumBestSplit(racePoints,bestX,ofFirstY,bestZOfRest,restCount) {
  if (racePoints.length != ofFirstY+restCount) throw new Error(`race results length = ${racePoints.length} but need ${ofFirstY}+${restCount}`)
  return racePoints.slice(0,ofFirstY).toSorted((a,b) => b-a).slice(0,bestX).reduce((a,v) => a + v,0)
   + racePoints.slice(ofFirstY).toSorted((a,b) => b-a).slice(0,bestZOfRest).reduce((a,v) => a + v,0)
}

function driverCompare(ri) {
  return (a,b) => {
    let c =  b.results[ri].cumulative - a.results[ri].cumulative
    if (c != 0) {
      return c
    }
    for (let i = 0 ; i<b.results[ri]._racePositions.length; i++) {
      c = b.results[ri]._racePositions[i] - a.results[ri]._racePositions[i]
      if (c != 0) {
        return c
      }
    }
    c = a.familyName.localeCompare(b.familyName)
    if (c != 0) return c
    return a.givenName.localeCompare(b.givenName)
  }
}

export function generateDriversTable(values) {

  const rounds = loadRounds(values.year)
  const drivers = loadDrivers(values.year)
  const constructors = loadConstructors(values.year)

  let t = {
    season: values.year*1,
    races: [],
    drivers: [],
  };

  let races = [];

  rounds.forEach((r, ri) => {

    if (r.sessions.find(s => s.name == 'Sprint')) {
      try {
        const sprint = yaml.load(fs.readFileSync(`data/${values.year}-${r.round}-sprint.yaml`, 'utf8'));
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
      const race = yaml.load(fs.readFileSync(`data/${values.year}-${r.round}-race.yaml`, 'utf8'));
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

  let driversMap = {};

  drivers.forEach((d, di) => {
    let driver = {
      driverId: d.driverId,
      familyName: d.familyName,
      givenName: d.givenName,
      flag: d.flag,
      number: (d.permanentNumber ? d.permanentNumber * 1 : -1),
      countryCode3: d.countryCode3,
      driverCode3: (d.driverCode3
        ? d.driverCode3
        : d.familyName.substring(0,3).toUpperCase()),
      results: [],
    };
    driversMap[driver.driverId] = driver;
    t.drivers.push(driver);
  })

  races.forEach((race, ri) => {
    race.results.forEach((res) => {
      let driver = driversMap[res.driverId];

      if (!driver) {
        console.error(`round ${race.round}`)
        console.error(res)
        throw new Error(`Failed to find driver ${res.driverId}`)
      }

      // drivers can have multiple results in the same race
      // when car sharing/swapping was allowed
      // take the best result for position
      // add all the points together
      if (driver.results[ri]) {
        driver.results[ri].points += res.points*1
      } else {
        driver.results[ri] = {
          position: res.position * 1,
          points: res.points * 1,
          status: statusFor(res.status),
          constructorId: res.constructorId,
          cumulative: 0,
          standing: 0,
        };
      }
    });
  });

  t.drivers.forEach((driver) => {

    let racePositions = Array(t.drivers.length).fill(0);
    let racePoints = Array(races.length).fill(0);

    for (let r = 0; r < races.length; r++) {
      if (!driver.results[r]) {
        driver.results[r] = {
          position: 0,
          points: 0,
          status: '',
          constructorId: '',
          cumulative: -1, // to be set
          standing: 0,
          _racePositions: Object.assign([], racePositions),
        };
      } else {
        racePoints[r] = driver.results[r].points

        if (t.races[r].type == 'race') racePositions[driver.results[r].position - 1]++;
        driver.results[r]._racePositions = Object.assign([], racePositions);
      }

      let points = 0
      if (values.year <= 1953) {
        // top 4 results count
        points = sumBest(racePoints,4)
      } else if (
        (values.year >= 1954 && values.year <=1957)
        ||
        values.year == 1959
        ||
        (values.year >= 1961 && values.year <=1962)
        ||
        values.year == 1966) {
        // top 5 results count
        points = sumBest(racePoints,5)
      } else if (
        values.year == 1958
        ||
        values.year == 1960
        ||
        (values.year >= 1963 && values.year <= 1965)) {
        // top 6 results count
        points = sumBest(racePoints,6)
      } else if (values.year == 1967) {
        points = sumBestSplit(racePoints,5,6,4,5)
      } else if (values.year == 1968) {
        points = sumBestSplit(racePoints,5,6,5,6)
      } else if (values.year == 1969) {
        points = sumBestSplit(racePoints,5,6,4,5)
      } else if (values.year == 1970) {
        points = sumBestSplit(racePoints,6,7,5,6)
      } else if (values.year == 1971) {
        points = sumBestSplit(racePoints,5,6,4,5)
      } else if (values.year == 1972) {
        points = sumBestSplit(racePoints,5,6,5,6)
      } else if (values.year == 1973 || values.year == 1974) {
        points = sumBestSplit(racePoints,7,8,6,7)
      } else if (values.year == 1975) {
        points = sumBestSplit(racePoints,6,7,6,7)
      } else if (values.year == 1976) {
        points = sumBestSplit(racePoints,7,8,7,8)
      } else if (values.year == 1977) {
        points = sumBestSplit(racePoints,8,9,7,8)
      } else if (values.year == 1978) {
        points = sumBestSplit(racePoints,7,8,7,8)
      } else if (values.year == 1979) {
        points = sumBestSplit(racePoints,4,7,4,8)
      } else if (values.year == 1980) {
        points = sumBestSplit(racePoints,5,7,5,7)
      } else if (values.year >= 1981 && values.year <=1990) {
        // top 11 results count
        points = sumBest(racePoints,11)
      } else {
        // sum all results
        points = racePoints.reduce((a,v) => a + v,0)
      }
      driver.results[r].cumulative = points;
    }
  });

  races.forEach((race, ri) => {
    t.drivers.toSorted(driverCompare(ri)).forEach((driver, i) => {
      driver.results[ri].standing = i + 1;
    });
  });

  t.drivers.forEach((driver) => {
    driver.results.forEach((res) => {
      delete res._racePositions;
    });
  });

  fs.writeFileSync(`data/${values.year}-table-drivers.yaml`, yaml.dump(t));
}

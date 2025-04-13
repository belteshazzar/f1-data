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

  //if (status == 'Retired') return 'Ret'

  // console.log(`${status} => DNF`)
  return 'DNF'
}

function driverCompare(ri) {
  return (a,b) => {
    let c =  b.results[ri].cumulative - a.results[ri].cumulative
    if (c != 0) return c
    for (let i = 0 ; i<b.results[ri]._racePositions.length; i++) {
      c = b.results[ri]._racePositions[i] - a.results[ri]._racePositions[i]
      if (c != 0) return c
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

  // const rounds = yaml.load(fs.readFileSync(`data/${values.year}-rounds.yaml`, 'utf8'));
  // const drivers = yaml.load(fs.readFileSync(`data/${values.year}-drivers.yaml`, 'utf8'));
  // const constructors = yaml.load(fs.readFileSync(`data/${values.year}-constructors.yaml`, 'utf8'));

  let t = {
    season: values.year*1,
    races: [],
    drivers: [],
  };

  let constructorsMap = constructors.asMap();


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
      driverCode3: (d.code
        ? d.code
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
        // const res2 = {
        //   position: res.position * 1,
        //   points: res.points * 1,
        //   status: statusFor(res.status),
        //   constructorId: res.constructorId,
        //   cumulative: 0,
        //   standing: 0,
        // };
        // console.log(driver.results[ri],res2)
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
//    let points = 0;
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

//        points += driver.results[r].points;

        if (t.races[r].type == 'race' && driver.results[r].status == "Finished") racePositions[driver.results[r].position - 1]++;
        driver.results[r]._racePositions = Object.assign([], racePositions);
      }

      // if (driver.driverCode3 == 'ASC') {
      //   console.log(racePoints)
      // }

      let points = 0
      if (values.year <= 1952) {
        // in 1950 only top 4 results count
        points = racePoints.toSorted((a,b) => b-a).slice(0,4).reduce((a,v) => a + v,0)
      } else {
        points = racePoints.reduce((a,v) => a + v,0)
      }
      driver.results[r].cumulative = points;

      // if (driver.driverCode3 == 'ASC') {
      //   console.log()
      // }
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

//  console.log(t.drivers.map(d => d.results.map(r => r.constructor)))

  fs.writeFileSync(`data/${values.year}-table-drivers.yaml`, yaml.dump(t));
}

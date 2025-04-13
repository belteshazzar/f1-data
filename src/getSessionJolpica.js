import fs from 'fs';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';
import {loadDrivers,loadConstructors} from './db.js'
import { posix } from 'path';

export default function getSession(values) {
  if (values.session == 'q') getQualy(values)
  else if (values.session == 'r') getRace(values)
  else throw new Error(`jolpica doesnt support session ${values.session}`)
}

function getQualy(values) {
  const session = 'qualifying'

  const url = `https://api.jolpi.ca/ergast/f1/${values.year}/${values.round}/${session}/?limit=100&format=json`
    
  console.log(`Getting ${url}`);

  fetch(url)
    .then(res => res.json())
    .then(json => {

      const drivers = loadDrivers(values.year)
      const constructors = loadConstructors(values.year)
      const filename = `data/${values.year}-${values.round}-${session}.yaml`

      const data = {
        season: values.year*1,
        round: values.round*1,
        session: session,
        results: []
      }

      json.MRData.RaceTable.Races[0].QualifyingResults.forEach((r) => {
        const times = {}
        if (r.Q1) times.q1 = r.Q1
        if (r.Q2) times.q2 = r.Q2
        if (r.Q3) times.q3 = r.Q3
        data.results.push({
          position: r.position*1,
          driverId: drivers.getById(r.Driver.driverId),
          constructorId: constructors.getById(r.Constructor.constructorId),
          times
        })

      })

      fs.writeFileSync(filename, yaml.dump(data));
    });
}

function getRace(values) {
  const session = 'race'

  const url = `https://api.jolpi.ca/ergast/f1/${values.year}/${values.round}/results/?limit=100&format=json`
    
  console.log(`Getting ${url}`);

  fetch(url)
    .then(res => res.json())
    .then(json => {

      const drivers = loadDrivers(values.year)
      const constructors = loadConstructors(values.year)
      const filename = `data/${values.year}-${values.round}-${session}.yaml`

      const data = {
        season: values.year*1,
        round: values.round*1,
        session: session,
        results: []
      }

      json.MRData.RaceTable.Races[0].Results.forEach((r) => {
        data.results.push({
          position: r.position*1,
          driverId: drivers.getById(r.Driver.driverId),
          constructorId: constructors.getById(r.Constructor.constructorId),
          laps: r.laps*1,
          time: r.Time.time,
          status: r.status,
          points: r.points*1,
        })

      })

      fs.writeFileSync(filename, yaml.dump(data));
    });
}


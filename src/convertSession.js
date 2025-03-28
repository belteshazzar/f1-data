import fs from 'fs';
import yaml from 'js-yaml';

export function convertSession(values) {
  let session = values.session || 'race';
  if (session != 'race' && session != 'qualifying' && session != 'sprint') {
    throw new Error(`Invalid session: ${session}`);
  }

  console.log(`Converting year: ${values.year}, round: ${values.round}, session: ${session}`)

  let doc = yaml.load(fs.readFileSync(`ergast/${values.year}-${values.round}-${session}.yaml`, 'utf8'));

  let out = {
    season: doc.MRData.RaceTable.season,
    round: doc.MRData.RaceTable.round,
    session: session,
    results: []
  };

  if (session == 'race') {
    doc.MRData.RaceTable.Races[0].Results.forEach(r => {
      out.results.push({
        position: r.position,
        points: r.points,
        grid: r.grid,
        laps: r.laps,
        status: r.status,
        driver: r.Driver.driverId,
        constructor: r.Constructor.constructorId,
        time: (r.Time ? r.Time.time : null),
        fastestLap: (r.FastestLap ? r.FastestLap.time : null),
      });
    });
  } else if (session == 'qualifying') {
  } else if (session == 'sprint') {
    doc.MRData.RaceTable.Races[0].SprintResults.forEach(r => {
      out.results.push({
        position: r.position,
        points: r.points,
        grid: r.grid,
        laps: r.laps,
        status: r.status,
        driver: r.Driver.driverId,
        constructor: r.Constructor.constructorId,
        time: (r.Time ? r.Time.time : null),
        fastestLap: (r.FastestLap ? r.FastestLap.time : null),
      });
    });
  }
  fs.writeFileSync(`data/${values.year}-${values.round}-${session}.yaml`, yaml.dump(out));
}

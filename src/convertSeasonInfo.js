import fs from 'fs';
import yaml from 'js-yaml';
import { countryInfoFor } from './countryCodes.js';

const RACE_CODES = {
  'Australian Grand Prix': 'AUS',
  'Bahrain Grand Prix': 'BAH',
  'Vietnamese Grand Prix': 'VIE',
  'Chinese Grand Prix': 'CHN',
  'Spanish Grand Prix': 'ESP',
  'Monaco Grand Prix': 'MON',
  'Azerbaijan Grand Prix': 'AZE',
  'Canadian Grand Prix': 'CAN',
  'French Grand Prix': 'FRA',
  'Austrian Grand Prix': 'AUT',
  'British Grand Prix': 'GBR',
  'Hungarian Grand Prix': 'HUN',
  'Belgian Grand Prix': 'BEL',
  'Dutch Grand Prix': 'NED',
  'Italian Grand Prix': 'ITA',
  'Russian Grand Prix': 'RUS',
  'Singapore Grand Prix': 'SIN',
  'Japanese Grand Prix': 'JPN',
  'United States Grand Prix': 'USA',
  'Mexican Grand Prix': 'MEX',
  'Brazilian Grand Prix': 'BRA',
  'Abu Dhabi Grand Prix': 'UAE',
  'Saudi Arabian Grand Prix': 'SAU',
  'Qatar Grand Prix': 'QAT',
  'Turkish Grand Prix': 'TUR',
  'French Grand Prix': 'FRA',
  'Styrian Grand Prix': 'STY',
  'British Grand Prix': 'GBR',
  'Miami Grand Prix': 'MIA',
  'Emilia Romagna Grand Prix': 'EMI',
  'Mexico City Grand Prix': 'MXC',
  'São Paulo Grand Prix': 'SAP',
  'Las Vegas Grand Prix': 'LVG',
  'Portuguese Grand Prix': 'POR',
  "Indianapolis 500": "USA",
  "Swiss Grand Prix": "CHE",
  "German Grand Prix": "DEU",
  "Argentine Grand Prix": "ARG",
  "Pescara Grand Prix": "ITA",
  "Moroccan Grand Prix": "MAR",
  "South African Grand Prix": "ZAF",
  "Swedish Grand Prix":"SWE",
  "United States Grand Prix West": "USW",
  "San Marino Grand Prix":"SMR",
  "Caesars Palace Grand Prix":"CPL",
  "Detroit Grand Prix": "DET",
  "European Grand Prix":"EUR",
  "Dallas Grand Prix":"DAL",
  "Pacific Grand Prix":"PAC",
  "Luxembourg Grand Prix":"LUX",
  "Malaysian Grand Prix": "MYS",
  "Korean Grand Prix":"KOR",
  "Indian Grand Prix":"IND",
  "70th Anniversary Grand Prix":"70A",
  "Tuscan Grand Prix":"TUS",
  "Eifel Grand Prix":"EIF",
  "Sakhir Grand Prix":"SKH",
}

function raceCode3For(raceName) {
  let code = RACE_CODES[raceName];
  if (code == undefined) {
    throw new Error(`unknown race code for ${raceName}`);
  }
  return code;
}


export function convertSeasonInfo(values) {
  let type = values.type || 'rounds';
  if (type != 'rounds' && type != 'drivers' && type != 'constructors') {
    throw new Error(`Invalid type: ${type}`);
  }

  let doc = yaml.load(fs.readFileSync(`ergast/${values.year}-${type}.yaml`, 'utf8'));

  let out = {};

  if (type == 'rounds') {

    out.season = doc.MRData.RaceTable.season*1;
    out.rounds = [];

    doc.MRData.RaceTable.Races.forEach(r => {
      let o = {
        round: r.round*1,
        url: r.url,
        name: r.raceName,
        raceCode3: raceCode3For(r.raceName),
        sessions: [{
          name: 'Race',
          date: r.date,
          time: r.time
        }],
        circuit: r.Circuit
      };
      out.rounds.push(o);

      o.circuit.name = r.Circuit.circuitName;
      delete o.circuit.circuitName;
      o.circuit.location = r.Circuit.Location;
      delete o.circuit.Location;

      let { code, flag, code3 } = countryInfoFor(o.circuit.location.country);
      o.circuit.location.latitude = o.circuit.location.lat*1.0;
      o.circuit.location.longitude = o.circuit.location.long*1.0;
      delete o.circuit.location.lat;
      delete o.circuit.location.long;
      o.circuit.location.flag = flag;
      o.circuit.location.countryCode3 = code3;

      if (r.FirstPractice) {
        o.sessions.push(Object.assign({ name: 'Practice 1' }, r.FirstPractice ));
      }

      if (r.SecondPractice) {
        o.sessions.push(Object.assign({ name: 'Practice 2' }, r.SecondPractice ));
      }

      if (r.ThirdPractice) {
        o.sessions.push(Object.assign({ name: 'Practice 3' }, r.ThirdPractice ));
      }

      if (r.Qualifying) {
        o.sessions.push(Object.assign({ name: 'Qualifying' }, r.Qualifying ));
      }

      if (r.SprintQualifying) {
        o.sessions.push(Object.assign({ name: 'Sprint Qualifying' }, r.SprintQualifying ));
      }

      if (r.SprintShootout) {
        o.sessions.push(Object.assign({ name: 'Sprint Shootout' }, r.SprintShootout ));
      }

      if (r.Sprint) {
        o.sessions.push(Object.assign({ name: 'Sprint' }, r.Sprint ));
      }
    });
  } else if (type == 'drivers') {
    out.season = doc.MRData.DriverTable.season*1;
    out.drivers = [];

    doc.MRData.DriverTable.Drivers.forEach(r => {

      let { code, flag, code3  } = countryInfoFor(r.nationality);
      //r.countryCode = code;
      r.flag = flag;
      r.countryCode3 = code3;
      if (r.permanentNumber !== undefined) {
        r.permanentNumber = r.permanentNumber*1
      }
      if (r.code === undefined) {
        r.driverCode3 = r.familyName.toUpperCase().substring(0, 3);
      } else {
        r.driverCode3 = r.code
        delete r.code;
      }

      out.drivers.push(r);

    });

  } else if (type == 'constructors') {
    out.season = doc.MRData.ConstructorTable.season*1;
    out.constructors = [];

    doc.MRData.ConstructorTable.Constructors.forEach(r => {
      let { code, flag, code3 } = countryInfoFor(r.nationality);
      //r.countryCode = code;
      r.flag = flag;
      r.countryCode3 = code3;
      r.knownAs = [ r.name ];

      out.constructors.push(r);
    });
  }

  fs.writeFileSync(`data/${values.year}-${type}.yaml`, yaml.dump(out));
}

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
    out.season = doc.MRData.RaceTable.season;
    out.rounds = [];

    doc.MRData.RaceTable.Races.forEach(r => {
      let o = {
        round: r.round,
        url: r.url,
        raceName: r.raceName,
        raceCode3: raceCode3For(r.raceName),
        race: {
          date: r.date,
          time: r.time
        },
        circuit: r.Circuit
      };
      out.rounds.push(o);

      o.circuit.location = r.Circuit.Location;
      delete o.circuit.Location;

      let { code, flag, code3 } = countryInfoFor(o.circuit.location.country);
      o.circuit.location.countryCode = code;
      o.circuit.location.flag = flag;
      o.circuit.location.countryCode3 = code3;

      if (r.FirstPractice) {
        o.firstPractice = r.FirstPractice;
      }

      if (r.SecondPractice) {
        o.secondPractice = r.SecondPractice;
      }

      if (r.ThirdPractice) {
        o.thirdPractice = r.ThirdPractice;
      }

      if (r.Qualifying) {
        o.qualifying = r.Qualifying;
      }

      if (r.SprintQualifying) {
        o.sprintQualifying = r.SprintQualifying;
      }

      if (r.Sprint) {
        o.sprint = r.Sprint;
      }
    });
  } else if (type == 'drivers') {
    out.season = doc.MRData.DriverTable.season;
    out.drivers = [];

    doc.MRData.DriverTable.Drivers.forEach(r => {

      let { code, flag, code3  } = countryInfoFor(r.nationality);
      r.countryCode = code;
      r.flag = flag;
      r.countryCode3 = code3;

      out.drivers.push(r);

    });
  } else if (type == 'constructors') {
    out.season = doc.MRData.ConstructorTable.season;
    out.constructors = [];

    doc.MRData.ConstructorTable.Constructors.forEach(r => {
      let { code, flag, code3 } = countryInfoFor(r.nationality);
      r.countryCode = code;
      r.flag = flag;
      r.countryCode3 = code3;

      out.constructors.push(r);
    });
  }

  fs.writeFileSync(`data/${values.year}-${type}.yaml`, yaml.dump(out));
}

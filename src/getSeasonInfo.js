import fs from 'fs';
import yaml from 'js-yaml';

export function getSeasonInfo(values) {
  let type = values.type || 'rounds';
  if (type != 'rounds' && type != 'drivers' && type != 'constructors') {
    throw new Error(`Invalid type: ${type}`);
  }

  console.log(`Getting ${type} of ${values.year}`);

  fetch(`https://api.jolpi.ca/ergast/f1/${values.year}/${type == 'rounds' ? 'races' : type}?format=json`)
    .then(res => res.json())
    .then(json => {
      fs.writeFileSync(`ergast/${values.year}-${type}.yaml`, yaml.dump(json));
    });
}

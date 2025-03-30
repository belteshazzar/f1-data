import fs from 'fs';
import yaml from 'js-yaml';

export function getSeasonInfo(values) {
  let type = values.type || 'rounds';
  if (type != 'rounds' && type != 'drivers' && type != 'constructors') {
    throw new Error(`Invalid type: ${type}`);
  }

  const url = `https://api.jolpi.ca/ergast/f1/${values.year}/${type == 'rounds' ? 'races' : type}?limit=100&format=json`
  const filename = `ergast/${values.year}-${type}.yaml`

  console.log(`\nGetting ${type} of ${values.year}`);
  console.log(`- url: ${url}`);
  console.log(`- file: ${filename}`);

  fetch(url)
    .then(res => res.json())
    .then(json => {
      fs.writeFileSync(filename, yaml.dump(json));
    });
}

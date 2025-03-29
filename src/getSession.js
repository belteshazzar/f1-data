import fs from 'fs';
import yaml from 'js-yaml';

export function getSession(values) {
  let session = values.session || 'race';
  if (session != 'race' && session != 'qualifying' && session != 'sprint') {
    throw new Error(`Invalid session: ${session}`);
  }

  const url = `https://api.jolpi.ca/ergast/f1/${values.year}/${values.round}/${session == 'race' ? 'results' : session}/?limit=100&format=json`
  const filename = `ergast/${values.year}-${values.round}-${session}.yaml`

  console.log(`Getting ${session} for round ${values.round} of ${values.year}`);
  console.log(`- url: ${url}`);
  console.log(`- file: ${filename}`);

  fetch(url)
    .then(res => res.json())
    .then(json => {
      fs.writeFileSync(filename, yaml.dump(json));
    });
}

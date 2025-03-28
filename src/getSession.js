import fs from 'fs';
import yaml from 'js-yaml';

export function getSession(values) {
  let session = values.session || 'race';
  if (session != 'race' && session != 'qualifying' && session != 'sprint') {
    throw new Error(`Invalid session: ${session}`);
  }

  console.log(`Getting round ${values.round} of ${values.year}`);

  fetch(`https://api.jolpi.ca/ergast/f1/${values.year}/${values.round}/${session == 'race' ? 'results' : session}/?format=json`)
    .then(res => res.json())
    .then(json => {
      fs.writeFileSync(`ergast/${values.year}-${values.round}-${session}.yaml`, yaml.dump(json));
    });
}

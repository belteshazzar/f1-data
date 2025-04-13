import {parseArgs} from 'util';
import {validate} from 'jsonschema';
import fs from 'fs';
import yaml from 'js-yaml';

import { convertSeasonInfo } from './src/convertSeasonInfo.js';
import { convertSession } from './src/convertSession.js';
import { getSeasonInfo } from './src/getSeasonInfo.js';
import getSessionF1 from './src/getSessionF1.js';
import getSessionJolpica from './src/getSessionJolpica.js';
import { generateDriversTable } from './src/generateDriversTable.js';

const args = process.argv

const options = {
  year: {
    type: 'string',
    short: 'y',
  },
  round: {
    type: 'string',
    short: 'r',
  },
  session: {
    type: 'string',
    short: 's',
  },
  type: {
    type: 'string',
    short: 't',
  },
  from: {
    type: 'string',
    short: 'f',
  },
};

const {values,positionals} = parseArgs({ args, options, allowPositionals: true });

if (positionals.length == 3) {
  if (positionals[2] == 'get') {
    if (values.year && values.round) {
      if (values.from == 'f1') {
        getSessionF1(values);
      } else if (values.from == 'jolpica') {
        getSessionJolpica(values);
      } else {
        throw new Error(`unknown source to get session from: ${values.from}`)
      }
    } else if (values.year) {
      getSeasonInfo(values);
    } else {
      throw new Error('year required with round optional')
    }
  } else if (positionals[2] == 'convert') {
    if (values.year && values.round) {

      convertSession(values);

    } else if (values.year) {

      convertSeasonInfo(values);

    } else {
      throw new Error('year required with round optional')
    }
  } else if (positionals[2] == 'generate') {
    if (values.year && values.type == 'drivers') {

      generateDriversTable(values);

    } else {
      throw new Error('year required')
    }
  } else {
    throw new Error('only get, convert or generate is supported')
  }
} else if (positionals.length == 5 && positionals[2] == 'validate') {
  doValidation(positionals[3], positionals[4]);
} else {
  throw new Error('Invalid number of arguments')
}

function doValidation(fileName, schemaName) {

  console.log()
  console.log('validating:')
  console.log(`  ${fileName}`)
  console.log('with:')
  console.log(`  ${schemaName}`)
  console.log()

  const file = yaml.load(fs.readFileSync(fileName, 'utf8'));
  const schema = yaml.load(fs.readFileSync(schemaName, 'utf8'));
  var result = validate(file, schema);
  if (result.valid) {
    console.log('valid')
  } else {
    console.log('validation errors:')
    result.errors.forEach((error) => {
      console.log(`  ${error.stack}`);
    });
  }
  console.log()

}

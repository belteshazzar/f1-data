import {parseArgs} from 'util';

import { convertSeasonInfo } from './src/convertSeasonInfo.js';
import { convertSession } from './src/convertSession.js';
import { getSeasonInfo } from './src/getSeasonInfo.js';
import { getSession } from './src/getSession.js';
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
};

const {values,positionals} = parseArgs({ args, options, allowPositionals: true });

if (positionals.length == 3) {
  if (positionals[2] == 'get') {
    if (values.year && values.round) {

      getSession(values);

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
} else {
  throw new Error('Invalid number of arguments')
}

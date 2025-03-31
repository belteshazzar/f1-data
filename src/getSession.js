import fs from 'fs';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';

export function getSession(values) {
  let session = values.session || 'r';

  if (session == 'r') {
    session = 'results';
  } else if (session == 'q') {
    session = 'qualifying';
  } else if (session == 's') {
    session = 'sprint';
  } else if (session == 'sq') {
    getSessionFromF1(values);
    return
  } else {
    throw new Error(`Invalid session: ${session}`);
  } 

  const url = ( session == 'sq'
    ? `https://ergast.com/api/f1/${values.year}/${values.round}/sprint.json`
    : `https://api.jolpi.ca/ergast/f1/${values.year}/${values.round}/${session}/?limit=100&format=json`)
  const filename = `ergast/${values.year}-${values.round}-${session}.yaml`

  console.log(`\nGetting ${session} for round ${values.round} of ${values.year}`);
  console.log(`- url: ${url}`);
  console.log(`- file: ${filename}`);

  fetch(url)
    .then(res => res.json())
    .then(json => {
      fs.writeFileSync(filename, yaml.dump(json));
    });
}

function getSessionFromF1(values) {

  if (values.session == 'sq') {
    getSessionFromF1SQ(values)
  } else {
    throw new Error(`invalid session ${values.session}`)
  }
}

function getSessionFromF1SQ(values) {

  const rounds = yaml.load(fs.readFileSync(`data/${values.year}-rounds.yaml`, 'utf8'));
  const race = rounds.rounds[values.round-1]

  const raceNum = race.raceNum + 94 // F1 Race Number Offset
  const country = race.circuit.location.country.toLowerCase()
  const url = `https://www.formula1.com/en/results/${values.year}/races/${raceNum}/${country}/sprint-qualifying`
  const filename = `f1/${values.year}-${values.round}-sprint-qualifying.yaml`

  console.log(`\nGetting sprint qualifying for round ${values.round} of ${values.year}`);
  console.log(`- url: ${url}`)
  console.log(`- file: ${filename}`)

  fetch(url)
    .then(res => res.text())
    .then(text => {
      const $ = cheerio.load(text);

      const title = $('title').text().toLowerCase()
      console.log(`\n- page title: ${title}`)

      const data = {
        season: values.year,
        round: values.round,
        session: 'sprint qualifying',
        results: [],
      }

      $('table.f1-table > tbody > tr').each(function() {
        const result = {}

        const tds = $(this).find('td')
        result.position = $(tds[0]).text()*1

        result.driver = {
          number: $(tds[1]).text()*1,
          familyName: $(tds[2]).find('span:nth(0)').text(),
          givenName: $(tds[2]).find('span:nth(1)').text(),
          code3: $(tds[2]).find('span:nth(2)').text(),
          constructor: $(tds[3]).text(),
        }
        result.q1 = $(tds[4]).text()
        result.q2 = $(tds[5]).text()
        result.q3 = $(tds[6]).text()

        data.results.push(result);
      });

      fs.writeFileSync(filename, yaml.dump(data));
    });
}
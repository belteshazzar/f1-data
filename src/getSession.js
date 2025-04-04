import fs from 'fs';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';

export function getSession(values) {
  let session = values.session || 'r';

  if (session == 'r') {
    session = 'results';
  } else if (session == 's') {
    session = 'sprint';
  } else if (session == 'p1' 
      || session == 'p2' 
      || session == 'p3' 
      || session == 'q' 
      || session == 'sq') {
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

  if (values.session == 'p1' || values.session == 'p2' || values.session == 'p3') {
    getSessionFromF1Practice(values)
  } else if (values.session == 'q') {
    getSessionFromF1Q(values)
  } else if (values.session == 'sq') {
    getSessionFromF1SQ(values)
  } else {
    throw new Error(`invalid session ${values.session}`)
  }
}

function getSessionFromF1Practice(values) {

  const rounds = yaml.load(fs.readFileSync(`data/${values.year}-rounds.yaml`, 'utf8'));
  const drivers = yaml.load(fs.readFileSync(`data/${values.year}-drivers.yaml`, 'utf8'));
  const constructors = yaml.load(fs.readFileSync(`data/${values.year}-constructors.yaml`, 'utf8'));
  const race = rounds.rounds[values.round-1]
  const practice = values.session.substr(1)

  const f1racesUrl = `https://www.formula1.com/en/results/${values.year}/races`

  fetch(f1racesUrl)
    .then(res => res.text())
    .then(text => {
      const $ = cheerio.load(text);
      const title = $('title').text().toLowerCase()
      console.log(`\n- page title: ${title}`)

      const els = $(`li[data-name|=races]:nth(${values.round-1})`)
      const f1raceCountry = els[0].attribs['data-value']
      const raceNum = els[0].attribs['data-id']

      const country = race.circuit.location.country.toLowerCase()
      if (f1raceCountry != country) {
        throw new Error(`country mismatch: ${country} != ${f1raceCountry}`)
      }

      const url = `https://www.formula1.com/en/results/${values.year}/races/${raceNum}/${country}/practice/${practice}`
      const filename = `data/${values.year}-${values.round}-practice-${practice}.yaml`

      console.log(`\nGetting practice ${practice} for round ${values.round} of ${values.year}`);
      console.log(`- url: ${url}`)
      console.log(`- file: ${filename}`)

      fetch(url)
        .then(res => res.text())
        .then(text => {
          const $ = cheerio.load(text);

          const title = $('title').text().toLowerCase()
          console.log(`\n- page title: ${title}\n`)

          const data = {
            season: values.year*1,
            round: values.round*1,
            session: 'practice ' + practice,
            results: [],
          }

          $('table.f1-table > tbody > tr').each(function() {
            const result = {}

            const tds = $(this).find('td')
            result.position = $(tds[0]).text()*1

            const driverCode = $(tds[2]).find('span:nth(2)').text()
            const driver = drivers.drivers.find(d => d.code == driverCode)
            if (!driver) {
              throw new Error(`driver not found: ${driverCode}`)
            }
            result.driverId = driver.driverId

            const constructorName = $(tds[3]).text()
            const constructor = constructors.constructors.find(d => {
              return d.knownAs.find(knownAs => knownAs == constructorName)
            })
            if (!constructor) {
              throw new Error(`constructor not found: ${constructorName}`)
            }
            result.constructorId = constructor.constructorId

            result.time = $(tds[4]).text()
            result.gap = $(tds[5]).text()
            result.laps = $(tds[6]).text()

            data.results.push(result);
          });

          fs.writeFileSync(filename, yaml.dump(data));
        });
    })
}

function getSessionFromF1Q(values) {

  const rounds = yaml.load(fs.readFileSync(`data/${values.year}-rounds.yaml`, 'utf8'));
  const drivers = yaml.load(fs.readFileSync(`data/${values.year}-drivers.yaml`, 'utf8'));
  const constructors = yaml.load(fs.readFileSync(`data/${values.year}-constructors.yaml`, 'utf8'));
  const race = rounds.rounds[values.round-1]

  const f1racesUrl = `https://www.formula1.com/en/results/${values.year}/races`

  fetch(f1racesUrl)
    .then(res => res.text())
    .then(text => {
      const $ = cheerio.load(text);
      const title = $('title').text().toLowerCase()
      console.log(`\n- page title: ${title}`)

      const els = $(`li[data-name|=races]:nth(${values.round-1})`)
      const f1raceCountry = els[0].attribs['data-value']
      const raceNum = els[0].attribs['data-id']

      const country = race.circuit.location.country.toLowerCase()
      if (f1raceCountry != country) {
        throw new Error(`country mismatch: ${country} != ${f1raceCountry}`)
      }

      const url = `https://www.formula1.com/en/results/${values.year}/races/${raceNum}/${country}/qualifying`
      const filename = `data/${values.year}-${values.round}-qualifying.yaml`

      console.log(`\nGetting qualifying for round ${values.round} of ${values.year}`);
      console.log(`- url: ${url}`)
      console.log(`- file: ${filename}`)

      fetch(url)
        .then(res => res.text())
        .then(text => {
          const $ = cheerio.load(text);

          const title = $('title').text().toLowerCase()
          console.log(`\n- page title: ${title}\n`)

          const data = {
            season: values.year*1,
            round: values.round*1,
            session: 'qualifying',
            results: [],
          }

          $('table.f1-table > tbody > tr').each(function() {
            const result = {}

            const tds = $(this).find('td')
            result.position = $(tds[0]).text()*1

            const driverCode = $(tds[2]).find('span:nth(2)').text()
            const driver = drivers.drivers.find(d => d.code == driverCode)
            if (!driver) {
              throw new Error(`driver not found: ${driverCode}`)
            }
            result.driverId = driver.driverId

            const constructorName = $(tds[3]).text()
            const constructor = constructors.constructors.find(d => {
              return d.knownAs.find(knownAs => knownAs == constructorName)
            })
            if (!constructor) {
              throw new Error(`constructor not found: ${constructorName}`)
            }
            result.constructorId = constructor.constructorId

            result.q1 = $(tds[4]).text()
            result.q2 = $(tds[5]).text()
            result.q3 = $(tds[6]).text()
            result.laps = $(tds[7]).text()*1

            data.results.push(result);
          });

          fs.writeFileSync(filename, yaml.dump(data));
        });
    })
}

function getSessionFromF1SQ(values) {

  const rounds = yaml.load(fs.readFileSync(`data/${values.year}-rounds.yaml`, 'utf8'));
  const drivers = yaml.load(fs.readFileSync(`data/${values.year}-drivers.yaml`, 'utf8'));
  const constructors = yaml.load(fs.readFileSync(`data/${values.year}-constructors.yaml`, 'utf8'));
  const race = rounds.rounds[values.round-1]

  const f1racesUrl = `https://www.formula1.com/en/results/${values.year}/races`

  fetch(f1racesUrl)
    .then(res => res.text())
    .then(text => {
      const $ = cheerio.load(text);
      const title = $('title').text().toLowerCase()
      console.log(`\n- page title: ${title}`)

      let nth = values.round*1-1
      // emelia-romagna gp 2023 was cancelled but is still in the list
      if (values.year*1 == 2023 && values.round*1 > 6) {
        nth++
      }
      const els = $(`li[data-name|=races]:nth(${nth})`)
      console.log(els[0].attribs)

      const f1raceCountry = els[0].attribs['data-value']
      const raceNum = els[0].attribs['data-id']

      const country = race.circuit.location.country.toLowerCase()
      if (f1raceCountry != country) {
        console.warn(`!!! country mismatch: ${country} != ${f1raceCountry}`)
      }

      const url = `https://www.formula1.com/en/results/${values.year}/races/${raceNum}/${country}/sprint-qualifying`
      const filename = `data/${values.year}-${values.round}-sprint-qualifying.yaml`

      console.log(`\nGetting sprint qualifying for round ${values.round} of ${values.year}`);
      console.log(`- url: ${url}`)
      console.log(`- file: ${filename}`)

      fetch(url)
        .then(res => res.text())
        .then(text => {
          const $ = cheerio.load(text);

          const title = $('title').text().toLowerCase()
          console.log(`\n- page title: ${title}\n`)

          const data = {
            season: values.year*1,
            round: values.round*1,
            session: 'sprint qualifying',
            results: [],
          }

          $('table.f1-table > tbody > tr').each(function() {
            const result = {}

            const tds = $(this).find('td')
            result.position = $(tds[0]).text()*1

            const driverCode = $(tds[2]).find('span:nth(2)').text()
            const driver = drivers.drivers.find(d => d.code == driverCode)
            if (!driver) {
              throw new Error(`driver not found: ${driverCode}`)
            }
            result.driverId = driver.driverId

            const constructorName = $(tds[3]).text()
            const constructor = constructors.constructors.find(d => {
              if (!d.knownAs) {
                console.error(`looking for constructor ${constructorName}`)
                console.error(d)
                throw new Error(`constructor knownAs not found`)
              }
              return d.knownAs.find(knownAs => knownAs == constructorName)
            })
            if (!constructor) {
              throw new Error(`constructor not found: ${constructorName}`)
            }
            result.constructorId = constructor.constructorId

            result.q1 = $(tds[4]).text()
            result.q2 = $(tds[5]).text()
            result.q3 = $(tds[6]).text()
            result.laps = $(tds[7]).text()*1

            data.results.push(result);
          });

          fs.writeFileSync(filename, yaml.dump(data));
        });
    })
}

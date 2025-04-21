import fs from 'fs';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';
import {loadDrivers,loadConstructors,loadRounds} from './db.js'

export default function getSession(values) {
  if (values.session == 'p1' || values.session == 'p2' || values.session == 'p3') {
    getPractice(values)
  } else if (values.session == 'q' || values.session == 'sq') {
    getQualy(values)
  } else if (values.session == 'g' || values.session == 'sg') {
    getGrid(values)
  } else if (values.session == 'r' || values.session == 'sg') {
    getRace(values)
  } else {
    throw new Error(`invalid session ${values.session}`)
  }
}

function formula1dotcomPage(year,round,country,pageName) {
  const f1racesUrl = `https://www.formula1.com/en/results/${year}/races`

  return new Promise((resolve, reject) => {

    fetch(f1racesUrl)
      .then(res => res.text())
      .then(text => {
        const $ = cheerio.load(text);
        const title = $('title').text().toLowerCase()
        console.log(`\n- page title: ${title}`)

        let nth = round*1-1
        // emelia-romagna gp 2023 was cancelled but is still in the list
        if (year*1 == 2023 && round > 6) {
          nth++
        }
        const els = $(`li[data-name|=races]:nth(${nth})`)
        const f1raceCountry = els[0].attribs['data-value']
        const raceNum = els[0].attribs['data-id']

        if (f1raceCountry.replace('-',' ') != country) {
          reject(`country mismatch: ${country} != ${f1raceCountry}`)
        }

        const url = `https://www.formula1.com/en/results/${year}/races/${raceNum}/${country}/${pageName}`

        console.log(`loading url: ${url}`)

        fetch(url)
        .then(res => res.text())
        .then(text => {
          const $ = cheerio.load(text);

          const title = $('title').text().toLowerCase()
          console.log(`\n- page title: ${title}\n`)

          resolve($)
        })
      })
  })
}

function getPractice(values) {

  const rounds = loadRounds(values.year)
  const drivers = loadDrivers(values.year)
  const constructors = loadConstructors(values.year)
  const race = rounds.get(values.round)
  const country = race.circuit.location.country.toLowerCase()
  const practice = values.session.substr(1)
  const filename = `data/${values.year}/${values.year}-${values.round}-practice-${practice}.yaml`

  const data = {
    season: values.year*1,
    round: values.round*1,
    session: 'practice ' + practice,
    results: [],
  }

  formula1dotcomPage(values.year,values.round,country,`practice/${practice}`)
    .then($ => {

      $('table.f1-table > tbody > tr').each(function() {
        const result = {}

        const tds = $(this).find('td')
        result.position = $(tds[0]).text()*1
        result.driverId = drivers.forCode3($(tds[2]).find('span:nth(2)').text())
        result.constructorId = constructors.forKnownAs($(tds[3]).text())
        result.time = $(tds[4]).text()
        result.gap = $(tds[5]).text()
        result.laps = $(tds[6]).text()*1

        data.results.push(result);
      });

      fs.writeFileSync(filename, yaml.dump(data));
    });
}

function getQualy(values) {

  const rounds = loadRounds(values.year)
  const drivers = loadDrivers(values.year)
  const constructors = loadConstructors(values.year)
  const race = rounds.get(values.round)
  const country = race.circuit.location.country.toLowerCase()
  const filename = `data/${values.year}/${values.year}-${values.round}-${values.s=='sq'?'sprint-':''}qualifying.yaml`

  const data = {
    season: values.year*1,
    round: values.round*1,
    session: `${values.s=='sq'?'sprint ':''}qualifying`,
    results: [],
  }

  formula1dotcomPage(values.year,values.round,country,`${values.s=='sq'?'sprint-':''}qualifying`)
    .then($ => {

      $('table.f1-table > tbody > tr').each(function() {
        const result = {}

        const tds = $(this).find('td')
        result.position = $(tds[0]).text()*1
        result.driverId = drivers.forCode3($(tds[2]).find('span:nth(2)').text())
        result.constructorId = constructors.forKnownAs($(tds[3]).text())
        const q1 = $(tds[4]).text()
        const q2 = $(tds[5]).text()
        const q3 = $(tds[6]).text()
        result.times = {}
        if (q1 != '') result.times.q1 = q1
        if (q2 != '') result.times.q2 = q2
        if (q3 != '') result.times.q3 = q3
        result.laps = $(tds[7]).text()*1

        data.results.push(result);
      });

      fs.writeFileSync(filename, yaml.dump(data));
    });
}

function getRace(values) {
  const rounds = loadRounds(values.year)
  const drivers = loadDrivers(values.year)
  const constructors = loadConstructors(values.year)
  const race = rounds.get(values.round)
  const country = race.circuit.location.country.toLowerCase()
  const filename = `data/${values.year}/${values.year}-${values.round}-${values.session=='r'?'race':'sprint'}.yaml`

  const data = {
    season: values.year*1,
    round: values.round*1,
    session: values.session == 'r' ? 'race' : 'sprint',
    results: [],
  }

  formula1dotcomPage(values.year,values.round,country,values.session == 'r' ? 'race-result' : 'sprint-results')
    .then($ => {

      $('table.f1-table > tbody > tr').each(function() {
        const result = {}

        const tds = $(this).find('td')
        result.position = $(tds[0]).text()
        if (result.position == 'NC') {
          result.position = 0
        } else {
          result.position = result.position*1
        }

        result.driverId = drivers.forCode3($(tds[2]).find('span:nth(2)').text())
        result.constructorId = constructors.forKnownAs($(tds[3]).text())
        result.laps = $(tds[4]).text()*1
        result.time = $(tds[5]).text()

        if (result.position == 0) {
          result.status = result.time
          result.time = ''
        } else {
          result.status = "Finished"
        }
        // remove the s for seconds from times, checking lap
        if (result.time.length > 2 && result.time[result.time.length-1] == 's' && result.time.indexOf('lap') == -1) {
          result.time = result.time.substring(0,result.time.length-1)
        }

        result.points = $(tds[6]).text()*1

        data.results.push(result);
      });

      fs.writeFileSync(filename, yaml.dump(data));
    });
}

function getGrid(values) {

  const rounds = loadRounds(values.year)
  const drivers = loadDrivers(values.year)
  const constructors = loadConstructors(values.year)
  const race = rounds.get(values.round)
  const country = race.circuit.location.country.toLowerCase()
  const filename = `data/${values.year}/${values.year}-${values.round}-${values.session=='g' ? 'race-grid' : 'sprint-grid'}.yaml`

  const data = {
    season: values.year*1,
    round: values.round*1,
    session: values.session == 'g' ? 'race grid' : 'sprint grid',
    results: [],
  }

  formula1dotcomPage(values.year,values.round,country,values.session == 'g' ? 'starting-grid' : 'sprint-grid')
    .then($ => {

      $('table.f1-table > tbody > tr').each(function() {
        const result = {}

        const tds = $(this).find('td')
        result.position = $(tds[0]).text()*1
        result.driverId = drivers.forCode3($(tds[2]).find('span:nth(2)').text())
        result.constructorId = constructors.forKnownAs($(tds[3]).text())
        data.results.push(result);
      });

      fs.writeFileSync(filename, yaml.dump(data));
    });
}

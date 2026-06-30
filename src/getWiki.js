
import fs from 'fs';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';
import {loadDrivers,loadConstructors,loadRounds} from './db.js'
import {writeFile} from 'fs/promises';

export default function getWiki(values) {

  const drivers = loadDrivers(values.year)
  const driver = drivers.getById(values.driver)

  console.log(`loading driver wiki page: ${driver.url}`)

  fetch(driver.url)
    .then(res => res.text())
    .then(text => {
      console.log('- loaded driver page')
      const $ = cheerio.load(text);
      const img = $('.infobox.vcard img')
      console.log(`- found ${ img.length } images in infobox`)
      if (img.length==0) return
      const imgSrc = `http:${ $(img).first().attr('src') }`
      console.log(`- first image src=${imgSrc}`)
      if (imgSrc.indexOf('Flag_of_') > 0) {
        console.log('- image is flag, skipping')
        return
      }
      const ext = imgSrc.replace(/.*\./gm,'')
      console.log(`- extention=${ext}`)
      return fetch(imgSrc)
        .then(x => x.arrayBuffer())
        .then(x => {
          if (x.byteLength < 3000) {
            console.log(`- only ${x.byteLength} bytes, assuming flag`)
            return
          }
          if (!fs.existsSync(`data/${values.year}`)) {
            fs.mkdirSync(`data/${values.year}`);
          }
          if (!fs.existsSync(`data/${values.year}/drivers`)) {
            fs.mkdirSync(`data/${values.year}/drivers`);
          }
          const filename = `data/${values.year}/drivers/${values.driver}.${ext}`
          console.log(`- writing image: ${filename}`)
          writeFile(filename, Buffer.from(x))
        });

    })

}
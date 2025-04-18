import fs from 'fs';
import yaml from 'js-yaml';

export function loadRounds(year) {
  const rounds = yaml.load(fs.readFileSync(`data/${year}/${year}-rounds.yaml`, 'utf8'));
  return {
    get: function(round) {
      return rounds.rounds[round-1]
    },
    forEach: function(cb) {
      rounds.rounds.forEach(cb)
    }
  };
} 

export function loadDrivers(year) {
  const drivers = yaml.load(fs.readFileSync(`data/${year}/${year}-drivers.yaml`, 'utf8'));
  return {
    forEach: function(cb) {
      drivers.drivers.forEach(cb)
    },
    forCode3: function(code3) {
      const driver = drivers.drivers.find(d => d.driverCode3 == code3)
      if (!driver) {
        console.error(`driver not found: ${code3}`)
        return `${code3}_NOT_FOUND`
      } else {
        return driver.driverId
      }
    },
    getById: function(driverId) {
      const driver = drivers.drivers.find(d => d.driverId == driverId)
      if (!driver) {
        console.error(`driver not found: ${driverId}`)
        return { driverId: `${driverId}_NOT_FOUND` }
      } else {
        return driver
      }
    }
  };
}

export function loadConstructors(year) {
  const constructors = yaml.load(fs.readFileSync(`data/${year}/${year}-constructors.yaml`, 'utf8'));
  return {
    forKnownAs: function(knownAs) {
      const c = constructors.constructors.find(d => d.knownAs.find(k => k == knownAs))
      if (!c) {
        console.error(`constructor not found: ${knownAs}`)
        return `${knownAs}_NOT_FOUND`
      } else {
        return c.constructorId
      }
    },
    getById: function(constructorId) {
      const c = constructors.constructors.find(c => c.constructorId == constructorId)
      if (!c) {
        console.error(`constructor not found: ${constructorId}`)
        return { constructorId: `${constructorId}_NOT_FOUND` }
      } else {
        return c
      }
    },
    asMap: function() {
      const m = {};
      constructors.constructors.forEach(c => {
        m[c.constructorId] = c;
      });
      return m
    }
  };
}

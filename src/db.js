import fs from 'fs';
import yaml from 'js-yaml';

export function loadRounds(year) {
  const rounds = yaml.load(fs.readFileSync(`data/${year}-rounds.yaml`, 'utf8'));
  return {
    get: function(round) {
      return rounds.rounds[round-1]
    }
  };
} 

export function loadDrivers(year) {
  const drivers = yaml.load(fs.readFileSync(`data/${year}-drivers.yaml`, 'utf8'));
  return {
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
        return `${driverId}_NOT_FOUND`
      } else {
        return driver.driverId
      }
    }
  };
}

export function loadConstructors(year) {
  const constructors = yaml.load(fs.readFileSync(`data/${year}-constructors.yaml`, 'utf8'));
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
        return `${constructorId}_NOT_FOUND`
      } else {
        return c.constructorId
      }
    }
  };
}

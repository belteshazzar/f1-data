// Shared between generateDriversTable.js and generateConstructorsTable.js so
// both championships apply identical drop-round rules per season.

export function sumBest(racePoints,bestX) {
  return racePoints.toSorted((a,b) => b-a).slice(0,bestX).reduce((a,v) => a + v,0)
}

export function sumBestSplit(racePoints,bestX,ofFirstY,bestZOfRest,restCount) {
  if (racePoints.length != ofFirstY+restCount) throw new Error(`race results length = ${racePoints.length} but need ${ofFirstY}+${restCount}`)
  return racePoints.slice(0,ofFirstY).toSorted((a,b) => b-a).slice(0,bestX).reduce((a,v) => a + v,0)
   + racePoints.slice(ofFirstY).toSorted((a,b) => b-a).slice(0,bestZOfRest).reduce((a,v) => a + v,0)
}

// Points that count toward the championship after applying the season's
// drop-round rule, given the full-length, progressively-filled array of
// per-race points earned so far (unfilled future races are 0 placeholders).
export function seasonPoints(year, racePoints) {
  if (year <= 1953) {
    // top 4 results count
    return sumBest(racePoints,4)
  } else if (
    (year >= 1954 && year <=1957)
    ||
    year == 1959
    ||
    (year >= 1961 && year <=1962)
    ||
    year == 1966) {
    // top 5 results count
    return sumBest(racePoints,5)
  } else if (
    year == 1958
    ||
    year == 1960
    ||
    (year >= 1963 && year <= 1965)) {
    // top 6 results count
    return sumBest(racePoints,6)
  } else if (year == 1967) {
    return sumBestSplit(racePoints,5,6,4,5)
  } else if (year == 1968) {
    return sumBestSplit(racePoints,5,6,5,6)
  } else if (year == 1969) {
    return sumBestSplit(racePoints,5,6,4,5)
  } else if (year == 1970) {
    return sumBestSplit(racePoints,6,7,5,6)
  } else if (year == 1971) {
    return sumBestSplit(racePoints,5,6,4,5)
  } else if (year == 1972) {
    return sumBestSplit(racePoints,5,6,5,6)
  } else if (year == 1973 || year == 1974) {
    return sumBestSplit(racePoints,7,8,6,7)
  } else if (year == 1975) {
    return sumBestSplit(racePoints,6,7,6,7)
  } else if (year == 1976) {
    return sumBestSplit(racePoints,7,8,7,8)
  } else if (year == 1977) {
    return sumBestSplit(racePoints,8,9,7,8)
  } else if (year == 1978) {
    return sumBestSplit(racePoints,7,8,7,8)
  } else if (year == 1979) {
    return sumBestSplit(racePoints,4,7,4,8)
  } else if (year == 1980) {
    return sumBestSplit(racePoints,5,7,5,7)
  } else if (year >= 1981 && year <=1990) {
    // top 11 results count
    return sumBest(racePoints,11)
  } else {
    // sum all results
    return racePoints.reduce((a,v) => a + v,0)
  }
}

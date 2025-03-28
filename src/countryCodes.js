
const countryCodes = {
  "American": "US",
  "Argentine": "AR",
  "Australia": "AU",
  "Australian": "AU",
  "Austria": "AT",
  "Austrian": "AT",
  "Azerbaijan": "AZ",
  "Bahrain": "BH",
  "Belgium": "BE",
  "Brazil": "BR",
  "Brazilian": "BR",
  "British": "GB",
  "Georgia": "GE",
  "Canada": "CA",
  "Canadian": "CA",
  "China": "CN",
  "Chinese": "CN",
  "Danish": "DK",
  "Dutch": "NL",
  "France": "FR",
  "French": "FR",
  "Finnish": "FI",
  "Germany": "DE",
  "German": "DE",
  "Hungary": "HU",
  "Italy": "IT",
  "Italian": "IT",
  "Japan": "JP",
  "Japanese": "JP",
  "Mexican": "MX",
  "Mexico": "MX",
  "Monaco": "MC",
  "Monegasque": "MC",
  "Netherlands": "NL",
  "New Zealander": "NZ",
  "Qatar": "QA",
  "Russia": "RU",
  "Saudi Arabia": "SA",
  "Singapore": "SG",
  "Spain": "ES",
  "Spanish": "ES",
  "Swiss": "CH",
  "Thai": "TH",
  "UAE": "AE",
  "UK": "GB",
  "USA": "US",
  "Vietnam": "VN",
  "Vietnamese": "VN",
};

const countryCodes3 = {
  "US": "USA",
  "AR": "ARG",
  "AU": "AUS",
  "AT": "AUT",
  "AZ": "AZE",
  "BH": "BHR",
  "BE": "BEL",
  "BR": "BRA",
  "CA": "CAN",
  "CH": "CHE",
  "CN": "CHN",
  "DK": "DNK",
  "FI": "FIN",
  "FR": "FRA",
  "DE": "DEU",
  "GB": "GBR",
  "HU": "HUN",
  "IT": "ITA",
  "JP": "JPN",
  "MX": "MEX",
  "MC": "MCO",
  "NL": "NLD",
  "NZ": "NZL",
  "QA": "QAT",
  "RU": "RUS",
  "SA": "SAU",
  "SG": "SGP",
  "ES": "ESP",
  "TH": "THA",
  "AE": "ARE",
  "VN": "VNM",
};

export function countryInfoFor(country) {
  let countryCode = countryCodes[country]
  if (countryCode === undefined) {
    throw new Error(`Country code not found for ${country}`)
  }
  const code3 = countryCodes3[countryCode]
  if (code3 === undefined) {
    throw new Error(`Country code3 not found for ${countryCode}`)
  }
  const codePoints = countryCode.toUpperCase().split("").map((char) => 127397 + char.charCodeAt(0));
  return {
    code: countryCode,
    flag: String.fromCodePoint(...codePoints),
    code3: code3
   };
}
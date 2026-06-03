import type { ParsedSource } from './letter-engine';

export type AffidavitJurisdiction = {
  state: string;
  county: string;
  addressPresent: boolean;
  stateResolved: boolean;
  countyResolved: boolean;
  reviewRequired: boolean;
  explanation: string;
};

const NOT_AVAILABLE = 'N/A';
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
};

function clean(value: string) { return value.replace(/\s+/g, ' ').trim(); }
function titleCase(value: string) { return clean(value).toLowerCase().replace(/\b([a-z])/g, (match) => match.toUpperCase()); }
function currentAddress(source: ParsedSource) { return clean(source.address.join(' ')); }
function localityLine(source: ParsedSource) {
  return [...source.address].reverse().find((line) => /,\s*[A-Z]{2}(?=\s+\d{5}(?:-\d{4})?\b|\s|$)/i.test(line)) || '';
}
function parseCityAndState(source: ParsedSource) {
  const line = localityLine(source);
  const match = line.match(/^\s*([A-Za-z][A-Za-z .'-]*?)\s*,\s*([A-Z]{2})(?=\s+\d{5}(?:-\d{4})?\b|\s|$)/i);
  if (!match) return { city: '', state: '' };
  const code = match[2].toUpperCase();
  return { city: titleCase(match[1]), state: STATE_NAMES[code] || '' };
}

export function resolveAffidavitJurisdiction(source: ParsedSource): AffidavitJurisdiction {
  const address = currentAddress(source);
  if (!address) {
    return { state: NOT_AVAILABLE, county: NOT_AVAILABLE, addressPresent: false, stateResolved: false, countyResolved: false, reviewRequired: true, explanation: 'Current address is missing. State of and County of are marked N/A for review.' };
  }
  const locality = parseCityAndState(source);
  const stateResolved = Boolean(locality.state);
  const countyResolved = Boolean(locality.city);
  const reviewRequired = !stateResolved || !countyResolved;
  return {
    state: locality.state || NOT_AVAILABLE,
    county: locality.city || NOT_AVAILABLE,
    addressPresent: true,
    stateResolved,
    countyResolved,
    reviewRequired,
    explanation: reviewRequired ? 'Review required: the current address does not contain a usable city and U.S. state abbreviation.' : 'State of is expanded from the state abbreviation and County of is mapped from the city in the current address.'
  };
}

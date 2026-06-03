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
const STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]);

function clean(value: string) { return value.replace(/\s+/g, ' ').trim(); }
function currentAddress(source: ParsedSource) { return clean(source.address.join(' ')); }
function localityLine(source: ParsedSource) {
  return [...source.address].reverse().find((line) => /,\s*[A-Z]{2}(?=\s+\d{5}(?:-\d{4})?\b|\s|$)/i.test(line)) || '';
}
function parseCityAndState(source: ParsedSource) {
  const line = localityLine(source);
  const match = line.match(/^\s*([A-Za-z][A-Za-z .'-]*?)\s*,\s*([A-Z]{2})(?=\s+\d{5}(?:-\d{4})?\b|\s|$)/i);
  if (!match) return { city: '', state: '' };
  const state = match[2].toUpperCase();
  return { city: clean(match[1]).toUpperCase(), state: STATE_CODES.has(state) ? state : '' };
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
    explanation: reviewRequired ? 'Review required: the current address does not contain a usable city and state abbreviation.' : 'State of is mapped from the state abbreviation and County of is mapped from the city in the current address.'
  };
}

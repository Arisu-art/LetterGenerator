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
const STATE_BY_NAME = Object.entries(STATE_NAMES).sort((a, b) => b[1].length - a[1].length);

function clean(value: string) { return value.replace(/\s+/g, ' ').trim(); }
function currentAddress(source: ParsedSource) { return clean(source.address.join(' ')); }
function stateInAddress(address: string) {
  const named = STATE_BY_NAME.find(([, name]) => new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i').test(address));
  if (named) return named[1];
  const abbreviated = address.match(/(?:,|\s)\s*([A-Z]{2})(?=\s+\d{5}(?:-\d{4})?\b|\s*,|\s*$)/i);
  return abbreviated && STATE_NAMES[abbreviated[1].toUpperCase()] ? STATE_NAMES[abbreviated[1].toUpperCase()] : '';
}
function countyInAddress(address: string) {
  const county = address.match(/\b([A-Za-z][A-Za-z .'-]*?\s+County)\b/i);
  if (county) return clean(county[1]).replace(/\bcounty\b/i, 'County');
  const prefixed = address.match(/\bCounty\s+of\s+([A-Za-z][A-Za-z .'-]*?)\b(?=,|\s+[A-Z]{2}\b|\s+\d{5}\b|$)/i);
  return prefixed ? `${clean(prefixed[1])} County` : '';
}

export function resolveAffidavitJurisdiction(source: ParsedSource): AffidavitJurisdiction {
  const address = currentAddress(source);
  if (!address) {
    return { state: NOT_AVAILABLE, county: NOT_AVAILABLE, addressPresent: false, stateResolved: false, countyResolved: false, reviewRequired: true, explanation: 'Current address is missing. State and county are marked N/A for review.' };
  }
  const state = clean(source.affidavitState) || stateInAddress(address);
  const county = clean(source.affidavitCounty) || countyInAddress(address);
  const stateResolved = Boolean(state);
  const countyResolved = Boolean(county);
  const reviewRequired = !stateResolved || !countyResolved;
  return {
    state: state || NOT_AVAILABLE,
    county: county || NOT_AVAILABLE,
    addressPresent: true,
    stateResolved,
    countyResolved,
    reviewRequired,
    explanation: reviewRequired ? 'Review required: the current address does not explicitly identify every jurisdiction value.' : 'Jurisdiction resolved from the current address or reviewed source override.'
  };
}

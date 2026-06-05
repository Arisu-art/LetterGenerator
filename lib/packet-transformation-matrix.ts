import type { Bureau, LetterRoute, LetterType, ParsedSource, SourceItem } from './letter-engine';

export type MatrixLayer = 'source' | 'template' | 'packet-editor';
export type MatrixIssue = { layer: MatrixLayer; code: string; field: string; message: string };
export type MatrixTrace = { layer: MatrixLayer; field: string; source: string; transform: string; output: string };
export type MatrixResult<T> = { ok: true; value: T; trace: MatrixTrace[] } | { ok: false; issues: MatrixIssue[]; trace: MatrixTrace[] };
export type MatrixBindingKey = 'consumer_name' | 'address' | 'dob' | 'ssn' | 'date' | 'bureau_name' | 'bureau_address' | 'accounts' | 'hard_inquiries' | 'late_payment_items';
export type MatrixBindings = Record<MatrixBindingKey, string | SourceItem[]>;

const BUREAUS: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const REQUIRED_SOURCE_FIELDS: Array<keyof ParsedSource> = ['name', 'dob', 'ssn'];
export const SOURCE_FIELD_MATRIX = ['name', 'address', 'dob', 'ssn', 'routes'] as const;
export const TEMPLATE_BINDING_MATRIX: Array<{ key: MatrixBindingKey; requiredFor: LetterType[]; source: string; transform: string }> = [
  { key: 'consumer_name', requiredFor: ['DISPUTE', 'LATE_PAYMENT'], source: 'ParsedSource.name', transform: 'identity' },
  { key: 'address', requiredFor: ['DISPUTE', 'LATE_PAYMENT'], source: 'ParsedSource.address', transform: 'join-lines' },
  { key: 'dob', requiredFor: ['DISPUTE', 'LATE_PAYMENT'], source: 'ParsedSource.dob', transform: 'identity' },
  { key: 'ssn', requiredFor: ['DISPUTE', 'LATE_PAYMENT'], source: 'ParsedSource.ssn', transform: 'identity' },
  { key: 'date', requiredFor: ['DISPUTE', 'LATE_PAYMENT'], source: 'documentDate', transform: 'identity' },
  { key: 'bureau_name', requiredFor: ['DISPUTE', 'LATE_PAYMENT'], source: 'bureauInfo[route.bureau].name', transform: 'identity' },
  { key: 'bureau_address', requiredFor: ['DISPUTE', 'LATE_PAYMENT'], source: 'bureauInfo[route.bureau].address', transform: 'join-lines' },
  { key: 'accounts', requiredFor: ['DISPUTE'], source: 'LetterRoute.items.DISPUTE_ACCOUNT', transform: 'filter' },
  { key: 'hard_inquiries', requiredFor: ['DISPUTE'], source: 'LetterRoute.items.HARD_INQUIRY', transform: 'filter' },
  { key: 'late_payment_items', requiredFor: ['LATE_PAYMENT'], source: 'LetterRoute.items.LATE_PAYMENT', transform: 'filter' }
];
export const PACKET_PART_MATRIX = ['LETTER', 'SUPPORTING_DOCUMENTS', 'FCRA', 'AFFIDAVIT', 'ATTACHMENT'] as const;

function present(value: unknown) { return Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : Boolean(value); }
function issue(layer: MatrixLayer, field: string, code: string, message: string): MatrixIssue { return { layer, field, code, message }; }
function trace(layer: MatrixLayer, field: string, source: string, transform: string, output: unknown): MatrixTrace { return { layer, field, source, transform, output: Array.isArray(output) ? `${output.length} item(s)` : String(output ?? '') }; }

export function validateSourceAgainstMatrix(parsed: ParsedSource, routes: LetterRoute[]): MatrixResult<ParsedSource> {
  const issues: MatrixIssue[] = [];
  const traces: MatrixTrace[] = [];
  REQUIRED_SOURCE_FIELDS.forEach((field) => {
    const value = parsed[field];
    traces.push(trace('source', String(field), `ParsedSource.${String(field)}`, 'required', present(value) ? 'valid' : 'missing'));
    if (!present(value)) issues.push(issue('source', String(field), `matrix_missing_${String(field)}`, `Required source field is missing: ${String(field)}.`));
  });
  traces.push(trace('source', 'address', 'ParsedSource.address', 'required', parsed.address.filter(Boolean).length));
  if (!parsed.address.filter(Boolean).length) issues.push(issue('source', 'address', 'matrix_missing_address', 'Required source field is missing: address.'));
  traces.push(trace('source', 'routes', 'detectRoutes(parsed)', 'required', routes.length));
  if (!routes.length) issues.push(issue('source', 'routes', 'matrix_missing_routes', 'No route mappings were detected.'));
  routes.forEach((route, routeIndex) => {
    if (!BUREAUS.includes(route.bureau)) issues.push(issue('source', `routes[${routeIndex}].bureau`, 'matrix_invalid_bureau', `Invalid bureau: ${route.bureau}.`));
    if (!['DISPUTE', 'LATE_PAYMENT'].includes(route.type)) issues.push(issue('source', `routes[${routeIndex}].type`, 'matrix_invalid_type', `Invalid letter type: ${route.type}.`));
    if (!route.items.length) issues.push(issue('source', `routes[${routeIndex}].items`, 'matrix_empty_route', `${route.bureau} ${route.type} has no mapped items.`));
    route.items.forEach((item, itemIndex) => { if (!present(item.displayText)) issues.push(issue('source', `routes[${routeIndex}].items[${itemIndex}]`, 'matrix_empty_item', `${route.bureau} ${route.type} item ${itemIndex + 1} has empty display text.`)); });
  });
  return issues.length ? { ok: false, issues, trace: traces } : { ok: true, value: parsed, trace: traces };
}

export function matrixIssueSummary(result: MatrixResult<unknown>) { return result.ok ? [] : result.issues.map((item) => `[${item.layer}:${item.code}] ${item.message}`); }

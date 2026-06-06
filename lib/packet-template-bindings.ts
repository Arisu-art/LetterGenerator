import type { LetterRoute, ParsedSource, SourceItem } from './letter-engine';
import { validateSourceAgainstMatrix, type MatrixIssue, type MatrixResult, type MatrixTrace, type MatrixBindingKey, type MatrixBindings } from './packet-transformation-matrix';

function issue(field: string, code: string, message: string): MatrixIssue { return { layer: 'template', field, code, message }; }
function trace(field: string, source: string, transform: string, output: unknown): MatrixTrace { return { layer: 'template', field, source, transform, output: Array.isArray(output) ? `${output.length} item(s)` : String(output ?? '') }; }
function present(value: unknown) { return Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : Boolean(value); }
function emptyBindings(): MatrixBindings { return { consumer_name: '', address: '', dob: '', ssn: '', date: '', bureau_name: '', bureau_address: '', accounts: [], hard_inquiries: [], late_payment_items: [] }; }
function requiredKeys(route: LetterRoute): MatrixBindingKey[] {
  return route.type === 'DISPUTE'
    ? ['consumer_name', 'address', 'dob', 'ssn', 'date', 'bureau_name', 'bureau_address', 'accounts']
    : ['consumer_name', 'address', 'dob', 'ssn', 'date', 'bureau_name', 'bureau_address', 'late_payment_items'];
}
export function sourceItems(value: string | SourceItem[]) { return Array.isArray(value) ? value : []; }
export function sourceText(value: string | SourceItem[]) { return typeof value === 'string' ? value : ''; }
export function resolveTemplateBindingsAgainstMatrix(args: { parsed: ParsedSource; route: LetterRoute; documentDate: string; bureauName: string; bureauAddressLines: string[] }): MatrixResult<MatrixBindings> {
  const source = validateSourceAgainstMatrix(args.parsed, [args.route]);
  const traces = [...source.trace];
  if (!source.ok) return { ok: false, issues: source.issues, trace: traces };
  const values = emptyBindings();
  const issues: MatrixIssue[] = [];
  values.consumer_name = args.parsed.name;
  values.address = args.parsed.address.filter(Boolean).join('\n');
  values.dob = args.parsed.dob;
  values.ssn = args.parsed.ssn;
  values.date = args.documentDate;
  values.bureau_name = args.bureauName;
  values.bureau_address = args.bureauAddressLines.filter(Boolean).join('\n');
  values.accounts = args.route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT');
  values.hard_inquiries = args.route.items.filter((item) => item.type === 'HARD_INQUIRY');
  values.late_payment_items = args.route.items.filter((item) => item.type === 'LATE_PAYMENT');
  traces.push(trace('consumer_name', 'ParsedSource.name', 'identity', values.consumer_name));
  traces.push(trace('address', 'ParsedSource.address', 'join-lines', values.address));
  traces.push(trace('dob', 'ParsedSource.dob', 'identity', values.dob));
  traces.push(trace('ssn', 'ParsedSource.ssn', 'identity', values.ssn));
  traces.push(trace('date', 'documentDate', 'identity', values.date));
  traces.push(trace('bureau_name', 'bureauInfo[route.bureau].name', 'identity', values.bureau_name));
  traces.push(trace('bureau_address', 'bureauInfo[route.bureau].address', 'join-lines', values.bureau_address));
  traces.push(trace('accounts', 'LetterRoute.items.DISPUTE_ACCOUNT', 'filter', values.accounts));
  traces.push(trace('hard_inquiries', 'LetterRoute.items.HARD_INQUIRY', 'filter', values.hard_inquiries));
  traces.push(trace('late_payment_items', 'LetterRoute.items.LATE_PAYMENT', 'filter', values.late_payment_items));
  requiredKeys(args.route).forEach((key) => { if (!present(values[key])) issues.push(issue(key, `matrix_unresolved_${key}`, `Required template binding resolved empty: ${key}.`)); });
  return issues.length ? { ok: false, issues, trace: traces } : { ok: true, value: values, trace: traces };
}

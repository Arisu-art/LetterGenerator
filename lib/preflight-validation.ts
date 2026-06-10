import { bureaus, type LetterRoute, type ParsedSource } from './letter-engine';
import { generationPacketPositions, generationRequiredExhibits } from './generation-contract';
import type { PacketAssets } from './packet-assets';
import type { LetterReference } from './reference-store';
import type { TemplateExhibits } from './template-exhibits';
import type { WorkspacePreferences } from './workspace-preferences';

export type PreflightSeverity = 'pass' | 'warning' | 'blocker';

export type PreflightCheck = {
  id: string;
  label: string;
  severity: PreflightSeverity;
  detail: string;
};

export type GenerationPreflightInput = {
  source: string;
  normalized: boolean;
  parsed: ParsedSource;
  routes: LetterRoute[];
  references: LetterReference[];
  templates: TemplateExhibits;
  evidence: PacketAssets;
  affidavitReady: boolean;
  customReady: boolean;
  strictValidation: boolean;
  preferences?: WorkspacePreferences;
};

export type GenerationPreflightResult = {
  ready: boolean;
  blockers: PreflightCheck[];
  warnings: PreflightCheck[];
  checks: PreflightCheck[];
  summary: string;
};

const pass = (id: string, label: string, detail: string): PreflightCheck => ({ id, label, severity: 'pass', detail });
const warn = (id: string, label: string, detail: string): PreflightCheck => ({ id, label, severity: 'warning', detail });
const block = (id: string, label: string, detail: string): PreflightCheck => ({ id, label, severity: 'blocker', detail });

function countDisputeAccounts(parsed: ParsedSource) {
  return bureaus.reduce((total, bureau) => total + parsed.dispute[bureau].length, 0);
}

function countHardInquiries(parsed: ParsedSource) {
  return bureaus.reduce((total, bureau) => total + parsed.inquiry[bureau].length, 0);
}

function countLatePayments(parsed: ParsedSource) {
  return bureaus.reduce((total, bureau) => total + parsed.late[bureau].length, 0);
}

function routeTemplateName(route: LetterRoute) {
  return route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
}

export function evaluateGenerationPreflight(input: GenerationPreflightInput): GenerationPreflightResult {
  const checks: PreflightCheck[] = [];
  const sourceReady = Boolean(input.source.trim() && input.normalized && input.parsed.name.trim());
  checks.push(sourceReady
    ? pass('source.locked', 'Source data locked', `${input.parsed.name} is parsed and standardized.`)
    : block('source.locked', 'Source data locked', 'Import or standardize source data before generation.'));

  checks.push(input.routes.length
    ? pass('routes.detected', 'Routes detected', `${input.routes.length} output route(s) detected.`)
    : block('routes.detected', 'Routes detected', 'No dispute or late-payment routes were detected from the source data.'));

  const disputeAccounts = countDisputeAccounts(input.parsed);
  const hardInquiries = countHardInquiries(input.parsed);
  const latePayments = countLatePayments(input.parsed);

  if (disputeAccounts) checks.push(pass('source.dispute-accounts', 'Dispute accounts', `${disputeAccounts} dispute account(s) detected.`));
  else if (input.routes.some((route) => route.type === 'DISPUTE')) checks.push(block('source.dispute-accounts', 'Dispute accounts', 'A dispute route exists but no dispute accounts were detected.'));
  else checks.push(warn('source.dispute-accounts', 'Dispute accounts', 'No dispute account route is active.'));

  checks.push(hardInquiries
    ? pass('source.hard-inquiries', 'Hard inquiries', `${hardInquiries} hard inquiry item(s) detected and governed by the same red legal-statement rule as dispute accounts.`)
    : warn('source.hard-inquiries', 'Hard inquiries', 'No hard inquiries detected.'));

  if (input.routes.some((route) => route.type === 'LATE_PAYMENT')) {
    checks.push(latePayments
      ? pass('source.late-payments', 'Late payments', `${latePayments} late-payment item(s) detected.`)
      : block('source.late-payments', 'Late payments', 'A late-payment route exists but no late-payment items were detected.'));
  }

  const routeMissing = input.routes.filter((route) => !input.references.find((slot) => slot.round && slot.type === route.type && slot.file));
  checks.push(routeMissing.length
    ? block('templates.letters', 'Letter templates', `Missing required letter template(s): ${routeMissing.map((route) => `${route.bureau} ${routeTemplateName(route)}`).join(', ')}.`)
    : pass('templates.letters', 'Letter templates', 'All active route letter templates are configured.'));

  const activeTypes = Array.from(new Set(input.routes.map((route) => route.type)));
  const requiredExhibits = Array.from(new Set(activeTypes.flatMap((type) => generationRequiredExhibits(type))));
  const missingExhibits = requiredExhibits.filter((kind) => !input.templates[kind]);
  checks.push(missingExhibits.length
    ? block('templates.exhibits', 'Required packet templates', `Missing required packet item(s): ${missingExhibits.join(', ')}.`)
    : pass('templates.exhibits', 'Required packet templates', 'Required FCRA, Attachment, Affidavit, and FTC templates are configured for the active contract.'));

  checks.push(input.evidence.supporting.length
    ? pass('evidence.supporting', 'Supporting documents', `${input.evidence.supporting.length} supporting document image(s) ready.`)
    : block('evidence.supporting', 'Supporting documents', 'Upload at least one supporting document image before generation.'));

  checks.push(input.affidavitReady
    ? pass('affidavit.jurisdiction', 'Affidavit jurisdiction', 'Affidavit state/county is resolved or not required.')
    : block('affidavit.jurisdiction', 'Affidavit jurisdiction', 'Affidavit state/county needs review before generation.'));

  checks.push(input.customReady
    ? pass('templates.custom-fields', 'Custom template fields', 'Required custom template fields are complete.')
    : block('templates.custom-fields', 'Custom template fields', 'A configured template has required custom fields that are still blank.'));

  const packetOrders = activeTypes.map((type) => `${type}: ${generationPacketPositions(type).map((position) => `${String(position.sequence).padStart(2, '0')} ${position.label}`).join(' → ')}`);
  checks.push(pass('contract.order', 'Generation contract order', packetOrders.length ? packetOrders.join(' | ') : 'No active packet order yet.'));

  const blockers = checks.filter((check) => check.severity === 'blocker');
  const warnings = checks.filter((check) => check.severity === 'warning');
  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    checks,
    summary: blockers.length ? `Generation blocked by ${blockers.length} preflight issue(s).` : warnings.length ? `Generation ready with ${warnings.length} warning(s).` : 'Generation preflight passed.'
  };
}

export function preflightFailureMessage(result: GenerationPreflightResult) {
  if (result.ready) return '';
  return `${result.summary} ${result.blockers.map((item) => item.detail).join(' ')}`;
}

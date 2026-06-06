import type { Bureau, LetterRoute, LetterType, ParsedSource } from './letter-engine';
import type { PacketAssets } from './packet-assets';
import type { LetterReference, Round } from './reference-store';
import type { ExhibitKind, TemplateExhibits } from './template-exhibits';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { validateSourceAgainstMatrix, matrixIssueSummary, type MatrixTrace } from './packet-transformation-matrix';

export type ValidationStage = 'source' | 'generation' | 'final-pdf';
export type ValidationIssue = { stage: ValidationStage; code: string; message: string };
export type ValidationResult = { ok: boolean; issues: ValidationIssue[]; trace: MatrixTrace[] };

const DISPUTE_REQUIREMENTS: ExhibitKind[] = ['FCRA', 'AFFIDAVIT', 'ATTACHMENT'];
const BUREAUS: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];

function issue(stage: ValidationStage, code: string, message: string): ValidationIssue { return { stage, code, message }; }
function routeKey(route: LetterRoute) { return `${route.type}:${route.bureau}`; }
function routeLabel(type: LetterType) { return type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter'; }
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function hasLetterReference(type: LetterType, round: Round, references: LetterReference[]) { return references.some((item) => item.round === round && item.type === type && Boolean(item.file)); }
function hasReviewDoc(type: LetterType, bureau: Bureau, role: ReviewOutput['role'], docs: ReviewOutput[]) { return docs.some((doc) => doc.type === type && doc.bureau === bureau && doc.role === role); }
function matrixIssues(parsed: ParsedSource, routes: LetterRoute[]) {
  const matrix = validateSourceAgainstMatrix(parsed, routes);
  return {
    trace: matrix.trace,
    issues: matrixIssueSummary(matrix).map((message) => issue('source', 'matrix_validation_failed', message))
  };
}

export function validateSourceMatrix(parsed: ParsedSource, routes: LetterRoute[]): ValidationResult {
  const matrix = matrixIssues(parsed, routes);
  const issues: ValidationIssue[] = [...matrix.issues];
  routes.forEach((route) => {
    if (!BUREAUS.includes(route.bureau)) issues.push(issue('source', 'invalid_route_bureau', `Route bureau is invalid: ${route.bureau}.`));
    if (!['DISPUTE', 'LATE_PAYMENT'].includes(route.type)) issues.push(issue('source', 'invalid_route_type', `Route type is invalid: ${route.type}.`));
  });
  const duplicateRoutes = unique(routes.map(routeKey)).filter((key) => routes.filter((route) => routeKey(route) === key).length > 1);
  duplicateRoutes.forEach((key) => issues.push(issue('source', 'duplicate_route', `Duplicate route detected: ${key}.`)));
  return { ok: issues.length === 0, issues, trace: matrix.trace };
}

export function validateGenerationInputs(args: { parsed: ParsedSource; routes: LetterRoute[]; round: Round; references: LetterReference[]; templates: TemplateExhibits }): ValidationResult {
  const source = validateSourceMatrix(args.parsed, args.routes);
  const issues = [...source.issues];
  unique(args.routes.map((route) => route.type)).forEach((type) => {
    if (!hasLetterReference(type, args.round, args.references)) issues.push(issue('generation', 'missing_letter_reference', `${routeLabel(type)} DOCX reference is missing for ${args.round}.`));
  });
  if (args.routes.some((route) => route.type === 'DISPUTE')) {
    DISPUTE_REQUIREMENTS.forEach((kind) => { if (!args.templates[kind]) issues.push(issue('generation', `missing_${kind.toLowerCase()}_template`, `${kind} template/exhibit is required for Dispute packet generation.`)); });
  }
  return { ok: issues.length === 0, issues, trace: source.trace };
}

export function validateFinalPdfInputs(args: { parsed: ParsedSource; routes: LetterRoute[]; docs: ReviewOutput[]; evidence: PacketAssets; templates: TemplateExhibits }): ValidationResult {
  const source = validateSourceMatrix(args.parsed, args.routes);
  const issues = [...source.issues];
  if (!args.evidence.supporting.length) issues.push(issue('final-pdf', 'missing_supporting_documents', 'Supporting Documents are required before final PDF packet assembly.'));
  args.routes.forEach((route) => {
    if (!hasReviewDoc(route.type, route.bureau, 'LETTER', args.docs)) issues.push(issue('final-pdf', 'missing_generated_letter', `${route.bureau} ${routeLabel(route.type)} generated DOCX is missing.`));
    if (route.type === 'DISPUTE') {
      if (!hasReviewDoc('DISPUTE', route.bureau, 'AFFIDAVIT', args.docs)) issues.push(issue('final-pdf', 'missing_generated_affidavit', `${route.bureau} Affidavit generated DOCX is missing.`));
      DISPUTE_REQUIREMENTS.filter((kind) => kind !== 'AFFIDAVIT').forEach((kind) => { if (!args.templates[kind]) issues.push(issue('final-pdf', `missing_${kind.toLowerCase()}_template`, `${kind} PDF is required for ${route.bureau} final packet.`)); });
    }
  });
  return { ok: issues.length === 0, issues, trace: source.trace };
}

export function validationSummary(result: ValidationResult) { return result.issues.map((item) => `[${item.stage}:${item.code}] ${item.message}`); }
export function validationTraceSummary(result: ValidationResult) { return result.trace.map((item) => `[${item.layer}:${item.field}] ${item.source} -> ${item.transform} -> ${item.output}`); }

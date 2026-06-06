'use client';

import JSZip from 'jszip';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { assertGeneratedDocx } from './docx-review-marker';
import { bureauInfo, type Bureau } from './letter-engine';
import { createSupportingDocumentsPdf } from './packet-renderer';
import type { PacketAssets } from './packet-assets';
import type { Round } from './reference-store';
import { readTemplateExhibit, type TemplateExhibits } from './template-exhibits';

type PacketType = 'DISPUTE' | 'LATE_PAYMENT';
export type PacketRoute = { type: PacketType; bureau: string };
type OrderedPacketOptions = {
  outputs: ReviewOutput[];
  warnings?: string[];
  evidence?: PacketAssets;
  exhibits?: TemplateExhibits;
  clientName: string;
  round: Round;
  documentDate?: string;
  routeHints?: PacketRoute[];
  caseKey?: string;
};
type LegacyArgs = [docs: ReviewOutput[], round: Round, caseKey: string, clientName: string, routeHints?: PacketRoute[]];

function safe(value: string) { return value.replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function isReviewOutput(value: unknown): value is ReviewOutput {
  return Boolean(value && typeof value === 'object' && 'blob' in value && 'path' in value && 'type' in value && 'bureau' in value);
}
function normalizeOutputs(value: unknown): ReviewOutput[] {
  if (!Array.isArray(value)) throw new Error('Ordered packet archive expected generated document outputs as an array. Regenerate the package and retry.');
  const docs = value.filter(isReviewOutput);
  if (!docs.length) throw new Error('Ordered packet archive received no generated DOCX outputs. Generate letters before building the ZIP.');
  return docs;
}
function normalizeRouteHints(value: unknown): PacketRoute[] {
  return Array.isArray(value) ? value.filter((route): route is PacketRoute => Boolean(route && typeof route === 'object' && 'type' in route && 'bureau' in route)) : [];
}
function normalizeOptions(input: unknown, legacy: LegacyArgs): OrderedPacketOptions {
  if (input && typeof input === 'object' && !Array.isArray(input) && 'outputs' in input) {
    const options = input as OrderedPacketOptions;
    return { ...options, outputs: normalizeOutputs(options.outputs), routeHints: normalizeRouteHints(options.routeHints) };
  }
  const [docs, round, caseKey, clientName, routeHints = []] = legacy;
  return { outputs: normalizeOutputs(docs), round, caseKey, clientName, routeHints: normalizeRouteHints(routeHints) };
}
function findDocument(docs: ReviewOutput[], route: PacketRoute, role: 'LETTER' | 'AFFIDAVIT') {
  return docs.find((doc) => doc.type === route.type && (
    role === 'LETTER'
      ? doc.bureau === route.bureau && (!doc.role || doc.role === 'LETTER')
      : route.type === 'DISPUTE' && doc.role === role && (doc.bureau === route.bureau || doc.bureau === 'CLIENT')
  ));
}
function buildRoutes(docs: ReviewOutput[], hints: PacketRoute[]) {
  const docRoutes = docs.filter((doc) => !doc.role || doc.role === 'LETTER').map((doc) => ({ type: doc.type as PacketType, bureau: doc.bureau }));
  return Array.from(new Map([...docRoutes, ...hints].filter((route) => route.type && route.bureau).map((route) => [`${route.type}:${route.bureau}`, route])).values());
}
async function resolveSupportingPdf(options: OrderedPacketOptions) {
  if (options.caseKey) return createSupportingDocumentsPdf(options.caseKey).catch(() => null);
  if (options.evidence?.supporting?.length) throw new Error('Supporting Documents are attached but cannot be rebuilt without a storage key. Return to Supporting Documents and save the evidence set, then retry generation.');
  return null;
}
async function resolvePacketExhibit(options: OrderedPacketOptions, kind: 'FCRA' | 'ATTACHMENT') {
  const configured = options.exhibits?.[kind]?.file;
  if (configured instanceof Blob) return configured;
  return readTemplateExhibit(options.round, kind);
}
/**
 * Writes the complete ordered component package for each generated route.
 * Supports both the current object contract and the older positional contract.
 * DOCX files remain editable; PDFs are inserted unchanged in filing position.
 * FTC is intentionally excluded from the active packet contract.
 */
export async function addOrderedPacketFolders(zip: JSZip, input: OrderedPacketOptions): Promise<void>;
export async function addOrderedPacketFolders(zip: JSZip, docs: ReviewOutput[], round: Round, caseKey: string, clientName: string, routeHints?: PacketRoute[]): Promise<void>;
export async function addOrderedPacketFolders(zip: JSZip, input: OrderedPacketOptions | ReviewOutput[], round?: Round, caseKey = '', clientName = '', routeHints: PacketRoute[] = []) {
  const options = normalizeOptions(input, [input as ReviewOutput[], round as Round, caseKey, clientName, routeHints]);
  const docs = options.outputs;
  const routes = buildRoutes(docs, options.routeHints || []);
  const client = safe(options.clientName) || 'CLIENT';
  const supporting = await resolveSupportingPdf(options);
  if (!supporting) throw new Error('Required component missing: 02 Supporting Documents.pdf could not be prepared.');
  const disputePresent = routes.some((route) => route.type === 'DISPUTE');
  const fcra = disputePresent ? await resolvePacketExhibit(options, 'FCRA') : null;
  const attachment = disputePresent ? await resolvePacketExhibit(options, 'ATTACHMENT') : null;
  if (disputePresent && !fcra) throw new Error('Required component missing: 03 FCRA Legal Exhibit.pdf is not configured.');
  if (disputePresent && !attachment) throw new Error('Required component missing: 05 Attachment.pdf is not configured.');
  for (const route of routes) {
    const root = route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS';
    const folder = `${root}/${client} ${route.bureau}/`;
    const letter = findDocument(docs, route, 'LETTER');
    if (!letter) throw new Error(`Required component missing: ${route.bureau} 01 ${route.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'} Letter.docx was not generated.`);
    const title = route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
    const recipient = bureauInfo[route.bureau as Bureau]?.name || route.bureau;
    zip.file(`${folder}01 ${title}.docx`, await assertGeneratedDocx(letter.blob, `${route.bureau} ${title}`, [options.clientName, recipient]));
    zip.file(`${folder}02 Supporting Documents.pdf`, supporting);
    if (route.type === 'DISPUTE') {
      zip.file(`${folder}03 FCRA Legal Exhibit.pdf`, fcra!);
      const affidavit = findDocument(docs, route, 'AFFIDAVIT');
      if (!affidavit) throw new Error('Required component missing: 04 Affidavit.docx was not generated.');
      zip.file(`${folder}04 Affidavit.docx`, await assertGeneratedDocx(affidavit.blob, 'Affidavit', [options.clientName]));
      zip.file(`${folder}05 Attachment.pdf`, attachment!);
    }
  }
}

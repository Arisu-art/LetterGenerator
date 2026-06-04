'use client';

import JSZip from 'jszip';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { loadPacketAssets, loadPacketFile } from './packet-assets';
import { readTemplateExhibit } from './template-exhibits';
import type { Round } from './reference-store';

type PacketType = 'DISPUTE' | 'LATE_PAYMENT';
export type PacketRoute = { type: PacketType; bureau: string };

function safe(value: string) {
  return value.replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
function fileName(path: string) {
  return path.split('/').pop() || path;
}
function docByRole(docs: ReviewOutput[], bureau: string, type: PacketType, role: 'LETTER' | 'AFFIDAVIT' | 'FTC') {
  return docs.find((doc) => doc.type === type && (
    role === 'LETTER'
      ? doc.bureau === bureau && (!doc.role || doc.role === 'LETTER')
      : doc.role === role && (doc.bureau === bureau || doc.bureau === 'CLIENT')
  ));
}
async function addSourceEvidence(zip: JSZip, evidenceKey: string) {
  if (!evidenceKey) return [] as string[];
  const assets = loadPacketAssets(evidenceKey).supporting;
  const paths: string[] = [];
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const file = await loadPacketFile(evidenceKey, asset.id).catch(() => null);
    if (!file) continue;
    const path = `SOURCE EVIDENCE/02 Supporting Documents/${String(index + 1).padStart(2, '0')} ${asset.name}`;
    zip.file(path, file);
    paths.push(path);
  }
  return paths;
}
function routeManifest(route: PacketRoute, client: string, docs: ReviewOutput[], supportingPaths: string[], hasFcra: boolean, hasAttachment: boolean) {
  const letterTitle = route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
  const letter = docByRole(docs, route.bureau, route.type, 'LETTER');
  const affidavit = docByRole(docs, route.bureau, route.type, 'AFFIDAVIT');
  const ftc = docByRole(docs, route.bureau, route.type, 'FTC');
  const lines = [
    'ORDERED PACKET WORKING MANIFEST',
    `Client: ${client}`,
    `Bureau: ${route.bureau}`,
    `Packet Type: ${route.type}`,
    '',
    'This working ZIP retains editable DOCX files and original evidence without rendering PDFs.',
    'PDF conversion occurs only during Create Final PDFs to avoid unnecessary browser blocking.',
    '',
    `01 ${letterTitle}: ${letter ? fileName(letter.path) : 'Not generated'}`,
    `02 Supporting Documents: ${supportingPaths.length ? `${supportingPaths.length} original evidence file(s) in SOURCE EVIDENCE/02 Supporting Documents/` : 'Not available'}`
  ];
  if (route.type === 'DISPUTE') lines.push(
    `03 FCRA: ${hasFcra ? 'SHARED PACKET INSERTS/03 FCRA.pdf' : 'Not configured'}`,
    `04 Affidavit: ${affidavit ? fileName(affidavit.path) : 'Not generated'}`,
    `05 Attachment: ${hasAttachment ? 'SHARED PACKET INSERTS/05 Attachment.pdf' : 'Not configured'}`,
    `06 FTC Identity Theft Report: ${ftc ? fileName(ftc.path) : 'Not generated'}`
  );
  return lines.join('\n');
}

/**
 * Adds a lightweight filing-order manifest to the editable working ZIP.
 *
 * Heavy evidence-to-PDF rendering is intentionally deferred to final PDF delivery.
 * The working ZIP preserves original supporting files once, keeps shared insert files once,
 * and points each bureau manifest to the corresponding editable DOCX documents already stored
 * under Editable Documents/. This prevents package generation from decoding and re-encoding
 * evidence images before the user reaches the document review step.
 */
export async function addOrderedPacketFolders(
  zip: JSZip,
  docs: ReviewOutput[],
  round: Round,
  evidenceKey: string,
  clientName: string,
  routeHints: PacketRoute[] = []
) {
  const documentRoutes: PacketRoute[] = docs
    .filter((doc) => !doc.role || doc.role === 'LETTER')
    .map((doc) => ({ type: doc.type, bureau: doc.bureau }));
  const routes = Array.from(new Map([...documentRoutes, ...routeHints].map((route) => [`${route.type}:${route.bureau}`, route])).values());
  const client = safe(clientName) || 'CLIENT';
  const supportingPaths = await addSourceEvidence(zip, evidenceKey);
  const disputeRequired = routes.some((route) => route.type === 'DISPUTE');
  const fcra = disputeRequired ? await readTemplateExhibit(round, 'FCRA').catch(() => null) : null;
  const attachment = disputeRequired ? await readTemplateExhibit(round, 'ATTACHMENT').catch(() => null) : null;
  if (fcra) zip.file('SHARED PACKET INSERTS/03 FCRA.pdf', fcra);
  if (attachment) zip.file('SHARED PACKET INSERTS/05 Attachment.pdf', attachment);
  for (const route of routes) {
    const group = route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS';
    const path = `${group}/${client} ${route.bureau}/PACKET ORDER.txt`;
    zip.file(path, routeManifest(route, client, docs, supportingPaths, Boolean(fcra), Boolean(attachment)));
  }
}

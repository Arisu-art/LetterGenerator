'use client';

import JSZip from 'jszip';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { createBlankPdf } from './final-pdf-packet';
import { createSupportingDocumentsPdf } from './packet-renderer';
import { readTemplateExhibit } from './template-exhibits';
import type { Round } from './reference-store';

type PacketType = 'DISPUTE' | 'LATE_PAYMENT';
export type PacketRoute = { type: PacketType; bureau: string };

function safe(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function docByRole(docs: ReviewOutput[], bureau: string, type: PacketType, role: 'LETTER' | 'AFFIDAVIT' | 'FTC') {
  return docs.find((doc) => doc.bureau === bureau && doc.type === type && (role === 'LETTER' ? (!doc.role || doc.role === 'LETTER') : doc.role === role));
}

async function pdfOrBlank(file: Blob | null, blank: Blob) {
  return file || blank;
}

/**
 * Adds per-bureau filing-order folders to the working ZIP.
 * Every detected route is retained; unavailable template positions are blank PDF pages.
 * The optional routeHints parameter is compatible with routes detected before a letter DOCX exists.
 */
export async function addOrderedPacketFolders(
  zip: JSZip,
  docs: ReviewOutput[],
  round: Round,
  evidenceKey: string,
  clientName: string,
  routeHints: PacketRoute[] = []
) {
  const blank = await createBlankPdf();
  const documentRoutes: PacketRoute[] = docs
    .filter((doc) => !doc.role || doc.role === 'LETTER')
    .map((doc) => ({ type: doc.type, bureau: doc.bureau }));
  const routes = Array.from(new Map([...documentRoutes, ...routeHints].map((route) => [`${route.type}:${route.bureau}`, route])).values());
  const supporting = evidenceKey ? await createSupportingDocumentsPdf(evidenceKey).catch(() => null) : null;
  const client = safe(clientName) || 'CLIENT';

  for (const route of routes) {
    const group = route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS';
    const folder = `${group}/${client} ${route.bureau}/`;
    const letterTitle = route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
    const letter = docByRole(docs, route.bureau, route.type, 'LETTER');

    if (letter) zip.file(`${folder}01 ${letterTitle}.docx`, letter.blob);
    else zip.file(`${folder}01 ${letterTitle} - BLANK PAGE.pdf`, blank);
    zip.file(`${folder}02 Supporting Documents.pdf`, await pdfOrBlank(supporting, blank));

    if (route.type === 'DISPUTE') {
      const fcra = await readTemplateExhibit(round, 'FCRA').catch(() => null);
      const affidavit = docByRole(docs, route.bureau, route.type, 'AFFIDAVIT');
      const attachment = await readTemplateExhibit(round, 'ATTACHMENT').catch(() => null);
      const ftc = docByRole(docs, route.bureau, route.type, 'FTC');

      zip.file(`${folder}03 FCRA.pdf`, await pdfOrBlank(fcra, blank));
      if (affidavit) zip.file(`${folder}04 Affidavit.docx`, affidavit.blob);
      else zip.file(`${folder}04 Affidavit - BLANK PAGE.pdf`, blank);
      zip.file(`${folder}05 Attachment.pdf`, await pdfOrBlank(attachment, blank));
      if (ftc) zip.file(`${folder}06 FTC.docx`, ftc.blob);
      else zip.file(`${folder}06 FTC - BLANK PAGE.pdf`, blank);
    }
  }
}

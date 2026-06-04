'use client';

import JSZip from 'jszip';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { assertGeneratedDocx } from './docx-review-marker';
import { bureauInfo, type Bureau } from './letter-engine';
import { createSupportingDocumentsPdf } from './packet-renderer';
import type { Round } from './reference-store';
import { readTemplateExhibit } from './template-exhibits';

type PacketType = 'DISPUTE' | 'LATE_PAYMENT';
export type PacketRoute = { type: PacketType; bureau: string };

function safe(value: string) {
  return value.replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function findDocument(docs: ReviewOutput[], route: PacketRoute, role: 'LETTER' | 'AFFIDAVIT') {
  return docs.find((doc) => doc.type === route.type && (
    role === 'LETTER'
      ? doc.bureau === route.bureau && (!doc.role || doc.role === 'LETTER')
      : route.type === 'DISPUTE' && doc.role === role && (doc.bureau === route.bureau || doc.bureau === 'CLIENT')
  ));
}

/**
 * Writes the complete ordered component package for each generated route.
 * DOCX files remain editable; PDFs are inserted unchanged in filing position.
 * FTC is intentionally excluded from the active packet contract.
 */
export async function addOrderedPacketFolders(
  zip: JSZip,
  docs: ReviewOutput[],
  round: Round,
  caseKey: string,
  clientName: string,
  routeHints: PacketRoute[] = []
) {
  const docRoutes = docs
    .filter((doc) => !doc.role || doc.role === 'LETTER')
    .map((doc) => ({ type: doc.type, bureau: doc.bureau }));
  const routes = Array.from(new Map([...docRoutes, ...routeHints].map((route) => [`${route.type}:${route.bureau}`, route])).values());
  const client = safe(clientName) || 'CLIENT';
  const supporting = caseKey ? await createSupportingDocumentsPdf(caseKey).catch(() => null) : null;
  const disputePresent = routes.some((route) => route.type === 'DISPUTE');
  const fcra = disputePresent ? await readTemplateExhibit(round, 'FCRA') : null;
  const attachment = disputePresent ? await readTemplateExhibit(round, 'ATTACHMENT') : null;

  for (const route of routes) {
    const root = route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS';
    const folder = `${root}/${client} ${route.bureau}/`;
    const letter = findDocument(docs, route, 'LETTER');
    if (letter) {
      const title = route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
      const recipient = bureauInfo[route.bureau as Bureau]?.name || route.bureau;
      const validated = await assertGeneratedDocx(letter.blob, `${route.bureau} ${title}`, [clientName, recipient]);
      zip.file(`${folder}01 ${title}.docx`, validated);
    }
    if (supporting) zip.file(`${folder}02 Supporting Documents.pdf`, supporting);
    if (route.type === 'DISPUTE') {
      if (fcra) zip.file(`${folder}03 FCRA Legal Exhibit.pdf`, fcra);
      const affidavit = findDocument(docs, route, 'AFFIDAVIT');
      if (affidavit) zip.file(`${folder}04 Affidavit.docx`, await assertGeneratedDocx(affidavit.blob, 'Affidavit', [clientName]));
      if (attachment) zip.file(`${folder}05 Attachment.pdf`, attachment);
    }
  }
}

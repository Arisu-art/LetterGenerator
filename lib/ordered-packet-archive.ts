'use client';

import JSZip from 'jszip';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { createBlankPdf } from './final-pdf-packet';
import { createSupportingDocumentsPdf } from './packet-renderer';
import { readTemplateExhibit, type ExhibitKind } from './template-exhibits';
import type { Round } from './reference-store';

type PacketType = 'DISPUTE' | 'LATE_PAYMENT';
export type PacketRoute = { type: PacketType; bureau: string };

const DISPUTE_ORDER: Array<{ index: string; title: string; kind: ExhibitKind }> = [
  { index: '03', title: 'FCRA', kind: 'FCRA' },
  { index: '05', title: 'Attachment', kind: 'ATTACHMENT' }
];

function safe(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

async function addPdfOrBlank(zip: JSZip, path: string, blob: Blob | null, blank: Blob) {
  zip.file(path, blob || blank);
}

function docByRole(docs: ReviewOutput[], bureau: string, type: PacketType, role: 'LETTER' | 'AFFIDAVIT' | 'FTC') {
  return docs.find((doc) => doc.bureau === bureau && doc.type === type && (role === 'LETTER' ? (!doc.role || doc.role === 'LETTER') : doc.role === role));
}

/** Adds filing-order folders to the ZIP. Detected routes are retained even when their templates are still missing. */
export async function addOrderedPacketFolders(zip: JSZip, docs: ReviewOutput[], routes: PacketRoute[], round: Round, evidenceKey: string, clientName: string) {
  const blank = await createBlankPdf();
  const uniqueRoutes = Array.from(new Map(routes.map((route) => [`${route.type}:${route.bureau}`, route])).values());
  const supporting = evidenceKey ? await createSupportingDocumentsPdf(evidenceKey).catch(() => null) : null;
  const client = safe(clientName) || 'CLIENT';

  for (const route of uniqueRoutes) {
    const folderType = route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS';
    const folder = `${folderType}/${client} ${route.bureau}/`;
    const letterTitle = route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
    const letter = docByRole(docs, route.bureau, route.type, 'LETTER');
    if (letter) zip.file(`${folder}01 ${letterTitle}.docx`, letter.blob);
    else zip.file(`${folder}01 ${letterTitle} - BLANK PAGE.pdf`, blank);
    await addPdfOrBlank(zip, `${folder}02 Supporting Documents.pdf`, supporting, blank);

    if (route.type === 'DISPUTE') {
      for (const item of DISPUTE_ORDER) {
        const source = await readTemplateExhibit(round, item.kind).catch(() => null);
        await addPdfOrBlank(zip, `${folder}${item.index} ${item.title}.pdf`, source, blank);
      }
      const affidavit = docByRole(docs, route.bureau, route.type, 'AFFIDAVIT');
      const ftc = docByRole(docs, route.bureau, route.type, 'FTC');
      if (affidavit) zip.file(`${folder}04 Affidavit.docx`, affidavit.blob);
      else zip.file(`${folder}04 Affidavit - BLANK PAGE.pdf`, blank);
      if (ftc) zip.file(`${folder}06 FTC.docx`, ftc.blob);
      else zip.file(`${folder}06 FTC - BLANK PAGE.pdf`, blank);
    }
  }
}

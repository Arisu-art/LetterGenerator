'use client';

import JSZip from 'jszip';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { createBlankPdf } from './final-pdf-packet';
import { createSupportingDocumentsPdf } from './packet-renderer';
import { readTemplateExhibit, type ExhibitKind } from './template-exhibits';
import type { Round } from './reference-store';

type PacketType = 'DISPUTE' | 'LATE_PAYMENT';

const DISPUTE_ORDER: Array<{ index: string; title: string; kind?: ExhibitKind }> = [
  { index: '03', title: 'FCRA', kind: 'FCRA' },
  { index: '05', title: 'Attachment', kind: 'ATTACHMENT' }
];

function safe(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

async function addPdfOrBlank(zip: JSZip, path: string, blob: Blob | null) {
  zip.file(path, blob || await createBlankPdf());
}

function docByRole(docs: ReviewOutput[], bureau: string, type: PacketType, role: 'LETTER' | 'AFFIDAVIT' | 'FTC') {
  return docs.find((doc) => doc.bureau === bureau && doc.type === type && (role === 'LETTER' ? (!doc.role || doc.role === 'LETTER') : doc.role === role));
}

/** Adds filing-order folders to the working ZIP. Missing packet positions are retained as blank PDF pages. */
export async function addOrderedPacketFolders(zip: JSZip, docs: ReviewOutput[], round: Round, evidenceKey: string, clientName: string) {
  const blank = await createBlankPdf();
  const routes = Array.from(new Map(docs.filter((doc) => !doc.role || doc.role === 'LETTER').map((doc) => [`${doc.type}:${doc.bureau}`, { type: doc.type, bureau: doc.bureau }])).values());
  const supporting = evidenceKey ? await createSupportingDocumentsPdf(evidenceKey).catch(() => null) : null;
  const client = safe(clientName) || 'CLIENT';

  for (const route of routes) {
    const folderType = route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS';
    const folder = `${folderType}/${client} ${route.bureau}/`;
    const letter = docByRole(docs, route.bureau, route.type, 'LETTER');
    if (letter) zip.file(`${folder}01 ${route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter'}.docx`, letter.blob);
    await addPdfOrBlank(zip, `${folder}02 Supporting Documents.pdf`, supporting || blank);

    if (route.type === 'DISPUTE') {
      for (const item of DISPUTE_ORDER) {
        const source = await readTemplateExhibit(round, item.kind!).catch(() => null);
        await addPdfOrBlank(zip, `${folder}${item.index} ${item.title}.pdf`, source || blank);
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

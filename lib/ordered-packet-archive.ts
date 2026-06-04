'use client';

import JSZip from 'jszip';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import { assertGeneratedDocx } from './docx-review-marker';
import { bureauInfo, type Bureau } from './letter-engine';
import type { Round } from './reference-store';

type PacketType = 'DISPUTE' | 'LATE_PAYMENT';
export type PacketRoute = { type: PacketType; bureau: string };

function safe(value: string) {
  return value.replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function findDocument(docs: ReviewOutput[], route: PacketRoute, role: 'LETTER' | 'AFFIDAVIT' | 'FTC') {
  return docs.find((doc) => doc.type === route.type && (
    role === 'LETTER'
      ? doc.bureau === route.bureau && (!doc.role || doc.role === 'LETTER')
      : route.type === 'DISPUTE' && doc.role === role && (doc.bureau === route.bureau || doc.bureau === 'CLIENT')
  ));
}

export async function addOrderedPacketFolders(
  zip: JSZip,
  docs: ReviewOutput[],
  _round: Round,
  _caseKey: string,
  clientName: string,
  routeHints: PacketRoute[] = []
) {
  const docRoutes = docs
    .filter((doc) => !doc.role || doc.role === 'LETTER')
    .map((doc) => ({ type: doc.type, bureau: doc.bureau }));
  const routes = Array.from(new Map([...docRoutes, ...routeHints].map((route) => [`${route.type}:${route.bureau}`, route])).values());
  const client = safe(clientName) || 'CLIENT';

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
    if (route.type === 'DISPUTE') {
      const affidavit = findDocument(docs, route, 'AFFIDAVIT');
      const ftc = findDocument(docs, route, 'FTC');
      if (affidavit) zip.file(`${folder}04 Affidavit.docx`, await assertGeneratedDocx(affidavit.blob, 'Affidavit', [clientName]));
      if (ftc) zip.file(`${folder}06 FTC Identity Theft Report.docx`, await assertGeneratedDocx(ftc.blob, 'FTC Identity Theft Report', [clientName]));
    }
  }
}

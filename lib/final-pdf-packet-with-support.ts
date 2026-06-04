import { assembleFinalPdf, type PdfPacketPart } from './final-pdf-packet';
import { readTemplateExhibit } from './template-exhibits';
import { createSupportingDocumentsPdf } from './packet-renderer';
import type { ReviewOutput } from '../components/OutputReviewWorkspace';
import type { Round } from '../lib/reference-store';
import type { LetterType } from './letter-engine';

export async function assembleFinalPacketWithSupporting(
  type: LetterType,
  bureau: string,
  items: ReviewOutput[],
  round: Round,
  evidenceKey: string
) {
  // 1. Generate supporting docs PDF
  const supporting = await createSupportingDocumentsPdf(evidenceKey).catch(() => null);
  if (!supporting) throw new Error('Supporting Documents could not be prepared.');

  // 2. Locate each document type
  const letterDoc = items.find(i => i.type === type && i.bureau === bureau && i.role === 'LETTER');
  const fcraDoc = await readTemplateExhibit(round, 'FCRA');
  const affidavitDoc = items.find(i => i.role === 'AFFIDAVIT' && (i.bureau === bureau || i.bureau === 'CLIENT'));
  const attachmentDoc = await readTemplateExhibit(round, 'ATTACHMENT');

  // 3. Prepare PDF parts in order
  const parts: PdfPacketPart[] = [
    letterDoc ? { label: 'Letter', kind: 'DOCX', blob: letterDoc.blob } : { label: 'Letter', kind: 'BLANK' },
    { label: 'Supporting Documents', kind: 'PDF', blob: supporting },
    fcraDoc ? { label: 'FCRA', kind: 'PDF', blob: fcraDoc } : { label: 'FCRA', kind: 'BLANK' },
    affidavitDoc ? { label: 'Affidavit', kind: 'DOCX', blob: affidavitDoc.blob } : { label: 'Affidavit', kind: 'BLANK' },
    attachmentDoc ? { label: 'Attachment', kind: 'PDF', blob: attachmentDoc } : { label: 'Attachment', kind: 'BLANK' }
  ];

  // 4. Merge all into final PDF
  return assembleFinalPdf(parts, { requireAllParts: true });
}
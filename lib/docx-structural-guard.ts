import { DOCX_HYDRATION_CONTRACT } from './docx-hydration-contract';

export type DocxStructuralSnapshot = {
  paragraphCount: number;
  styleMutationGuard: boolean;
  contract: typeof DOCX_HYDRATION_CONTRACT;
};

export function createStructuralSnapshot(xmlText: string): DocxStructuralSnapshot {
  const paragraphCount = (xmlText.match(/<w:p[\s>]/g) || []).length;
  return { paragraphCount, styleMutationGuard: true, contract: DOCX_HYDRATION_CONTRACT };
}

export function validateStructuralInvariance(before: DocxStructuralSnapshot, afterXmlText: string) {
  const afterParagraphCount = (afterXmlText.match(/<w:p[\s>]/g) || []).length;
  if (afterParagraphCount < before.paragraphCount) {
    throw new Error('DOCX structural guard blocked generation because rendered paragraphs were unexpectedly removed.');
  }
  return true;
}

import { DOCX_HYDRATION_CONTRACT } from './docx-hydration-contract';

export type DocxStructuralSnapshot = {
  paragraphCount: number;
  hasBody: boolean;
  hasSectionProperties: boolean;
  styleMutationGuard: boolean;
  contract: typeof DOCX_HYDRATION_CONTRACT;
};

function countParagraphs(xmlText: string) {
  return (xmlText.match(/<w:p[\s>]/g) || []).length;
}

function hasBody(xmlText: string) {
  return /<w:body[\s>]/.test(xmlText) && /<\/w:body>/.test(xmlText);
}

function hasSectionProperties(xmlText: string) {
  return /<w:sectPr[\s>]/.test(xmlText);
}

export function createStructuralSnapshot(xmlText: string): DocxStructuralSnapshot {
  return {
    paragraphCount: countParagraphs(xmlText),
    hasBody: hasBody(xmlText),
    hasSectionProperties: hasSectionProperties(xmlText),
    styleMutationGuard: true,
    contract: DOCX_HYDRATION_CONTRACT
  };
}

export function validateStructuralInvariance(before: DocxStructuralSnapshot, afterXmlText: string) {
  const afterParagraphCount = countParagraphs(afterXmlText);

  if (!afterParagraphCount) {
    throw new Error('Document layout could not be prepared because the template body became empty.');
  }

  if (before.hasBody && !hasBody(afterXmlText)) {
    throw new Error('Document layout could not be prepared because the template body was not preserved.');
  }

  if (before.hasSectionProperties && !hasSectionProperties(afterXmlText)) {
    throw new Error('Document layout could not be prepared because page setup was not preserved.');
  }

  return true;
}

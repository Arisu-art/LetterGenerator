export type HydrationMutationZone = 'identity-header' | 'recipient-header' | 'account-section' | 'inquiry-section' | 'signature';

export const DOCX_HYDRATION_CONTRACT = {
  preserveUnmappedText: true,
  preserveParagraphProperties: true,
  preserveRunProperties: true,
  preserveTemplateColors: true,
  preserveMargins: true,
  preserveLineSpacing: true,
  preventStyleBleed: true,
  keepAccountBlocksAtomic: true,
  preserveCrossBureauDuplicates: true,
  forbidGeneratedLayoutAesthetics: true,
  allowedMutationZones: ['identity-header', 'recipient-header', 'account-section', 'inquiry-section', 'signature'] as HydrationMutationZone[]
} as const;

export type StructuralHydrationContract = typeof DOCX_HYDRATION_CONTRACT;

export function assertHydrationContract() {
  return DOCX_HYDRATION_CONTRACT;
}

export type DocxAnchorCategory = 'FRAUDULENT_ACCOUNTS' | 'HARD_INQUIRIES' | 'LATE_PAYMENTS';

export type DocxAnchorBinding = {
  category: DocxAnchorCategory;
  label: string;
  required: boolean;
};

export const DOCX_ANCHOR_BINDINGS: DocxAnchorBinding[] = [
  { category: 'FRAUDULENT_ACCOUNTS', label: 'Fraudulent accounts re-asserted for deletion', required: true },
  { category: 'HARD_INQUIRIES', label: 'Hard inquiries', required: false },
  { category: 'LATE_PAYMENTS', label: 'Late payments', required: false }
];

export function anchorLabel(category: DocxAnchorCategory) {
  return DOCX_ANCHOR_BINDINGS.find((binding) => binding.category === category)?.label || category;
}

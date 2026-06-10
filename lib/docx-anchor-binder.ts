export type DocxAnchorCategory = 'FRAUDULENT_ACCOUNTS' | 'HARD_INQUIRIES' | 'LATE_PAYMENTS' | 'CLIENT_INFO';

export type DocxAnchorBinding = {
  category: DocxAnchorCategory;
  label: string;
  required: boolean;
  inventWhenMissing: boolean;
};

export const DOCX_ANCHOR_BINDINGS: DocxAnchorBinding[] = [
  { category: 'CLIENT_INFO', label: 'Client information', required: true, inventWhenMissing: false },
  { category: 'FRAUDULENT_ACCOUNTS', label: 'Fraudulent accounts re-asserted for deletion', required: true, inventWhenMissing: false },
  { category: 'HARD_INQUIRIES', label: 'Hard inquiries', required: false, inventWhenMissing: false },
  { category: 'LATE_PAYMENTS', label: 'Late payments', required: false, inventWhenMissing: false }
];

export function anchorBinding(category: DocxAnchorCategory) {
  return DOCX_ANCHOR_BINDINGS.find((binding) => binding.category === category);
}

export function anchorLabel(category: DocxAnchorCategory) {
  return anchorBinding(category)?.label || category;
}

export function shouldInventAnchor(category: DocxAnchorCategory) {
  return Boolean(anchorBinding(category)?.inventWhenMissing);
}

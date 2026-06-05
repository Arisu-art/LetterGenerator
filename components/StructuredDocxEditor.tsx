'use client';

import { useMemo, useState } from 'react';
import type { EditableParagraph, ParagraphAlignment } from '../lib/simple-docx-editor';

type Props = {
  paragraphs: EditableParagraph[];
  activeId: string;
  onSelect: (id: string) => void;
  onChange: (id: string, change: Partial<EditableParagraph>) => void;
};
type SectionKind = 'identity' | 'recipient' | 'subject' | 'opening' | 'accounts' | 'legal' | 'closing' | 'affidavit' | 'notary' | 'general';
type Section = { id: string; label: string; kind: SectionKind; items: Array<{ paragraph: EditableParagraph; index: number }> };
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const LINE_SPACING = [1, 1.15, 1.5, 2];
const ALIGNMENTS: ParagraphAlignment[] = ['left', 'center', 'right', 'justify'];
const FILTERS: Array<{ value: SectionKind | 'all'; label: string }> = [
  { value: 'all', label: 'All sections' }, { value: 'identity', label: 'Client Identity' }, { value: 'recipient', label: 'Recipient / Bureau' },
  { value: 'subject', label: 'Subject Line' }, { value: 'opening', label: 'Opening' }, { value: 'accounts', label: 'Accounts' },
  { value: 'legal', label: 'Legal Demand' }, { value: 'closing', label: 'Closing' }, { value: 'affidavit', label: 'Affidavit' }, { value: 'notary', label: 'Notary' }, { value: 'general', label: 'General' }
];
function clean(text: string) { return text.replace(/\s+/g, ' ').trim(); }
function titleFor(text: string, index: number) {
  const value = clean(text);
  if (/^(Account|Creditor)\s+Name\s*:/i.test(value)) return `Account block ${index + 1}`;
  if (/^Account\s+Number\s*:/i.test(value)) return `Account number ${index + 1}`;
  if (/^Pursuant\s+to\s+15\s+USC/i.test(value)) return `Legal statement ${index + 1}`;
  if (/^RE\s*:/i.test(value)) return 'Subject / RE line';
  if (/Sincerely|Respectfully|Signature|Notary/i.test(value)) return value;
  if (value.length > 48) return `${value.slice(0, 48)}…`;
  return value || `Paragraph ${index + 1}`;
}
function sectionLabel(kind: SectionKind) {
  const labels: Record<SectionKind, string> = {
    identity: 'Client Identity', recipient: 'Recipient / Bureau', subject: 'Subject Line', opening: 'Opening Statement', accounts: 'Account Information', legal: 'Legal Demand / Request', closing: 'Closing / Signature', affidavit: 'Affidavit Statement', notary: 'Notary Block', general: 'General Content'
  };
  return labels[kind];
}
function classify(text: string, index: number): SectionKind {
  const value = clean(text);
  if (!value) return 'general';
  if (index <= 2 && /\b(?:DOB|SSN|\d{3,5}\s+\w+|\b[A-Z]{2}\b|\d{5})\b/i.test(value)) return 'identity';
  if (index <= 6 && /(Equifax|Experian|TransUnion|Information Services|PO Box|P\.O\.|Atlanta|Chester|Allen|Costa Mesa)/i.test(value)) return 'recipient';
  if (/^RE\s*:|FORMAL\s+IDENTITY\s+THEFT|AFFIDAVIT\s+OF\s+DISPUTE/i.test(value)) return 'subject';
  if (/To Whom It May Concern|This correspondence|I am a victim|I declare|Statement of Facts|Personal Information/i.test(value)) return /affidavit/i.test(value) ? 'affidavit' : 'opening';
  if (/^(Account|Creditor)\s+Name\s*:|^Account\s+Number\s*:|^Pursuant\s+to\s+15\s+USC|FRAUDULENT\s+ACCOUNTS|INACCURATE|DISPUTED\s+ACCOUNTS/i.test(value)) return 'accounts';
  if (/LEGAL\s+DEMAND|FCRA|REQUEST\s+FOR\s+ACTION|block\s+the\s+reporting|delete|investigate|correct/i.test(value)) return 'legal';
  if (/Sincerely|Respectfully|Signature|Date:|Notary|Electronically signed|Oath|penalty of perjury/i.test(value)) return /Notary/i.test(value) ? 'notary' : 'closing';
  return 'general';
}
function buildSections(paragraphs: EditableParagraph[]) {
  const sections: Section[] = [];
  function push(kind: SectionKind, item: Section['items'][number]) {
    const last = sections[sections.length - 1];
    if (last?.kind === kind) { last.items.push(item); return; }
    sections.push({ id: `${kind}-${sections.length}`, label: sectionLabel(kind), kind, items: [item] });
  }
  paragraphs.forEach((paragraph, index) => push(classify(paragraph.text, index), { paragraph, index }));
  return sections;
}
function countWords(text: string) { return clean(text).split(' ').filter(Boolean).length; }
export default function StructuredDocxEditor({ paragraphs, activeId, onSelect, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<SectionKind | 'all'>('all');
  const [dirtyOnly, setDirtyOnly] = useState(false);
  const sections = useMemo(() => buildSections(paragraphs), [paragraphs]);
  const active = paragraphs.find((paragraph) => paragraph.id === activeId) || paragraphs[0];
  const activeIndex = active ? paragraphs.findIndex((item) => item.id === active.id) : -1;
  const activeSection = sections.find((section) => section.items.some((item) => item.paragraph.id === active?.id));
  const filteredSections = sections.map((section) => ({ ...section, items: section.items.filter(({ paragraph, index }) => {
    const matchesSection = sectionFilter === 'all' || section.kind === sectionFilter;
    const matchesDirty = !dirtyOnly || Boolean(paragraph.dirty);
    const haystack = `${titleFor(paragraph.text, index)} ${paragraph.text}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    return matchesSection && matchesDirty && matchesQuery;
  }) })).filter((section) => section.items.length);
  function resetSelected() {
    if (!active) return;
    onChange(active.id, { dirty: false });
  }
  return <section className="structured-docx-editor simple-structured-docx-editor" aria-label="Simple DOCX content editor">
    <header><div><p className="eyebrow">Simple editor</p><h3>DOCX Content Editor</h3><p>Edit mapped DOCX paragraphs while preserving the document's original template layout, styles, margins, and section settings.</p></div><div className="simple-editor-count"><strong>{paragraphs.length} paragraphs</strong><span>{sections.length} sections</span></div></header>
    <div className="simple-editor-banner"><b>Template-controlled layout</b><span>This editor changes content and paragraph formatting only. Page size, margins, and template geometry stay controlled by the original DOCX template.</span></div>
    <div className="simple-editor-controls"><label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find account, legal text, name..." /></label><label><span>Section</span><select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value as SectionKind | 'all')}>{FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label><button type="button" className={dirtyOnly ? 'active' : ''} onClick={() => setDirtyOnly((value) => !value)}>Changed only</button><button type="button" onClick={() => { setQuery(''); setSectionFilter('all'); setDirtyOnly(false); }}>Clear filters</button></div>
    <div className="structured-editor-layout">
      <aside className="structured-paragraph-list" aria-label="Document sections and paragraphs">
        {filteredSections.length ? filteredSections.map((section) => <section key={section.id} className={`structured-section-group ${section.kind === activeSection?.kind ? 'current' : ''}`}><h4>{section.label}</h4>{section.items.map(({ paragraph, index }) => <button type="button" key={paragraph.id} className={paragraph.id === active?.id ? 'active' : ''} onClick={() => onSelect(paragraph.id)}><b>{String(index + 1).padStart(2, '0')}</b><span>{titleFor(paragraph.text, index)}</span>{paragraph.dirty && <em>Changed</em>}</button>)}</section>) : <p className="structured-empty">No paragraphs match the current filters.</p>}
      </aside>
      <main className="structured-editor-main">
        {active ? <>
          <div className="active-section-banner"><span>{activeSection?.label || 'Selected paragraph'}</span><strong>{titleFor(active.text, activeIndex)}</strong><small>Paragraph {activeIndex + 1} · {countWords(active.text)} words · {active.text.length} characters · {active.dirty ? 'unsaved changes' : 'clean'}</small></div>
          <label className="structured-text-field"><span>Paragraph text</span><textarea value={active.text} onChange={(event) => onChange(active.id, { text: event.target.value, dirty: true })} /></label>
          <div className="structured-format-grid">
            <div className="structured-toggle-row" aria-label="Text style controls"><button type="button" className={active.bold ? 'active' : ''} onClick={() => onChange(active.id, { bold: !active.bold, dirty: true })}><b>B</b></button><button type="button" className={active.italic ? 'active' : ''} onClick={() => onChange(active.id, { italic: !active.italic, dirty: true })}><i>I</i></button><button type="button" className={active.underline ? 'active' : ''} onClick={() => onChange(active.id, { underline: !active.underline, dirty: true })}><u>U</u></button></div>
            <label><span>Size</span><select value={active.fontSize} onChange={(event) => onChange(active.id, { fontSize: Number(event.target.value), dirty: true })}>{FONT_SIZES.map((size) => <option value={size} key={size}>{size} pt</option>)}</select></label>
            <label><span>Color</span><input type="color" value={active.color} onChange={(event) => onChange(active.id, { color: event.target.value, dirty: true })} /></label>
            <label><span>Alignment</span><select value={active.alignment} onChange={(event) => onChange(active.id, { alignment: event.target.value as ParagraphAlignment, dirty: true })}>{ALIGNMENTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Line spacing</span><select value={active.lineSpacing} onChange={(event) => onChange(active.id, { lineSpacing: Number(event.target.value), dirty: true })}>{LINE_SPACING.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <button type="button" className="simple-reset-button" disabled={!active.dirty} onClick={resetSelected}>Mark clean</button>
          </div>
        </> : <p className="structured-empty">No editable paragraphs were detected in this DOCX.</p>}
      </main>
    </div>
  </section>;
}

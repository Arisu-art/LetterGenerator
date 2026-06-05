'use client';

import type { EditableParagraph, ParagraphAlignment } from '../lib/simple-docx-editor';

type Props = {
  paragraphs: EditableParagraph[];
  activeId: string;
  onSelect: (id: string) => void;
  onChange: (id: string, change: Partial<EditableParagraph>) => void;
};
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const LINE_SPACING = [1, 1.15, 1.5, 2];
const ALIGNMENTS: ParagraphAlignment[] = ['left', 'center', 'right', 'justify'];
function titleFor(text: string, index: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (/^(Account|Creditor)\s+Name\s*:/i.test(clean)) return `Account block ${index + 1}`;
  if (/^Pursuant\s+to\s+15\s+USC/i.test(clean)) return `Legal statement ${index + 1}`;
  if (clean.length > 48) return `${clean.slice(0, 48)}…`;
  return clean || `Paragraph ${index + 1}`;
}
export default function StructuredDocxEditor({ paragraphs, activeId, onSelect, onChange }: Props) {
  const active = paragraphs.find((paragraph) => paragraph.id === activeId) || paragraphs[0];
  return <section className="structured-docx-editor" aria-label="Structured DOCX content editor">
    <header><div><p className="eyebrow">Editable source</p><h3>Document Content Editor</h3><p>Edit the DOCX source paragraphs. Save changes to rebuild the LibreOffice proof preview.</p></div><strong>{paragraphs.length} paragraphs</strong></header>
    <div className="structured-editor-layout">
      <aside className="structured-paragraph-list" aria-label="Paragraph list">
        {paragraphs.map((paragraph, index) => <button type="button" key={paragraph.id} className={paragraph.id === active?.id ? 'active' : ''} onClick={() => onSelect(paragraph.id)}><b>{String(index + 1).padStart(2, '0')}</b><span>{titleFor(paragraph.text, index)}</span></button>)}
      </aside>
      <main className="structured-editor-main">
        {active ? <>
          <label className="structured-text-field"><span>Paragraph text</span><textarea value={active.text} onChange={(event) => onChange(active.id, { text: event.target.value, dirty: true })} /></label>
          <div className="structured-format-grid">
            <div className="structured-toggle-row" aria-label="Text style controls"><button type="button" className={active.bold ? 'active' : ''} onClick={() => onChange(active.id, { bold: !active.bold, dirty: true })}><b>B</b></button><button type="button" className={active.italic ? 'active' : ''} onClick={() => onChange(active.id, { italic: !active.italic, dirty: true })}><i>I</i></button><button type="button" className={active.underline ? 'active' : ''} onClick={() => onChange(active.id, { underline: !active.underline, dirty: true })}><u>U</u></button></div>
            <label><span>Size</span><select value={active.fontSize} onChange={(event) => onChange(active.id, { fontSize: Number(event.target.value), dirty: true })}>{FONT_SIZES.map((size) => <option value={size} key={size}>{size} pt</option>)}</select></label>
            <label><span>Color</span><input type="color" value={active.color} onChange={(event) => onChange(active.id, { color: event.target.value, dirty: true })} /></label>
            <label><span>Alignment</span><select value={active.alignment} onChange={(event) => onChange(active.id, { alignment: event.target.value as ParagraphAlignment, dirty: true })}>{ALIGNMENTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Line spacing</span><select value={active.lineSpacing} onChange={(event) => onChange(active.id, { lineSpacing: Number(event.target.value), dirty: true })}>{LINE_SPACING.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
        </> : <p className="structured-empty">No editable paragraphs were detected in this DOCX.</p>}
      </main>
    </div>
  </section>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { readDocxPageLayout, type DocxPageLayout } from '../lib/docx-preview-pagination';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { label: string; slotId: string; output: ReviewOutput; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };
const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const LINE_SPACING = [0.9, 1, 1.08, 1.15, 1.5, 2];
type PageShell = { page: HTMLElement; body: HTMLElement };
function fileName(output: ReviewOutput) { return output.path.split('/').pop() || 'document.docx'; }
function textOf(node: HTMLElement) { return (node.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); }
function pageLabel(page: number, total: number) { return total ? `Edit page ${page} of ${total}` : 'Preparing edit canvas'; }
function layoutLabel(layout: DocxPageLayout | null) { return layout ? `${layout.name} ${layout.orientation} · ${layout.widthIn}×${layout.heightIn}in · margins ${layout.marginTopIn}/${layout.marginRightIn}/${layout.marginBottomIn}/${layout.marginLeftIn}in` : 'Reading template page setup'; }
function pt(value: number | undefined, fallback = 0) { return `${Number.isFinite(value) ? value : fallback}pt`; }
function applyPageGeometry(page: HTMLElement, body: HTMLElement, layout: DocxPageLayout) {
  page.className = 'measured-docx-page strict-template-page';
  page.dataset.pageRole = 'strict-template-page';
  page.style.setProperty('--docx-page-width', `${layout.widthIn}in`);
  page.style.setProperty('--docx-page-height', `${layout.heightIn}in`);
  page.style.setProperty('--docx-margin-top', `${layout.marginTopIn}in`);
  page.style.setProperty('--docx-margin-right', `${layout.marginRightIn}in`);
  page.style.setProperty('--docx-margin-bottom', `${layout.marginBottomIn}in`);
  page.style.setProperty('--docx-margin-left', `${layout.marginLeftIn}in`);
  Object.assign(page.style, { position: 'relative', width: `${layout.widthIn}in`, minWidth: `${layout.widthIn}in`, maxWidth: `${layout.widthIn}in`, height: `${layout.heightIn}in`, minHeight: `${layout.heightIn}in`, maxHeight: `${layout.heightIn}in`, padding: '0', margin: '0 auto 34px', overflow: 'hidden', boxSizing: 'border-box', background: '#fff' });
  body.className = 'measured-docx-content strict-template-frame';
  body.dataset.pageRole = 'strict-template-frame';
  Object.assign(body.style, { position: 'absolute', top: `${layout.marginTopIn}in`, right: `${layout.marginRightIn}in`, bottom: `${layout.marginBottomIn}in`, left: `${layout.marginLeftIn}in`, width: 'auto', height: 'auto', margin: '0', padding: '0', overflow: 'hidden', boxSizing: 'border-box' });
}
function createPage(host: HTMLElement, layout: DocxPageLayout, pageNumber: number): PageShell {
  const page = document.createElement('section');
  const body = document.createElement('article');
  page.dataset.pageNumber = String(pageNumber);
  applyPageGeometry(page, body, layout);
  page.appendChild(body);
  host.appendChild(page);
  return { page, body };
}
function applyPreviewFormatting(node: HTMLElement, paragraph: EditableParagraph) {
  node.style.cssText = '';
  node.style.setProperty('font-family', paragraph.fontFamily || 'Arial', 'important');
  node.style.setProperty('font-size', pt(paragraph.fontSize, 8), 'important');
  node.style.setProperty('line-height', String(paragraph.lineSpacing || 1), 'important');
  node.style.setProperty('margin-top', pt(paragraph.spacingBefore, 0), 'important');
  node.style.setProperty('margin-right', pt(paragraph.rightIndent, 0), 'important');
  node.style.setProperty('margin-bottom', pt(paragraph.spacingAfter, 0), 'important');
  node.style.setProperty('margin-left', pt(paragraph.leftIndent, 0), 'important');
  node.style.setProperty('padding', '0', 'important');
  node.style.setProperty('text-indent', pt(paragraph.firstLineIndent, 0), 'important');
  node.style.setProperty('text-align', paragraph.alignment, 'important');
  node.style.setProperty('font-weight', paragraph.bold ? '700' : '400', 'important');
  node.style.setProperty('font-style', paragraph.italic ? 'italic' : 'normal', 'important');
  node.style.setProperty('text-decoration', paragraph.underline ? 'underline' : 'none', 'important');
  node.style.setProperty('color', paragraph.color || '#000000', 'important');
  node.style.setProperty('white-space', 'pre-wrap', 'important');
  node.style.setProperty('overflow-wrap', 'break-word', 'important');
  node.style.setProperty('box-sizing', 'border-box', 'important');
  if (paragraph.pageBreakBefore) node.classList.add('docx-edit-page-break-before'); else node.classList.remove('docx-edit-page-break-before');
}
function overflows(body: HTMLElement) { return body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1; }
function renderStrictCanvas(host: HTMLElement, items: EditableParagraph[], layout: DocxPageLayout, setActiveId: (id: string) => void, onChange: (id: string, text: string) => void, nodes: Map<string, HTMLElement>) {
  host.innerHTML = '';
  host.dataset.docxCanvasMode = 'style-resolved-strict-template-renderer';
  nodes.clear();
  const pages: HTMLElement[] = [];
  let current = createPage(host, layout, 1);
  pages.push(current.page);
  items.forEach((item) => {
    if (item.pageBreakBefore && current.body.childNodes.length) { current = createPage(host, layout, pages.length + 1); pages.push(current.page); }
    const node = document.createElement('p');
    node.textContent = item.text;
    node.contentEditable = 'true';
    node.spellcheck = true;
    node.dataset.paragraphId = item.id;
    applyPreviewFormatting(node, item);
    node.addEventListener('focus', () => setActiveId(item.id));
    node.addEventListener('input', () => onChange(item.id, textOf(node)));
    current.body.appendChild(node);
    if (overflows(current.body) && current.body.childNodes.length > 1) {
      current.body.removeChild(node);
      current = createPage(host, layout, pages.length + 1);
      pages.push(current.page);
      current.body.appendChild(node);
    }
    if (overflows(current.body)) current.page.classList.add('docx-page-oversized');
    nodes.set(item.id, node);
  });
  return pages;
}
export default function MeasuredDocxEditorSection({ label, slotId, output, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const nodes = useRef<Map<string, HTMLElement>>(new Map());
  const pages = useRef<HTMLElement[]>([]);
  const [paragraphs, setParagraphs] = useState<EditableParagraph[]>([]);
  const [activeId, setActiveId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading style-resolved template canvas');
  const [layout, setLayout] = useState<DocxPageLayout | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [oversizedPages, setOversizedPages] = useState<number[]>([]);
  const selected = paragraphs.find((paragraph) => paragraph.id === activeId) || paragraphs[0];
  function goToPage(value: number) { const page = Math.max(1, Math.min(value, pages.current.length || 1)); pages.current[page - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setCurrentPage(page); }
  useEffect(() => {
    let live = true; let removeScroll: (() => void) | undefined;
    setDirty(false); setStatus('Loading style-resolved template canvas'); setLayout(null); setCurrentPage(1); setPageCount(0); setOversizedPages([]); nodes.current.clear(); pages.current = [];
    void Promise.all([readEditableParagraphs(output.blob), readDocxPageLayout(output.blob)]).then(([items, templateLayout]) => {
      if (!live || !host.current) return;
      setLayout(templateLayout); setParagraphs(items); setActiveId(items[0]?.id || '');
      const builtPages = renderStrictCanvas(host.current, items, templateLayout, setActiveId, (id, text) => {
        setDirty(true); setStatus('Unsaved DOCX edits');
        setParagraphs((current) => current.map((entry) => entry.id === id ? { ...entry, text, dirty: true } : entry));
      }, nodes.current);
      pages.current = builtPages; setPageCount(builtPages.length || 1); setOversizedPages(builtPages.flatMap((page, index) => page.classList.contains('docx-page-oversized') ? [index + 1] : []));
      const scrollRoot = host.current.closest<HTMLElement>('.packet-edit-html-scroll');
      if (scrollRoot && builtPages.length > 1) {
        const updatePage = () => { const top = scrollRoot.getBoundingClientRect().top + 80; const closest = builtPages.reduce((best, sheet, index) => { const distance = Math.abs(sheet.getBoundingClientRect().top - top); return distance < best.distance ? { page: index + 1, distance } : best; }, { page: 1, distance: Infinity }); setCurrentPage(closest.page); };
        scrollRoot.addEventListener('scroll', updatePage, { passive: true }); removeScroll = () => scrollRoot.removeEventListener('scroll', updatePage);
      }
      setStatus('Style-resolved strict template canvas ready');
    }).catch((error: Error) => { if (live) setStatus(error.message); });
    return () => { live = false; removeScroll?.(); };
  }, [output.blob, label]);
  function format(change: Partial<EditableParagraph>) { if (!selected) return; const updated = { ...selected, ...change, dirty: true }; setParagraphs((current) => current.map((entry) => entry.id === selected.id ? updated : entry)); const node = nodes.current.get(selected.id); if (node) applyPreviewFormatting(node, updated); setDirty(true); setStatus('Unsaved DOCX edits'); }
  async function save() {
    setSaving(true); setStatus('Saving DOCX');
    try { const blob = await saveEditedParagraphs(output.blob, paragraphs); await onSave(output, new File([blob], fileName(output), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); setDirty(false); setParagraphs((current) => current.map((paragraph) => ({ ...paragraph, dirty: false }))); setStatus('DOCX saved'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setSaving(false); }
  }
  return <article className="packet-focus-section packet-stack-editable docx-canvas-editor" data-slot={slotId}>
    <div className="packet-document-toolbar"><div className="docx-page-navigation" aria-label="Edit canvas pages"><button type="button" disabled={currentPage <= 1 || pageCount < 2} onClick={() => goToPage(currentPage - 1)}>Previous edit page</button><strong>{pageLabel(currentPage, pageCount)}</strong><button type="button" disabled={currentPage >= pageCount || pageCount < 2} onClick={() => goToPage(currentPage + 1)}>Next edit page</button></div><span className={`packet-edit-state ${dirty ? 'changed' : ''}`}>{status}</span><button className="packet-save-button" type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save DOCX changes' : 'Saved'}</button></div>
    <p className="docx-template-geometry-status"><strong>Template page setup</strong><span>{layoutLabel(layout)}</span></p>
    <div className="docx-format-toolbar" aria-label="Document formatting toolbar"><div className="docx-format-selection"><span>Selected paragraph</span><strong>{selected ? `Paragraph ${paragraphs.findIndex((item) => item.id === selected.id) + 1}` : 'Select text'}</strong></div><div className="docx-format-group docx-format-toggles"><button type="button" className={selected?.bold ? 'active' : ''} disabled={!selected} onClick={() => format({ bold: !selected?.bold })}><b>B</b></button><button type="button" className={selected?.italic ? 'active' : ''} disabled={!selected} onClick={() => format({ italic: !selected?.italic })}><i>I</i></button><button type="button" className={selected?.underline ? 'active' : ''} disabled={!selected} onClick={() => format({ underline: !selected?.underline })}><u>U</u></button></div><label className="docx-format-field"><span>Size</span><select disabled={!selected} value={selected?.fontSize || 8} onChange={(event) => format({ fontSize: Number(event.target.value) })}>{FONT_SIZES.map((size) => <option key={size} value={size}>{size} pt</option>)}</select></label><label className="docx-format-field color-field"><span>Color</span><input type="color" disabled={!selected} value={selected?.color || '#000000'} onChange={(event) => format({ color: event.target.value })} /></label><label className="docx-format-field"><span>Alignment</span><select disabled={!selected} value={selected?.alignment || 'left'} onChange={(event) => format({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label><label className="docx-format-field"><span>Line spacing</span><select disabled={!selected} value={selected?.lineSpacing || 1} onChange={(event) => format({ lineSpacing: Number(event.target.value) })}>{LINE_SPACING.map((spacing) => <option key={spacing} value={spacing}>{spacing}</option>)}</select></label><button type="button" className={selected?.pageBreakBefore ? 'active' : ''} disabled={!selected} onClick={() => format({ pageBreakBefore: !selected?.pageBreakBefore })}>New page before</button></div>
    {selected?.pageBreakBefore && <p className="docx-page-break-state">Selected paragraph will start on the next saved DOCX page.</p>}
    {oversizedPages.length > 0 && <p className="docx-page-oversized-alert" role="alert">A protected content block is larger than the printable area on page {oversizedPages.join(', ')}. Review or reduce that block before delivery.</p>}
    <div className="packet-edit-html-scroll"><div ref={host} className="packet-inline-docx-host strict-template-host" aria-label={`${label} style-resolved strict template DOCX canvas`} /></div>
  </article>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { paginateDocxPreview, readDocxPageLayout, type DocxPageLayout, type PreviewQuality } from '../lib/docx-preview-pagination';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { label: string; slotId: string; output: ReviewOutput; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const LINE_SPACING = [1, 1.15, 1.5, 2];
const CANVAS_FONT_PT = 7.35;
const CANVAS_RED_FONT_PT = 7.1;
const CANVAS_LINE_HEIGHT = 1.05;
const CANVAS_SPACING_PT = 3.25;
function fileName(output: ReviewOutput) { return output.path.split('/').pop() || 'document.docx'; }
function textOf(node: HTMLElement) { return (node.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); }
function pageLabel(page: number, total: number) { return total ? `Edit page ${page} of ${total}` : 'Preparing edit canvas'; }
function layoutLabel(layout: DocxPageLayout | null) { return layout ? `${layout.name} ${layout.orientation} · ${layout.widthIn}×${layout.heightIn}in · margins ${layout.marginTopIn}/${layout.marginRightIn}/${layout.marginBottomIn}/${layout.marginLeftIn}in` : 'Reading template page setup'; }
function isRedParagraph(paragraph: EditableParagraph) { return paragraph.color.toLowerCase() === '#ff0000' || /Pursuant to 15 USC|tradeline is the direct result/i.test(paragraph.text); }
function applyPreviewFormatting(node: HTMLElement, paragraph: EditableParagraph) {
  const red = isRedParagraph(paragraph);
  const fontSize = red ? CANVAS_RED_FONT_PT : CANVAS_FONT_PT;
  const spacing = red ? CANVAS_SPACING_PT + 0.75 : CANVAS_SPACING_PT;
  const color = red ? '#ff0000' : paragraph.color;
  node.style.setProperty('font-family', 'Arial, Helvetica, sans-serif', 'important');
  node.style.setProperty('font-size', `${fontSize}pt`, 'important');
  node.style.setProperty('line-height', String(CANVAS_LINE_HEIGHT), 'important');
  node.style.setProperty('margin-top', '0', 'important');
  node.style.setProperty('margin-bottom', `${spacing}pt`, 'important');
  node.style.setProperty('padding-top', '0', 'important');
  node.style.setProperty('padding-bottom', '0', 'important');
  node.style.setProperty('text-align', paragraph.alignment, 'important');
  node.style.setProperty('font-weight', paragraph.bold ? '700' : '400', 'important');
  node.style.setProperty('font-style', paragraph.italic ? 'italic' : 'normal', 'important');
  node.style.setProperty('text-decoration', paragraph.underline ? 'underline' : 'none', 'important');
  node.style.setProperty('color', color, 'important');
  node.style.setProperty('break-before', paragraph.pageBreakBefore ? 'page' : 'auto', 'important');
  if (paragraph.pageBreakBefore) node.classList.add('docx-edit-page-break-before'); else node.classList.remove('docx-edit-page-break-before');
  [node, ...Array.from(node.querySelectorAll<HTMLElement>('span'))].forEach((element) => {
    element.style.setProperty('font-family', 'Arial, Helvetica, sans-serif', 'important');
    element.style.setProperty('font-size', `${fontSize}pt`, 'important');
    element.style.setProperty('line-height', String(CANVAS_LINE_HEIGHT), 'important');
    element.style.setProperty('color', color, 'important');
  });
}
export default function MeasuredDocxEditorSection({ label, slotId, output, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const nodes = useRef<Map<string, HTMLElement>>(new Map());
  const pages = useRef<HTMLElement[]>([]);
  const [paragraphs, setParagraphs] = useState<EditableParagraph[]>([]);
  const [activeId, setActiveId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading editable DOCX canvas');
  const [quality, setQuality] = useState<PreviewQuality>('verified-pagination');
  const [qualityNotice, setQualityNotice] = useState('');
  const [layout, setLayout] = useState<DocxPageLayout | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [oversizedPages, setOversizedPages] = useState<number[]>([]);
  const selected = paragraphs.find((paragraph) => paragraph.id === activeId) || paragraphs[0];
  function goToPage(value: number) { const page = Math.max(1, Math.min(value, pages.current.length || 1)); pages.current[page - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setCurrentPage(page); }
  useEffect(() => {
    let live = true; let removeScroll: (() => void) | undefined;
    setDirty(false); setStatus('Loading editable DOCX canvas'); setQuality('verified-pagination'); setQualityNotice(''); setLayout(null); setCurrentPage(1); setPageCount(0); setOversizedPages([]); nodes.current.clear(); pages.current = [];
    void Promise.all([readEditableParagraphs(output.blob), readDocxPageLayout(output.blob), import('docx-preview')]).then(async ([items, templateLayout, renderer]) => {
      if (!live || !host.current) return;
      setLayout(templateLayout); setParagraphs(items); setActiveId(items[0]?.id || ''); host.current.innerHTML = '';
      host.current.dataset.docxCanvasMode = 'compact-template';
      await renderer.renderAsync(await output.blob.arrayBuffer(), host.current, undefined, { className: 'packet-inline-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: false, renderFooters: false });
      if (!live || !host.current) return;
      const paginated = paginateDocxPreview(host.current, templateLayout);
      pages.current = paginated.pages; setPageCount(paginated.pages.length || 1); setOversizedPages(paginated.oversizedPages); setQuality(paginated.quality); setQualityNotice(paginated.notice || '');
      const scrollRoot = host.current.closest<HTMLElement>('.packet-edit-html-scroll');
      if (scrollRoot && paginated.pages.length > 1) {
        const updatePage = () => { const top = scrollRoot.getBoundingClientRect().top + 80; const closest = paginated.pages.reduce((best, sheet, index) => { const distance = Math.abs(sheet.getBoundingClientRect().top - top); return distance < best.distance ? { page: index + 1, distance } : best; }, { page: 1, distance: Infinity }); setCurrentPage(closest.page); };
        scrollRoot.addEventListener('scroll', updatePage, { passive: true }); removeScroll = () => scrollRoot.removeEventListener('scroll', updatePage);
      }
      const paragraphScope = paginated.quality === 'native-fallback' ? '.packet-inline-docx p, .docx p' : '.measured-docx-content p';
      const renderedParagraphs = Array.from(host.current.querySelectorAll<HTMLElement>(paragraphScope)).filter((element) => Boolean(element.textContent?.trim()));
      items.forEach((item, index) => { const element = renderedParagraphs[index]; if (!element) return; nodes.current.set(item.id, element); element.contentEditable = 'true'; element.spellcheck = true; applyPreviewFormatting(element, item); element.addEventListener('focus', () => setActiveId(item.id)); element.addEventListener('input', () => { setDirty(true); setStatus('Unsaved DOCX edits'); setParagraphs((current) => current.map((entry) => entry.id === item.id ? { ...entry, text: textOf(element), dirty: true } : entry)); }); });
      setStatus('Editable DOCX canvas ready');
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
    {quality === 'native-fallback' && <p className="docx-preview-qa-notice" role="status">{qualityNotice || 'Native DOCX edit canvas is shown because measured pagination could not be verified without risking clipped content.'}</p>}
    <div className="docx-format-toolbar" aria-label="Document formatting toolbar"><div className="docx-format-selection"><span>Selected paragraph</span><strong>{selected ? `Paragraph ${paragraphs.findIndex((item) => item.id === selected.id) + 1}` : 'Select text'}</strong></div><div className="docx-format-group docx-format-toggles"><button type="button" className={selected?.bold ? 'active' : ''} disabled={!selected} onClick={() => format({ bold: !selected?.bold })}><b>B</b></button><button type="button" className={selected?.italic ? 'active' : ''} disabled={!selected} onClick={() => format({ italic: !selected?.italic })}><i>I</i></button><button type="button" className={selected?.underline ? 'active' : ''} disabled={!selected} onClick={() => format({ underline: !selected?.underline })}><u>U</u></button></div><label className="docx-format-field"><span>Size</span><select disabled={!selected} value={selected?.fontSize || 11} onChange={(event) => format({ fontSize: Number(event.target.value) })}>{FONT_SIZES.map((size) => <option key={size} value={size}>{size} pt</option>)}</select></label><label className="docx-format-field color-field"><span>Color</span><input type="color" disabled={!selected} value={selected?.color || '#111827'} onChange={(event) => format({ color: event.target.value })} /></label><label className="docx-format-field"><span>Alignment</span><select disabled={!selected} value={selected?.alignment || 'left'} onChange={(event) => format({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label><label className="docx-format-field"><span>Line spacing</span><select disabled={!selected} value={selected?.lineSpacing || 1.15} onChange={(event) => format({ lineSpacing: Number(event.target.value) })}>{LINE_SPACING.map((spacing) => <option key={spacing} value={spacing}>{spacing}</option>)}</select></label><button type="button" className={selected?.pageBreakBefore ? 'active' : ''} disabled={!selected} onClick={() => format({ pageBreakBefore: !selected?.pageBreakBefore })}>New page before</button></div>
    {selected?.pageBreakBefore && <p className="docx-page-break-state">Selected paragraph will start on the next saved DOCX page.</p>}
    {oversizedPages.length > 0 && <p className="docx-page-oversized-alert" role="alert">A protected content block is larger than the printable area on page {oversizedPages.join(', ')}. Review the original template layout or reduce that block before delivery.</p>}
    <div className="packet-edit-html-scroll"><div ref={host} className="packet-inline-docx-host" aria-label={`${label} editable DOCX canvas`} /></div>
  </article>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { paginateDocxPreview } from '../lib/docx-preview-pagination';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { label: string; slotId: string; output: ReviewOutput; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const LINE_SPACING = [1, 1.15, 1.5, 2];
function fileName(output: ReviewOutput) { return output.path.split('/').pop() || 'document.docx'; }
function textOf(node: HTMLElement) { return (node.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); }
function pageLabel(page: number, total: number) { return total ? `Page ${page} of ${total}` : 'Preparing pages'; }
function applyPreviewFormatting(node: HTMLElement, paragraph: EditableParagraph) {
  const properties: Array<[string, string]> = [['font-weight', paragraph.bold ? '700' : '400'], ['font-style', paragraph.italic ? 'italic' : 'normal'], ['text-decoration', paragraph.underline ? 'underline' : 'none'], ['color', paragraph.color], ['font-size', `${paragraph.fontSize}pt`]];
  node.style.setProperty('text-align', paragraph.alignment, 'important');
  node.style.setProperty('line-height', String(paragraph.lineSpacing), 'important');
  node.style.setProperty('margin-bottom', `${paragraph.spacingAfter}pt`, 'important');
  [node, ...Array.from(node.querySelectorAll<HTMLElement>('span'))].forEach((element) => properties.forEach(([name, value]) => element.style.setProperty(name, value, 'important')));
}
export default function MeasuredDocxEditorSection({ label, slotId, output, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const nodes = useRef<Map<string, HTMLElement>>(new Map());
  const pages = useRef<HTMLElement[]>([]);
  const [paragraphs, setParagraphs] = useState<EditableParagraph[]>([]);
  const [activeId, setActiveId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading document');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [oversizedPages, setOversizedPages] = useState<number[]>([]);
  const selected = paragraphs.find((paragraph) => paragraph.id === activeId) || paragraphs[0];
  function goToPage(value: number) { const page = Math.max(1, Math.min(value, pages.current.length || 1)); pages.current[page - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setCurrentPage(page); }
  useEffect(() => {
    let live = true; let removeScroll: (() => void) | undefined;
    setDirty(false); setStatus('Loading document'); setCurrentPage(1); setPageCount(0); setOversizedPages([]); nodes.current.clear(); pages.current = [];
    void Promise.all([readEditableParagraphs(output.blob), import('docx-preview')]).then(async ([items, renderer]) => {
      if (!live || !host.current) return;
      setParagraphs(items); setActiveId(items[0]?.id || ''); host.current.innerHTML = '';
      await renderer.renderAsync(await output.blob.arrayBuffer(), host.current, undefined, { className: 'packet-inline-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: false, renderFooters: false });
      if (!live || !host.current) return;
      const layout = paginateDocxPreview(host.current);
      pages.current = layout.pages; setPageCount(layout.pages.length || 1); setOversizedPages(layout.oversizedPages);
      const scrollRoot = host.current.closest<HTMLElement>('.packet-focus-scroll');
      if (scrollRoot && layout.pages.length > 1) {
        const updatePage = () => { const top = scrollRoot.getBoundingClientRect().top + 124; const closest = layout.pages.reduce((best, sheet, index) => { const distance = Math.abs(sheet.getBoundingClientRect().top - top); return distance < best.distance ? { page: index + 1, distance } : best; }, { page: 1, distance: Infinity }); setCurrentPage(closest.page); };
        scrollRoot.addEventListener('scroll', updatePage, { passive: true }); removeScroll = () => scrollRoot.removeEventListener('scroll', updatePage);
      }
      const renderedParagraphs = Array.from(host.current.querySelectorAll<HTMLElement>('.packet-inline-docx p')).filter((element) => Boolean(element.textContent?.trim()));
      items.forEach((item, index) => { const element = renderedParagraphs[index]; if (!element) return; nodes.current.set(item.id, element); element.contentEditable = 'true'; element.spellcheck = true; element.addEventListener('focus', () => setActiveId(item.id)); element.addEventListener('input', () => { setDirty(true); setStatus('Save to recalculate page layout'); setParagraphs((current) => current.map((entry) => entry.id === item.id ? { ...entry, text: textOf(element), dirty: true } : entry)); }); });
      setStatus('Paginated preview ready');
    }).catch((error: Error) => { if (live) setStatus(error.message); });
    return () => { live = false; removeScroll?.(); };
  }, [output.blob, label]);
  function format(change: Partial<EditableParagraph>) { if (!selected) return; const updated = { ...selected, ...change, dirty: true }; setParagraphs((current) => current.map((entry) => entry.id === selected.id ? updated : entry)); const node = nodes.current.get(selected.id); if (node) applyPreviewFormatting(node, updated); setDirty(true); setStatus('Save to recalculate page layout'); }
  async function save() { setSaving(true); setStatus('Saving'); try { const blob = await saveEditedParagraphs(output.blob, paragraphs); await onSave(output, new File([blob], fileName(output), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); setDirty(false); setStatus('Saved'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); } finally { setSaving(false); } }
  return <article className="packet-focus-section packet-stack-editable" data-slot={slotId}><div className="packet-document-toolbar"><div className="docx-page-navigation" aria-label="Document pages"><button type="button" disabled={currentPage <= 1 || pageCount < 2} onClick={() => goToPage(currentPage - 1)}>Previous page</button><strong>{pageLabel(currentPage, pageCount)}</strong><button type="button" disabled={currentPage >= pageCount || pageCount < 2} onClick={() => goToPage(currentPage + 1)}>Next page</button></div><span className={`packet-edit-state ${dirty ? 'changed' : ''}`}>{status}</span><button className="packet-save-button" type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button></div><div className="docx-format-toolbar" aria-label="Document formatting toolbar"><div className="docx-format-selection"><span>Selected paragraph</span><strong>{selected ? `Paragraph ${paragraphs.findIndex((item) => item.id === selected.id) + 1}` : 'Select text'}</strong></div><div className="docx-format-group docx-format-toggles"><button type="button" className={selected?.bold ? 'active' : ''} disabled={!selected} onClick={() => format({ bold: !selected?.bold })}><b>B</b></button><button type="button" className={selected?.italic ? 'active' : ''} disabled={!selected} onClick={() => format({ italic: !selected?.italic })}><i>I</i></button><button type="button" className={selected?.underline ? 'active' : ''} disabled={!selected} onClick={() => format({ underline: !selected?.underline })}><u>U</u></button></div><label className="docx-format-field"><span>Size</span><select disabled={!selected} value={selected?.fontSize || 11} onChange={(event) => format({ fontSize: Number(event.target.value) })}>{FONT_SIZES.map((size) => <option key={size} value={size}>{size} pt</option>)}</select></label><label className="docx-format-field color-field"><span>Color</span><input type="color" disabled={!selected} value={selected?.color || '#111827'} onChange={(event) => format({ color: event.target.value })} /></label><label className="docx-format-field"><span>Alignment</span><select disabled={!selected} value={selected?.alignment || 'left'} onChange={(event) => format({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label><label className="docx-format-field"><span>Line spacing</span><select disabled={!selected} value={selected?.lineSpacing || 1.15} onChange={(event) => format({ lineSpacing: Number(event.target.value) })}>{LINE_SPACING.map((spacing) => <option key={spacing} value={spacing}>{spacing}</option>)}</select></label></div>{oversizedPages.length > 0 && <p className="docx-page-oversized-alert" role="alert">An object cannot fit within the printable area on page {oversizedPages.join(', ')}. Resize it before delivery.</p>}<div ref={host} className="packet-inline-docx-host" aria-label={`${label} paginated preview`} /></article>;
}

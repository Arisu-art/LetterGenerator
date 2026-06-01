'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { applyExtraParagraphFormatting, type HighlightColor } from '../lib/docx-extra-format';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = {
  output: ReviewOutput;
  documents: ReviewOutput[];
  onSelect: (output: ReviewOutput) => void;
  onClose: () => void;
  onSave: (output: ReviewOutput, file: File) => void | Promise<void>;
};
type ExtraFormat = { fontSize?: number; highlight?: HighlightColor; pageBreakBefore?: boolean };

function newBlock(base?: EditableParagraph): EditableParagraph {
  return { id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`, originalIndex: null, templateIndex: base?.originalIndex ?? base?.templateIndex ?? null, text: '', bold: base?.bold ?? false, italic: base?.italic ?? false, underline: base?.underline ?? false, color: base?.color ?? '#111827', alignment: base?.alignment ?? 'left', lineSpacing: base?.lineSpacing ?? 1.15, spacingAfter: base?.spacingAfter ?? 8, dirty: true };
}
function displayedText(node: HTMLElement) { return (node.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); }
function highlightCss(value?: HighlightColor) { return value === 'yellow' ? '#fff19a' : value === 'green' ? '#cef0d4' : value === 'cyan' ? '#d5f3f7' : ''; }
function role(output: ReviewOutput) { return output.role === 'AFFIDAVIT' ? 'Affidavit' : output.role === 'FTC' ? 'FTC Report' : output.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter'; }
function order(output: ReviewOutput) { return output.sequence || (output.role === 'AFFIDAVIT' ? 4 : output.role === 'FTC' ? 6 : 1); }
function filename(output: ReviewOutput) { return output.path.split('/').pop() || 'document.docx'; }
function tagPages(host: HTMLDivElement) {
  const found = Array.from(host.querySelectorAll('section.simple-visual-docx, .simple-visual-docx.docx, .simple-visual-docx .docx')) as HTMLElement[];
  const pages = found.filter((page, index) => found.indexOf(page) === index && !page.querySelector('.docx'));
  const selected = pages.length ? pages : found;
  selected.forEach((page, index) => {
    page.classList.add('editor-page-sheet');
    page.dataset.pageNumber = String(index + 1);
    if (!page.querySelector(':scope > .page-boundary-label')) {
      const badge = document.createElement('span');
      badge.className = 'page-boundary-label';
      badge.textContent = `PAGE ${index + 1}`;
      badge.contentEditable = 'false';
      page.prepend(badge);
    }
  });
  return selected;
}

export default function SimpleDocxEditor({ output, documents, onSelect, onClose, onSave }: Props) {
  const [items, setItems] = useState<EditableParagraph[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [extras, setExtras] = useState<Record<string, ExtraFormat>>({});
  const [showGuides, setShowGuides] = useState(true);
  const [showRail, setShowRail] = useState(true);
  const [status, setStatus] = useState('Opening visual document...');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const visualHost = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0], [items, selectedId]);
  const selectedExtra = selected ? extras[selected.id] || {} : {};
  const orderedDocuments = useMemo(() => [...documents].sort((a, b) => a.bureau.localeCompare(b.bureau) || order(a) - order(b) || a.path.localeCompare(b.path)), [documents]);
  const currentFilename = filename(output);

  useEffect(() => {
    let active = true;
    nodes.current.clear();
    setExtras({});
    setDirty(false);
    setActivePage(1);
    setPageCount(1);
    setStatus('Opening visual document...');
    void Promise.all([readEditableParagraphs(output.blob), import('docx-preview')]).then(async ([paragraphs, visual]) => {
      if (!active || !visualHost.current) return;
      setItems(paragraphs);
      setSelectedId(paragraphs[0]?.id || '');
      visualHost.current.innerHTML = '';
      await visual.renderAsync(await output.blob.arrayBuffer(), visualHost.current, undefined, { className: 'simple-visual-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: false, renderFooters: false });
      if (!active || !visualHost.current) return;
      const pages = tagPages(visualHost.current);
      setPageCount(Math.max(1, pages.length));
      const visible = Array.from(visualHost.current.querySelectorAll('.simple-visual-docx p')).filter((node) => (node.textContent || '').trim().length > 0) as HTMLElement[];
      paragraphs.forEach((block, index) => {
        const node = visible[index];
        if (!node) return;
        node.dataset.blockId = block.id;
        node.contentEditable = 'true';
        node.spellcheck = true;
        node.setAttribute('role', 'textbox');
        node.setAttribute('aria-label', `Editable paragraph ${index + 1}`);
        node.addEventListener('focus', () => setSelectedId(block.id));
        node.addEventListener('input', () => { setDirty(true); setItems((current) => current.map((item) => item.id === block.id ? { ...item, text: displayedText(node), dirty: true } : item)); });
        nodes.current.set(block.id, node);
      });
      setStatus('Edit this document directly. Save before switching documents or downloading the package.');
    }).catch((error: Error) => { if (active) setStatus(error.message); });
    return () => { active = false; nodes.current.clear(); };
  }, [output.blob]);

  function syncPage() {
    const editor = stage.current;
    if (!editor) return;
    const pages = Array.from(editor.querySelectorAll<HTMLElement>('.editor-page-sheet'));
    if (!pages.length) return;
    const middle = editor.scrollTop + editor.clientHeight / 2;
    let current = 1;
    let distance = Number.POSITIVE_INFINITY;
    pages.forEach((page, index) => {
      const next = Math.abs(page.offsetTop + page.offsetHeight / 2 - middle);
      if (next < distance) { distance = next; current = index + 1; }
    });
    setActivePage(current);
  }
  function applyVisual(block: EditableParagraph, extra: ExtraFormat = extras[block.id] || {}) {
    const node = nodes.current.get(block.id);
    if (!node) return;
    node.style.color = block.color;
    node.style.fontWeight = block.bold ? '700' : '400';
    node.style.fontStyle = block.italic ? 'italic' : 'normal';
    node.style.textDecoration = block.underline ? 'underline' : 'none';
    node.style.textAlign = block.alignment;
    node.style.lineHeight = String(block.lineSpacing);
    node.style.marginBottom = `${block.spacingAfter}pt`;
    if (extra.fontSize !== undefined) node.style.fontSize = `${extra.fontSize}pt`;
    if (extra.highlight !== undefined) node.style.backgroundColor = highlightCss(extra.highlight);
    node.classList.toggle('manual-page-break', Boolean(extra.pageBreakBefore));
    node.dataset.pageBreakBefore = String(Boolean(extra.pageBreakBefore));
  }
  function patch(values: Partial<EditableParagraph>) {
    if (!selected) return;
    const updated = { ...selected, ...values, dirty: true };
    applyVisual(updated);
    setItems((all) => all.map((item) => item.id === selected.id ? updated : item));
    setDirty(true);
  }
  function patchExtra(values: ExtraFormat) {
    if (!selected) return;
    const updated = { ...(extras[selected.id] || {}), ...values };
    setExtras((all) => ({ ...all, [selected.id]: updated }));
    applyVisual(selected, updated);
    setDirty(true);
  }
  function add() {
    if (!selected) return;
    const index = items.findIndex((item) => item.id === selected.id);
    const item = newBlock(selected);
    const source = nodes.current.get(selected.id);
    if (source) {
      const added = source.cloneNode(false) as HTMLElement;
      added.dataset.blockId = item.id;
      added.contentEditable = 'true';
      added.innerText = 'New paragraph';
      added.addEventListener('focus', () => setSelectedId(item.id));
      added.addEventListener('input', () => { setDirty(true); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, text: displayedText(added), dirty: true } : entry)); });
      source.after(added);
      nodes.current.set(item.id, added);
      item.text = 'New paragraph';
      added.focus();
    }
    setItems((all) => [...all.slice(0, index + 1), item, ...all.slice(index + 1)]);
    setSelectedId(item.id);
    setDirty(true);
  }
  function remove() {
    if (!selected || items.length < 2) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    nodes.current.get(selected.id)?.remove();
    nodes.current.delete(selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id || '');
    setDirty(true);
  }
  async function editedBlob() {
    const base = await saveEditedParagraphs(output.blob, items);
    const extended = items.flatMap((item, position) => extras[item.id] ? [{ position, ...extras[item.id] }] : []);
    return applyExtraParagraphFormatting(base, extended);
  }
  async function save() {
    setBusy(true);
    setStatus('Saving document changes into the working package...');
    try {
      const blob = await editedBlob();
      await onSave(output, new File([blob], currentFilename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      setDirty(false);
      setStatus('Saved to package. Switch documents or download all editable DOCX files when ready.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setBusy(false); }
  }
  function switchDocument(next: ReviewOutput) {
    if (next.path === output.path) return;
    if (dirty && !window.confirm('This document has unsaved edits. Switch documents without saving?')) return;
    onSelect(next);
  }

  return <div className="simple-editor-backdrop"><section className="simple-editor-modal" role="dialog" aria-modal="true" aria-label={`Edit ${currentFilename}`}>
    <header className="simple-editor-header"><div><p className="eyebrow">Editable DOCX document</p><h2>{currentFilename}</h2><span>{output.bureau} - {role(output)} · Document order {String(order(output)).padStart(2, '0')} · Page {activePage} of {pageCount}</span></div><div><button className="save-edits" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Saving...' : dirty ? 'Save to Package' : 'Saved'}</button><button className="close-editor" onClick={onClose} aria-label="Close editor">×</button></div></header>
    <div className="editor-view-switch document-mode"><strong>Edit DOCX</strong><span>Lightweight document editing only · final PDF packets are created from Outputs when requested</span></div>
    <div className="simple-editor-toolbar" aria-label="Text and paragraph formatting"><button className={selected?.bold ? 'active' : ''} onClick={() => patch({ bold: !selected?.bold })} title="Bold"><strong>B</strong></button><button className={selected?.italic ? 'active' : ''} onClick={() => patch({ italic: !selected?.italic })} title="Italic"><em>I</em></button><button className={selected?.underline ? 'active' : ''} onClick={() => patch({ underline: !selected?.underline })} title="Underline"><u>U</u></button><input type="color" aria-label="Text color" value={selected?.color || '#111827'} onChange={(event) => patch({ color: event.target.value })} /><select aria-label="Font size" value={selectedExtra.fontSize || ''} onChange={(event) => event.target.value && patchExtra({ fontSize: Number(event.target.value) })}><option value="">Text size</option><option value="9">9 pt</option><option value="10">10 pt</option><option value="11">11 pt</option><option value="12">12 pt</option><option value="14">14 pt</option><option value="16">16 pt</option></select><select aria-label="Alignment" value={selected?.alignment || 'left'} onChange={(event) => patch({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select><select aria-label="Line spacing" value={selected?.lineSpacing || 1.15} onChange={(event) => patch({ lineSpacing: Number(event.target.value) })}><option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">Double</option></select><select aria-label="Paragraph spacing" value={selected?.spacingAfter ?? 8} onChange={(event) => patch({ spacingAfter: Number(event.target.value) })}><option value="0">No gap</option><option value="6">6 pt after</option><option value="8">8 pt after</option><option value="12">12 pt after</option><option value="18">18 pt after</option></select><select aria-label="Highlight" value={selectedExtra.highlight || 'none'} onChange={(event) => patchExtra({ highlight: event.target.value as HighlightColor })}><option value="none">No highlight</option><option value="yellow">Yellow highlight</option><option value="green">Green highlight</option><option value="cyan">Blue highlight</option></select><button className={selectedExtra.pageBreakBefore ? 'active utility' : 'utility'} onClick={() => patchExtra({ pageBreakBefore: !selectedExtra.pageBreakBefore })}>Page break before</button><button className={`utility guide-toggle ${showGuides ? 'active' : ''}`} onClick={() => setShowGuides((value) => !value)}>{showGuides ? 'Page guides: On' : 'Page guides: Off'}</button><button className={`utility guide-toggle ${showRail ? 'active' : ''}`} onClick={() => setShowRail((value) => !value)}>{showRail ? 'Documents: On' : 'Documents: Off'}</button><button className="utility" onClick={add}>Add paragraph</button><button className="utility" onClick={remove}>Delete paragraph</button></div>
    <div className="simple-editor-status" role="status">{status}</div>
    <div className={`simple-editor-body ${showRail ? 'with-packet-map' : ''}`}>{showRail && <aside className="editor-packet-map document-rail"><header><p className="eyebrow">Editable documents</p><h3>Generated DOCX</h3><span>Switch among editable documents. Save changes before switching.</span></header><ol>{orderedDocuments.map((document) => <li className={document.path === output.path ? 'current editable' : 'editable'} key={document.path}><button type="button" onClick={() => switchDocument(document)}><b>{String(order(document)).padStart(2, '0')}</b><div><strong>{role(document)}</strong><small>{document.bureau}{document.path === output.path ? ` · Page ${activePage}/${pageCount}` : ''}</small></div></button></li>)}</ol><p className="map-instruction">Use Outputs to download all DOCX files or create final PDFs only after edits are saved.</p></aside>}<div ref={stage} onScroll={syncPage} className={`simple-editor-stage ${showGuides ? 'show-page-guides' : ''}`}><div ref={visualHost} className="simple-editor-visual-host" /></div></div>
  </section></div>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { applyExtraParagraphFormatting, type HighlightColor } from '../lib/docx-extra-format';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';
import type { FinalPdfPacket } from './PdfPacketPreview';

type Props = {
  output: ReviewOutput;
  onClose: () => void;
  onSave: (output: ReviewOutput, file: File) => void | Promise<void>;
  onPreviewPacket?: (output: ReviewOutput, pendingBlob: Blob) => Promise<FinalPdfPacket>;
};
type ExtraFormat = { fontSize?: number; highlight?: HighlightColor; pageBreakBefore?: boolean };
type EditorView = 'EDIT' | 'PACKET';

function newBlock(base?: EditableParagraph): EditableParagraph {
  return { id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`, originalIndex: null, templateIndex: base?.originalIndex ?? base?.templateIndex ?? null, text: '', bold: base?.bold ?? false, italic: base?.italic ?? false, underline: base?.underline ?? false, color: base?.color ?? '#111827', alignment: base?.alignment ?? 'left', lineSpacing: base?.lineSpacing ?? 1.15, spacingAfter: base?.spacingAfter ?? 8, dirty: true };
}
function displayedText(node: HTMLElement) {
  return (node.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
function highlightCss(highlight?: HighlightColor) {
  if (highlight === 'yellow') return '#fff19a';
  if (highlight === 'green') return '#cef0d4';
  if (highlight === 'cyan') return '#d5f3f7';
  return '';
}
function documentRole(output: ReviewOutput) {
  if (output.role === 'AFFIDAVIT') return 'Affidavit';
  if (output.role === 'FTC') return 'FTC Identity Theft Report';
  return output.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter';
}
function stepNumber(step: string) {
  const match = step.match(/^\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}
function tagPageSheets(host: HTMLDivElement) {
  const found = Array.from(host.querySelectorAll('section.simple-visual-docx, .simple-visual-docx.docx, .simple-visual-docx .docx')) as HTMLElement[];
  const pages = found.filter((page, index) => found.indexOf(page) === index && !page.closest('.simple-visual-docx .docx')?.contains(page.parentElement));
  (pages.length ? pages : found).forEach((page, index) => {
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
}

export default function SimpleDocxEditor({ output, onClose, onSave, onPreviewPacket }: Props) {
  const [items, setItems] = useState<EditableParagraph[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [extras, setExtras] = useState<Record<string, ExtraFormat>>({});
  const [showGuides, setShowGuides] = useState(true);
  const [showPacketOrder, setShowPacketOrder] = useState(true);
  const [view, setView] = useState<EditorView>('EDIT');
  const [preview, setPreview] = useState<FinalPdfPacket | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [status, setStatus] = useState('Opening visual document...');
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const visualHost = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0], [items, selectedId]);
  const selectedExtra = selected ? extras[selected.id] || {} : {};
  const filename = output.path.split('/').pop() || 'document.docx';
  const packetSteps = output.packetSteps || (output.type === 'DISPUTE' ? ['01 Dispute Letter', '02 Supporting Documents', '03 FCRA', '04 Affidavit', '05 Attachment', '06 FTC'] : ['01 Late Payment Letter', '02 Supporting Documents']);
  const currentSequence = output.sequence || 1;

  useEffect(() => {
    let active = true;
    nodes.current.clear();
    setExtras({});
    setPreview(null);
    setView('EDIT');
    setStatus('Opening visual document...');
    void Promise.all([readEditableParagraphs(output.blob), import('docx-preview')]).then(async ([paragraphs, visual]) => {
      if (!active || !visualHost.current) return;
      setItems(paragraphs);
      setSelectedId(paragraphs[0]?.id || '');
      visualHost.current.innerHTML = '';
      await visual.renderAsync(await output.blob.arrayBuffer(), visualHost.current, undefined, { className: 'simple-visual-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: false, renderFooters: false });
      if (!active || !visualHost.current) return;
      tagPageSheets(visualHost.current);
      const visibleParagraphs = Array.from(visualHost.current.querySelectorAll('.simple-visual-docx p')).filter((node) => (node.textContent || '').trim().length > 0) as HTMLElement[];
      paragraphs.forEach((block, index) => {
        const node = visibleParagraphs[index];
        if (!node) return;
        node.dataset.blockId = block.id;
        node.contentEditable = 'true';
        node.spellcheck = true;
        node.setAttribute('role', 'textbox');
        node.setAttribute('aria-label', `Editable paragraph ${index + 1}`);
        node.addEventListener('focus', () => setSelectedId(block.id));
        node.addEventListener('input', () => setItems((current) => current.map((item) => item.id === block.id ? { ...item, text: displayedText(node), dirty: true } : item)));
        nodes.current.set(block.id, node);
      });
      setStatus('Edit this DOCX or open Complete Packet Preview to see Supporting Documents and PDF inserts merged in final order.');
    }).catch((error: Error) => { if (active) setStatus(error.message); });
    return () => { active = false; nodes.current.clear(); };
  }, [output.blob]);
  useEffect(() => {
    if (!preview) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(preview.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

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
    setPreview(null);
  }
  function patchExtra(values: ExtraFormat) {
    if (!selected) return;
    const updated = { ...(extras[selected.id] || {}), ...values };
    setExtras((all) => ({ ...all, [selected.id]: updated }));
    applyVisual(selected, updated);
    setPreview(null);
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
      added.addEventListener('input', () => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, text: displayedText(added), dirty: true } : entry)));
      source.after(added);
      nodes.current.set(item.id, added);
      item.text = 'New paragraph';
      added.focus();
    }
    setItems((all) => [...all.slice(0, index + 1), item, ...all.slice(index + 1)]);
    setSelectedId(item.id);
    setPreview(null);
  }
  function remove() {
    if (!selected || items.length < 2) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    nodes.current.get(selected.id)?.remove();
    nodes.current.delete(selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id || '');
    setPreview(null);
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
      await onSave(output, new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      setStatus('Saved. Open Complete Packet Preview to verify all ordered pages before downloading.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    } finally { setBusy(false); }
  }
  async function previewCompletePacket() {
    if (!onPreviewPacket) return;
    setPreviewBusy(true);
    setStatus('Building complete packet preview with the current document edits...');
    try {
      const packet = await onPreviewPacket(output, await editedBlob());
      setPreview(packet);
      setView('PACKET');
      setStatus('Complete packet preview loaded. All ordered pages are shown together below; return to Edit DOCX to make changes.');
    } catch (error) {
      setPreview(null);
      setStatus(error instanceof Error ? error.message : 'Complete packet preview could not be prepared.');
    } finally { setPreviewBusy(false); }
  }

  return <div className="simple-editor-backdrop"><section className="simple-editor-modal" role="dialog" aria-modal="true" aria-label={`Edit ${filename}`}>
    <header className="simple-editor-header"><div><p className="eyebrow">{view === 'EDIT' ? 'Editable DOCX component' : 'Complete packet preview'}</p><h2>{filename}</h2><span>{output.bureau} - {documentRole(output)} · Packet position {String(currentSequence).padStart(2, '0')}</span></div><div><button className="save-edits" disabled={busy || view === 'PACKET'} onClick={() => void save()}>{busy ? 'Saving...' : 'Save to Package'}</button><button className="close-editor" onClick={onClose} aria-label="Close editor">×</button></div></header>
    <div className="editor-view-switch" aria-label="Document review modes"><button className={view === 'EDIT' ? 'active' : ''} onClick={() => setView('EDIT')}>Edit DOCX</button><button className={view === 'PACKET' ? 'active' : ''} disabled={!onPreviewPacket || previewBusy} onClick={() => void previewCompletePacket()}>{previewBusy ? 'Building packet...' : 'Complete Packet Preview'}</button><span>{view === 'PACKET' ? 'Read-only merged packet view' : 'Edit the selected DOCX component'}</span></div>
    {view === 'EDIT' ? <div className="simple-editor-toolbar" aria-label="Text and paragraph formatting"><button className={selected?.bold ? 'active' : ''} onClick={() => patch({ bold: !selected?.bold })} title="Bold"><strong>B</strong></button><button className={selected?.italic ? 'active' : ''} onClick={() => patch({ italic: !selected?.italic })} title="Italic"><em>I</em></button><button className={selected?.underline ? 'active' : ''} onClick={() => patch({ underline: !selected?.underline })} title="Underline"><u>U</u></button><input type="color" aria-label="Text color" value={selected?.color || '#111827'} onChange={(event) => patch({ color: event.target.value })} /><select aria-label="Font size" value={selectedExtra.fontSize || ''} onChange={(event) => event.target.value && patchExtra({ fontSize: Number(event.target.value) })}><option value="">Text size</option><option value="9">9 pt</option><option value="10">10 pt</option><option value="11">11 pt</option><option value="12">12 pt</option><option value="14">14 pt</option><option value="16">16 pt</option></select><select aria-label="Alignment" value={selected?.alignment || 'left'} onChange={(event) => patch({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select><select aria-label="Line spacing" value={selected?.lineSpacing || 1.15} onChange={(event) => patch({ lineSpacing: Number(event.target.value) })}><option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">Double</option></select><select aria-label="Paragraph spacing" value={selected?.spacingAfter ?? 8} onChange={(event) => patch({ spacingAfter: Number(event.target.value) })}><option value="0">No gap</option><option value="6">6 pt after</option><option value="8">8 pt after</option><option value="12">12 pt after</option><option value="18">18 pt after</option></select><select aria-label="Highlight" value={selectedExtra.highlight || 'none'} onChange={(event) => patchExtra({ highlight: event.target.value as HighlightColor })}><option value="none">No highlight</option><option value="yellow">Yellow highlight</option><option value="green">Green highlight</option><option value="cyan">Blue highlight</option></select><button className={selectedExtra.pageBreakBefore ? 'active utility' : 'utility'} onClick={() => patchExtra({ pageBreakBefore: !selectedExtra.pageBreakBefore })} title="Start selected paragraph on next page">Page break before</button><button className={`utility guide-toggle ${showGuides ? 'active' : ''}`} onClick={() => setShowGuides((value) => !value)}>{showGuides ? 'Page guides: On' : 'Page guides: Off'}</button><button className={`utility guide-toggle ${showPacketOrder ? 'active' : ''}`} onClick={() => setShowPacketOrder((value) => !value)}>{showPacketOrder ? 'Packet map: On' : 'Packet map: Off'}</button><button className="utility" onClick={add}>Add paragraph</button><button className="utility" onClick={remove}>Delete paragraph</button></div> : <div className="packet-preview-toolbar"><strong>Read-only complete packet</strong><span>The preview includes the current unsaved DOCX changes plus Supporting Documents, static PDF pages and other generated DOCX pages in order.</span><button onClick={() => setView('EDIT')}>Return to Editing</button></div>}
    <div className="simple-editor-status" role="status">{status}</div>
    <div className={`simple-editor-body ${showPacketOrder ? 'with-packet-map' : ''}`}>{showPacketOrder && <aside className="editor-packet-map"><header><p className="eyebrow">Final PDF order</p><h3>{output.type === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</h3><span>{view === 'PACKET' ? 'All pages are displayed together in the preview.' : 'Open Complete Packet Preview to display every page together before download.'}</span></header><ol>{packetSteps.map((step) => { const number = stepNumber(step); const isCurrent = number === currentSequence; const editable = /Letter|Affidavit|FTC/i.test(step); return <li className={`${isCurrent ? 'current' : ''} ${editable ? 'editable' : 'static'}`} key={step}><b>{String(number).padStart(2, '0')}</b><div><strong>{step.replace(/^\s*\d+\s*/, '')}</strong><small>{isCurrent && view === 'EDIT' ? 'Editing now' : editable ? 'Editable DOCX component' : 'Merged/static page'}</small></div></li>; })}</ol><p className="map-instruction">{view === 'PACKET' ? 'Inspect each PDF page here, then return to editing when a correction is needed.' : 'Save to Package after correcting this DOCX. Complete Packet Preview does not download or change static documents.'}</p></aside>}{view === 'EDIT' ? <div className={`simple-editor-stage ${showGuides ? 'show-page-guides' : ''}`}><div ref={visualHost} className="simple-editor-visual-host" /></div> : <div className="editor-complete-packet-preview">{previewUrl ? <iframe title="Complete packet preview before download" src={previewUrl} /> : <div className="preview-loading">Building the complete packet preview...</div>}</div>}</div>
  </section></div>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { applyExtraParagraphFormatting, type HighlightColor } from '../lib/docx-extra-format';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { output: ReviewOutput; onClose: () => void; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };
type ExtraFormat = { fontSize?: number; highlight?: HighlightColor; pageBreakBefore?: boolean };

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

export default function SimpleDocxEditor({ output, onClose, onSave }: Props) {
  const [items, setItems] = useState<EditableParagraph[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [extras, setExtras] = useState<Record<string, ExtraFormat>>({});
  const [status, setStatus] = useState('Opening visual document…');
  const [busy, setBusy] = useState(false);
  const visualHost = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0], [items, selectedId]);
  const selectedExtra = selected ? extras[selected.id] || {} : {};
  const filename = output.path.split('/').pop() || 'letter.docx';

  useEffect(() => {
    let active = true;
    nodes.current.clear();
    setExtras({});
    setStatus('Opening visual document…');
    void Promise.all([readEditableParagraphs(output.blob), import('docx-preview')]).then(async ([paragraphs, preview]) => {
      if (!active || !visualHost.current) return;
      setItems(paragraphs);
      setSelectedId(paragraphs[0]?.id || '');
      visualHost.current.innerHTML = '';
      await preview.renderAsync(await output.blob.arrayBuffer(), visualHost.current, undefined, { className: 'simple-visual-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: false, renderFooters: false });
      if (!active || !visualHost.current) return;
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
      setStatus('Edit directly on the document. Select text blocks and apply formatting from the toolbar.');
    }).catch((error: Error) => { if (active) setStatus(error.message); });
    return () => { active = false; nodes.current.clear(); };
  }, [output.blob]);

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
    if (extra.pageBreakBefore !== undefined) node.dataset.pageBreakBefore = String(extra.pageBreakBefore);
  }
  function patch(values: Partial<EditableParagraph>) {
    if (!selected) return;
    const updated = { ...selected, ...values, dirty: true };
    applyVisual(updated);
    setItems((all) => all.map((item) => item.id === selected.id ? updated : item));
  }
  function patchExtra(values: ExtraFormat) {
    if (!selected) return;
    const updated = { ...(extras[selected.id] || {}), ...values };
    setExtras((all) => ({ ...all, [selected.id]: updated }));
    applyVisual(selected, updated);
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
  }
  function remove() {
    if (!selected || items.length < 2) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    nodes.current.get(selected.id)?.remove();
    nodes.current.delete(selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id || '');
  }
  async function save() {
    setBusy(true);
    setStatus('Saving document changes into the ZIP package…');
    try {
      const base = await saveEditedParagraphs(output.blob, items);
      const extended = items.flatMap((item, position) => extras[item.id] ? [{ position, ...extras[item.id] }] : []);
      const blob = await applyExtraParagraphFormatting(base, extended);
      await onSave(output, new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      setStatus('Saved. This edited DOCX is now included in the package.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    } finally { setBusy(false); }
  }

  return <div className="simple-editor-backdrop"><section className="simple-editor-modal" role="dialog" aria-modal="true" aria-label={`Edit ${filename}`}><header className="simple-editor-header"><div><p className="eyebrow">Simple document editor</p><h2>{filename}</h2><span>{output.bureau} · {output.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter'}</span></div><div><button className="save-edits" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to Package'}</button><button className="close-editor" onClick={onClose} aria-label="Close editor">×</button></div></header><div className="simple-editor-toolbar" aria-label="Text and paragraph formatting"><button className={selected?.bold ? 'active' : ''} onClick={() => patch({ bold: !selected?.bold })} title="Bold"><strong>B</strong></button><button className={selected?.italic ? 'active' : ''} onClick={() => patch({ italic: !selected?.italic })} title="Italic"><em>I</em></button><button className={selected?.underline ? 'active' : ''} onClick={() => patch({ underline: !selected?.underline })} title="Underline"><u>U</u></button><input type="color" aria-label="Text color" value={selected?.color || '#111827'} onChange={(event) => patch({ color: event.target.value })} /><select aria-label="Font size" value={selectedExtra.fontSize || ''} onChange={(event) => event.target.value && patchExtra({ fontSize: Number(event.target.value) })}><option value="">Text size</option><option value="9">9 pt</option><option value="10">10 pt</option><option value="11">11 pt</option><option value="12">12 pt</option><option value="14">14 pt</option><option value="16">16 pt</option></select><select aria-label="Alignment" value={selected?.alignment || 'left'} onChange={(event) => patch({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select><select aria-label="Line spacing" value={selected?.lineSpacing || 1.15} onChange={(event) => patch({ lineSpacing: Number(event.target.value) })}><option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">Double</option></select><select aria-label="Paragraph spacing" value={selected?.spacingAfter ?? 8} onChange={(event) => patch({ spacingAfter: Number(event.target.value) })}><option value="0">No gap</option><option value="6">6 pt after</option><option value="8">8 pt after</option><option value="12">12 pt after</option><option value="18">18 pt after</option></select><select aria-label="Highlight" value={selectedExtra.highlight || 'none'} onChange={(event) => patchExtra({ highlight: event.target.value as HighlightColor })}><option value="none">No highlight</option><option value="yellow">Yellow highlight</option><option value="green">Green highlight</option><option value="cyan">Blue highlight</option></select><button className={selectedExtra.pageBreakBefore ? 'active utility' : 'utility'} onClick={() => patchExtra({ pageBreakBefore: !selectedExtra.pageBreakBefore })} title="Move this paragraph to the start of the next page">Page break before</button><button className="utility" onClick={add}>Add paragraph</button><button className="utility" onClick={remove}>Delete paragraph</button></div><div className="simple-editor-status" role="status">{status}</div><div className="simple-editor-stage"><div ref={visualHost} className="simple-editor-visual-host" /></div></section></div>;
}

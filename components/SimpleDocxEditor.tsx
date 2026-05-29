'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { output: ReviewOutput; onClose: () => void; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };

function newBlock(base?: EditableParagraph): EditableParagraph {
  return { id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`, originalIndex: null, templateIndex: base?.originalIndex ?? base?.templateIndex ?? null, text: '', bold: base?.bold ?? false, italic: base?.italic ?? false, underline: base?.underline ?? false, color: base?.color ?? '#111827', alignment: base?.alignment ?? 'left', lineSpacing: base?.lineSpacing ?? 1.15, spacingAfter: base?.spacingAfter ?? 8, dirty: true };
}
function displayedText(node: HTMLElement) {
  return (node.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export default function SimpleDocxEditor({ output, onClose, onSave }: Props) {
  const [items, setItems] = useState<EditableParagraph[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('Opening visual document…');
  const [busy, setBusy] = useState(false);
  const visualHost = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0], [items, selectedId]);
  const filename = output.path.split('/').pop() || 'letter.docx';

  useEffect(() => {
    let active = true;
    nodes.current.clear();
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
      setStatus('Edit directly on the rendered document. Toolbar changes apply to the selected paragraph.');
    }).catch((error: Error) => { if (active) setStatus(error.message); });
    return () => { active = false; nodes.current.clear(); };
  }, [output.blob]);

  function applyVisual(block: EditableParagraph) {
    const node = nodes.current.get(block.id);
    if (!node) return;
    node.style.color = block.color;
    node.style.fontWeight = block.bold ? '700' : '400';
    node.style.fontStyle = block.italic ? 'italic' : 'normal';
    node.style.textDecoration = block.underline ? 'underline' : 'none';
    node.style.textAlign = block.alignment;
    node.style.lineHeight = String(block.lineSpacing);
    node.style.marginBottom = `${block.spacingAfter}pt`;
  }
  function patch(values: Partial<EditableParagraph>) {
    if (!selected) return;
    const updated = { ...selected, ...values, dirty: true };
    applyVisual(updated);
    setItems((all) => all.map((item) => item.id === selected.id ? updated : item));
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
    setStatus('Saving visual document changes into the ZIP package…');
    try {
      const blob = await saveEditedParagraphs(output.blob, items);
      await onSave(output, new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      setStatus('Saved. This edited DOCX is now included in the package.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    } finally { setBusy(false); }
  }

  return <div className="simple-editor-backdrop"><section className="simple-editor-modal" role="dialog" aria-modal="true" aria-label={`Edit ${filename}`}><header className="simple-editor-header"><div><p className="eyebrow">Simple document editor</p><h2>{filename}</h2><span>{output.bureau} · {output.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter'}</span></div><div><button className="save-edits" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to Package'}</button><button className="close-editor" onClick={onClose} aria-label="Close editor">×</button></div></header><div className="simple-editor-toolbar"><button className={selected?.bold ? 'active' : ''} onClick={() => patch({ bold: !selected?.bold })}><strong>B</strong></button><button className={selected?.italic ? 'active' : ''} onClick={() => patch({ italic: !selected?.italic })}><em>I</em></button><button className={selected?.underline ? 'active' : ''} onClick={() => patch({ underline: !selected?.underline })}><u>U</u></button><input type="color" aria-label="Text color" value={selected?.color || '#111827'} onChange={(event) => patch({ color: event.target.value })} /><select aria-label="Alignment" value={selected?.alignment || 'left'} onChange={(event) => patch({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select><select aria-label="Line spacing" value={selected?.lineSpacing || 1.15} onChange={(event) => patch({ lineSpacing: Number(event.target.value) })}><option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">Double</option></select><button className="utility" onClick={add}>Add paragraph</button><button className="utility" onClick={remove}>Delete paragraph</button></div><div className="simple-editor-status" role="status">{status}</div><div className="simple-editor-stage"><div ref={visualHost} className="simple-editor-visual-host" /></div></section></div>;
}

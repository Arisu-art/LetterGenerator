'use client';

import { useEffect, useMemo, useState } from 'react';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { output: ReviewOutput; onClose: () => void; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };

function newBlock(base?: EditableParagraph): EditableParagraph {
  return { id: `new-${Date.now()}`, originalIndex: null, templateIndex: base?.originalIndex ?? null, text: '', bold: base?.bold ?? false, italic: base?.italic ?? false, underline: base?.underline ?? false, color: base?.color ?? '#111827', alignment: base?.alignment ?? 'left', lineSpacing: base?.lineSpacing ?? 1.15, spacingAfter: base?.spacingAfter ?? 8, dirty: true };
}

export default function SimpleDocxEditor({ output, onClose, onSave }: Props) {
  const [items, setItems] = useState<EditableParagraph[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('Opening document…');
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0], [items, selectedId]);
  const filename = output.path.split('/').pop() || 'letter.docx';

  useEffect(() => { void readEditableParagraphs(output.blob).then((next) => { setItems(next); setSelectedId(next[0]?.id || ''); setStatus('Edit text and paragraph formatting, then save to the package.'); }).catch((error: Error) => setStatus(error.message)); }, [output.blob]);
  function patch(values: Partial<EditableParagraph>) { if (selected) setItems((all) => all.map((item) => item.id === selected.id ? { ...item, ...values, dirty: true } : item)); }
  function text(id: string, value: string) { setItems((all) => all.map((item) => item.id === id ? { ...item, text: value, dirty: true } : item)); }
  function add() { const index = selected ? items.findIndex((item) => item.id === selected.id) : items.length - 1; const item = newBlock(selected); setItems([...items.slice(0, index + 1), item, ...items.slice(index + 1)]); setSelectedId(item.id); }
  function remove() { if (!selected || items.length < 2) return; const remaining = items.filter((item) => item.id !== selected.id); setItems(remaining); setSelectedId(remaining[0].id); }
  async function save() { setBusy(true); try { const blob = await saveEditedParagraphs(output.blob, items); await onSave(output, new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); setStatus('Saved. This edited document is now in the package.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); } finally { setBusy(false); } }

  return <div className="simple-editor-backdrop"><section className="simple-editor-modal"><header className="simple-editor-header"><div><p className="eyebrow">Simple document editor</p><h2>{filename}</h2><span>{output.bureau} · {output.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter'}</span></div><div><button className="save-edits" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to Package'}</button><button className="close-editor" onClick={onClose}>×</button></div></header><div className="simple-editor-toolbar"><button className={selected?.bold ? 'active' : ''} onClick={() => patch({ bold: !selected?.bold })}><strong>B</strong></button><button className={selected?.italic ? 'active' : ''} onClick={() => patch({ italic: !selected?.italic })}><em>I</em></button><button className={selected?.underline ? 'active' : ''} onClick={() => patch({ underline: !selected?.underline })}><u>U</u></button><input type="color" aria-label="Text color" value={selected?.color || '#111827'} onChange={(event) => patch({ color: event.target.value })} /><select value={selected?.alignment || 'left'} onChange={(event) => patch({ alignment: event.target.value as ParagraphAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select><select value={selected?.lineSpacing || 1.15} onChange={(event) => patch({ lineSpacing: Number(event.target.value) })}><option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">Double</option></select><button className="utility" onClick={add}>Add paragraph</button><button className="utility" onClick={remove}>Delete paragraph</button></div><div className="simple-editor-status">{status}</div><div className="simple-editor-stage"><article className="simple-editor-page">{items.map((item) => <textarea key={item.id} className={`simple-editor-paragraph ${item.id === selected?.id ? 'selected' : ''}`} value={item.text} rows={Math.max(1, item.text.split('\n').length)} onFocus={() => setSelectedId(item.id)} onChange={(event) => text(item.id, event.target.value)} style={{ color: item.color, fontWeight: item.bold ? 700 : 400, fontStyle: item.italic ? 'italic' : 'normal', textDecoration: item.underline ? 'underline' : 'none', textAlign: item.alignment, lineHeight: item.lineSpacing, marginBottom: `${item.spacingAfter}px` }} />)}</article></div></section></div>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { readEditableParagraphs, saveEditedParagraphs, type EditableParagraph, type ParagraphAlignment } from '../lib/simple-docx-editor';
import { loadTemplateExhibits } from '../lib/template-exhibits';
import { getPacketPositions, isFtcEnabled } from '../lib/workflow-framework';
import type { PacketAssets } from '../lib/packet-assets';
import PacketInsertViewer from './PacketInsertViewer';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = {
  round: string;
  output: ReviewOutput;
  documents: ReviewOutput[];
  initialDocumentPath?: string;
  evidenceKey?: string;
  evidence?: PacketAssets;
  warnings?: string[];
  onEvidenceChanged?: (assets: PacketAssets) => void;
  onMessage?: (message: string) => void;
  onClose: () => void;
  onSave: (output: ReviewOutput, file: File) => void | Promise<void>;
};

type SlotId = 'LETTER' | 'SUPPORTING' | 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';

type Slot = {
  id: SlotId;
  number: number;
  label: string;
  document?: ReviewOutput;
  configured?: boolean;
  message: string;
};

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const LINE_SPACING = [1, 1.15, 1.5, 2];

function fileName(output: ReviewOutput) {
  return output.path.split('/').pop() || 'document.docx';
}

function roleOf(output: ReviewOutput) {
  return output.role || 'LETTER';
}

function textOf(node: HTMLElement) {
  return (node.innerText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stateOf(slot: Slot) {
  if (slot.document) return 'Editable DOCX';
  if (slot.id === 'SUPPORTING') return 'Evidence layout';
  return slot.configured ? 'Configured' : 'Not generated';
}

function slotForDocument(path: string | undefined, documents: ReviewOutput[]): SlotId {
  const role = documents.find((document) => document.path === path)?.role;

  if (role === 'AFFIDAVIT') return 'AFFIDAVIT';
  if (role === 'FTC') return 'FTC';

  return 'LETTER';
}

function missingReason(slot: Slot, warnings: string[]) {
  if (slot.id === 'AFFIDAVIT') {
    return warnings.find((message) => /^Affidavit\s*:/i.test(message)) ||
      'Affidavit document was not generated. Review the Affidavit template mapping and source data, then regenerate documents.';
  }

  if (slot.id === 'FTC') {
    return warnings.find((message) => /^FTC\s*:/i.test(message)) ||
      'FTC Identity Theft Report was not generated. Confirm the FTC template is uploaded and source data is loaded, then regenerate documents.';
  }

  return slot.message || 'No generated document for this packet position.';
}

function ensureFtcEditorSlot(slots: Slot[], ftc?: ReviewOutput, ftcConfigured?: boolean): Slot[] {
  const normalized = [...slots];

  if (normalized.some((slot) => slot.id === 'FTC')) {
    return normalized.sort((a, b) => a.number - b.number);
  }

  normalized.push({
    id: 'FTC',
        number: 6,
        label: 'FTC Identity Theft Report',
    document: ftc,
    configured: Boolean(ftc || ftcConfigured),
    message: ftc
      ? 'Editable DOCX component'
      : ftcConfigured
        ? 'Configured template; regenerate packet to create editable FTC DOCX'
        : 'Not configured'
  });

  return normalized.sort((a, b) => a.number - b.number);
}

function applyPreviewFormatting(node: HTMLElement, block: EditableParagraph) {
  const values: Array<[string, string]> = [
    ['font-weight', block.bold ? '700' : '400'],
    ['font-style', block.italic ? 'italic' : 'normal'],
    ['text-decoration', block.underline ? 'underline' : 'none'],
    ['color', block.color],
    ['font-size', `${block.fontSize}pt`]
  ];

  node.style.setProperty('text-align', block.alignment, 'important');
  node.style.setProperty('line-height', String(block.lineSpacing), 'important');
  node.style.setProperty('margin-bottom', `${block.spacingAfter}pt`, 'important');

  [node, ...Array.from(node.querySelectorAll<HTMLElement>('span'))].forEach((element) => {
    values.forEach(([name, value]) => element.style.setProperty(name, value, 'important'));
  });
}

function EditablePacketSection({ slot, onSave }: { slot: Slot; onSave: Props['onSave'] }) {
  const output = slot.document!;
  const host = useRef<HTMLDivElement>(null);
  const paragraphNodes = useRef<Map<string, HTMLElement>>(new Map());
  const [paragraphs, setParagraphs] = useState<EditableParagraph[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading document');
  const selected = paragraphs.find((paragraph) => paragraph.id === activeId) || paragraphs[0];

  useEffect(() => {
    let alive = true;

    setDirty(false);
    setStatus('Loading document');
    setActiveId('');
    paragraphNodes.current.clear();

    void Promise.all([readEditableParagraphs(output.blob), import('docx-preview')])
      .then(async ([items, docx]) => {
        if (!alive || !host.current) return;

        setParagraphs(items);
        setActiveId(items[0]?.id || '');
        host.current.innerHTML = '';

        await docx.renderAsync(await output.blob.arrayBuffer(), host.current, undefined, {
          className: 'packet-inline-docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: false,
          renderFooters: false
        });

        if (!alive || !host.current) return;

        const nodes = Array.from(host.current.querySelectorAll<HTMLElement>('.packet-inline-docx p'))
          .filter((node) => (node.textContent || '').trim().length > 0);

        items.forEach((item, index) => {
          const node = nodes[index];
          if (!node) return;

          paragraphNodes.current.set(item.id, node);
          node.contentEditable = 'true';
          node.spellcheck = true;
          node.dataset.paragraphId = item.id;
          node.setAttribute('aria-label', `${slot.label} paragraph ${index + 1}`);

          node.addEventListener('focus', () => setActiveId(item.id));
          node.addEventListener('click', () => setActiveId(item.id));
          node.addEventListener('input', () => {
            setDirty(true);
            setParagraphs((current) =>
              current.map((entry) =>
                entry.id === item.id ? { ...entry, text: textOf(node), dirty: true } : entry
              )
            );
          });
        });

        setStatus('Ready to edit');
      })
      .catch((error: Error) => {
        if (alive) setStatus(error.message);
      });

    return () => {
      alive = false;
    };
  }, [output.blob, slot.label]);

  function updateFormatting(change: Partial<EditableParagraph>) {
    if (!selected) return;

    const updated = { ...selected, ...change, dirty: true };

    setParagraphs((current) => current.map((entry) => entry.id === selected.id ? updated : entry));

    const node = paragraphNodes.current.get(selected.id);
    if (node) applyPreviewFormatting(node, updated);

    setDirty(true);
    setStatus('Formatting changed');
  }

  async function save() {
    setSaving(true);
    setStatus('Saving');

    try {
      const blob = await saveEditedParagraphs(output.blob, paragraphs);

      await onSave(
        output,
        new File([blob], fileName(output), {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
      );

      setDirty(false);
      setParagraphs((current) => current.map((entry) => ({ ...entry, dirty: false })));
      setStatus('Saved');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="packet-focus-section packet-stack-editable" data-slot={slot.id}>
      <div className="packet-document-toolbar">
        <span className={`packet-edit-state ${dirty ? 'changed' : ''}`}>{dirty ? 'Unsaved changes' : status}</span>
        <button className="packet-save-button" type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div className="docx-format-toolbar" aria-label="Document formatting toolbar">
        <div className="docx-format-selection">
          <span>Selected paragraph</span>
          <strong>{selected ? `Paragraph ${paragraphs.findIndex((item) => item.id === selected.id) + 1}` : 'Select text'}</strong>
        </div>

        <div className="docx-format-group docx-format-toggles" aria-label="Text style">
          <button type="button" className={selected?.bold ? 'active' : ''} aria-pressed={Boolean(selected?.bold)} disabled={!selected} onClick={() => updateFormatting({ bold: !selected?.bold })}><b>B</b></button>
          <button type="button" className={selected?.italic ? 'active' : ''} aria-pressed={Boolean(selected?.italic)} disabled={!selected} onClick={() => updateFormatting({ italic: !selected?.italic })}><i>I</i></button>
          <button type="button" className={selected?.underline ? 'active' : ''} aria-pressed={Boolean(selected?.underline)} disabled={!selected} onClick={() => updateFormatting({ underline: !selected?.underline })}><u>U</u></button>
        </div>

        <label className="docx-format-field">
          <span>Size</span>
          <select disabled={!selected} value={selected?.fontSize || 11} onChange={(event) => updateFormatting({ fontSize: Number(event.target.value) })}>
            {FONT_SIZES.map((size) => <option key={size} value={size}>{size} pt</option>)}
          </select>
        </label>

        <label className="docx-format-field color-field">
          <span>Color</span>
          <input type="color" disabled={!selected} value={selected?.color || '#111827'} onChange={(event) => updateFormatting({ color: event.target.value })} />
        </label>

        <label className="docx-format-field">
          <span>Alignment</span>
          <select disabled={!selected} value={selected?.alignment || 'left'} onChange={(event) => updateFormatting({ alignment: event.target.value as ParagraphAlignment })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
            <option value="justify">Justify</option>
          </select>
        </label>

        <label className="docx-format-field">
          <span>Line spacing</span>
          <select disabled={!selected} value={selected?.lineSpacing || 1.15} onChange={(event) => updateFormatting({ lineSpacing: Number(event.target.value) })}>
            {LINE_SPACING.map((spacing) => <option key={spacing} value={spacing}>{spacing}</option>)}
          </select>
        </label>

        <label className="docx-format-field">
          <span>After</span>
          <select disabled={!selected} value={selected?.spacingAfter || 0} onChange={(event) => updateFormatting({ spacingAfter: Number(event.target.value) })}>
            {[0, 4, 6, 8, 10, 12, 18, 24].map((spacing) => <option key={spacing} value={spacing}>{spacing} pt</option>)}
          </select>
        </label>
      </div>

      <div ref={host} className="packet-inline-docx-host" />
    </article>
  );
}

function PacketInsertSection({
  slot,
  round,
  evidenceKey,
  evidence,
  warnings,
  toolbarTargetId,
  onEvidenceChanged,
  onMessage
}: {
  slot: Slot;
  round: Props['round'];
  evidenceKey?: string;
  evidence?: PacketAssets;
  warnings: string[];
  toolbarTargetId?: string;
  onEvidenceChanged?: Props['onEvidenceChanged'];
  onMessage?: Props['onMessage'];
}) {
  const viewable = slot.id === 'SUPPORTING' || slot.id === 'FCRA' || slot.id === 'ATTACHMENT';

  return (
    <article className="packet-focus-section packet-stack-insert" data-slot={slot.id}>
      {viewable ? (
        <PacketInsertViewer
          kind={slot.id as 'SUPPORTING' | 'FCRA' | 'ATTACHMENT'}
          round={round}
          evidenceKey={evidenceKey}
          evidence={evidence}
          toolbarTargetId={slot.id === 'SUPPORTING' ? toolbarTargetId : undefined}
          onEvidenceChanged={onEvidenceChanged}
          onMessage={onMessage}
        />
      ) : (
        <div className="packet-insert-status missing">
          <strong>{slot.label} not generated</strong>
          <span>{missingReason(slot, warnings)}</span>
        </div>
      )}
    </article>
  );
}

export default function SimpleDocxEditor({
  round,
  output,
  documents,
  initialDocumentPath,
  evidenceKey,
  evidence,
  warnings = [],
  onEvidenceChanged,
  onMessage,
  onClose,
  onSave
}: Props) {
  const [active, setActive] = useState<SlotId>(() => slotForDocument(initialDocumentPath, documents));
  const lastInitialDocumentPath = useRef(initialDocumentPath);
  const exhibits = useMemo(() => loadTemplateExhibits(round), [round]);

  const letter = documents.find((document) => roleOf(document) === 'LETTER') || output;
  const affidavit = documents.find((document) => roleOf(document) === 'AFFIDAVIT');
  const ftc = documents.find((document) => roleOf(document) === 'FTC');

  const slots = useMemo<Slot[]>(() => {
    const generated: Record<SlotId, ReviewOutput | undefined> = {
      LETTER: letter,
      SUPPORTING: undefined,
      FCRA: undefined,
      AFFIDAVIT: affidavit,
      ATTACHMENT: undefined,
      FTC: ftc
    };

    const configured: Record<SlotId, boolean> = {
      LETTER: true,
      SUPPORTING: Boolean(evidence?.supporting.length),
      FCRA: Boolean(exhibits.FCRA),
      AFFIDAVIT: Boolean(affidavit || exhibits.AFFIDAVIT),
      ATTACHMENT: Boolean(exhibits.ATTACHMENT),
      FTC: Boolean(ftc || exhibits.FTC)
    };

    const messages: Record<SlotId, string> = {
      LETTER: 'Editable DOCX component',
      SUPPORTING: 'One-page evidence layout',
      FCRA: exhibits.FCRA ? 'Configured insert' : 'Not configured',
      AFFIDAVIT: affidavit ? 'Editable DOCX component' : exhibits.AFFIDAVIT ? 'Configured template; regenerate packet to create editable Affidavit DOCX' : 'Not configured',
      ATTACHMENT: exhibits.ATTACHMENT ? 'Configured insert' : 'Not configured',
      FTC: ftc ? 'Editable DOCX component' : exhibits.FTC ? 'Configured template; regenerate packet to create editable FTC DOCX' : 'Not configured'
    };

    const positions = getPacketPositions(output.type)
      .filter((position) => position.id !== 'FTC' || isFtcEnabled() || ftc || exhibits.FTC);

    const workflowSlots = positions.map((position) => {
      const id = position.id as SlotId;

      return {
        id,
        number: position.number,
        label: position.label,
        document: generated[id],
        configured: configured[id],
        message: messages[id]
      };
    });

    if (output.type === 'DISPUTE' && (isFtcEnabled() || ftc || exhibits.FTC)) {
      return ensureFtcEditorSlot(workflowSlots, ftc, Boolean(exhibits.FTC));
    }

    return workflowSlots.sort((a, b) => a.number - b.number);
  }, [output.type, letter, affidavit, ftc, evidence?.supporting.length, exhibits]);

  useEffect(() => {
    if (lastInitialDocumentPath.current !== initialDocumentPath) {
      lastInitialDocumentPath.current = initialDocumentPath;
      setActive(slotForDocument(initialDocumentPath, documents));
    }
  }, [initialDocumentPath, documents]);

  useEffect(() => {
    if (!slots.some((slot) => slot.id === active)) {
      setActive(slots[0]?.id || 'LETTER');
    }
  }, [active, slots]);

  const activeIndex = Math.max(0, slots.findIndex((slot) => slot.id === active));
  const selected = slots[activeIndex] || slots[0];
  const previous = activeIndex > 0 ? slots[activeIndex - 1] : null;
  const next = activeIndex < slots.length - 1 ? slots[activeIndex + 1] : null;
  const evidenceToolsId = `packet-evidence-tools-${output.bureau.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;

  const ftcRailSlot: Slot | null = output.type === 'DISPUTE'
    ? slots.find((slot) => slot.id === 'FTC') || {
        id: 'FTC',
        number: 6,
        label: 'FTC Identity Theft Report',
        document: ftc,
        configured: Boolean(ftc || exhibits.FTC),
        message: ftc
          ? 'Editable DOCX component'
          : exhibits.FTC
            ? 'Configured template; regenerate packet to create editable FTC DOCX'
            : 'Not configured'
      }
    : null;

  const railSlots = output.type === 'DISPUTE' && ftcRailSlot
    ? [...slots.filter((slot) => slot.id !== 'FTC'), ftcRailSlot].sort((a, b) => a.number - b.number)
    : slots;

  if (!selected) return null;

  return (
    <div className="simple-editor-backdrop">
      <section className="simple-editor-modal ordered-packet-modal premium-document-editor focused-packet-editor consolidated-packet-editor" role="dialog" aria-modal="true" aria-label={`${output.bureau} ordered packet editor`} data-ftc-editor-slots={slots.map((slot) => slot.id).join('|')} data-ftc-rail-slots={railSlots.map((slot) => slot.id).join('|')}>
        <header className="simple-editor-header editor-command-header">
          <div className="editor-command-identity">
            <div className="editor-packet-name">
              <p className="eyebrow">Packet editor</p>
              <h2>{output.bureau} {output.type === 'DISPUTE' ? 'Dispute Packet' : 'Late Payment Packet'}</h2>
              <div className="editor-context-tags">
                <span>{round}</span>
                <span>{slots.length} positions</span>
              </div>
            </div>

            <span className="editor-command-separator" aria-hidden="true" />

            <div className="editor-active-document">
              <p className="eyebrow">Current document</p>
              <strong><b>{String(selected.number).padStart(2, '0')}</b>{selected.label}</strong>
              <small>{stateOf(selected)}</small>
            </div>
          </div>

          {selected.id === 'SUPPORTING' && evidence?.supporting.length ? (
            <div className="packet-header-evidence-slot" id={evidenceToolsId} aria-label="Evidence image tools" />
          ) : null}

          <div className="editor-command-actions">
            <div className="packet-focus-controls">
              <button type="button" className="secondary-button" disabled={!previous} onClick={() => previous && setActive(previous.id)}>Previous</button>
              <button type="button" className="secondary-button" disabled={!next} onClick={() => next && setActive(next.id)}>Next</button>
            </div>

            <button type="button" className="close-editor" onClick={onClose} aria-label="Close editor">×</button>
          </div>
        </header>

        <div className="ordered-packet-body">
          <aside className="editor-packet-map document-rail" data-ftc-rail-count={slots.length}>
            <header>
              <p className="eyebrow">Packet order</p>
              <h3>Documents</h3>
            </header>

            <ol>
              {railSlots.map((slot) => (
                <li className={active === slot.id ? 'current editable' : 'editable'} key={slot.id}>
                  <button type="button" onClick={() => setActive(slot.id)}>
                    <b>{String(slot.number).padStart(2, '0')}</b>
                    <div>
                      <strong>{slot.label}</strong>
                      <small>{stateOf(slot)}</small>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <main className="packet-focus-workspace">
            <div className="packet-focus-scroll">
              {selected.document ? (
                <EditablePacketSection key={`${output.path}-${selected.id}`} slot={selected} onSave={onSave} />
              ) : (
                <PacketInsertSection
                  key={`${output.path}-${selected.id}`}
                  slot={selected}
                  round={round}
                  evidenceKey={evidenceKey}
                  evidence={evidence}
                  warnings={warnings}
                  toolbarTargetId={evidenceToolsId}
                  onEvidenceChanged={onEvidenceChanged}
                  onMessage={onMessage}
                />
              )}
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}

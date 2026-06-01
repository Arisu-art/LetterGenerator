'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createSupportingDocumentsPdf } from '../lib/packet-renderer';
import { loadPacketAssets } from '../lib/packet-assets';
import { loadTemplateExhibits, readTemplateExhibit, type ExhibitKind } from '../lib/template-exhibits';
import { rounds } from '../lib/reference-store';

type Stage = { label: string; kind: 'LETTER' | 'PDF' | 'DOCX' | 'NONE'; blob: Blob | null; note: string };

function getExhibitKind(label: string): ExhibitKind | null {
  if (/FCRA/i.test(label)) return 'FCRA';
  if (/Affidavit/i.test(label)) return 'AFFIDAVIT';
  if (/Attachment/i.test(label)) return 'ATTACHMENT';
  if (/FTC/i.test(label)) return 'FTC';
  return null;
}

function findRound(kind: ExhibitKind) {
  return rounds.find((round) => Boolean(loadTemplateExhibits(round)[kind])) || null;
}

function recentSupportingKey() {
  const prefix = 'lettergenerator.packet-assets.v1.';
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix)).reverse();
  return keys.map((key) => key.slice(prefix.length)).find((key) => loadPacketAssets(key).supporting.length > 0) || null;
}

function rowLabel(row: Element) {
  return row.querySelector('strong')?.textContent?.trim() || '';
}

function setCurrentRow(rows: Element[], index: number) {
  rows.forEach((row, position) => row.classList.toggle('scroll-current', position === index));
  const selected = rows[index] as HTMLElement | undefined;
  selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export default function ScrollSyncedPacketPreview() {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const docxHost = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(0);

  useEffect(() => {
    const locate = () => setBody(document.querySelector<HTMLElement>('.simple-editor-body'));
    locate();
    const mutation = new MutationObserver(locate);
    mutation.observe(document.body, { childList: true, subtree: true });
    return () => mutation.disconnect();
  }, []);

  useEffect(() => {
    if (stage?.kind !== 'PDF' || !stage.blob) { setPdfUrl(''); return; }
    const value = URL.createObjectURL(stage.blob);
    setPdfUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [stage]);

  useEffect(() => {
    const target = docxHost.current;
    if (stage?.kind !== 'DOCX' || !stage.blob || !target) return;
    target.innerHTML = '';
    let alive = true;
    void import('docx-preview').then(async ({ renderAsync }) => {
      if (!alive) return;
      await renderAsync(await stage.blob!.arrayBuffer(), target, undefined, {
        className: 'scroll-step-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: true, renderFooters: true
      });
    }).catch(() => setStage({ label: stage.label, kind: 'NONE', blob: null, note: 'This uploaded DOCX cannot be previewed.' }));
    return () => { alive = false; };
  }, [stage]);

  useEffect(() => {
    const editor = document.querySelector<HTMLElement>('.simple-editor-stage');
    const map = document.querySelector<HTMLElement>('.editor-packet-map');
    if (!editor || !map) return;
    const rows = Array.from(map.querySelectorAll('li'));
    if (!rows.length) return;
    setCurrentRow(rows, 0);

    const handleLetterScroll = () => {
      if (stage) return;
      const pages = Array.from(editor.querySelectorAll<HTMLElement>('.editor-page-sheet'));
      if (!pages.length) return;
      const center = editor.scrollTop + editor.clientHeight / 2;
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      pages.forEach((page, index) => {
        const value = Math.abs(page.offsetTop + page.offsetHeight / 2 - center);
        if (value < distance) { distance = value; nearest = index; }
      });
      activeIndex.current = 0;
      setCurrentRow(rows, 0);
      map.dataset.letterPage = String(nearest + 1);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!stage) return;
      const target = event.target instanceof Element ? event.target.closest('.packet-scroll-stage') : null;
      if (!target || Math.abs(event.deltaY) < 10) return;
      const next = Math.max(0, Math.min(rows.length - 1, activeIndex.current + (event.deltaY > 0 ? 1 : -1)));
      if (next === activeIndex.current) return;
      event.preventDefault();
      activeIndex.current = next;
      setCurrentRow(rows, next);
      void openStep(rowLabel(rows[next]));
    };

    editor.addEventListener('scroll', handleLetterScroll, { passive: true });
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => { editor.removeEventListener('scroll', handleLetterScroll); document.removeEventListener('wheel', handleWheel); };

    async function openStep(label: string) {
      if (/Letter/i.test(label)) { setStage(null); return; }
      if (/Supporting Documents/i.test(label)) {
        const key = recentSupportingKey();
        const pdf = key ? await createSupportingDocumentsPdf(key).catch(() => null) : null;
        setStage(pdf ? { label, kind: 'PDF', blob: pdf, note: 'Uploaded supporting documents' } : { label, kind: 'NONE', blob: null, note: 'No supporting document is set yet.' });
        return;
      }
      const kind = getExhibitKind(label);
      const round = kind ? findRound(kind) : null;
      const file = kind && round ? await readTemplateExhibit(round, kind).catch(() => null) : null;
      if (!file) { setStage({ label, kind: 'NONE', blob: null, note: 'No template is configured yet.' }); return; }
      const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      setStage({ label, kind: pdf ? 'PDF' : 'DOCX', blob: file, note: 'Configured template preview' });
    }
  }, [body, stage]);

  if (!body || !stage) return null;
  return createPortal(
    <section className="packet-scroll-stage" aria-label={`${stage.label} automatic preview`}>
      <header><p>AUTO PACKET PREVIEW</p><h3>{stage.label}</h3><span>{stage.note} · Continue scrolling to move through the packet order.</span></header>
      <div className="packet-scroll-content">
        {stage.kind === 'PDF' && pdfUrl ? <iframe title={`${stage.label} automatic page preview`} src={pdfUrl} /> : stage.kind === 'DOCX' ? <div ref={docxHost} className="packet-scroll-docx" /> : <div className="packet-scroll-empty"><strong>None</strong><span>{stage.note}</span></div>}
      </div>
    </section>, body
  );
}

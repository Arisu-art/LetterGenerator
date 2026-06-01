'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { createSupportingDocumentsPdf } from '../lib/packet-renderer';
import { loadPacketAssets } from '../lib/packet-assets';
import { loadTemplateExhibits, readTemplateExhibit, type ExhibitKind } from '../lib/template-exhibits';
import { rounds } from '../lib/reference-store';

type Selection = { label: string; kind: 'pdf' | 'docx' | 'none'; blob: Blob | null; note: string };

function exhibitKind(label: string): ExhibitKind | null {
  if (/FCRA/i.test(label)) return 'FCRA';
  if (/Affidavit/i.test(label)) return 'AFFIDAVIT';
  if (/Attachment/i.test(label)) return 'ATTACHMENT';
  if (/FTC/i.test(label)) return 'FTC';
  return null;
}

function configuredRound(kind: ExhibitKind) {
  return rounds.find((round) => Boolean(loadTemplateExhibits(round)[kind])) || null;
}

function supportingStorageKey() {
  if (typeof window === 'undefined') return null;
  const prefix = 'lettergenerator.packet-assets.v1.';
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix)).reverse();
  for (const key of keys) {
    const storageKey = key.slice(prefix.length);
    if (loadPacketAssets(storageKey).supporting.length) return storageKey;
  }
  return null;
}

export default function PacketMapPreviewController() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const docxHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const locate = () => setHost(document.querySelector('.simple-editor-body'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selected?.blob || selected.kind !== 'pdf') { setUrl(''); return; }
    const value = URL.createObjectURL(selected.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [selected]);

  useEffect(() => {
    if (selected?.kind !== 'docx' || !selected.blob || !docxHost.current) return;
    const target = docxHost.current;
    target.innerHTML = '';
    let active = true;
    void import('docx-preview').then(async ({ renderAsync }) => {
      if (!active) return;
      await renderAsync(await selected.blob!.arrayBuffer(), target, undefined, { className: 'component-docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: true, renderFooters: true });
    }).catch(() => setSelected({ label: selected.label, kind: 'none', blob: null, note: 'This DOCX template could not be displayed in preview.' }));
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    const click = async (event: MouseEvent) => {
      const row = event.target instanceof Element ? event.target.closest('.editor-packet-map li') : null;
      if (!row) return;
      const label = row.querySelector('strong')?.textContent?.trim() || '';
      if (!label) return;
      if (/Letter/i.test(label)) { setSelected(null); return; }
      setBusy(true);
      try {
        if (/Supporting Documents/i.test(label)) {
          const key = supportingStorageKey();
          const pdf = key ? await createSupportingDocumentsPdf(key) : null;
          setSelected(pdf ? { label, kind: 'pdf', blob: pdf, note: 'Uploaded supporting document preview.' } : { label, kind: 'none', blob: null, note: 'No supporting documents are uploaded for this packet yet.' });
          return;
        }
        const kind = exhibitKind(label);
        const round = kind ? configuredRound(kind) : null;
        const file = kind && round ? await readTemplateExhibit(round, kind) : null;
        if (!file) { setSelected({ label, kind: 'none', blob: null, note: `No ${label} template or upload is set for this packet yet.` }); return; }
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        setSelected({ label, kind: isPdf ? 'pdf' : 'docx', blob: file, note: `${label} template preview from ${round}.` });
      } finally { setBusy(false); }
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, []);

  if (!host || !selected) return null;
  return createPortal(
    <section className="packet-component-overlay" aria-label={`${selected.label} preview`}>
      <header><div><p>PACKET PAGE PREVIEW</p><h3>{selected.label}</h3><span>{selected.note}</span></div><button onClick={() => setSelected(null)} aria-label="Return to document">×</button></header>
      <div className="packet-component-stage">
        {busy ? <div className="packet-component-empty">Loading preview...</div> : selected.kind === 'pdf' && url ? <iframe title={`${selected.label} page preview`} src={url} /> : selected.kind === 'docx' ? <div ref={docxHost} className="packet-component-docx" /> : <div className="packet-component-empty"><strong>None</strong><span>{selected.note}</span></div>}
      </div>
    </section>, host
  );
}

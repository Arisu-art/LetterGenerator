'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { createSupportingDocumentsPdf } from '../lib/packet-renderer';
import { loadPacketAssets } from '../lib/packet-assets';
import { loadTemplateExhibits, readTemplateExhibit, type ExhibitKind } from '../lib/template-exhibits';
import { rounds } from '../lib/reference-store';

type PacketSection = {
  label: string;
  kind: 'current' | 'pdf' | 'docx' | 'none';
  blob: Blob | null;
  note: string;
};

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

function CurrentDocumentPreview() {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const refresh = () => {
      const source = document.querySelector('.simple-editor-visual-host .docx-wrapper') as HTMLElement | null;
      if (!source || !target.current) return;
      target.current.innerHTML = '';
      target.current.appendChild(source.cloneNode(true));
    };
    refresh();
    const observer = new MutationObserver(refresh);
    const sourceHost = document.querySelector('.simple-editor-visual-host');
    if (sourceHost) observer.observe(sourceHost, { childList: true, subtree: true, characterData: true });
    const timer = window.setTimeout(refresh, 350);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, []);
  return <div ref={target} className="packet-continuous-docx" />;
}

function PdfPreview({ section }: { section: PacketSection }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!section.blob) return;
    const value = URL.createObjectURL(section.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [section.blob]);
  return url ? <iframe title={`${section.label} preview`} src={url} /> : null;
}

function DocxPreview({ section }: { section: PacketSection }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!section.blob || !target.current) return;
    const host = target.current;
    host.innerHTML = '';
    let active = true;
    void import('docx-preview').then(async ({ renderAsync }) => {
      if (!active) return;
      await renderAsync(await section.blob!.arrayBuffer(), host, undefined, {
        className: 'packet-continuous-docx-render',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true
      });
    });
    return () => { active = false; };
  }, [section.blob]);
  return <div ref={target} className="packet-continuous-docx" />;
}

function SectionContent({ section }: { section: PacketSection }) {
  if (section.kind === 'current') return <CurrentDocumentPreview />;
  if (section.kind === 'pdf') return <PdfPreview section={section} />;
  if (section.kind === 'docx') return <DocxPreview section={section} />;
  return <div className="packet-component-empty"><strong>None</strong><span>{section.note}</span></div>;
}

export default function PacketMapPreviewController() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const [sections, setSections] = useState<PacketSection[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [continuousView, setContinuousView] = useState(true);
  const [loading, setLoading] = useState(false);
  const scrollHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const locate = () => {
      const nextHost = document.querySelector('.simple-editor-body') as HTMLElement | null;
      const nextRail = document.querySelector('.editor-packet-map') as HTMLElement | null;
      setHost((previous) => {
        if (nextHost && previous !== nextHost) setContinuousView(true);
        return nextHost;
      });
      setRail(nextRail);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!rail) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const labels = Array.from(rail.querySelectorAll('li strong')).map((element) => element.textContent?.trim() || '').filter(Boolean);
      const next: PacketSection[] = [];
      for (const label of labels) {
        if (/Letter/i.test(label)) {
          next.push({ label, kind: 'current', blob: null, note: 'Generated editable letter.' });
          continue;
        }
        if (/Supporting Documents/i.test(label)) {
          const key = supportingStorageKey();
          const pdf = key ? await createSupportingDocumentsPdf(key) : null;
          next.push(pdf ? { label, kind: 'pdf', blob: pdf, note: 'Uploaded supporting documents.' } : { label, kind: 'none', blob: null, note: 'No supporting documents are uploaded yet.' });
          continue;
        }
        const kind = exhibitKind(label);
        const round = kind ? configuredRound(kind) : null;
        const file = kind && round ? await readTemplateExhibit(round, kind) : null;
        if (!file) {
          next.push({ label, kind: 'none', blob: null, note: `No ${label} template is configured yet.` });
          continue;
        }
        const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        next.push({ label, kind: pdf ? 'pdf' : 'docx', blob: file, note: `${label} template preview.` });
      }
      if (active) { setSections(next); setLoading(false); setActiveIndex(0); }
    };
    void load();
    return () => { active = false; };
  }, [rail]);

  useEffect(() => {
    if (!rail) return;
    const rows = Array.from(rail.querySelectorAll('li'));
    rows.forEach((row, index) => row.classList.toggle('in-view', continuousView && index === activeIndex));
    const activeRow = rows[activeIndex] as HTMLElement | undefined;
    if (continuousView && activeRow) activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => rows.forEach((row) => row.classList.remove('in-view'));
  }, [rail, activeIndex, continuousView]);

  useEffect(() => {
    if (!rail || !continuousView) return;
    const onSelect = (event: Event) => {
      const row = event.target instanceof Element ? event.target.closest('li') : null;
      if (!row || !rail.contains(row)) return;
      const rows = Array.from(rail.querySelectorAll('li'));
      const index = rows.indexOf(row);
      const target = scrollHost.current?.querySelector(`[data-packet-section="${index}"]`) as HTMLElement | null;
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    rail.addEventListener('click', onSelect);
    return () => rail.removeEventListener('click', onSelect);
  }, [rail, continuousView]);

  function onScroll() {
    const container = scrollHost.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top + 24;
    const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-packet-section]'));
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    pages.forEach((page, index) => {
      const delta = Math.abs(page.getBoundingClientRect().top - top);
      if (delta < distance) { distance = delta; best = index; }
    });
    setActiveIndex(best);
  }

  if (!host) return null;
  if (!continuousView) {
    return createPortal(<button className="open-continuous-preview" onClick={() => setContinuousView(true)}>Open automatic packet scroll view</button>, host);
  }

  return createPortal(
    <section className="packet-continuous-overlay" aria-label="Automatic ordered packet preview">
      <header>
        <div><p>AUTOMATIC PACKET PREVIEW</p><h3>Full ordered document scroll</h3><span>Scroll through the pages. The order panel updates automatically to the content in view.</span></div>
        <button onClick={() => setContinuousView(false)}>Edit DOCX</button>
      </header>
      <div className="packet-continuous-scroll" ref={scrollHost} onScroll={onScroll}>
        {loading && <div className="packet-component-empty"><span>Loading packet pages...</span></div>}
        {!loading && sections.map((section, index) => (
          <article className="packet-continuous-section" data-packet-section={index} key={`${index}-${section.label}`}>
            <div className="packet-section-marker"><b>{String(index + 1).padStart(2, '0')}</b><span>{section.label}</span></div>
            <SectionContent section={section} />
          </article>
        ))}
      </div>
    </section>, host
  );
}

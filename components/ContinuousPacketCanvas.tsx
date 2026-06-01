'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { sourceUrl: string; packetMap: HTMLElement | null };

function packetRows(packetMap: HTMLElement | null) {
  return packetMap ? Array.from(packetMap.querySelectorAll<HTMLElement>('li')) : [];
}
function startPageFor(index: number, pageCount: number, rowCount: number) {
  const firstPartPages = Math.max(1, pageCount - Math.max(0, rowCount - 1));
  return index === 0 ? 1 : Math.min(pageCount, firstPartPages + index);
}
function selectPacketStep(packetMap: HTMLElement | null, page: number, pageCount: number) {
  const rows = packetRows(packetMap);
  if (!rows.length) return;
  const firstPartPages = Math.max(1, pageCount - Math.max(0, rows.length - 1));
  const active = page <= firstPartPages ? 0 : Math.min(rows.length - 1, page - firstPartPages);
  rows.forEach((row, index) => {
    row.classList.toggle('scroll-current', index === active);
    row.setAttribute('aria-current', index === active ? 'page' : 'false');
  });
  rows[active]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export default function ContinuousPacketCanvas({ sourceUrl, packetMap }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Preparing ordered packet pages...');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    const removers: Array<() => void> = [];
    const target = host.current;
    if (!target || !sourceUrl) return;
    target.innerHTML = '';
    setProgress({ current: 0, total: 0 });
    setStatus('Preparing ordered packet pages...');

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error('Packet preview data could not be loaded.');
        const pdf = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;
        if (cancelled) return;
        setProgress({ current: 0, total: pdf.numPages });
        const pages: HTMLElement[] = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancelled) return;
          setStatus(`Rendering ordered page ${number} of ${pdf.numPages}...`);
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1.25 });
          const sheet = document.createElement('article');
          sheet.className = 'continuous-packet-page';
          sheet.dataset.packetPage = String(number);
          const badge = document.createElement('span');
          badge.className = 'continuous-page-badge';
          badge.textContent = `PAGE ${number}`;
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Document preview canvas could not be created.');
          sheet.append(badge, canvas);
          target.appendChild(sheet);
          pages.push(sheet);
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          setProgress({ current: number, total: pdf.numPages });
        }
        if (cancelled) return;
        setStatus('');
        const rows = packetRows(packetMap);
        rows.forEach((row, index) => {
          row.tabIndex = 0;
          row.setAttribute('role', 'button');
          const go = () => pages[startPageFor(index, pdf.numPages, rows.length) - 1]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          const key = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } };
          row.addEventListener('click', go);
          row.addEventListener('keydown', key);
          removers.push(() => { row.removeEventListener('click', go); row.removeEventListener('keydown', key); row.removeAttribute('role'); row.removeAttribute('tabindex'); });
        });
        selectPacketStep(packetMap, 1, pdf.numPages);
        observer = new IntersectionObserver((entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) selectPacketStep(packetMap, Number((visible.target as HTMLElement).dataset.packetPage || 1), pdf.numPages);
        }, { root: target.parentElement, threshold: [0.35, 0.6, 0.85] });
        pages.forEach((page) => observer?.observe(page));
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Packet pages could not be displayed.');
      }
    })();
    return () => { cancelled = true; observer?.disconnect(); removers.forEach((remove) => remove()); if (target) target.innerHTML = ''; };
  }, [sourceUrl, packetMap]);

  return <div className="continuous-packet-shell">{status && <div className="continuous-packet-status"><span>{status}</span>{progress.total > 0 && <progress max={progress.total} value={progress.current} />}</div>}<div ref={host} className="continuous-packet-pages" aria-label="Complete ordered packet pages" /></div>;
}

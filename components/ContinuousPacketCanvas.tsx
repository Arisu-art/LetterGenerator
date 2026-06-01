'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  sourceUrl: string;
  packetMap: HTMLElement | null;
};

function selectPacketStep(packetMap: HTMLElement | null, page: number, pageCount: number) {
  if (!packetMap) return;
  const rows = Array.from(packetMap.querySelectorAll<HTMLElement>('li'));
  if (!rows.length) return;
  // Generated letters may contain multiple pages. Reserved inserts after the letter
  // each retain at least one ordered page, so excess pages belong to the letter.
  const letterPages = Math.max(1, pageCount - (rows.length - 1));
  const active = page <= letterPages ? 0 : Math.min(rows.length - 1, page - letterPages);
  rows.forEach((row, index) => {
    row.classList.toggle('scroll-current', index === active);
    row.setAttribute('aria-current', index === active ? 'page' : 'false');
  });
  rows[active]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export default function ContinuousPacketCanvas({ sourceUrl, packetMap }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Preparing ordered packet pages...');

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    const target = host.current;
    if (!target || !sourceUrl) return;
    target.innerHTML = '';
    setStatus('Preparing ordered packet pages...');

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.4.296/legacy/build/pdf.worker.min.mjs';
        const data = await fetch(sourceUrl).then((response) => response.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        const pages: HTMLElement[] = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1.45 });
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
        }
        if (cancelled) return;
        setStatus('');
        selectPacketStep(packetMap, 1, pdf.numPages);
        observer = new IntersectionObserver((entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visible) return;
          selectPacketStep(packetMap, Number((visible.target as HTMLElement).dataset.packetPage || 1), pdf.numPages);
        }, { root: target.parentElement, threshold: [0.35, 0.6, 0.85] });
        pages.forEach((page) => observer?.observe(page));
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Packet pages could not be displayed.');
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (target) target.innerHTML = '';
    };
  }, [sourceUrl, packetMap]);

  return (
    <div className="continuous-packet-shell">
      {status && <div className="continuous-packet-status">{status}</div>}
      <div ref={host} className="continuous-packet-pages" aria-label="Complete ordered packet pages" />
    </div>
  );
}

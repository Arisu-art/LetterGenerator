'use client';

import { useEffect, useRef, useState } from 'react';
import { AssembledPdfPacket, assembleFinalPdfWithRanges, PdfPacketPart } from '../lib/final-pdf-packet';
import { createPortal } from 'react-dom';

export default function ContinuousPacketWorkspace({ parts }: { parts: PdfPacketPart[] }) {
  const [packet, setPacket] = useState<AssembledPdfPacket | null>(null);
  const scrollHost = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(0);

  useEffect(() => {
    let alive = true;
    void assembleFinalPdfWithRanges(parts).then((result) => {
      if (!alive) return;
      setPacket(result);
    });
    return () => { alive = false; };
  }, [parts]);

  useEffect(() => {
    if (!packet || !scrollHost.current) return;
    const container = scrollHost.current;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const index = Number(entry.target.getAttribute('data-range-index'));
          activeIndex.current = index;
          // Highlight sidebar here (user can add further callback)
        }
      }
    }, { root: container, threshold: 0.5 });

    const pages = Array.from(container.querySelectorAll('.packet-page'));
    pages.forEach((page, idx) => observer.observe(page));
    return () => observer.disconnect();
  }, [packet]);

  if (!packet) return null;

  return createPortal(
    <div className="continuous-packet-workspace" ref={scrollHost} style={{ overflowY: 'scroll', maxHeight: '80vh' }}>
      {packet.ranges.map((range, index) => (
        <div className="packet-page" key={index} data-range-index={index}>
          <h4>{range.label} (Pages {range.startPage}-{range.endPage})</h4>
          {/* Here user can render actual PDF page previews */}
        </div>
      ))}
    </div>, document.body
  );
}
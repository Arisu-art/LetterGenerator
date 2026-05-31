'use client';

import { useEffect, useState } from 'react';

export type FinalPdfPacket = {
  path: string;
  type: 'DISPUTE' | 'LATE_PAYMENT';
  bureau: string;
  sequence: string[];
  blob: Blob;
};

type Props = { packet: FinalPdfPacket; onClose: () => void; onDownload: (packet: FinalPdfPacket) => void };

export default function PdfPacketPreview({ packet, onClose, onDownload }: Props) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const value = URL.createObjectURL(packet.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [packet.blob]);
  return <div className="packet-preview-backdrop"><section className="packet-preview-modal" role="dialog" aria-modal="true" aria-label={`Review ${packet.path}`}>
    <header className="packet-preview-header"><div><p className="eyebrow">Final PDF packet</p><h2>{packet.path.split('/').pop()}</h2><span>{packet.bureau} · {packet.type === 'DISPUTE' ? 'Dispute packet' : 'Late Payment packet'}</span></div><div><button className="packet-preview-download" onClick={() => onDownload(packet)}>Download PDF</button><button className="packet-preview-close" onClick={onClose} aria-label="Close preview">×</button></div></header>
    <aside className="packet-sequence-review"><strong>Final assembly order</strong><ol>{packet.sequence.map((step) => <li key={step}>{step}</li>)}</ol></aside>
    <div className="packet-pdf-frame">{url && <iframe title="Final PDF packet preview" src={url} />}</div>
  </section></div>;
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { renderDocxProofPdf } from '../lib/final-pdf-packet';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { output: ReviewOutput; label: string };

export default function DocxProofPreview({ output, label }: Props) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('Preparing DOCX proof preview…');
  const [error, setError] = useState('');
  const proofKey = useMemo(() => `${output.path}:${output.blob.size}:${output.blob.type}`, [output.path, output.blob]);
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    setUrl(''); setError(''); setStatus('Preparing DOCX proof preview…');
    void renderDocxProofPdf(output.blob, label).then((pdf) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(pdf);
      setUrl(objectUrl);
      setStatus('DOCX proof preview ready');
    }).catch((cause: Error) => {
      if (!alive) return;
      setError(cause.message || 'DOCX proof preview could not be rendered.');
      setStatus('DOCX proof preview unavailable');
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proofKey, label, output.blob]);
  return <section className="docx-proof-preview" aria-label={`${label} proof preview`}>
    <header><div><p className="eyebrow">Proof preview</p><h3>{label}</h3><p>The visual proof is rendered from the generated DOCX binary. Downloaded DOCX remains the source of truth.</p></div><span className={error ? 'failed' : url ? 'ready' : ''}>{status}</span></header>
    {error ? <div className="docx-proof-error" role="alert"><strong>Proof preview failed</strong><p>{error}</p><p>Use the downloaded DOCX for final verification.</p></div> : url ? <iframe src={url} title={`${label} proof PDF`} /> : <div className="docx-proof-loading">Rendering proof preview…</div>}
  </section>;
}

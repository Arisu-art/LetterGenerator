'use client';

import { useEffect, useMemo, useState } from 'react';
import { renderDocxProofPdf } from '../lib/final-pdf-packet';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { output: ReviewOutput; label: string };
type ProofMode = 'server' | 'browser' | 'failed';
type ProofResult = { blob: Blob; mode: Exclude<ProofMode, 'failed'> };

async function serverProofPdf(output: ReviewOutput, label: string) {
  const form = new FormData();
  form.append('file', new File([output.blob], `${label.replace(/[^A-Za-z0-9_.-]+/g, '-') || 'document'}.docx`, { type: output.blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const response = await fetch('/api/docx-proof', { method: 'POST', body: form, cache: 'no-store' });
  if (response.ok) return response.blob();
  let detail = '';
  try { detail = (await response.json()).error || ''; } catch { detail = await response.text().catch(() => ''); }
  throw new Error(detail || `Server proof conversion failed with status ${response.status}.`);
}
async function proofWithFallback(output: ReviewOutput, label: string): Promise<ProofResult> {
  try {
    return { blob: await serverProofPdf(output, label), mode: 'server' };
  } catch (serverError) {
    try {
      return { blob: await renderDocxProofPdf(output.blob, label), mode: 'browser' };
    } catch (browserError) {
      throw new Error(`${serverError instanceof Error ? serverError.message : 'Server proof conversion failed.'} Browser fallback also failed: ${browserError instanceof Error ? browserError.message : 'unknown error'}`);
    }
  }
}
export default function DocxProofPreview({ output, label }: Props) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('Preparing server DOCX proof…');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ProofMode>('server');
  const proofKey = useMemo(() => `${output.path}:${output.blob.size}:${output.blob.type}`, [output.path, output.blob]);
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    setUrl(''); setError(''); setMode('server'); setStatus('Preparing server DOCX proof…');
    void proofWithFallback(output, label).then((proof) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(proof.blob);
      setUrl(objectUrl);
      setMode(proof.mode);
      setStatus(proof.mode === 'server' ? 'Server DOCX proof ready' : 'Browser fallback proof ready');
    }).catch((cause: Error) => {
      if (!alive) return;
      setMode('failed');
      setError(cause.message || 'DOCX proof preview could not be rendered.');
      setStatus('DOCX proof preview unavailable');
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proofKey, label, output.blob]);
  const statusClass = error ? 'failed' : url ? 'ready' : '';
  return <section className="docx-proof-preview" aria-label={`${label} proof preview`} data-mode={mode}>
    <header><div><p className="eyebrow">Proof preview</p><h3>{label}</h3><p>The preferred proof uses server-side LibreOffice conversion from the generated DOCX. Downloaded DOCX remains the source of truth.</p></div><span className={statusClass}>{status}</span></header>
    {error ? <div className="docx-proof-error" role="alert"><strong>Proof preview failed</strong><p>{error}</p><p>Install LibreOffice in the Codespace/server, then rebuild and retry. Use the downloaded DOCX for final verification until the converter is available.</p></div> : url ? <iframe src={url} title={`${label} proof PDF`} /> : <div className="docx-proof-loading">Rendering proof preview…</div>}
  </section>;
}

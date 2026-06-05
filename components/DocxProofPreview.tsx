'use client';

import { useEffect, useMemo, useState } from 'react';
import { renderDocxProofPdf } from '../lib/final-pdf-packet';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { output: ReviewOutput; label: string; onStatusChange?: (status: ProofStatus) => void };
export type ProofMode = 'server' | 'browser' | 'failed' | 'loading';
export type ProofStatus = { mode: ProofMode; label: string; ready: boolean; error?: string };
type ProofResult = { blob: Blob; mode: Exclude<ProofMode, 'failed' | 'loading'> };
const LOADING_STATUS: ProofStatus = { mode: 'loading', label: 'Rendering proof PDF', ready: false };

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
function labelForMode(mode: ProofMode) {
  if (mode === 'server') return 'Server proof PDF ready';
  if (mode === 'browser') return 'Browser fallback proof ready';
  if (mode === 'failed') return 'Proof PDF unavailable';
  return 'Rendering proof PDF';
}
export default function DocxProofPreview({ output, label, onStatusChange }: Props) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ProofStatus>(LOADING_STATUS);
  const proofKey = useMemo(() => `${output.path}:${output.blob.size}:${output.blob.type}`, [output.path, output.blob]);
  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    setUrl('');
    setStatus(LOADING_STATUS);
    void proofWithFallback(output, label).then((proof) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(proof.blob);
      setUrl(objectUrl);
      setStatus({ mode: proof.mode, label: labelForMode(proof.mode), ready: true });
    }).catch((cause: Error) => {
      if (!alive) return;
      setStatus({ mode: 'failed', label: labelForMode('failed'), ready: false, error: cause.message || 'DOCX proof preview could not be rendered.' });
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proofKey, label, output.blob]);
  const statusClass = status.mode === 'failed' ? 'failed' : status.ready ? 'ready' : '';
  return <section className="docx-proof-preview" aria-label={`${label} proof preview`} data-mode={status.mode}>
    <header><div><p className="eyebrow">Proof preview</p><h3>{label}</h3><p>The proof is a read-only PDF generated from the same DOCX blob edited below. Save edits below to rebuild this proof.</p></div><span className={statusClass}>{status.label}</span></header>
    {status.mode === 'failed' ? <div className="docx-proof-error" role="alert"><strong>Proof preview failed</strong><p>{status.error}</p><p>The editable source below still writes to the generated DOCX. Install LibreOffice in the Codespace/server for the server proof path.</p></div> : url ? <iframe src={url} title={`${label} proof PDF`} /> : <div className="docx-proof-loading">Rendering proof preview from the generated DOCX…</div>}
  </section>;
}

'use client';

import { useEffect, useState } from 'react';

type Health = { available: boolean; binary: string; version: string; requirement: string };
export default function DocxProofDiagnostics() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState('Not checked');
  async function check() {
    setStatus('Checking converter…');
    try {
      const response = await fetch('/api/docx-proof/health', { cache: 'no-store' });
      const data = await response.json();
      setHealth(data);
      setStatus(data.available ? 'Converter ready' : 'Converter unavailable');
    } catch (error) {
      setHealth(null);
      setStatus(error instanceof Error ? error.message : 'Converter check failed');
    }
  }
  useEffect(() => { if (open && !health) void check(); }, [open, health]);
  return <section className="docx-proof-diagnostics">
    <button type="button" onClick={() => setOpen((value) => !value)}>{open ? 'Hide proof diagnostics' : 'Proof diagnostics'}</button>
    {open && <div className={`docx-proof-diagnostics-panel ${health?.available ? 'ready' : 'blocked'}`}><header><strong>{status}</strong><button type="button" onClick={() => void check()}>Refresh</button></header>{health ? <dl><div><dt>LibreOffice</dt><dd>{health.available ? 'Available' : 'Unavailable'}</dd></div><div><dt>Binary</dt><dd>{health.binary || 'Not found'}</dd></div><div><dt>Version</dt><dd>{health.version || 'No version detected'}</dd></div><div><dt>Requirement</dt><dd>{health.requirement}</dd></div></dl> : <p>Open diagnostics to verify the server-side DOCX proof converter.</p>}</div>}
  </section>;
}

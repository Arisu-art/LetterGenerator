'use client';

import { useEffect, useState } from 'react';

type Props = { onReset: () => void };
type Stall = { label: string; detail: string } | null;

const trackedPattern = /Preparing documents|Finalizing PDF packets|Building packet|Preparing ordered packet pages|Rendering page \d+ of \d+/i;

export default function WorkflowPendingGuard({ onReset }: Props) {
  const [stall, setStall] = useState<Stall>(null);

  useEffect(() => {
    let activity = '';
    let changedAt = Date.now();
    const timeoutMs = 45000;
    const inspect = () => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('.generate-primary, .finalize-pdf-button, .simple-editor-status, .continuous-packet-status'));
      const next = nodes.map((node) => (node.textContent || '').trim()).find((text) => trackedPattern.test(text)) || '';
      if (!next) {
        activity = '';
        changedAt = Date.now();
        setStall(null);
        return;
      }
      if (next !== activity) {
        activity = next;
        changedAt = Date.now();
        setStall(null);
        return;
      }
      if (Date.now() - changedAt >= timeoutMs) {
        setStall({ label: next, detail: 'This operation has not advanced. Your locally saved templates remain available after resetting the active view.' });
      }
    };
    const onFailure = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : 'A background document operation stopped unexpectedly.';
      setStall({ label: 'Operation interrupted', detail: reason });
    };
    const interval = window.setInterval(inspect, 1000);
    window.addEventListener('unhandledrejection', onFailure);
    inspect();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('unhandledrejection', onFailure);
    };
  }, []);

  if (!stall) return null;
  return <aside className="workflow-recovery" role="alert"><div><strong>{stall.label}</strong><p>{stall.detail}</p></div><div className="workflow-recovery-actions"><button onClick={() => setStall(null)}>Keep waiting</button><button className="recovery-reset" onClick={() => { setStall(null); onReset(); }}>Reset active view</button></div></aside>;
}

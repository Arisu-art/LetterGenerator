'use client';

import { useEffect, useMemo, useState } from 'react';
import { cancelActiveAppendixRender, type AppendixRenderProgress } from '../lib/supplemental-template-renderer';

type Activity = { message: string; startedAt: number } | null;
const activeOperation = /^(Generating|Preparing|Creating final PDF|Compressing final PDF|Saving edited document)/i;
const finishedOperation = /(?:successfully|ready for download|failed|saved to the working package)/i;

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function GenerationActivityMonitor() {
  const [activity, setActivity] = useState<Activity>(null);
  const [detail, setDetail] = useState<AppendixRenderProgress | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [cancelRequested, setCancelRequested] = useState(false);

  useEffect(() => {
    function readStatus() {
      const value = document.querySelector('.workspace-operation-status')?.textContent?.trim() || '';
      if (activeOperation.test(value)) setActivity((current) => current?.message === value ? current : { message: value, startedAt: Date.now() });
      else if (finishedOperation.test(value)) { setActivity(null); setDetail(null); setCancelRequested(false); setSeconds(0); }
    }
    function readProgress(event: Event) {
      const progress = (event as CustomEvent<AppendixRenderProgress>).detail;
      if (!progress) return;
      setDetail(progress);
      setActivity((current) => current || { message: 'Generating document component…', startedAt: Date.now() });
    }
    readStatus();
    const observer = new MutationObserver(readStatus);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('lettergenerator:appendix-progress', readProgress);
    return () => { observer.disconnect(); window.removeEventListener('lettergenerator:appendix-progress', readProgress); };
  }, []);

  useEffect(() => {
    if (!activity) return;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - activity.startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activity]);

  const guidance = useMemo(() => {
    if (cancelRequested) return 'Cancellation requested. Completed outputs will be retained while the active step exits safely.';
    if (seconds < 15) return 'Processing securely inside this browser session.';
    if (seconds < 45) return 'Large templates are executing in cooperative stages; you can cancel the active appendix step.';
    return 'This stage is taking longer than expected. Cancel it to retain completed outputs and review the template.';
  }, [cancelRequested, seconds]);

  if (!activity) return null;
  const percent = detail?.total ? Math.max(0, Math.min(100, Math.round((detail.completed / detail.total) * 100))) : 0;

  return (
    <aside className="generation-activity-monitor" role="status" aria-live="polite" aria-label="Document generation activity">
      <div className="generation-activity-pulse" aria-hidden="true" />
      <div className="generation-activity-copy">
        <p className="generation-activity-title">Active document job <strong>{elapsedLabel(seconds)}</strong></p>
        <p className="generation-activity-step">{activity.message}</p>
        {detail && <><div className="generation-activity-progress"><span style={{ width: `${percent}%` }} /></div><p className="generation-activity-detail">{detail.phase}</p></>}
        <p className="generation-activity-guidance">{guidance}</p>
      </div>
      {detail && <button className="generation-activity-cancel" type="button" disabled={cancelRequested} onClick={() => { setCancelRequested(true); cancelActiveAppendixRender(); }}>{cancelRequested ? 'Cancelling…' : 'Cancel active document'}</button>}
    </aside>
  );
}

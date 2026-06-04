'use client';

import { useEffect, useMemo, useState } from 'react';

type Activity = { message: string; startedAt: number } | null;

const activeOperation = /^(Generating|Preparing|Creating final PDF|Compressing final PDF|Saving edited document)/i;
const finishedOperation = /(?:successfully|ready for download|failed|saved to the working package)/i;

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function GenerationActivityMonitor() {
  const [activity, setActivity] = useState<Activity>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    function readStatus() {
      const value = document.querySelector('.workspace-operation-status')?.textContent?.trim() || '';
      if (activeOperation.test(value)) {
        setActivity((current) => current?.message === value ? current : { message: value, startedAt: Date.now() });
      } else if (finishedOperation.test(value)) {
        setActivity(null);
        setSeconds(0);
      }
    }
    readStatus();
    const observer = new MutationObserver(readStatus);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activity) return;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - activity.startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activity]);

  const guidance = useMemo(() => {
    if (seconds < 15) return 'Processing securely in this browser session.';
    if (seconds < 45) return 'Large templates are being processed in cooperative stages. The workspace remains responsive.';
    return 'This document is taking longer than expected. The processor will surface a template error or timeout rather than hiding the failure.';
  }, [seconds]);

  if (!activity) return null;

  return (
    <aside className="generation-activity-monitor" role="status" aria-live="polite" aria-label="Document generation activity">
      <div className="generation-activity-pulse" aria-hidden="true" />
      <div className="generation-activity-copy">
        <p className="generation-activity-title">Active document job <strong>{elapsedLabel(seconds)}</strong></p>
        <p className="generation-activity-step">{activity.message}</p>
        <p className="generation-activity-guidance">{guidance}</p>
      </div>
    </aside>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { applyRuntimeMode, runtimeSnapshot, type RuntimeSnapshot } from '../lib/performance-guardian';

export default function PerformanceBeacon() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() => runtimeSnapshot());

  useEffect(() => {
    let longTasks = 0;
    let observer: PerformanceObserver | undefined;

    const refresh = () => {
      const next = runtimeSnapshot(longTasks);
      applyRuntimeMode(next);
      setSnapshot(next);
    };

    try {
      observer = new PerformanceObserver((entries) => {
        longTasks += entries.getEntries().length;
        refresh();
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      observer = undefined;
    }

    const network = (navigator as Navigator & { connection?: EventTarget }).connection;
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', refresh);
    network?.addEventListener('change', refresh);

    return () => {
      observer?.disconnect();
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      document.removeEventListener('visibilitychange', refresh);
      network?.removeEventListener('change', refresh);
    };
  }, []);

  return (
    <div className={`runtime-beacon ${snapshot.mode}`} role="status" aria-live="polite">
      <span className="runtime-dot" />
      <div>
        <strong>{snapshot.mode === 'full' ? 'Performance optimized' : `${snapshot.mode} mode`}</strong>
        <small>{snapshot.message}</small>
      </div>
    </div>
  );
}

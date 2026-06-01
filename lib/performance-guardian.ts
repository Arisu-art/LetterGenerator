export type RuntimeMode = 'full' | 'balanced' | 'efficient' | 'offline';

export type RuntimeSnapshot = {
  mode: RuntimeMode;
  online: boolean;
  reducedData: boolean;
  effectiveType: string;
  longTasks: number;
  hidden: boolean;
  message: string;
};

type NetworkInformation = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function connection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

export function runtimeSnapshot(longTasks = 0): RuntimeSnapshot {
  if (typeof window === 'undefined') {
    return { mode: 'full', online: true, reducedData: false, effectiveType: 'unknown', longTasks: 0, hidden: false, message: 'Runtime initializing.' };
  }

  const network = connection();
  const online = navigator.onLine;
  const effectiveType = network?.effectiveType || 'unknown';
  const reducedData = Boolean(network?.saveData);
  const hidden = document.visibilityState === 'hidden';
  let mode: RuntimeMode = 'full';
  let message = 'Full-speed rendering active.';

  if (!online) {
    mode = 'offline';
    message = 'Offline mode: preserve current workflow until connection returns.';
  } else if (reducedData || effectiveType === 'slow-2g' || effectiveType === '2g' || longTasks >= 4) {
    mode = 'efficient';
    message = 'Efficiency mode: non-essential motion and visual load reduced.';
  } else if (hidden || effectiveType === '3g' || longTasks >= 2) {
    mode = 'balanced';
    message = 'Balanced mode: idle interface work is deprioritized.';
  }

  return { mode, online, reducedData, effectiveType, longTasks, hidden, message };
}

export function applyRuntimeMode(snapshot: RuntimeSnapshot) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.runtimeMode = snapshot.mode;
}

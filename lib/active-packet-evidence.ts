import type { PacketAssets } from './packet-assets';

type ActiveEvidence = { key: string; assets: PacketAssets };
let active: ActiveEvidence | null = null;
const listeners = new Set<() => void>();

export function setActivePacketEvidence(key: string, assets: PacketAssets) {
  active = { key, assets };
  listeners.forEach((notify) => notify());
}

export function getActivePacketEvidence() {
  return active;
}

export function subscribeActivePacketEvidence(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

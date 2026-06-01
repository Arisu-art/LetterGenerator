'use client';

import { createRoot, type Root } from 'react-dom/client';
import { useEffect } from 'react';
import ContinuousPacketCanvas from './ContinuousPacketCanvas';

/** Replaces the embedded PDF frame with a continuous page canvas while retaining the generated packet PDF as its source. */
export default function ContinuousPacketUpgrade() {
  useEffect(() => {
    let mountedFrame: HTMLIFrameElement | null = null;
    let mountNode: HTMLDivElement | null = null;
    let root: Root | null = null;

    const cleanup = () => {
      root?.unmount();
      root = null;
      mountNode?.remove();
      mountNode = null;
      mountedFrame?.classList.remove('continuous-source-frame');
      mountedFrame = null;
    };

    const enhance = () => {
      const frame = document.querySelector<HTMLIFrameElement>('.editor-complete-packet-preview iframe');
      const source = frame?.getAttribute('src') || '';
      if (!frame || !source) {
        if (mountedFrame && !document.body.contains(mountedFrame)) cleanup();
        return;
      }
      if (frame === mountedFrame && mountNode) return;
      cleanup();
      mountedFrame = frame;
      frame.classList.add('continuous-source-frame');
      mountNode = document.createElement('div');
      mountNode.className = 'continuous-upgrade-host';
      frame.parentElement?.appendChild(mountNode);
      root = createRoot(mountNode);
      const map = document.querySelector<HTMLElement>('.editor-packet-map');
      root.render(<ContinuousPacketCanvas sourceUrl={source} packetMap={map} />);
    };

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class'] });
    enhance();
    return () => { observer.disconnect(); cleanup(); };
  }, []);

  return null;
}

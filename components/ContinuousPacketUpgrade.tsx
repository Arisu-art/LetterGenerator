'use client';

import { createRoot, type Root } from 'react-dom/client';
import { useEffect } from 'react';
import ContinuousPacketCanvas from './ContinuousPacketCanvas';

/** Opens and upgrades the ordered PDF view when a document is selected for packet review. */
export default function ContinuousPacketUpgrade() {
  useEffect(() => {
    let mountedFrame: HTMLIFrameElement | null = null;
    let mountNode: HTMLDivElement | null = null;
    let root: Root | null = null;
    let attemptedModal: Element | null = null;
    let requestTimer: number | null = null;

    const cleanup = () => {
      root?.unmount();
      root = null;
      mountNode?.remove();
      mountNode = null;
      mountedFrame?.classList.remove('continuous-source-frame');
      mountedFrame = null;
    };

    const requestOrderedPreview = () => {
      const modal = document.querySelector('.simple-editor-modal');
      if (!modal || modal === attemptedModal) return;
      const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>('.editor-view-switch button'));
      const previewButton = buttons.find((button) => /Complete Packet Preview/i.test(button.textContent || ''));
      if (!previewButton || previewButton.disabled) return;
      attemptedModal = modal;
      requestTimer = window.setTimeout(() => previewButton.click(), 140);
    };

    const enhance = () => {
      requestOrderedPreview();
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
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'disabled'] });
    enhance();
    return () => { observer.disconnect(); if (requestTimer !== null) window.clearTimeout(requestTimer); cleanup(); };
  }, []);

  return null;
}

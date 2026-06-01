'use client';

import { useEffect } from 'react';

/**
 * Opens the complete packet preview automatically whenever an editable document
 * editor is opened. The user can scroll the full packet in filing order without
 * manually selecting side-map entries. The Edit DOCX tab remains available.
 */
export default function AutomaticPacketPreview() {
  useEffect(() => {
    let lastModal: Element | null = null;
    let timer: number | null = null;

    const openPacketPreview = () => {
      const modal = document.querySelector('.simple-editor-modal');
      if (!modal || modal === lastModal) return;
      const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>('.editor-view-switch button'));
      const packetButton = buttons.find((button) => /Complete Packet Preview/i.test(button.textContent || ''));
      if (!packetButton || packetButton.disabled) return;
      lastModal = modal;
      timer = window.setTimeout(() => packetButton.click(), 120);
    };

    const observer = new MutationObserver(openPacketPreview);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    openPacketPreview();

    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}

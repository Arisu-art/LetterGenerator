'use client';

import { useEffect, useState } from 'react';
import ProgressiveDisclosure from './ProgressiveDisclosure';
import SupportingDocumentsLayoutEditor from './SupportingDocumentsLayoutEditor';
import { setActivePacketEvidence } from '../lib/active-packet-evidence';
import {
  addSupportingAssets,
  loadPacketAssets,
  moveSupportingAsset,
  removeSupportingAsset,
  type PacketAssets
} from '../lib/packet-assets';

type Props = {
  storageKey: string;
  clientName: string;
  embedded?: boolean;
  onChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
};
function size(value: number) {
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
}
export default function SupportingDocumentsSetup({ storageKey, clientName, embedded = false, onChanged, onMessage }: Props) {
  const [assets, setAssets] = useState<PacketAssets>({ supporting: [], legalPdf: null });
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(true);
  const [layoutOpen, setLayoutOpen] = useState(false);
  useEffect(() => {
    const next = loadPacketAssets(storageKey);
    setAssets(next);
    setActivePacketEvidence(storageKey, next);
    setManageOpen(next.supporting.length === 0);
    setLayoutOpen(next.supporting.length > 0);
  }, [storageKey]);
  function changed(next: PacketAssets) {
    setAssets(next);
    setActivePacketEvidence(storageKey, next);
    onChanged(next);
  }
  async function add(files: File[]) {
    setBusy(true);
    try {
      const next = await addSupportingAssets(storageKey, files);
      changed(next);
      setManageOpen(false);
      setLayoutOpen(true);
      onMessage(`${next.supporting.length} supporting document file(s) saved. Arrange them on one aligned page before finalizing.`);
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    const next = await removeSupportingAsset(storageKey, id);
    changed(next);
    if (!next.supporting.length) {
      setManageOpen(true);
      setLayoutOpen(false);
    }
    onMessage('Supporting document removed from this client packet.');
  }
  function move(id: string, direction: -1 | 1) { changed(moveSupportingAsset(storageKey, id, direction)); }
  return <section className={`${embedded ? 'source-supporting-embedded' : 'panel source-supporting-panel'} progressive-supporting`}>
    {!embedded && <header className="supporting-header">
      <div>
        <p className="eyebrow">Evidence</p>
        <h2>Supporting Documents</h2>
        <p>Upload and arrange evidence for <strong>{clientName}</strong>.</p>
      </div>
      <span className={`supporting-count ${assets.supporting.length ? 'has-files' : ''}`}>{assets.supporting.length} file{assets.supporting.length === 1 ? '' : 's'}</span>
    </header>}
    {embedded && <div className="embedded-evidence-summary"><span>Client: <strong>{clientName}</strong></span><span className={`supporting-count ${assets.supporting.length ? 'has-files' : ''}`}>{assets.supporting.length} file{assets.supporting.length === 1 ? '' : 's'}</span></div>}
    <ProgressiveDisclosure open={manageOpen} onToggle={() => setManageOpen((value) => !value)} title={assets.supporting.length ? 'Manage evidence files' : 'Upload evidence'} summary={assets.supporting.length ? `${assets.supporting.length} file(s) in packet position 02` : 'Images are placed in packet position 02'} badge={<span className={`packet-status ${assets.supporting.length ? 'ready' : 'neutral'}`}>{assets.supporting.length ? 'Ready' : 'Optional'}</span>} className="supporting-disclosure evidence-upload-disclosure">
      <div className="source-supporting-grid">
        <label className="supporting-dropzone"><strong>{assets.supporting.length ? 'Add evidence files' : 'Choose evidence images'}</strong><span>JPG, PNG or WEBP</span><input disabled={busy} multiple type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void add(files); event.target.value = ''; }} /></label>
        {assets.supporting.length ? <ol className="source-supporting-list">{assets.supporting.map((asset, index) => <li key={asset.id}><span className="support-order">{index + 1}</span><div><strong>{asset.name}</strong><small>{size(asset.size)}{asset.placement ? ' · Positioned' : ' · Auto-aligned'}</small></div><div className="support-actions"><button type="button" disabled={index === 0} onClick={() => move(asset.id, -1)} aria-label="Move up">↑</button><button type="button" disabled={index === assets.supporting.length - 1} onClick={() => move(asset.id, 1)} aria-label="Move down">↓</button><button type="button" onClick={() => void remove(asset.id)}>Remove</button></div></li>)}</ol> : null}
      </div>
    </ProgressiveDisclosure>
    {assets.supporting.length > 0 && <ProgressiveDisclosure open={layoutOpen} onToggle={() => setLayoutOpen((value) => !value)} title="Arrange evidence page" summary="Crop and position images on one page" badge={<span className="packet-status ready">Editable</span>} className="supporting-disclosure layout-disclosure"><SupportingDocumentsLayoutEditor storageKey={storageKey} assets={assets} onChanged={changed} onMessage={onMessage} /></ProgressiveDisclosure>}
  </section>;
}

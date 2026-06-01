'use client';

import { useEffect, useState } from 'react';
import ProgressiveDisclosure from './ProgressiveDisclosure';
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
  onChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
};
function size(value: number) {
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
}
export default function SupportingDocumentsSetup({ storageKey, clientName, onChanged, onMessage }: Props) {
  const [assets, setAssets] = useState<PacketAssets>({ supporting: [], legalPdf: null });
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => { setAssets(loadPacketAssets(storageKey)); setManageOpen(false); setAboutOpen(false); }, [storageKey]);
  function changed(next: PacketAssets) { setAssets(next); onChanged(next); }
  async function add(files: File[]) {
    setBusy(true);
    try {
      const next = await addSupportingAssets(storageKey, files);
      changed(next);
      onMessage(`${next.supporting.length} supporting document file(s) saved for ${clientName}.`);
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    const next = await removeSupportingAsset(storageKey, id);
    changed(next);
    onMessage('Supporting document removed from this client packet.');
  }
  function move(id: string, direction: -1 | 1) { changed(moveSupportingAsset(storageKey, id, direction)); }
  return <section className="panel source-supporting-panel progressive-supporting">
    <header className="supporting-header">
      <div>
        <p className="eyebrow">Client-specific documents</p>
        <h2>Supporting Documents</h2>
        <p>Shared proof for <strong>{clientName}</strong>. Secondary upload controls stay hidden until you activate them.</p>
      </div>
      <span className={`supporting-count ${assets.supporting.length ? 'has-files' : ''}`}>{assets.supporting.length} file{assets.supporting.length === 1 ? '' : 's'}</span>
    </header>
    <ProgressiveDisclosure
      open={manageOpen}
      onToggle={() => setManageOpen((value) => !value)}
      title={assets.supporting.length ? 'Manage supporting evidence' : 'Add supporting evidence'}
      summary={assets.supporting.length ? `${assets.supporting.length} uploaded file(s) ready for packet position 02` : 'Upload files only when evidence is available'}
      badge={<span className={`packet-status ${assets.supporting.length ? 'ready' : ''}`}>{assets.supporting.length ? 'Available' : 'Optional now'}</span>}
      className="supporting-disclosure"
    >
      <div className="source-supporting-grid">
        <label className="supporting-dropzone">
          <strong>{assets.supporting.length ? 'Add more supporting documents' : 'Upload supporting documents'}</strong>
          <span>JPG, PNG or WEBP only · evidence for this client packet</span>
          <input disabled={busy} multiple type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void add(files); event.target.value = ''; }} />
        </label>
        {assets.supporting.length ? <ol className="source-supporting-list">{assets.supporting.map((asset, index) => <li key={asset.id}>
          <span className="support-order">{index + 1}</span>
          <div><strong>{asset.name}</strong><small>{size(asset.size)}</small></div>
          <div className="support-actions"><button disabled={index === 0} onClick={() => move(asset.id, -1)} aria-label="Move up">↑</button><button disabled={index === assets.supporting.length - 1} onClick={() => move(asset.id, 1)} aria-label="Move down">↓</button><button onClick={() => void remove(asset.id)}>Remove</button></div>
        </li>)}</ol> : <div className="supporting-empty"><strong>No supporting documents uploaded</strong><p>Packet generation proceeds with a blank page at position 02 until evidence is uploaded.</p></div>}
      </div>
    </ProgressiveDisclosure>
    <ProgressiveDisclosure
      open={aboutOpen}
      onToggle={() => setAboutOpen((value) => !value)}
      title="Where supporting documents appear"
      summary="Reveal packet placement details"
      className="supporting-disclosure info-disclosure"
    >
      <p className="source-upload-boundary">Supporting Documents are inserted at packet position 02 for each generated route. FCRA, Affidavit, Attachment and FTC references stay in Templates. When no evidence has been uploaded, the ordered output keeps a blank position 02 page.</p>
    </ProgressiveDisclosure>
  </section>;
}

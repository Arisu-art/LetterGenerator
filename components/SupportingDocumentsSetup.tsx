'use client';

import { useEffect, useState } from 'react';
import ProgressiveDisclosure from './ProgressiveDisclosure';
import SupportingDocumentsLayoutEditor from './SupportingDocumentsLayoutEditor';
import { setActivePacketEvidence } from '../lib/active-packet-evidence';
import {
  addSupportingAssets,
  loadPacketAssets,
  moveSupportingAsset,
  normalizeSupportingLayout,
  removeSupportingAsset,
  savePacketAssets,
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
      const next = normalizeSupportingLayout(await addSupportingAssets(storageKey, files));
      savePacketAssets(storageKey, next);
      changed(next);
      setManageOpen(false);
      setLayoutOpen(true);
      onMessage(`${next.supporting.length} supporting document file(s) saved. Arrange the required evidence page before continuing.`);
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    const next = normalizeSupportingLayout(await removeSupportingAsset(storageKey, id));
    savePacketAssets(storageKey, next);
    changed(next);
    if (!next.supporting.length) {
      setManageOpen(true);
      setLayoutOpen(false);
      onMessage('Supporting Documents are required. Upload an evidence image to continue.');
      return;
    }
    onMessage('Supporting document removed from this client packet.');
  }
  function move(id: string, direction: -1 | 1) {
    const next = normalizeSupportingLayout(moveSupportingAsset(storageKey, id, direction));
    savePacketAssets(storageKey, next);
    changed(next);
  }
  const ready = assets.supporting.length > 0;
  const fileLabel = `${assets.supporting.length} file${assets.supporting.length === 1 ? '' : 's'}`;
  const layoutTitle = ready ? 'Evidence page ready for layout' : 'Evidence image required';
  const layoutSummary = ready ? `Client: ${clientName} · Position 02 supporting documents` : 'Upload at least one image for packet position 02.';
  const uploadInputId = `${storageKey}-evidence-upload`;

  const managerPanel = (selectedEvidenceId: string | null, selectEvidence: (id: string) => void) => <div className="evidence-panel-v2">
    <label className="evidence-upload-card-v2" htmlFor={uploadInputId}>
      <span className="evidence-upload-title-v2">{ready ? 'Add evidence images' : 'Upload evidence images'}</span>
      <span className="evidence-upload-copy-v2">JPG, PNG or WEBP · packet position 02</span>
      <span className="evidence-upload-button-v2">Choose files</span>
      <input id={uploadInputId} disabled={busy} multiple type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void add(files); event.target.value = ''; }} />
    </label>

    {ready ? <ol className="evidence-list-v2">{assets.supporting.map((asset, index) => <li className={`evidence-card-v2 ${selectedEvidenceId === asset.id ? 'selected' : ''}`} key={asset.id}>
      <button type="button" className="evidence-card-select-v2" onClick={() => selectEvidence(asset.id)} aria-label={`Select ${asset.name}`}>
        <span className="evidence-number-v2">{index + 1}</span>
        <div className="evidence-meta-v2">
          <strong title={asset.name}>{asset.name}</strong>
          <small>{size(asset.size)} · {asset.placement ? 'Layout adjusted' : 'Ready to arrange'}</small>
        </div>
      </button>
      <div className="evidence-actions-v2">
        <button type="button" disabled={index === 0} onClick={() => move(asset.id, -1)} aria-label="Move up">↑ Up</button>
        <button type="button" disabled={index === assets.supporting.length - 1} onClick={() => move(asset.id, 1)} aria-label="Move down">↓ Down</button>
        <button type="button" className="evidence-remove-v2" onClick={() => void remove(asset.id)}>Remove</button>
      </div>
    </li>)}</ol> : <p className="evidence-empty-v2">Upload evidence images first. They will appear here for ordering and removal.</p>}
  </div>;

  const managerPanelNode = managerPanel(null, () => undefined);

  return <section className={`${embedded ? 'source-supporting-embedded required-supporting-embedded' : 'panel source-supporting-panel'} progressive-supporting merged-evidence-header`}>
    {!embedded && <header className="supporting-header">
      <div><p className="eyebrow">Required evidence</p><h2>Supporting Documents</h2><p>Upload and arrange evidence for <strong>{clientName}</strong>.</p></div>
      <span className={`supporting-count ${ready ? 'has-files' : ''}`}>{fileLabel}</span>
    </header>}
{!ready && <ProgressiveDisclosure open={manageOpen} onToggle={() => setManageOpen((value) => !value)} title={embedded ? layoutTitle : 'Upload required evidence'} summary={embedded ? layoutSummary : 'Required for every ordered packet'} badge={<span className="packet-status required">Required</span>} className="supporting-disclosure evidence-upload-disclosure evidence-single-header"> {managerPanelNode} </ProgressiveDisclosure>}
    {ready && <ProgressiveDisclosure open={layoutOpen} onToggle={() => setLayoutOpen((value) => !value)} title={embedded ? layoutTitle : 'Evidence layout'} summary={embedded ? layoutSummary : 'Position 02 supporting documents'} badge={<span className="packet-status ready evidence-ready-badge">{embedded ? `${fileLabel} · editable` : 'Editable'}</span>} className="supporting-disclosure layout-disclosure evidence-single-header"><SupportingDocumentsLayoutEditor storageKey={storageKey} assets={assets} managerPanel={managerPanel} onChanged={changed} onMessage={onMessage} /></ProgressiveDisclosure>}
  </section>;
}

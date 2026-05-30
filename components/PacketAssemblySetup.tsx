'use client';

import { useEffect, useState } from 'react';
import {
  addSupportingAssets,
  loadPacketAssets,
  moveSupportingAsset,
  removeLegalPdf,
  removeSupportingAsset,
  saveLegalPdf,
  type PacketAssets
} from '../lib/packet-assets';

type Props = {
  round: string;
  storageKey: string;
  clientName: string;
  onChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
};
function readableBytes(value: number) {
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
}

export default function PacketAssemblySetup({ round, storageKey, clientName, onChanged, onMessage }: Props) {
  const [assets, setAssets] = useState<PacketAssets>({ supporting: [], legalPdf: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => setAssets(storageKey ? loadPacketAssets(storageKey) : { supporting: [], legalPdf: null }), [storageKey]);

  function changed(next: PacketAssets) {
    setAssets(next);
    onChanged(next);
  }
  async function uploadSupporting(files: File[]) {
    setBusy(true);
    try {
      const next = await addSupportingAssets(storageKey, files);
      changed(next);
      onMessage(`${next.supporting.length} supporting evidence page(s) saved for ${clientName}.`);
    } finally { setBusy(false); }
  }
  async function uploadLegal(file: File) {
    setBusy(true);
    try {
      const next = await saveLegalPdf(storageKey, file);
      changed(next);
      onMessage(`FCRA Legal Exhibit saved for ${clientName}. It will be included with dispute packets only.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'PDF could not be saved.');
    } finally { setBusy(false); }
  }
  async function deleteSupporting(id: string) {
    const next = await removeSupportingAsset(storageKey, id);
    changed(next);
    onMessage('Supporting evidence removed from future generated packets for this client.');
  }
  async function deleteLegal() {
    const next = await removeLegalPdf(storageKey);
    changed(next);
    onMessage('FCRA Legal Exhibit removed from future dispute packets for this client.');
  }
  function move(id: string, direction: -1 | 1) {
    changed(moveSupportingAsset(storageKey, id, direction));
  }

  return <section className="panel packet-assembly client-packet-assembly">
    <header className="packet-heading">
      <div>
        <p className="eyebrow">Client documents · {round}</p>
        <h2>Supporting documents for {clientName}</h2>
        <p>The normalized source identifies this client. Upload case-specific evidence here; it will not carry into a newly uploaded client source.</p>
      </div>
      <span className="packet-summary">{assets.supporting.length} shared page{assets.supporting.length === 1 ? '' : 's'}{assets.legalPdf ? ' + FCRA PDF' : ''}</span>
    </header>
    <div className="packet-modules">
      <article className="packet-module supporting-module">
        <header>
          <div>
            <span className="packet-type shared">Both letter types</span>
            <h3>Supporting Documents</h3>
            <p>Included after generated Dispute and Late Payment letters for this client.</p>
          </div>
          <span className="module-count">{assets.supporting.length} file{assets.supporting.length === 1 ? '' : 's'}</span>
        </header>
        <label className="packet-upload">
          <strong>Add evidence files</strong>
          <span>JPG, PNG or WEBP · identity records, statements, or other proof</span>
          <input disabled={busy} multiple type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void uploadSupporting(files); event.target.value = ''; }} />
        </label>
        {assets.supporting.length ? <ol className="attachment-order">{assets.supporting.map((asset, index) => <li key={asset.id}>
          <span className="order-number">{index + 1}</span>
          <div><strong>{asset.name}</strong><small>{readableBytes(asset.size)} · shared evidence page</small></div>
          <div className="order-controls"><button disabled={index === 0} onClick={() => move(asset.id, -1)} aria-label="Move earlier">↑</button><button disabled={index === assets.supporting.length - 1} onClick={() => move(asset.id, 1)} aria-label="Move later">↓</button><button className="remove" onClick={() => void deleteSupporting(asset.id)}>Remove</button></div>
        </li>)}</ol> : <div className="packet-empty"><strong>No supporting evidence uploaded</strong><span>Generation remains available, but no supporting pages will be attached.</span></div>}
      </article>
      <article className="packet-module legal-module">
        <header>
          <div>
            <span className="packet-type legal">Dispute only</span>
            <h3>FCRA Legal Exhibit</h3>
            <p>Static PDF supplied with generated Dispute packets only.</p>
          </div>
          <span className="module-count">{assets.legalPdf ? 'Saved' : 'Optional'}</span>
        </header>
        <label className="packet-upload legal-upload">
          <strong>{assets.legalPdf ? 'Replace FCRA PDF' : 'Upload FCRA PDF'}</strong>
          <span>PDF only · no placeholders or content replacement</span>
          <input disabled={busy} type="file" accept=".pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLegal(file); event.target.value = ''; }} />
        </label>
        {assets.legalPdf ? <div className="legal-file"><div><strong>{assets.legalPdf.name}</strong><span>{readableBytes(assets.legalPdf.size)} · static PDF exhibit</span></div><button onClick={() => void deleteLegal()}>Remove</button></div> : <div className="packet-empty"><strong>No FCRA PDF uploaded</strong><span>Only generated dispute letters and any shared evidence will be packaged.</span></div>}
      </article>
    </div>
    <footer className="packet-privacy"><strong>Client-specific</strong><span>Files are connected only to this normalized source workspace and are not part of reusable letter templates.</span></footer>
  </section>;
}

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
  onChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
};
function readableBytes(value: number) {
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
}

export default function PacketAssemblySetup({ round, onChanged, onMessage }: Props) {
  const [assets, setAssets] = useState<PacketAssets>({ supporting: [], legalPdf: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => setAssets(loadPacketAssets(round)), [round]);

  function changed(next: PacketAssets) {
    setAssets(next);
    onChanged(next);
  }
  async function uploadSupporting(files: File[]) {
    setBusy(true);
    try {
      const next = await addSupportingAssets(round, files);
      changed(next);
      onMessage(`${next.supporting.length} shared supporting evidence page(s) saved for ${round}.`);
    } finally { setBusy(false); }
  }
  async function uploadLegal(file: File) {
    setBusy(true);
    try {
      const next = await saveLegalPdf(round, file);
      changed(next);
      onMessage('FCRA Legal Exhibit PDF saved. It will be included for dispute packets only.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'PDF could not be saved.');
    } finally { setBusy(false); }
  }
  async function deleteSupporting(id: string) {
    const next = await removeSupportingAsset(round, id);
    changed(next);
    onMessage('Supporting evidence page removed from future generated packets.');
  }
  async function deleteLegal() {
    const next = await removeLegalPdf(round);
    changed(next);
    onMessage('FCRA Legal Exhibit removed from future dispute packets.');
  }
  function move(id: string, direction: -1 | 1) {
    changed(moveSupportingAsset(round, id, direction));
  }

  return <section className="panel packet-assembly">
    <header className="packet-heading">
      <div>
        <p className="eyebrow">Packet assembly</p>
        <h2>Supporting documents and legal exhibit</h2>
        <p>Upload these once for {round}. They apply only when a valid letter is generated.</p>
      </div>
      <span className="packet-summary">{assets.supporting.length} shared page{assets.supporting.length === 1 ? '' : 's'}{assets.legalPdf ? ' + FCRA PDF' : ''}</span>
    </header>
    <div className="packet-modules">
      <article className="packet-module supporting-module">
        <header>
          <div>
            <span className="packet-type shared">Shared evidence</span>
            <h3>Supporting Documents</h3>
            <p>Included after every generated Dispute and Late Payment letter.</p>
          </div>
          <span className="module-count">{assets.supporting.length} page{assets.supporting.length === 1 ? '' : 's'}</span>
        </header>
        <label className="packet-upload">
          <strong>Add supporting pages</strong>
          <span>JPG, PNG or WEBP · each upload becomes one appended page</span>
          <input disabled={busy} multiple type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void uploadSupporting(files); event.target.value = ''; }} />
        </label>
        {assets.supporting.length ? <ol className="attachment-order">{assets.supporting.map((asset, index) => <li key={asset.id}>
          <span className="order-number">{index + 1}</span>
          <div><strong>{asset.name}</strong><small>{readableBytes(asset.size)} · shared evidence page</small></div>
          <div className="order-controls"><button disabled={index === 0} onClick={() => move(asset.id, -1)} aria-label="Move earlier">↑</button><button disabled={index === assets.supporting.length - 1} onClick={() => move(asset.id, 1)} aria-label="Move later">↓</button><button className="remove" onClick={() => void deleteSupporting(asset.id)}>Remove</button></div>
        </li>)}</ol> : <div className="packet-empty"><strong>No supporting evidence uploaded</strong><span>Letters may generate, but no proof page will be appended.</span></div>}
      </article>
      <article className="packet-module legal-module">
        <header>
          <div>
            <span className="packet-type legal">Dispute only</span>
            <h3>FCRA Legal Exhibit</h3>
            <p>One static PDF attached to dispute output packets only.</p>
          </div>
          <span className="module-count">{assets.legalPdf ? 'Saved' : 'Optional'}</span>
        </header>
        <label className="packet-upload legal-upload">
          <strong>{assets.legalPdf ? 'Replace FCRA PDF' : 'Upload FCRA PDF'}</strong>
          <span>PDF only · no placeholders and no content replacement</span>
          <input disabled={busy} type="file" accept=".pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLegal(file); event.target.value = ''; }} />
        </label>
        {assets.legalPdf ? <div className="legal-file"><div><strong>{assets.legalPdf.name}</strong><span>{readableBytes(assets.legalPdf.size)} · static PDF exhibit</span></div><button onClick={() => void deleteLegal()}>Remove</button></div> : <div className="packet-empty"><strong>No FCRA PDF uploaded</strong><span>Dispute output will contain the letter and any shared supporting pages only.</span></div>}
      </article>
    </div>
    <footer className="packet-privacy"><strong>Private attachments</strong><span>Files remain in this browser workspace and are not added to the repository.</span></footer>
  </section>;
}

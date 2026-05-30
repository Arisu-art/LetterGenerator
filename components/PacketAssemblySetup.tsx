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
import { countPdfPages } from '../lib/packet-renderer';

type Props = {
  round: string;
  onChanged: () => void;
  onMessage: (message: string) => void;
};
function readableBytes(value: number) {
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
}

export default function PacketAssemblySetup({ round, onChanged, onMessage }: Props) {
  const [assets, setAssets] = useState<PacketAssets>({ supporting: [], legalPdf: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => setAssets(loadPacketAssets(round)), [round]);

  async function uploadSupporting(files: File[]) {
    setBusy(true);
    try {
      const next = await addSupportingAssets(round, files);
      setAssets(next);
      onChanged();
      onMessage(`${next.supporting.length} supporting evidence page(s) saved for ${round}.`);
    } finally { setBusy(false); }
  }
  async function uploadLegal(file: File) {
    setBusy(true);
    try {
      const pages = await countPdfPages(file);
      const next = await saveLegalPdf(round, file, pages);
      setAssets(next);
      onChanged();
      onMessage(`Static legal exhibit saved: ${pages} PDF page(s), used for dispute outputs only.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'PDF could not be saved.');
    } finally { setBusy(false); }
  }
  async function deleteSupporting(id: string) {
    const next = await removeSupportingAsset(round, id);
    setAssets(next);
    onChanged();
    onMessage('Supporting evidence page removed from future generated packets.');
  }
  async function deleteLegal() {
    const next = await removeLegalPdf(round);
    setAssets(next);
    onChanged();
    onMessage('Static legal exhibit removed from future dispute packets.');
  }
  function move(id: string, direction: -1 | 1) {
    const next = moveSupportingAsset(round, id, direction);
    setAssets(next);
    onChanged();
  }

  return <section className="panel packet-assembly">
    <header className="packet-heading">
      <div>
        <p className="eyebrow">Document assembly</p>
        <h2>Attached evidence and legal exhibits</h2>
        <p>Upload once for {round}. The system appends these pages only to letters that are created from valid source data.</p>
      </div>
      <span className="packet-summary">{assets.supporting.length + (assets.legalPdf?.pages || 0)} appended page{assets.supporting.length + (assets.legalPdf?.pages || 0) === 1 ? '' : 's'}</span>
    </header>
    <div className="packet-modules">
      <article className="packet-module supporting-module">
        <header>
          <div>
            <span className="packet-type shared">Shared evidence</span>
            <h3>Supporting Documents</h3>
            <p>Applied to both Dispute and Late Payment letters.</p>
          </div>
          <span className="module-count">{assets.supporting.length} page{assets.supporting.length === 1 ? '' : 's'}</span>
        </header>
        <label className="packet-upload">
          <strong>Add supporting pages</strong>
          <span>JPG, PNG or WEBP · each file becomes one clean appended page</span>
          <input disabled={busy} multiple type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void uploadSupporting(files); event.target.value = ''; }} />
        </label>
        {assets.supporting.length ? <ol className="attachment-order">{assets.supporting.map((asset, index) => <li key={asset.id}>
          <span className="order-number">{index + 1}</span>
          <div><strong>{asset.name}</strong><small>{readableBytes(asset.size)} · supporting page</small></div>
          <div className="order-controls"><button disabled={index === 0} onClick={() => move(asset.id, -1)} aria-label="Move earlier">↑</button><button disabled={index === assets.supporting.length - 1} onClick={() => move(asset.id, 1)} aria-label="Move later">↓</button><button className="remove" onClick={() => void deleteSupporting(asset.id)}>Remove</button></div>
        </li>)}</ol> : <div className="packet-empty"><strong>No supporting evidence added</strong><span>Letters can still generate, but no evidence page will be appended.</span></div>}
      </article>
      <article className="packet-module legal-module">
        <header>
          <div>
            <span className="packet-type legal">Dispute only</span>
            <h3>FCRA Legal Exhibit</h3>
            <p>Static PDF appended unchanged in meaning to Dispute letters only.</p>
          </div>
          <span className="module-count">{assets.legalPdf?.pages || 0} page{assets.legalPdf?.pages === 1 ? '' : 's'}</span>
        </header>
        <label className="packet-upload legal-upload">
          <strong>{assets.legalPdf ? 'Replace FCRA PDF' : 'Upload FCRA PDF'}</strong>
          <span>PDF only · rendered as exhibit pages during packet generation</span>
          <input disabled={busy} type="file" accept=".pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLegal(file); event.target.value = ''; }} />
        </label>
        {assets.legalPdf ? <div className="legal-file"><div><strong>{assets.legalPdf.name}</strong><span>{readableBytes(assets.legalPdf.size)} · {assets.legalPdf.pages} PDF page(s)</span></div><button onClick={() => void deleteLegal()}>Remove</button></div> : <div className="packet-empty"><strong>No FCRA exhibit added</strong><span>Dispute letters will show a readiness warning until this PDF is uploaded.</span></div>}
      </article>
    </div>
    <footer className="packet-privacy"><strong>Private document handling</strong><span>Attachment contents are stored in this browser workspace for generation and are never committed to the repository.</span></footer>
  </section>;
}

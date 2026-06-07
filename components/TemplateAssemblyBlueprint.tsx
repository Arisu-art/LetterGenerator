'use client';

import { isFtcEnabled } from '../lib/workflow-framework';
import type { PacketAssets } from '../lib/packet-assets';

type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
type ReferenceSlot = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type Props = {
  round: Round;
  slots: ReferenceSlot[];
  selectedId: string;
  packet: PacketAssets;
  sourceVerified: boolean;
  clientName: string;
  onSelect: (id: string) => void;
  onSourceData: () => void;
};
function Status({ saved, text }: { saved: boolean; text: string }) {
  return <span className={`blueprint-status ${saved ? 'ready' : ''}`}>{text}</span>;
}
function Connector() { return <span className="blueprint-connector" aria-hidden="true"><i /></span>; }

export default function TemplateAssemblyBlueprint({ round, slots, selectedId, packet, sourceVerified, clientName, onSelect, onSourceData }: Props) {
  const dispute = slots.find((slot) => slot.type === 'DISPUTE');
  const latePayment = slots.find((slot) => slot.type === 'LATE_PAYMENT');
  const context = sourceVerified ? `Current source: ${clientName}` : 'No normalized client source connected yet';
  return <section className="panel template-blueprint">
    <header className="blueprint-heading">
      <div>
        <p className="eyebrow">Reusable packet blueprint</p>
        <h2>{round} document order</h2>
        <p>Letter references are reusable. Client-specific evidence is connected from Source Data only after normalization.</p>
      </div>
      <button className="blueprint-source-action" onClick={onSourceData}>{sourceVerified ? 'View client documents' : 'Go to Source Data'}</button>
    </header>
    <div className="blueprint-context"><span className={sourceVerified ? 'connected' : ''} /> <strong>{context}</strong></div>
    <div className="blueprint-grid">
      <article className="blueprint-lane dispute-lane">
        <header><div><span className="blueprint-kind dispute">Dispute packet</span><h3>Dispute Letter assembly</h3></div><span className="lane-rule">Bureau-specific output</span></header>
        <div className="blueprint-flow">
          <button className={`blueprint-node letter-node ${selectedId === dispute?.id ? 'selected' : ''}`} onClick={() => dispute && onSelect(dispute.id)}>
            <span className="node-step">01</span><div><strong>Dispute Letter Reference</strong><small>Editable DOCX template · includes uploaded supporting page at generation</small></div><Status saved={Boolean(dispute?.file)} text={dispute?.file ? 'Saved' : 'Upload needed'} />
          </button>
          <Connector />
          <div className="blueprint-node linked-node"><span className="node-step">02</span><div><strong>Supporting Documents</strong><small>Client evidence · appended inside letter DOCX</small></div><Status saved={packet.supporting.length > 0} text={packet.supporting.length ? `${packet.supporting.length} file(s)` : sourceVerified ? 'Add in Source' : 'Source-linked'} /></div>
          <Connector />
          <div className="blueprint-node linked-node"><span className="node-step">03</span><div><strong>FCRA Legal Exhibit</strong><small>Static PDF · packaged with dispute output only</small></div><Status saved={Boolean(packet.legalPdf)} text={packet.legalPdf ? 'Saved' : sourceVerified ? 'Add in Source' : 'Source-linked'} /></div>
          <Connector />
          <div className="blueprint-node future-node"><span className="node-step">04</span><div><strong>Affidavit</strong><small>Reserved dispute exhibit position</small></div><Status saved={false} text="Not configured" /></div>
          <Connector />
          <div className="blueprint-node future-node"><span className="node-step">05</span><div><strong>Attachment</strong><small>Reserved exhibit position</small></div><Status saved={false} text="Not configured" /></div>
          {isFtcEnabled() && <>
            <Connector />
            <div className="blueprint-node future-node"><span className="node-step">06</span><div><strong>FTC</strong><small>Reserved dispute exhibit position</small></div><Status saved={false} text="Not configured" /></div>
          </>}
        </div>
      </article>
      <article className="blueprint-lane late-lane">
        <header><div><span className="blueprint-kind late">Late Payment packet</span><h3>Late Payment assembly</h3></div><span className="lane-rule">Only when data exists</span></header>
        <div className="blueprint-flow compact">
          <button className={`blueprint-node letter-node ${selectedId === latePayment?.id ? 'selected' : ''}`} onClick={() => latePayment && onSelect(latePayment.id)}>
            <span className="node-step">01</span><div><strong>Late Payment Letter Reference</strong><small>Editable DOCX template · includes uploaded supporting page at generation</small></div><Status saved={Boolean(latePayment?.file)} text={latePayment?.file ? 'Saved' : 'Upload needed'} />
          </button>
          <Connector />
          <div className="blueprint-node linked-node"><span className="node-step">02</span><div><strong>Supporting Documents</strong><small>Same client evidence · appended inside letter DOCX</small></div><Status saved={packet.supporting.length > 0} text={packet.supporting.length ? `${packet.supporting.length} file(s)` : sourceVerified ? 'Add in Source' : 'Source-linked'} /></div>
        </div>
        <p className="late-note">FCRA, Affidavit, Attachment and FTC are not inserted in the Late Payment packet unless a future rule explicitly requires them.</p>
      </article>
    </div>
  </section>;
}

'use client';

import { useState } from 'react';
import { isFtcEnabled } from '../lib/workflow-framework';

type Item = { id: string; title: string; detail: string; status: string; ready?: boolean };
type Props = {
  disputeTitle: string;
  disputeReady: boolean;
  lateTitle: string;
  lateReady: boolean;
  supportingReady: boolean;
  exhibitItems: Item[];
  renderDisputeUpload: React.ReactNode;
  renderLateUpload: React.ReactNode;
  renderExhibitUpload: (id: string) => React.ReactNode;
};
function Badge({ ready, children }: { ready?: boolean; children: React.ReactNode }) {
  return <span className={`order-status ${ready ? 'ready' : ''}`}>{children}</span>;
}
function Step({ number, title, detail, status, ready, action }: Item & { number: string; action?: React.ReactNode }) {
  return <div className="order-step"><span className="order-number">{number}</span><div className="order-copy"><strong>{title}</strong><small>{detail}</small></div><Badge ready={ready}>{status}</Badge>{action}</div>;
}
export default function CollapsiblePacketOrder(props: Props) {
  const [open, setOpen] = useState<'DISPUTE' | 'LATE' | null>(null);
  return <section className="packet-order">
    <header className="packet-order-header"><div><h2>Document packet order</h2><p>Open a packet to manage its reusable files. Supporting Documents remain connected to Source Data.</p></div><span>Collapsed by default</span></header>
    <article className={`order-group ${open === 'DISPUTE' ? 'open' : ''}`}>
      <button className="order-toggle" onClick={() => setOpen(open === 'DISPUTE' ? null : 'DISPUTE')} aria-expanded={open === 'DISPUTE'}><div><strong>{props.disputeTitle}</strong><small>Supporting Document inside letter → FCRA → Affidavit → Attachment{isFtcEnabled() && ' → FTC'}</small></div><Badge ready={props.disputeReady}>{props.disputeReady ? 'Saved' : 'Needed'}</Badge><i>{open === 'DISPUTE' ? '−' : '+'}</i></button>
      {open === 'DISPUTE' && <div className="order-details">
        <Step id="dispute" number="01" title="Dispute Letter DOCX" detail="Reusable letter reference" status={props.disputeReady ? 'Saved' : 'Needed'} ready={props.disputeReady} action={props.renderDisputeUpload} />
        <span className="order-link" />
        <Step id="supporting" number="02" title="Supporting Document" detail="Upload in Source Data with client TXT" status={props.supportingReady ? 'Added' : 'Source Data'} ready={props.supportingReady} />
        {props.exhibitItems.map((item, index) => <div key={item.id}><span className="order-link" /><Step {...item} number={String(index + 3).padStart(2, '0')} action={props.renderExhibitUpload(item.id)} /></div>)}
      </div>}
    </article>
    <article className={`order-group ${open === 'LATE' ? 'open' : ''}`}>
      <button className="order-toggle" onClick={() => setOpen(open === 'LATE' ? null : 'LATE')} aria-expanded={open === 'LATE'}><div><strong>{props.lateTitle}</strong><small>Supporting Document inside letter only</small></div><Badge ready={props.lateReady}>{props.lateReady ? 'Saved' : 'Needed'}</Badge><i>{open === 'LATE' ? '−' : '+'}</i></button>
      {open === 'LATE' && <div className="order-details">
        <Step id="late" number="01" title="Late Payment Letter DOCX" detail="Reusable letter reference" status={props.lateReady ? 'Saved' : 'Needed'} ready={props.lateReady} action={props.renderLateUpload} />
        <span className="order-link" />
        <Step id="supporting-late" number="02" title="Supporting Document" detail="Same source-linked supporting document" status={props.supportingReady ? 'Added' : 'Source Data'} ready={props.supportingReady} />
        <p className="order-note">Dispute exhibit files are not included in Late Payment output.</p>
      </div>}
    </article>
  </section>;
}

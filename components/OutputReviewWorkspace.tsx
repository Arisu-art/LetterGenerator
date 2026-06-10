'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import { isFtcEnabled } from '../lib/workflow-framework';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterRoute, LetterType } from '../lib/letter-engine';
import { buildPacketReviewSummary } from '../lib/packet-review-contract';
import { userFacingText } from '../lib/ux-copy-contract';

export interface ReviewOutput {
  id?: string;
  path: string;
  type: LetterType;
  role?: 'LETTER' | 'AFFIDAVIT' | 'FTC';
  sequence?: number;
  bureau: string;
  count: number;
  detail: string;
  blob: Blob;
  packetSteps?: string[];
}

interface OutputReviewWorkspaceProps {
  round: string;
  outputs: ReviewOutput[];
  expectedRoutes?: LetterRoute[];
  zipName?: string;
  warnings: string[];
  evidenceKey?: string;
  evidence?: PacketAssets;
  onEvidenceChanged?: (assets: PacketAssets) => void;
  onMessage?: (message: string) => void;
  onZip: () => void;
  onReplace: (output: ReviewOutput, file: File) => void | Promise<void>;
  finalPackets?: unknown[];
  finalizing?: boolean;
  finalZipName?: string;
  onFinalZip?: () => void;
  onFinalize?: () => void | Promise<void>;
  onPreviewPacket?: (output: ReviewOutput, pendingBlob: Blob) => Promise<unknown>;
  onPdfDownload?: (packet: ReviewOutput) => void;
}

function packetDocuments(anchor: ReviewOutput, allOutputs: ReviewOutput[]) {
  return allOutputs
    .filter((item) => {
      if (item.role === 'FTC' && !isFtcEnabled()) return false;
      if (item.bureau === anchor.bureau && item.type === anchor.type) return true;
      return anchor.type === 'DISPUTE' && (item.role === 'AFFIDAVIT' || (item.role === 'FTC' && isFtcEnabled())) && item.bureau === 'CLIENT';
    })
    .sort((a, b) => (a.sequence || 1) - (b.sequence || 1));
}

export default function OutputReviewWorkspace({
  round,
  outputs,
  expectedRoutes,
  zipName,
  warnings,
  evidenceKey,
  evidence,
  onEvidenceChanged,
  onMessage,
  onZip,
  onReplace
}: OutputReviewWorkspaceProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [reviewedPaths, setReviewedPaths] = useState<string[]>([]);

  const activeOutputs = useMemo(() => outputs.filter((output) => output.role !== 'FTC' || isFtcEnabled()), [outputs]);
  const review = useMemo(() => buildPacketReviewSummary({ outputs: activeOutputs, reviewedPaths, evidence, expectedRoutes }), [activeOutputs, reviewedPaths, evidence, expectedRoutes]);
  const selected = activeOutputs.find((output) => output.path === selectedPath) || null;
  const selectedDocuments = selected ? packetDocuments(selected, activeOutputs) : [];

  function openPacket(path: string) {
    setSelectedPath(path);
    setReviewedPaths((current) => current.includes(path) ? current : [...current, path]);
  }

  return (
    <section className="outputs-workspace guided-output-workspace progressive-output-workspace">
      <section className="panel output-stage output-review-stage shared-stage-surface">
        <header className="output-stage-header output-progressive-command">
          <div className="output-stage-heading">
            <p className="eyebrow">Review and delivery</p>
            <h2>{review.headline}</h2>
            <p>{review.instruction}</p>
          </div>
        </header>

        <section className="output-packet-review canonical-package-review" aria-label="Packet review">
          <div className="review-cards output-packet-grid">
            {review.cards.map((packet) => (
              <article className={`review-card packet-card component-package-card ${packet.reviewed ? 'reviewed' : ''}`} key={packet.key}>
                <header className="output-card-head">
                  <span className="output-bureau">{packet.bureau}</span>
                  <span className={`packet-status ${packet.ready ? 'ready' : 'pending'}`}>{packet.reviewed ? 'Reviewed' : packet.ready ? 'Ready' : 'Needs review'}</span>
                </header>

                <h3>{packet.title}</h3>
                <p className="output-card-order">{packet.subtitle}</p>

                <div className="package-file-list">
                  {packet.documents.map((row) => (
                    <div key={row.id}>
                      <b>{row.id}</b>
                      <strong>{row.label}</strong>
                      <small>{row.detail}</small>
                      <span>{row.included ? 'Included' : 'Missing'}</span>
                    </div>
                  ))}
                </div>

                <button type="button" className="edit-document" onClick={() => openPacket(packet.key)}>
                  Review packet
                </button>
              </article>
            ))}
          </div>
        </section>

        {warnings.length > 0 && (
          <section className="output-notices">
            <strong>Items to review</strong>
            {warnings.slice(0, 3).map((warning, index) => <p key={index}>{userFacingText(warning, 'error')}</p>)}
          </section>
        )}

        <section className="complete-package-delivery">
          <div>
            <p className="eyebrow">Final package</p>
            <h3>Download final package</h3>
            <p>{review.reviewedPackets}/{review.totalPackets} packet{review.totalPackets === 1 ? '' : 's'} reviewed. Review each prepared packet, then download the final organized package.</p>
          </div>
          <button type="button" className="action-button" disabled={!zipName || !review.readyToDownload} onClick={onZip}>
            Download final package
          </button>
        </section>
      </section>

      {selected && (
        <SimpleDocxEditor
          round={round}
          output={selected}
          documents={selectedDocuments}
          initialDocumentPath={selected.path}
          evidenceKey={evidenceKey}
          evidence={evidence}
          warnings={warnings}
          onEvidenceChanged={onEvidenceChanged}
          onMessage={onMessage}
          onClose={() => setSelectedPath(null)}
          onSave={onReplace}
        />
      )}
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterRoute, LetterType } from '../lib/letter-engine';
import { packetOrderText } from '../lib/workflow-framework';

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
  onPreviewPacket?: (...args: unknown[]) => Promise<unknown>;
  onPdfDownload?: (...args: unknown[]) => void;
}

function isEditableLetter(output: ReviewOutput) {
  return !output.role || output.role === 'LETTER';
}

function packetTitle(output: ReviewOutput) {
  const label = output.type === 'LATE_PAYMENT' ? 'Late Payment' : 'Dispute';
  return `${output.bureau} ${label} Packet`;
}

function packetDocuments(anchor: ReviewOutput, allOutputs: ReviewOutput[]) {
  return allOutputs
    .filter((item) => {
      if (item.role === 'FTC') return false;
      if (item.bureau === anchor.bureau && item.type === anchor.type) return true;
      return anchor.type === 'DISPUTE' && item.role === 'AFFIDAVIT' && item.bureau === 'CLIENT';
    })
    .sort((a, b) => (a.sequence || 1) - (b.sequence || 1));
}

function packageRows(output: ReviewOutput, supportingCount: number) {
  if (output.type === 'LATE_PAYMENT') {
    return [
      { id: '01', label: 'Late Payment Letter', detail: 'Editable DOCX' },
      { id: '02', label: 'Supporting Documents', detail: `${supportingCount} evidence file${supportingCount === 1 ? '' : 's'}` }
    ];
  }

  return [
    { id: '01', label: 'Dispute Letter', detail: 'Editable DOCX' },
    { id: '02', label: 'Supporting Documents', detail: `${supportingCount} evidence file${supportingCount === 1 ? '' : 's'}` },
    { id: '03', label: 'FCRA Legal Exhibit', detail: 'Configured PDF insert' },
    { id: '04', label: 'Affidavit', detail: 'Editable DOCX' },
    { id: '05', label: 'Attachment', detail: 'Configured PDF insert' }
  ];
}

export default function OutputReviewWorkspace({
  round,
  outputs,
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

  const activeOutputs = useMemo(() => outputs.filter((output) => output.role !== 'FTC'), [outputs]);
  const packets = useMemo(
    () => activeOutputs.filter(isEditableLetter).sort((a, b) => a.bureau.localeCompare(b.bureau) || a.type.localeCompare(b.type)),
    [activeOutputs]
  );

  const selected = activeOutputs.find((output) => output.path === selectedPath) || null;
  const selectedDocuments = selected ? packetDocuments(selected, activeOutputs) : [];
  const supportingCount = evidence?.supporting.length || 0;

  function openPacket(packet: ReviewOutput) {
    setSelectedPath(packet.path);
    setReviewedPaths((current) => current.includes(packet.path) ? current : [...current, packet.path]);
  }

  return (
    <section className="outputs-workspace guided-output-workspace progressive-output-workspace">
      <section className="panel output-stage output-review-stage shared-stage-surface">
        <header className="output-stage-header output-progressive-command">
          <div className="output-stage-heading">
            <p className="eyebrow">Review and delivery</p>
            <h2>Complete ordered package</h2>
            <p>Open each packet for live-proof review, edit generated DOCX documents, then download the ordered ZIP package.</p>
          </div>
        </header>

        <section className="output-packet-review canonical-package-review">
          <header className="output-section-heading">
            <p className="eyebrow">Live-proof packet preview</p>
            <h3>Review packets before download</h3>
            <p>{packets.length} packet{packets.length === 1 ? '' : 's'} ready for review.</p>
          </header>

          <div className="review-cards output-packet-grid">
            {packets.map((packet) => (
              <article className={`review-card packet-card component-package-card ${reviewedPaths.includes(packet.path) ? 'reviewed' : ''}`} key={packet.path}>
                <header className="output-card-head">
                  <span className="output-bureau">{packet.bureau}</span>
                  <span className="packet-status ready">Ready</span>
                </header>

                <h3>{packetTitle(packet)}</h3>
                <p className="output-card-order">{packetOrderText(packet.type)}</p>

                <div className="package-file-list">
                  {packageRows(packet, supportingCount).map((row) => (
                    <div key={row.id}>
                      <b>{row.id}</b>
                      <strong>{row.label}</strong>
                      <small>{row.detail}</small>
                      <span>Included</span>
                    </div>
                  ))}
                </div>

                <button type="button" className="edit-document" onClick={() => openPacket(packet)}>
                  Open Live-Proof Preview
                </button>
              </article>
            ))}
          </div>
        </section>

        {warnings.length > 0 && (
          <section className="output-notices">
            <strong>Notes</strong>
            {warnings.slice(0, 3).map((warning, index) => <p key={index}>{warning}</p>)}
          </section>
        )}

        <section className="complete-package-delivery">
          <div>
            <p className="eyebrow">Download</p>
            <h3>Ordered package ZIP</h3>
            <p>Downloads the final ordered bureau folders only.</p>
          </div>
          <button type="button" className="action-button" disabled={!zipName} onClick={onZip}>
            Download Ordered Package ZIP
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

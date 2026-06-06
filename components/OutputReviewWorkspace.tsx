'use client';

import { useEffect, useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterRoute, LetterType } from '../lib/letter-engine';
import { packetOrderText } from '../lib/workflow-framework';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';

export type ReviewOutput = {
  id?: string;
  path: string;
  type: LetterType;
  role?: DocumentRole;
  sequence?: number;
  bureau: string;
  count: number;
  detail: string;
  blob: Blob;
  packetSteps?: string[];
};

type Props = {
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
  onPreviewPacket?: (...args: any[]) => Promise<unknown>;
  onPdfDownload?: (...args: any[]) => void;
};

type PackageFile = {
  position: string;
  label: string;
  format: 'DOCX' | 'PDF';
  supportingCount?: number;
};

function isLetter(output: ReviewOutput) {
  return !output.role || output.role === 'LETTER';
}

function packetTitle(output: ReviewOutput) {
  return `${output.bureau} ${output.type === 'DISPUTE' ? 'Dispute' : 'Late Payment'} Packet`;
}

function packetDocuments(anchor: ReviewOutput, all: ReviewOutput[]) {
  return all
    .filter((item) =>
      item.type === anchor.type &&
      (
        item.bureau === anchor.bureau ||
        (anchor.type === 'DISPUTE' && item.role === 'AFFIDAVIT' && item.bureau === 'CLIENT')
      )
    )
    .sort((a, b) => (a.sequence || 1) - (b.sequence || 1));
}

function packageFiles(type: LetterType, supportingCount: number): PackageFile[] {
  if (type === 'DISPUTE') {
    return [
      { position: '01', label: 'Dispute Letter', format: 'DOCX' },
      { position: '02', label: 'Supporting Documents', format: 'PDF', supportingCount },
      { position: '03', label: 'FCRA Legal Exhibit', format: 'PDF' },
      { position: '04', label: 'Affidavit', format: 'DOCX' },
      { position: '05', label: 'Attachment', format: 'PDF' }
    ];
  }

  return [
    { position: '01', label: 'Late Payment Letter', format: 'DOCX' },
    { position: '02', label: 'Supporting Documents', format: 'PDF', supportingCount }
  ];
}

export default function OutputReviewWorkspace({
  round,
  outputs,
  zipName,
  warnings,
  evidenceKey = '',
  evidence,
  onEvidenceChanged,
  onMessage,
  onZip,
  onReplace
}: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);

  const active = useMemo(() => outputs.filter((item) => item.role !== 'FTC'), [outputs]);
  const packets = useMemo(
    () => active.filter(isLetter).sort((a, b) => a.bureau.localeCompare(b.bureau) || a.type.localeCompare(b.type)),
    [active]
  );

  const selected = active.find((item) => item.path === selectedPath) || null;
  const selectedPacket = selected && isLetter(selected) ? selected : null;
  const selectedDocuments = selectedPacket ? packetDocuments(selectedPacket, active) : [];

  const editorWarnings = useMemo(
    () => Array.from(new Set(warnings.filter((warning) => !/\bFTC\b|identity\s+theft\s+report/i.test(warning)))),
    [warnings]
  );

  const supportingCount = evidence?.supporting.length || 0;

  useEffect(() => {
    setReviewed((value) => value.filter((path) => packets.some((packet) => packet.path === path)));
  }, [packets]);

  function openPacket(packet: ReviewOutput) {
    setSelectedPath(packet.path);
    setReviewed((value) => value.includes(packet.path) ? value : [...value, packet.path]);
  }

  return (
    <section className="outputs-workspace guided-output-workspace progressive-output-workspace">
      <section className="panel output-stage output-review-stage shared-stage-surface">
        <header className="output-stage-header output-progressive-command">
          <div className="output-stage-heading">
            <p className="eyebrow">Review and delivery</p>
            <h2>Complete ordered package</h2>
            <p>Review each bureau packet, make edits if needed, then download the complete ZIP.</p>
          </div>
        </header>

        <section className="output-packet-review canonical-package-review">
          <header className="output-section-heading">
            <p className="eyebrow">Ordered folders</p>
            <h3>Package Contents by Bureau</h3>
            <p>The DOCX and PDF components below are included in each bureau folder.</p>
          </header>

          <div className="review-cards output-packet-grid">
            {packets.map((packet) => (
              <article
                className={`review-card packet-card component-package-card ${reviewed.includes(packet.path) ? 'reviewed' : ''}`}
                key={packet.path}
              >
                <header className="output-card-head">
                  <span className="output-bureau">{packet.bureau}</span>
                  <span className="packet-status ready">Ready</span>
                </header>

                <h3>{packetTitle(packet)}</h3>
                <p className="output-card-order">{packetOrderText(packet.type)}</p>

                <div className="package-file-list">
                  {packageFiles(packet.type, supportingCount).map((file) => (
                    <div key={file.position}>
                      <b>{file.position}</b>
                      <strong>{file.label}</strong>
                      <small>
                        {file.format}
                        {file.supportingCount ? ` · ${file.supportingCount} file${file.supportingCount === 1 ? '' : 's'}` : ''}
                      </small>
                      <span>Included</span>
                    </div>
                  ))}
                </div>

                <button type="button" className="edit-document" onClick={() => openPacket(packet)}>
                  Open Packet Editor
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="complete-package-delivery">
          <div>
            <p className="eyebrow">Single archive delivery</p>
            <h3>Download ordered packet package</h3>
            <p>Includes the generated bureau folders and supporting files.</p>
          </div>
          <button type="button" className="action-button" disabled={!zipName} onClick={onZip}>
            Download Ordered Package ZIP
          </button>
        </section>
      </section>

      {selectedPacket && selected && (
        <SimpleDocxEditor
          round={round}
          output={selectedPacket}
          documents={selectedDocuments}
          initialDocumentPath={selected.path}
          evidenceKey={evidenceKey}
          evidence={evidence}
          warnings={editorWarnings}
          onEvidenceChanged={onEvidenceChanged}
          onMessage={onMessage}
          onClose={() => setSelectedPath(null)}
          onSave={onReplace}
        />
      )}
    </section>
  );
}

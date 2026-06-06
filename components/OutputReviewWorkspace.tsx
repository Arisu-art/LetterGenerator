'use client';

import { useMemo } from 'react';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterRoute, LetterType } from '../lib/letter-engine';

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
  onPreviewPacket?: (...args: unknown[]) => Promise<unknown>;
  onPdfDownload?: (...args: unknown[]) => void;
};

function labelForType(type: LetterType) {
  return type === 'LATE_PAYMENT' ? 'Late Payment Letter' : 'Dispute Letter';
}

export default function OutputReviewWorkspace({
  outputs,
  zipName,
  warnings,
  evidence,
  onZip
}: Props) {
  const visibleOutputs = useMemo(() => outputs.filter((output) => output.role !== 'FTC'), [outputs]);
  const supportingCount = evidence?.supporting.length || 0;

  return (
    <section className="outputs-workspace guided-output-workspace progressive-output-workspace">
      <section className="panel output-stage output-review-stage shared-stage-surface">
        <header className="output-stage-header output-progressive-command">
          <div className="output-stage-heading">
            <p className="eyebrow">Review and delivery</p>
            <h2>Complete ordered package</h2>
            <p>Review the generated bureau documents, then download the complete ordered package.</p>
          </div>
        </header>

        <section className="output-packet-review canonical-package-review">
          <header className="output-section-heading">
            <p className="eyebrow">Ordered package</p>
            <h3>Generated documents</h3>
            <p>
              {visibleOutputs.length} document{visibleOutputs.length === 1 ? '' : 's'} ready.
              Supporting files: {supportingCount}.
            </p>
          </header>

          <div className="review-cards output-packet-grid">
            {visibleOutputs.map((output) => (
              <article className="review-card packet-card component-package-card reviewed" key={output.path}>
                <header className="output-card-head">
                  <span className="output-bureau">{output.bureau}</span>
                  <span className="packet-status ready">Ready</span>
                </header>

                <h3>{labelForType(output.type)}</h3>
                <p>{output.detail}</p>
              </article>
            ))}
          </div>
        </section>

        {warnings.length > 0 && (
          <section className="output-notices">
            <strong>Notes</strong>
            {warnings.slice(0, 3).map((warning, index) => (
              <p key={index}>{warning}</p>
            ))}
          </section>
        )}

        <section className="complete-package-delivery">
          <div>
            <p className="eyebrow">Download</p>
            <h3>Ordered package files</h3>
            <p>Download the final ordered ZIP package.</p>
          </div>

          <div className="output-download-actions">
            <button type="button" className="action-button" disabled={!zipName} onClick={onZip}>
              Download Ordered Package ZIP
            </button>
          </div>
        </section>
      </section>
    </section>
  );
}

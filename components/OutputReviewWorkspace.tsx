'use client';

import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { renderAsync } from 'docx-preview';
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

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PDF_TYPE = 'application/pdf';

function labelForType(type: LetterType) {
  return type === 'LATE_PAYMENT' ? 'Late Payment Letter' : 'Dispute Letter';
}

function pdfPath(path: string) {
  return path.replace(/\.docx$/i, '.pdf').replace(/\/+/g, '/');
}

function pdfZipName(zipName?: string) {
  return (zipName || 'ORDERED_PACKET_PACKAGE.zip').replace(/\.zip$/i, '_PDF.zip');
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function canvasToPngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PDF page rasterization failed.')), 'image/png', 0.95);
  });

  return new Uint8Array(await blob.arrayBuffer());
}

async function docxToPdfBlob(blob: Blob) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-12000px';
  host.style.top = '0';
  host.style.width = '816px';
  host.style.minHeight = '1056px';
  host.style.background = '#ffffff';
  host.style.color = '#000000';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  try {
    await renderAsync(blob, host);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const canvas = await html2canvas(host, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    });

    const pdf = await PDFDocument.create();
    const pagePixelHeight = Math.max(1, Math.floor(canvas.width * (A4_HEIGHT / A4_WIDTH)));

    for (let y = 0; y < canvas.height; y += pagePixelHeight) {
      const height = Math.min(pagePixelHeight, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = height;

      const context = slice.getContext('2d');
      if (!context) throw new Error('Could not prepare PDF page canvas.');

      context.drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);

      const image = await pdf.embedPng(await canvasToPngBytes(slice));
      const pageHeight = A4_WIDTH * (slice.height / slice.width);
      const finalHeight = Math.min(A4_HEIGHT, pageHeight);
      const page = pdf.addPage([A4_WIDTH, finalHeight]);
      page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH, height: finalHeight });
    }

    const bytes = await pdf.save();
    return new Blob([bytes], { type: PDF_TYPE });
  } finally {
    host.remove();
  }
}

async function mergePdfBlobs(blobs: Blob[]) {
  const merged = await PDFDocument.create();

  for (const blob of blobs) {
    const source = await PDFDocument.load(await blob.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  const bytes = await merged.save();
  return new Blob([bytes], { type: PDF_TYPE });
}

async function makePdfZip(outputs: ReviewOutput[]) {
  const zip = new JSZip();
  const pdfs: Blob[] = [];

  for (const output of outputs.filter((item) => item.role !== 'FTC')) {
    const converted = /\.pdf$/i.test(output.path) ? output.blob : await docxToPdfBlob(output.blob);
    const path = pdfPath(output.path);

    zip.file(path, converted);
    pdfs.push(converted);
  }

  if (pdfs.length) {
    zip.file('Merged Ordered Package.pdf', await mergePdfBlobs(pdfs));
  }

  zip.file('PDF Package Manifest.txt', [
    'PDF ORDERED PACKAGE',
    'DOCX outputs were converted to PDF in-browser.',
    'Original PDF outputs were copied unchanged.',
    'Merged Ordered Package.pdf combines generated PDFs in package order.'
  ].join('\n'));

  return zip.generateAsync({ type: 'blob' });
}

export default function OutputReviewWorkspace({
  outputs,
  zipName,
  warnings,
  evidence,
  onZip,
  onMessage
}: Props) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const visibleOutputs = useMemo(() => outputs.filter((output) => output.role !== 'FTC'), [outputs]);
  const supportingCount = evidence?.supporting.length || 0;

  async function downloadPdfZip() {
    if (!visibleOutputs.length || pdfBusy) return;

    setPdfBusy(true);

    try {
      const blob = await makePdfZip(visibleOutputs);
      downloadBlob(pdfZipName(zipName), blob);
      onMessage?.('PDF package ZIP is ready and downloading.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF package conversion failed.';
      onMessage?.(`PDF package conversion failed: ${message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <section className="outputs-workspace guided-output-workspace progressive-output-workspace">
      <section className="panel output-stage output-review-stage shared-stage-surface">
        <header className="output-stage-header output-progressive-command">
          <div className="output-stage-heading">
            <p className="eyebrow">Review and delivery</p>
            <h2>Complete ordered package</h2>
            <p>Review the generated bureau documents, then download the complete package.</p>
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
            <p>Download the editable package or convert every generated DOCX into PDF and download a PDF ZIP.</p>
          </div>

          <div className="output-download-actions">
            <button type="button" className="action-button" disabled={!zipName} onClick={onZip}>
              Download Ordered Package ZIP
            </button>

            <button type="button" className="action-button" disabled={!visibleOutputs.length || pdfBusy} onClick={downloadPdfZip}>
              {pdfBusy ? 'Converting DOCX to PDF…' : 'Download PDF Package ZIP'}
            </button>
          </div>
        </section>
      </section>
    </section>
  );
}

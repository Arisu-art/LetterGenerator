'use client';

import { PDFDocument } from 'pdf-lib';

export type PdfPacketPart = {
  label: string;
  kind: 'DOCX' | 'PDF' | 'BLANK';
  blob?: Blob | null;
};

export type PacketPageRange = {
  label: string;
  startPage: number;
  endPage: number;
};

export type AssembledPdfPacket = {
  blob: Blob;
  ranges: PacketPageRange[];
};

function toPdfBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}

export async function createBlankPdf() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return toPdfBlob(await document.save());
}

async function addBlankPage(target: PDFDocument) {
  target.addPage([612, 792]);
  return 1;
}

async function addRenderedDocx(target: PDFDocument, blob: Blob) {
  const [{ renderAsync }, html2canvas] = await Promise.all([
    import('docx-preview'),
    import('html2canvas').then((module) => module.default)
  ]);
  const host = document.createElement('div');
  host.className = 'pdf-render-host';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  let count = 0;
  try {
    await renderAsync(await blob.arrayBuffer(), host, undefined, {
      className: 'packet-pdf-docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true
    });
    const renderedSections = Array.from(host.querySelectorAll('.packet-pdf-docx.docx')) as HTMLElement[];
    const pages = renderedSections.length ? renderedSections : Array.from(host.querySelectorAll('.docx')) as HTMLElement[];
    if (!pages.length) return addBlankPage(target);
    for (const page of pages) {
      const canvas = await html2canvas(page, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const embedded = await target.embedPng(canvas.toDataURL('image/png'));
      const pdfPage = target.addPage([embedded.width, embedded.height]);
      pdfPage.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      count += 1;
    }
  } finally {
    host.remove();
  }
  return count;
}

async function addStaticPdf(target: PDFDocument, blob: Blob) {
  const source = await PDFDocument.load(await blob.arrayBuffer());
  const copied = await target.copyPages(source, source.getPageIndices());
  copied.forEach((page) => target.addPage(page));
  return copied.length;
}

export async function assembleFinalPdfWithRanges(parts: PdfPacketPart[]): Promise<AssembledPdfPacket> {
  const output = await PDFDocument.create();
  const ranges: PacketPageRange[] = [];
  let page = 1;
  for (const part of parts) {
    const count = part.kind === 'BLANK' || !part.blob
      ? await addBlankPage(output)
      : part.kind === 'DOCX'
        ? await addRenderedDocx(output, part.blob)
        : await addStaticPdf(output, part.blob);
    ranges.push({ label: part.label, startPage: page, endPage: page + Math.max(1, count) - 1 });
    page += Math.max(1, count);
  }
  return { blob: toPdfBlob(await output.save()), ranges };
}

export async function assembleFinalPdf(parts: PdfPacketPart[]) {
  return (await assembleFinalPdfWithRanges(parts)).blob;
}

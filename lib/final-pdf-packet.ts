'use client';

import { PDFDocument } from 'pdf-lib';

export type PdfPacketPart = {
  label: string;
  kind: 'DOCX' | 'PDF';
  blob: Blob;
};

async function addRenderedDocx(target: PDFDocument, blob: Blob) {
  const [{ renderAsync }, html2canvas] = await Promise.all([
    import('docx-preview'),
    import('html2canvas').then((module) => module.default)
  ]);
  const host = document.createElement('div');
  host.className = 'pdf-render-host';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
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
    const pages = Array.from(host.querySelectorAll('.packet-pdf-docx.docx, .packet-pdf-docx .docx')) as HTMLElement[];
    if (!pages.length) throw new Error('Rendered DOCX pages were not available for PDF finalization.');
    for (const page of pages) {
      const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const embedded = await target.embedPng(canvas.toDataURL('image/png'));
      const width = embedded.width;
      const height = embedded.height;
      const pdfPage = target.addPage([width, height]);
      pdfPage.drawImage(embedded, { x: 0, y: 0, width, height });
    }
  } finally {
    host.remove();
  }
}
async function addStaticPdf(target: PDFDocument, blob: Blob) {
  const source = await PDFDocument.load(await blob.arrayBuffer());
  const copied = await target.copyPages(source, source.getPageIndices());
  copied.forEach((page) => target.addPage(page));
}

/** Creates one read-only PDF packet in the exact supplied order. */
export async function assembleFinalPdf(parts: PdfPacketPart[]) {
  const output = await PDFDocument.create();
  for (const part of parts) {
    if (part.kind === 'DOCX') await addRenderedDocx(output, part.blob);
    else await addStaticPdf(output, part.blob);
  }
  const bytes = await output.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

'use client';

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

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

export type PdfAssemblyOptions = {
  requireAllParts?: boolean;
};

type PacketFonts = { regular: PDFFont; bold: PDFFont };

/**
 * Weak caches release their entries automatically after the corresponding uploaded
 * document blobs are discarded. The same Affidavit, FTC report and static PDFs
 * are reused across bureau packets, so rendering them once prevents repeated
 * browser-side DOCX rasterization and repeated binary reads on large jobs.
 */
const renderedDocxPdfCache = new WeakMap<Blob, Promise<Blob>>();
const blobBufferCache = new WeakMap<Blob, Promise<ArrayBuffer>>();
const packetFontCache = new WeakMap<PDFDocument, Promise<PacketFonts>>();

function toPdfBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}

function readBlobBuffer(blob: Blob) {
  let cached = blobBufferCache.get(blob);
  if (!cached) {
    cached = blob.arrayBuffer().catch((error) => {
      blobBufferCache.delete(blob);
      throw error;
    });
    blobBufferCache.set(blob, cached);
  }
  return cached;
}

function loadPacketFonts(target: PDFDocument) {
  let cached = packetFontCache.get(target);
  if (!cached) {
    cached = Promise.all([
      target.embedFont(StandardFonts.Helvetica),
      target.embedFont(StandardFonts.HelveticaBold)
    ]).then(([regular, bold]) => ({ regular, bold }));
    packetFontCache.set(target, cached);
  }
  return cached;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function addNonePage(target: PDFDocument, label: string) {
  const page = target.addPage([612, 792]);
  const { regular, bold } = await loadPacketFonts(target);
  page.drawText(label.toUpperCase(), { x: 54, y: 710, size: 11, font: bold, color: rgb(0.15, 0.4, 0.7) });
  page.drawLine({ start: { x: 54, y: 693 }, end: { x: 558, y: 693 }, thickness: 1, color: rgb(0.86, 0.9, 0.94) });
  page.drawText('None', { x: 54, y: 420, size: 40, font: bold, color: rgb(0.18, 0.23, 0.32) });
  page.drawText('Not configured for this packet position.', { x: 54, y: 382, size: 13, font: regular, color: rgb(0.39, 0.46, 0.55) });
  page.drawText('Position retained to preserve preview order only.', { x: 54, y: 358, size: 12, font: regular, color: rgb(0.39, 0.46, 0.55) });
  return 1;
}

/** Used only for non-final previews where a missing position must remain visible. */
export async function createBlankPdf(label = 'Packet component') {
  const document = await PDFDocument.create();
  await addNonePage(document, label);
  return toPdfBlob(await document.save());
}

async function renderDocxToPdf(blob: Blob, label: string) {
  const [{ renderAsync }, html2canvas] = await Promise.all([
    import('docx-preview'),
    import('html2canvas').then((module) => module.default)
  ]);
  const target = await PDFDocument.create();
  const host = document.createElement('div');
  host.className = 'pdf-render-host';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  try {
    await renderAsync(await readBlobBuffer(blob), host, undefined, {
      className: 'packet-pdf-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
      breakPages: true, renderHeaders: true, renderFooters: true
    });
    const candidates = Array.from(host.querySelectorAll('.packet-pdf-docx.docx, .packet-pdf-docx .docx, .docx')) as HTMLElement[];
    const pages = candidates.filter((node, index) => candidates.indexOf(node) === index && !node.querySelector('.docx'));
    if (!pages.length) throw new Error(`${label} could not be rendered into PDF pages.`);
    for (const page of pages) {
      const canvas = await html2canvas(page, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const embedded = await target.embedPng(canvas.toDataURL('image/png'));
      const pdfPage = target.addPage([embedded.width, embedded.height]);
      pdfPage.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      await yieldToBrowser();
    }
  } finally {
    host.remove();
  }
  return toPdfBlob(await target.save());
}

function renderedDocxPdf(blob: Blob, label: string) {
  let cached = renderedDocxPdfCache.get(blob);
  if (!cached) {
    cached = renderDocxToPdf(blob, label).catch((error) => {
      renderedDocxPdfCache.delete(blob);
      throw error;
    });
    renderedDocxPdfCache.set(blob, cached);
  }
  return cached;
}

async function addStaticPdf(target: PDFDocument, blob: Blob, label: string, requireAllParts: boolean) {
  try {
    const source = await PDFDocument.load(await readBlobBuffer(blob));
    const copied = await target.copyPages(source, source.getPageIndices());
    if (!copied.length) throw new Error(`${label} PDF contains no pages.`);
    copied.forEach((page) => target.addPage(page));
    return copied.length;
  } catch (error) {
    if (requireAllParts) throw new Error(`${label} could not be included as PDF: ${error instanceof Error ? error.message : 'unreadable file'}`);
    return addNonePage(target, label);
  }
}

async function addPart(target: PDFDocument, part: PdfPacketPart, requireAllParts: boolean) {
  if (part.kind === 'BLANK' || !part.blob) {
    if (requireAllParts) throw new Error(`Missing required final packet component: ${part.label}. Configure or generate it before creating final PDFs.`);
    return addNonePage(target, part.label);
  }
  if (part.kind === 'DOCX') {
    try {
      return await addStaticPdf(target, await renderedDocxPdf(part.blob, part.label), part.label, requireAllParts);
    } catch (error) {
      if (requireAllParts) throw error;
      return addNonePage(target, part.label);
    }
  }
  return addStaticPdf(target, part.blob, part.label, requireAllParts);
}

export async function assembleFinalPdfWithRanges(parts: PdfPacketPart[], options: PdfAssemblyOptions = {}): Promise<AssembledPdfPacket> {
  const output = await PDFDocument.create();
  const ranges: PacketPageRange[] = [];
  let page = 1;
  for (const part of parts) {
    const count = await addPart(output, part, Boolean(options.requireAllParts));
    ranges.push({ label: part.label, startPage: page, endPage: page + count - 1 });
    page += count;
  }
  if (!ranges.length) throw new Error('No files were supplied for the PDF packet.');
  return { blob: toPdfBlob(await output.save()), ranges };
}

export async function assembleFinalPdf(parts: PdfPacketPart[], options: PdfAssemblyOptions = {}) {
  return (await assembleFinalPdfWithRanges(parts, options)).blob;
}

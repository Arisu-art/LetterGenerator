import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { DOCX_MIME } from './docx-renderer';
import { loadPacketAssets, loadPacketFile, type PacketAsset, type SupportingPlacement, type SupportingRotation } from './packet-assets';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const EMU = 914400;
const PX_TO_EMU = 9525;
const PAGE_W = 6.5 * EMU;
const PAGE_H = 9 * EMU;
const CANVAS_W = 1500;
const CANVAS_H = 2100;
const HORIZONTAL_MARGIN = 168;
const VERTICAL_MARGIN = 74;
const GAP = 18;

export type PacketPage = { name: string; image: Blob; type: 'SUPPORTING' };
type ImageSize = { width: number; height: number };
type VerticalSlot = { x: number; y: number; width: number; height: number };
type RenderAsset = { asset: PacketAsset; file: File };

function toPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Supporting document page could not be prepared.')), 'image/png');
  });
}
function verticalSlots(count: number): VerticalSlot[] {
  const safeCount = Math.max(1, count);
  const availableHeight = CANVAS_H - (VERTICAL_MARGIN * 2) - (GAP * (safeCount - 1));
  const slotHeight = availableHeight / safeCount;
  return Array.from({ length: safeCount }, (_, index) => ({ x: HORIZONTAL_MARGIN, y: VERTICAL_MARGIN + index * (slotHeight + GAP), width: CANVAS_W - (HORIZONTAL_MARGIN * 2), height: slotHeight }));
}
function contain(image: ImageSize, slot: VerticalSlot) {
  const scale = Math.min(slot.width / image.width, slot.height / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  return { x: Math.round(slot.x + ((slot.width - width) / 2)), y: Math.round(slot.y + ((slot.height - height) / 2)), width, height };
}
function defaultPlacement(index: number, count: number, image: ImageSize): SupportingPlacement {
  const frame = contain(image, verticalSlots(count)[index]);
  return { x: frame.x / CANVAS_W, y: frame.y / CANVAS_H, width: frame.width / CANVAS_W, height: frame.height / CANVAS_H, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, rotation: 0 };
}
function position(value: number, dimension: number) { return Math.round(value * dimension); }
function rotatedBitmap(bitmap: ImageBitmap, rotation: SupportingRotation) {
  if (!rotation) return bitmap;
  const swap = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) return bitmap;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
}
function fittedDestination(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number, fit: SupportingPlacement['fit']) {
  if (fit === 'stretch') {
    return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  }

  const scale = fit === 'cover'
    ? Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight)
    : Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);

  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height
  };
}

function drawPlacedImage(context: CanvasRenderingContext2D, bitmap: ImageBitmap, placement: SupportingPlacement) {
  const source = rotatedBitmap(bitmap, placement.rotation || 0);
  const sx = position(placement.cropX, source.width);
  const sy = position(placement.cropY, source.height);
  const sw = Math.max(1, position(placement.cropWidth, source.width));
  const sh = Math.max(1, position(placement.cropHeight, source.height));
  const dx = position(placement.x, CANVAS_W);
  const dy = position(placement.y, CANVAS_H);
  const dw = Math.max(1, position(placement.width, CANVAS_W));
  const dh = Math.max(1, position(placement.height, CANVAS_H));
  const fit = placement.fit || 'contain';
  const fitted = fittedDestination(sw, sh, dw, dh, fit);

  context.save();
  context.beginPath();
  context.rect(dx, dy, dw, dh);
  context.clip();
  context.drawImage(source, sx, sy, sw, sh, dx + fitted.x, dy + fitted.y, fitted.width, fitted.height);
  context.restore();
}
async function buildSingleSupportingPage(items: RenderAsset[]) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image rendering is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (let index = 0; index < items.length; index += 1) {
    const bitmap = await createImageBitmap(items[index].file);
    const rotation = items[index].asset.placement?.rotation || 0;
    const renderedSize = rotation === 90 || rotation === 270 ? { width: bitmap.height, height: bitmap.width } : { width: bitmap.width, height: bitmap.height };
    const placement = items[index].asset.placement || defaultPlacement(index, items.length, renderedSize);
    drawPlacedImage(context, bitmap, placement);
    bitmap.close();
  }
  return toPng(canvas);
}
export async function getSupportingPages(storageKey: string) {
  const setup = loadPacketAssets(storageKey);
  const items: RenderAsset[] = [];
  for (const asset of setup.supporting) {
    const file = await loadPacketFile(storageKey, asset.id);
    if (file) items.push({ asset, file });
  }
  if (!items.length) return [];
  return [{ name: 'Supporting Documents', image: await buildSingleSupportingPage(items), type: 'SUPPORTING' as const }];
}
/** Creates the editable one-page PDF evidence insert used at order position 02 in final packets. */
export async function createSupportingDocumentsPdf(storageKey: string) {
  const pages = await getSupportingPages(storageKey);
  if (!pages.length) return null;
  const document = await PDFDocument.create();
  const image = await document.embedPng(await pages[0].image.arrayBuffer());
  const page = document.addPage([612, 792]);
  const margin = 24;
  const scale = Math.min((page.getWidth() - margin * 2) / image.width, (page.getHeight() - margin * 2) / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  const bytes = await document.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}
async function dimensions(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const originalWidth = bitmap.width * PX_TO_EMU;
  const originalHeight = bitmap.height * PX_TO_EMU;
  const scale = Math.min(PAGE_W / originalWidth, PAGE_H / originalHeight, 1);
  const answer = { width: Math.round(originalWidth * scale), height: Math.round(originalHeight * scale) };
  bitmap.close();
  return answer;
}
function drawing(relationship: string, name: string, width: number, height: number) {
  const description = name.replace(/[<>&"]/g, '');
  return `<w:p xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:pPr><w:pageBreakBefore/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="8000" name="Supporting Documents Page" descr="${description}"/><a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="8000" name="${description}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
export async function appendSupportingPages(docx: Blob, pages: PacketPage[]) {
  if (!pages.length) return docx;
  const zip = new PizZip(await docx.arrayBuffer());
  const document = zip.file('word/document.xml');
  const relationships = zip.file('word/_rels/document.xml.rels');
  const types = zip.file('[Content_Types].xml');
  if (!document || !relationships || !types) throw new Error('Generated DOCX cannot receive its supporting-document page.');
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const documentXml = parser.parseFromString(document.asText(), 'application/xml');
  const relationshipsXml = parser.parseFromString(relationships.asText(), 'application/xml');
  const typesXml = parser.parseFromString(types.asText(), 'application/xml');
  const body = documentXml.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('Generated DOCX body cannot receive its supporting-document page.');
  if (!Array.from(typesXml.documentElement.children).some((node) => node.getAttribute('Extension') === 'png')) {
    const contentType = typesXml.createElementNS(typesXml.documentElement.namespaceURI, 'Default');
    contentType.setAttribute('Extension', 'png');
    contentType.setAttribute('ContentType', 'image/png');
    typesXml.documentElement.appendChild(contentType);
  }
  const page = pages[0];
  const target = 'media/supporting_documents_page.png';
  const relationId = 'rIdSupportingDocumentsPage';
  zip.file(`word/${target}`, await page.image.arrayBuffer());
  const relation = relationshipsXml.createElementNS(REL, 'Relationship');
  relation.setAttribute('Id', relationId);
  relation.setAttribute('Type', IMAGE_REL);
  relation.setAttribute('Target', target);
  relationshipsXml.documentElement.appendChild(relation);
  const size = await dimensions(page.image);
  const paragraph = parser.parseFromString(drawing(relationId, page.name, size.width, size.height), 'application/xml').documentElement;
  const section = Array.from(body.children).find((node) => node.namespaceURI === W && node.localName === 'sectPr') || null;
  body.insertBefore(documentXml.importNode(paragraph, true), section);
  zip.file('word/document.xml', serializer.serializeToString(documentXml));
  zip.file('word/_rels/document.xml.rels', serializer.serializeToString(relationshipsXml));
  zip.file('[Content_Types].xml', serializer.serializeToString(typesXml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

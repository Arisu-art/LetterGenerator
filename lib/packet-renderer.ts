import PizZip from 'pizzip';
import { DOCX_MIME } from './docx-renderer';
import { loadPacketAssets, loadPacketFile } from './packet-assets';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const EMU = 914400;
const PAGE_W = 6.5 * EMU;
const PAGE_H = 9 * EMU;

export type PacketPage = { name: string; image: Blob; type: 'SUPPORTING' };

function pngFromCanvas(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Supporting document could not be prepared.')), 'image/png'));
}
async function convertImage(file: Blob) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image rendering is unavailable in this browser.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return pngFromCanvas(canvas);
}
export async function getSupportingPages(round: string) {
  const setup = loadPacketAssets(round);
  const pages: PacketPage[] = [];
  for (const asset of setup.supporting) {
    const file = await loadPacketFile(round, asset.id);
    if (file) pages.push({ name: asset.name, image: await convertImage(file), type: 'SUPPORTING' });
  }
  return pages;
}
async function dimensions(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(PAGE_W / bitmap.width, PAGE_H / bitmap.height);
  const answer = { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) };
  bitmap.close();
  return answer;
}
function drawing(relationship: string, name: string, width: number, height: number, index: number) {
  const description = name.replace(/[<>&"]/g, '');
  return `<w:p xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:pPr><w:pageBreakBefore/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${8000 + index}" name="Supporting Document ${index + 1}" descr="${description}"/><a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${8000 + index}" name="${description}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
export async function appendSupportingPages(docx: Blob, pages: PacketPage[]) {
  if (!pages.length) return docx;
  const zip = new PizZip(await docx.arrayBuffer());
  const document = zip.file('word/document.xml');
  const relationships = zip.file('word/_rels/document.xml.rels');
  const types = zip.file('[Content_Types].xml');
  if (!document || !relationships || !types) throw new Error('Generated DOCX cannot receive supporting pages.');
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const documentXml = parser.parseFromString(document.asText(), 'application/xml');
  const relationshipsXml = parser.parseFromString(relationships.asText(), 'application/xml');
  const typesXml = parser.parseFromString(types.asText(), 'application/xml');
  const body = documentXml.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('Generated DOCX body cannot receive supporting pages.');
  if (!Array.from(typesXml.documentElement.children).some((node) => node.getAttribute('Extension') === 'png')) {
    const contentType = typesXml.createElementNS(typesXml.documentElement.namespaceURI, 'Default');
    contentType.setAttribute('Extension', 'png');
    contentType.setAttribute('ContentType', 'image/png');
    typesXml.documentElement.appendChild(contentType);
  }
  const section = Array.from(body.children).find((node) => node.namespaceURI === W && node.localName === 'sectPr') || null;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const target = `media/supporting_page_${index + 1}.png`;
    const relationId = `rIdSupportingPage${index + 1}`;
    zip.file(`word/${target}`, await page.image.arrayBuffer());
    const relation = relationshipsXml.createElementNS(REL, 'Relationship');
    relation.setAttribute('Id', relationId);
    relation.setAttribute('Type', IMAGE_REL);
    relation.setAttribute('Target', target);
    relationshipsXml.documentElement.appendChild(relation);
    const size = await dimensions(page.image);
    const paragraph = parser.parseFromString(drawing(relationId, page.name, size.width, size.height, index), 'application/xml').documentElement;
    body.insertBefore(documentXml.importNode(paragraph, true), section);
  }
  zip.file('word/document.xml', serializer.serializeToString(documentXml));
  zip.file('word/_rels/document.xml.rels', serializer.serializeToString(relationshipsXml));
  zip.file('[Content_Types].xml', serializer.serializeToString(typesXml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

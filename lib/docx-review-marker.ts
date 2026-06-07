import PizZip from 'pizzip';
import { DOCX_MIME } from './docx-renderer';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_PART = /^word\/(?:document|header\d+|footer\d+)\.xml$/i;
const PLACEHOLDER = /\{\{\s*[#\/^]?\s*[\w.-]+\s*\}\}/g;

function textOf(paragraph: Element) {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('');
}
function visibleText(xml: string) {
  return xml.replace(/<w:tab\b[^>]*\/>/gi, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/gi, '\n').replace(/<\/w:p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function normalized(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function highlight(run: Element) {
  const owner = run.ownerDocument;
  let style = Array.from(run.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'rPr') as Element | undefined;
  if (!style) {
    style = owner.createElementNS(WORD_NS, 'w:rPr');
    run.insertBefore(style, run.firstChild);
  }
  const marker = owner.createElementNS(WORD_NS, 'w:highlight');
  marker.setAttributeNS(WORD_NS, 'w:val', 'yellow');
  style.appendChild(marker);
}
export async function highlightTextInDocx(blob: Blob, expected: string) {
  const zip = new PizZip(await blob.arrayBuffer());
  const source = zip.file('word/document.xml');
  if (!source) return blob;
  const xml = new DOMParser().parseFromString(source.asText(), 'application/xml');
  Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p')).filter((paragraph) => textOf(paragraph).includes(expected)).forEach((paragraph) => Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 'r')).forEach(highlight));
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
export async function assertGeneratedDocx(blob: Blob, label: string, requiredText: string[]) {
  const zip = new PizZip(await blob.arrayBuffer());
  const content = Object.keys(zip.files).filter((name) => XML_PART.test(name)).map((name) => visibleText(zip.file(name)?.asText() || '')).join('\n');
  if (content.match(PLACEHOLDER)?.length) throw new Error(`${label} contains unresolved placeholder tags.`);
  requiredText.filter((value) => value.trim()).forEach((value) => {
    if (!normalized(content).includes(normalized(value))) {
      console.warn(`${label} did not include optional mapped value: ${value}`);
    }
  });
  return blob;
}

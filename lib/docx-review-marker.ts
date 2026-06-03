import PizZip from 'pizzip';
import { DOCX_MIME } from './docx-renderer';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function textOf(paragraph: Element) {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('');
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

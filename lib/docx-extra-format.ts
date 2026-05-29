import PizZip from 'pizzip';
import { DOCX_MIME } from './docx-renderer';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export type HighlightColor = 'none' | 'yellow' | 'green' | 'cyan';
export type ExtraParagraphFormat = {
  position: number;
  fontSize?: number;
  highlight?: HighlightColor;
  pageBreakBefore?: boolean;
};

function children(parent: Element | null, name: string) {
  return parent ? Array.from(parent.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === name) as Element[] : [];
}
function first(parent: Element | null, name: string) { return children(parent, name)[0] || null; }
function paragraphs(body: Element) { return children(body, 'p').filter((node) => node.textContent?.trim()); }
function ensure(parent: Element, name: string, leading = false) {
  const found = first(parent, name);
  if (found) return found;
  const node = parent.ownerDocument.createElementNS(WORD_NS, `w:${name}`);
  if (leading && parent.firstChild) parent.insertBefore(node, parent.firstChild); else parent.appendChild(node);
  return node;
}
function remove(parent: Element, name: string) { children(parent, name).forEach((node) => parent.removeChild(node)); }
function value(node: Element, content: string) { node.setAttributeNS(WORD_NS, 'w:val', content); }

/** Applies only explicitly requested extended formatting so unedited template styling is retained. */
export async function applyExtraParagraphFormatting(blob: Blob, formats: ExtraParagraphFormat[]) {
  if (!formats.length) return blob;
  const zip = new PizZip(await blob.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) return blob;
  const xml = new DOMParser().parseFromString(file.asText(), 'application/xml');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) return blob;
  const editable = paragraphs(body);
  formats.forEach((format) => {
    const paragraph = editable[format.position];
    if (!paragraph) return;
    const pPr = ensure(paragraph, 'pPr', true);
    if (format.pageBreakBefore !== undefined) {
      remove(pPr, 'pageBreakBefore');
      if (format.pageBreakBefore) pPr.appendChild(xml.createElementNS(WORD_NS, 'w:pageBreakBefore'));
    }
    children(paragraph, 'r').forEach((run) => {
      const rPr = ensure(run, 'rPr', true);
      if (format.fontSize !== undefined) {
        remove(rPr, 'sz'); remove(rPr, 'szCs');
        ['sz', 'szCs'].forEach((name) => { const node = xml.createElementNS(WORD_NS, `w:${name}`); value(node, String(Math.round(format.fontSize! * 2))); rPr.appendChild(node); });
      }
      if (format.highlight !== undefined) {
        remove(rPr, 'highlight');
        if (format.highlight !== 'none') { const node = xml.createElementNS(WORD_NS, 'w:highlight'); value(node, format.highlight); rPr.appendChild(node); }
      }
    });
  });
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

import PizZip from 'pizzip';
import { DOCX_MIME } from './docx-renderer';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export type LateReferenceValues = {
  consumerName: string;
  addressLines: string[];
  dob: string;
  ssn: string;
  letterDate: string;
  bureauName: string;
  bureauAddressLines: string[];
  latePaymentItems: string[];
};

function paragraphs(body: Element): Element[] {
  return Array.from(body.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'p');
}
function text(paragraph: Element): string {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').trim();
}
function runStyle(paragraph: Element): Element {
  const runs = Array.from(paragraph.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'r');
  return (runs.find((run) => text(run).length > 0) || runs[0] || paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r')).cloneNode(true) as Element;
}
function emptyRun(style: Element): Element {
  const run = style.cloneNode(true) as Element;
  Array.from(run.children).forEach((node) => {
    if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node);
  });
  return run;
}
function replaceParagraph(paragraph: Element, lines: string[]) {
  const doc = paragraph.ownerDocument;
  const style = runStyle(paragraph);
  Array.from(paragraph.children).forEach((node) => {
    if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) paragraph.removeChild(node);
  });
  lines.forEach((line, index) => {
    if (index) {
      const separator = emptyRun(style);
      separator.appendChild(doc.createElementNS(WORD_NS, 'w:br'));
      paragraph.appendChild(separator);
    }
    const run = emptyRun(style);
    const item = doc.createElementNS(WORD_NS, 'w:t');
    if (/^\s|\s$/.test(line)) item.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    item.textContent = line;
    run.appendChild(item);
    paragraph.appendChild(run);
  });
}
function matching(all: Element[], expressions: RegExp[], start = -1): Element | undefined {
  return all.slice(start + 1).find((paragraph) => expressions.some((expression) => expression.test(text(paragraph))));
}

/**
 * Late-payment reference mode: upload one finished late-payment DOCX containing one correctly
 * formatted sample late-payment item. The source records replace and repeat that item region.
 */
export async function renderLatePaymentReference(reference: File, values: LateReferenceValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Late Payment DOCX is missing its document XML.');
  const xml = new DOMParser().parseFromString(documentFile.asText(), 'application/xml');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Late Payment DOCX is missing its document body.');
  const nonEmpty = paragraphs(body).filter((paragraph) => text(paragraph).length > 0);
  if (nonEmpty.length < 3) throw new Error('Late Payment reference is missing client, date or bureau blocks.');
  replaceParagraph(nonEmpty[0], [values.consumerName, ...values.addressLines, `DOB: ${values.dob}`, `SSN: ${values.ssn}`]);
  replaceParagraph(nonEmpty[1], [values.letterDate]);
  replaceParagraph(nonEmpty[2], [values.bureauName, ...values.bureauAddressLines]);

  const all = paragraphs(body);
  const heading = matching(all, [/^LATE\s+PAYMENT/i, /^ACCOUNTS?\s+WITH\s+LATE\s+PAYMENT/i]);
  if (!heading) throw new Error('Late Payment reference must contain a late-payment items heading.');
  const start = all.indexOf(heading);
  const boundary = matching(all, [/^LEGAL\s+/i, /^REQUIRED\s+ACTIONS?/i, /^REQUESTED\s+ACTIONS?/i, /^NOTICE\s+/i, /^SUPPORTING\s+DOCUMENTS?/i, /^Sincerely,?$/i], start);
  if (!boundary) throw new Error('Late Payment reference is missing the section after its item example.');
  const region = all.slice(start + 1, all.indexOf(boundary));
  const sampleIndex = region.findIndex((paragraph) => text(paragraph).length > 0);
  if (sampleIndex < 0) throw new Error('Late Payment reference must contain one formatted sample item.');
  if (!values.latePaymentItems.length) throw new Error('No late-payment item was supplied.');
  const sample = region[sampleIndex];
  const tail = region.slice(sampleIndex + 1).map((paragraph) => paragraph.cloneNode(true));
  region.forEach((paragraph) => body.removeChild(paragraph));
  values.latePaymentItems.forEach((value) => {
    const item = sample.cloneNode(true) as Element;
    replaceParagraph(item, value.split('\n'));
    body.insertBefore(item, boundary);
    tail.forEach((paragraph) => body.insertBefore(paragraph.cloneNode(true), boundary));
  });
  const updated = paragraphs(body);
  const sincerely = matching(updated, [/^Sincerely,?$/i]);
  if (sincerely) {
    const signature = updated.slice(updated.indexOf(sincerely) + 1).find((paragraph) => text(paragraph).length > 0);
    if (signature) replaceParagraph(signature, [values.consumerName]);
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

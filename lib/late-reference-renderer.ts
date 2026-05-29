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
    const value = doc.createElementNS(WORD_NS, 'w:t');
    if (/^\s|\s$/.test(line)) value.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    value.textContent = line;
    run.appendChild(value);
    paragraph.appendChild(run);
  });
}
function matching(all: Element[], expressions: RegExp[], start = -1): Element | undefined {
  return all.slice(start + 1).find((paragraph) => expressions.some((expression) => expression.test(text(paragraph))));
}
function exact(all: Element[], expression: RegExp, message: string): Element {
  const paragraph = all.find((entry) => expression.test(text(entry)));
  if (!paragraph) throw new Error(message);
  return paragraph;
}
function bureauGreeting(bureauName: string) {
  if (/^TransUnion/i.test(bureauName)) return 'TransUnion';
  if (/^Equifax/i.test(bureauName)) return 'Equifax';
  return 'Experian';
}
function sourceItemLines(value: string) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => line.replace(/^Account\s+Name\s*:/i, 'Creditor Name:'));
}

/**
 * Completed-reference renderer for the supplied Late Payment letter.
 * Required layout anchors are the visible Subject paragraph, Dear bureau line,
 * Creditor Name sample, Account Number sample, statutory paragraph and signature.
 */
export async function renderLatePaymentReference(reference: File, values: LateReferenceValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Late Payment DOCX is missing its document XML.');
  const xml = new DOMParser().parseFromString(documentFile.asText(), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Late Payment DOCX content could not be read.');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Late Payment DOCX is missing its document body.');

  let all = paragraphs(body);
  const subject = exact(all, /^Subject:\s*Dispute of Inaccurate Late Payment/i, 'Late Payment reference is missing its subject line.');
  const subjectIndex = all.indexOf(subject);
  const header = all.slice(0, subjectIndex).filter((paragraph) => text(paragraph).length > 0);
  if (header.length < 9) throw new Error('Late Payment reference must include client, date and bureau recipient blocks before its subject.');

  replaceParagraph(header[0], [values.consumerName]);
  replaceParagraph(header[1], [values.addressLines[0] || '']);
  replaceParagraph(header[2], [values.addressLines.slice(1).join(' ') || '']);
  replaceParagraph(header[3], [`DOB: ${values.dob}`]);
  replaceParagraph(header[4], [`SSN: ${values.ssn}`]);
  replaceParagraph(header[5], [values.letterDate]);
  replaceParagraph(header[6], [values.bureauName]);
  replaceParagraph(header[7], [values.bureauAddressLines[0] || '']);
  replaceParagraph(header[8], [values.bureauAddressLines.slice(1).join(' ') || '']);

  all = paragraphs(body);
  const greeting = exact(all, /^Dear\s+.+,$/i, 'Late Payment reference is missing its bureau greeting.');
  replaceParagraph(greeting, [`Dear ${bureauGreeting(values.bureauName)},`]);

  const creditorSample = exact(all, /^Creditor\s+Name\s*:/i, 'Late Payment reference is missing its Creditor Name sample line.');
  const creditorIndex = all.indexOf(creditorSample);
  const accountSample = matching(all, [/^Account\s+Number\s*:/i], creditorIndex);
  if (!accountSample) throw new Error('Late Payment reference is missing its Account Number sample line.');
  const accountIndex = all.indexOf(accountSample);
  const statutory = matching(all, [/^Under\s+15\s+U\.S\.\s+Code/i], accountIndex);
  if (!statutory) throw new Error('Late Payment reference is missing the statutory paragraph after its account example.');
  if (!values.latePaymentItems.length) throw new Error('No late-payment item was supplied.');

  const region = all.slice(creditorIndex, all.indexOf(statutory));
  const blankTemplate = region.find((paragraph) => text(paragraph).length === 0);
  region.forEach((paragraph) => body.removeChild(paragraph));
  values.latePaymentItems.forEach((itemValue) => {
    const lines = sourceItemLines(itemValue);
    const creditorLine = lines.find((line) => /^Creditor\s+Name\s*:/i.test(line)) || `Creditor Name: ${lines[0] || ''}`;
    const otherLines = lines.filter((line) => line !== creditorLine);
    const accountLines = otherLines.length ? otherLines : ['Account Number:'];
    const creditor = creditorSample.cloneNode(true) as Element;
    const account = accountSample.cloneNode(true) as Element;
    replaceParagraph(creditor, [creditorLine]);
    replaceParagraph(account, accountLines);
    body.insertBefore(creditor, statutory);
    body.insertBefore(account, statutory);
    if (blankTemplate) body.insertBefore(blankTemplate.cloneNode(true), statutory);
  });

  all = paragraphs(body);
  const sincerely = matching(all, [/^Sincerely,?$/i]);
  if (sincerely) {
    const signature = all.slice(all.indexOf(sincerely) + 1).find((paragraph) => text(paragraph).length > 0);
    if (signature) replaceParagraph(signature, [values.consumerName]);
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

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
function normalizedLabel(value: string) {
  return value.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').replace(/:$/, '').trim().toUpperCase();
}
function bureauGreeting(bureauName: string) {
  if (/^TransUnion/i.test(bureauName)) return 'TransUnion';
  if (/^Equifax/i.test(bureauName)) return 'Equifax';
  return 'Experian';
}
function replaceHeaderFromReference(header: Element[], values: LateReferenceValues) {
  let fieldMatches = 0;
  header.forEach((paragraph) => {
    const key = normalizedLabel(text(paragraph));
    if (/^(NAME|CLIENT NAME|CONSUMER NAME)$/.test(key)) {
      replaceParagraph(paragraph, [values.consumerName]);
      fieldMatches += 1;
    } else if (/^(ADDRESS|STREET ADDRESS)$/.test(key)) {
      replaceParagraph(paragraph, [values.addressLines[0] || '']);
      fieldMatches += 1;
    } else if (/^(CITY,? STATE ZIP|CITY,? STATE,? ZIP|CITY STATE ZIP)$/.test(key)) {
      replaceParagraph(paragraph, [values.addressLines.slice(1).join(' ') || '']);
      fieldMatches += 1;
    } else if (/^DOB$/.test(key)) {
      replaceParagraph(paragraph, [`DOB: ${values.dob}`]);
      fieldMatches += 1;
    } else if (/^SSN$/.test(key)) {
      replaceParagraph(paragraph, [`SSN: ${values.ssn}`]);
      fieldMatches += 1;
    } else if (/^(DATE|LETTER DATE)$/.test(key)) {
      replaceParagraph(paragraph, [values.letterDate]);
      fieldMatches += 1;
    } else if (/^(CREDIT BUREAU NAME|BUREAU NAME)$/.test(key)) {
      replaceParagraph(paragraph, [values.bureauName]);
      fieldMatches += 1;
    } else if (/^(DISPUTE ADDRESS|BUREAU ADDRESS|CREDIT BUREAU ADDRESS)$/.test(key)) {
      replaceParagraph(paragraph, values.bureauAddressLines);
      fieldMatches += 1;
    }
  });

  // Blank visual templates use labels such as NAME, [DATE] and [DISPUTE ADDRESS].
  // Those labels are sufficient; the reference does not need populated sample identity data.
  if (fieldMatches >= 5) return;

  // Completed references may have one populated paragraph per field.
  if (header.length >= 9) {
    replaceParagraph(header[0], [values.consumerName]);
    replaceParagraph(header[1], [values.addressLines[0] || '']);
    replaceParagraph(header[2], [values.addressLines.slice(1).join(' ') || '']);
    replaceParagraph(header[3], [`DOB: ${values.dob}`]);
    replaceParagraph(header[4], [`SSN: ${values.ssn}`]);
    replaceParagraph(header[5], [values.letterDate]);
    replaceParagraph(header[6], [values.bureauName]);
    replaceParagraph(header[7], [values.bureauAddressLines[0] || '']);
    replaceParagraph(header[8], [values.bureauAddressLines.slice(1).join(' ') || '']);
    return;
  }

  // Some completed references group identity and recipient lines into three multiline paragraphs.
  if (header.length >= 3 && fieldMatches === 0) {
    replaceParagraph(header[0], [values.consumerName, ...values.addressLines, `DOB: ${values.dob}`, `SSN: ${values.ssn}`]);
    replaceParagraph(header[1], [values.letterDate]);
    replaceParagraph(header[2], [values.bureauName, ...values.bureauAddressLines]);
    return;
  }

  throw new Error('Late Payment reference must contain blank header labels (NAME, ADDRESS, DOB, SSN, DATE and bureau address) or a completed header layout.');
}
function sourceItemLines(value: string, accountNameLabel: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    // The output reference prints account identification only, not status text.
    .filter((line) => !/^Late\s*Payment\s*:/i.test(line))
    .map((line) => line.replace(/^(Account|Creditor)\s+Name\s*:/i, accountNameLabel));
}

/**
 * Completed or blank-reference renderer for the supplied Late Payment letter.
 * Blank visual labels are populated from source data; account labels can remain empty in the upload.
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
  replaceHeaderFromReference(header, values);

  all = paragraphs(body);
  const greeting = matching(all, [/^Dear\s+.+,$/i, /^Dear\s*\[?CREDIT\s+BUREAU\s+NAME\]?\s*,?$/i]);
  if (greeting) replaceParagraph(greeting, [`Dear ${bureauGreeting(values.bureauName)},`]);

  const accountNameSample = exact(all, /^(Creditor|Account)\s+Name\s*:/i, 'Late Payment reference is missing its Creditor Name or Account Name placeholder line.');
  const accountNameLabel = /^Creditor/i.test(text(accountNameSample)) ? 'Creditor Name:' : 'Account Name:';
  const accountNameIndex = all.indexOf(accountNameSample);
  const accountNumberSample = matching(all, [/^Account\s+Number\s*:/i], accountNameIndex);
  if (!accountNumberSample) throw new Error('Late Payment reference is missing its Account Number placeholder line.');
  const accountIndex = all.indexOf(accountNumberSample);
  const statutory = matching(all, [/^Under\s+15\s+U\.S\.\s+Code/i, /^Under\s+15\s+USC/i], accountIndex);
  if (!statutory) throw new Error('Late Payment reference is missing the statutory paragraph after its account placeholder block.');
  if (!values.latePaymentItems.length) throw new Error('No late-payment item was supplied.');

  const region = all.slice(accountNameIndex, all.indexOf(statutory));
  const blankTemplate = region.find((paragraph) => text(paragraph).length === 0);
  region.forEach((paragraph) => body.removeChild(paragraph));
  values.latePaymentItems.forEach((itemValue) => {
    const lines = sourceItemLines(itemValue, accountNameLabel);
    const nameLine = lines.find((line) => /^(Creditor|Account)\s+Name\s*:/i.test(line)) || `${accountNameLabel} ${lines[0] || ''}`;
    const remaining = lines.filter((line) => line !== nameLine);
    const numberLine = remaining.find((line) => /^Account\s+Number\s*:/i.test(line)) || 'Account Number:';
    const account = accountNameSample.cloneNode(true) as Element;
    const number = accountNumberSample.cloneNode(true) as Element;
    replaceParagraph(account, [nameLine]);
    replaceParagraph(number, [numberLine]);
    body.insertBefore(account, statutory);
    body.insertBefore(number, statutory);
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

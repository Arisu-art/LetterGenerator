import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { applyLetterFlowRules } from './docx-flow';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const STATEMENT_PREFIX = ['Pursuant to ', '15 USC'].join('');
const DISPUTE_EXCLUDED_ADDRESS_FIELD = /^(?:PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE|EMAIL|E-?MAIL|COUNTRY|DOB|SSN)\s*:/i;
const ACCOUNT_SECTION_PATTERNS = [
  /^DISPUTE(?:D)?\s+ACCOUNTS?$/i,
  /^ACCOUNTS?\s+(?:IN\s+DISPUTE|TO\s+BE\s+DISPUTED)$/i,
  /^(?:INACCURATE|UNVERIFIED|NEGATIVE)\s+ACCOUNTS?$/i,
  /^FRAUDULENT\s+ACCOUNTS(?:\s+FOR\s+IMMEDIATE\s+BLOCKING\s+AND\s+DELETION)?$/i
];
const HARD_INQUIRY_LABEL = /^HARD\s+(?:CREDIT\s+)?INQUIR(?:Y|IES)(?:\s*[:\-]\s*(.*))?$/i;
const LEGAL_BOUNDARY_PATTERNS = [
  /^LEGAL\s+DEMAND(?:\s+AND\s+NOTICE\s+OF\s+DUTY)?$/i,
  /^REQUEST(?:ED)?\s+ACTION$/i,
  /^NOTICE\s+OF\s+DUTY$/i,
  /^CONCLUSION$/i,
  /^CLOSING$/i
];
const SIGNATURE_PATTERN = /^(?:Sincerely|Respectfully(?:\s+submitted)?|Best\s+regards|Regards|Yours\s+(?:truly|sincerely)|Very\s+truly\s+yours|Thank\s+you),?$/i;

export type TemplateValue = string | number | boolean | Array<Record<string, string>>;
export type PlaceholderValues = Record<string, TemplateValue>;
export type ReferenceDisputeValues = {
  consumerName: string;
  addressLines: string[];
  dob: string;
  ssn: string;
  letterDate: string;
  bureauName: string;
  bureauAddressLines: string[];
  disputeItems?: string[];
  /** Rendered as inquiry rows only; no HARD INQUIRIES label is emitted. */
  hardInquiryItems?: string[];
  fraudItems?: string[];
};

export async function renderDocxTemplate(template: File, values: PlaceholderValues): Promise<Blob> {
  const zip = new PizZip(await template.arrayBuffer());
  const document = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  document.render(values);
  return document.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
function paragraphs(body: Element) { return Array.from(body.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'p') as Element[]; }
function content(paragraph: Element) { return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').trim(); }
function findParagraph(all: Element[], patterns: RegExp[]) { return all.find((paragraph) => patterns.some((pattern) => pattern.test(content(paragraph)))); }
function styleOf(paragraph: Element) {
  const runs = Array.from(paragraph.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'r');
  return (runs.find((run) => content(run)) || runs[0] || paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r')).cloneNode(true) as Element;
}
function blankRun(source: Element) {
  const run = source.cloneNode(true) as Element;
  Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node); });
  return run;
}
/** Replace mapped text within an existing template paragraph while retaining that paragraph's native formatting and spacing properties. */
function writeLines(paragraph: Element, lines: string[]) {
  const doc = paragraph.ownerDocument;
  const style = styleOf(paragraph);
  Array.from(paragraph.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) paragraph.removeChild(node); });
  lines.forEach((line, index) => {
    if (index) { const run = blankRun(style); run.appendChild(doc.createElementNS(WORD_NS, 'w:br')); paragraph.appendChild(run); }
    const run = blankRun(style);
    const value = doc.createElementNS(WORD_NS, 'w:t');
    if (/^\s|\s$/.test(line)) value.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    value.textContent = line;
    run.appendChild(value);
    paragraph.appendChild(run);
  });
}
function cloneWithText(source: Element, lines: string[]) {
  const paragraph = source.cloneNode(true) as Element;
  writeLines(paragraph, lines);
  return paragraph;
}
function paragraphProperties(paragraph: Element) {
  const existing = Array.from(paragraph.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'pPr') as Element | undefined;
  if (existing) return existing;
  const properties = paragraph.ownerDocument.createElementNS(WORD_NS, 'w:pPr');
  paragraph.insertBefore(properties, paragraph.firstChild);
  return properties;
}
function setSpacing(paragraph: Element, position: 'before' | 'after') {
  const properties = paragraphProperties(paragraph);
  let spacing = Array.from(properties.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'spacing') as Element | undefined;
  if (!spacing) {
    spacing = paragraph.ownerDocument.createElementNS(WORD_NS, 'w:spacing');
    properties.appendChild(spacing);
  }
  spacing.setAttributeNS(WORD_NS, `w:${position}`, '0');
}
/** Compacts only the identity-header boundary; all body and exhibit layout remains template-controlled. */
function compactSsnDateBoundary(body: Element, ssnParagraph: Element, dateParagraph: Element) {
  const all = paragraphs(body);
  const ssnIndex = all.indexOf(ssnParagraph);
  const dateIndex = all.indexOf(dateParagraph);
  if (ssnIndex < 0 || dateIndex <= ssnIndex) return;
  all.slice(ssnIndex + 1, dateIndex).filter((paragraph) => !content(paragraph)).forEach((paragraph) => body.removeChild(paragraph));
  setSpacing(ssnParagraph, 'after');
  setSpacing(dateParagraph, 'before');
}
function findPopulatedHeaderParagraphs(body: Element, values: ReferenceDisputeValues) {
  const all = paragraphs(body);
  const ssnParagraph = all.find((paragraph) => /\bSSN\s*:/i.test(content(paragraph)) && content(paragraph).includes(values.ssn));
  if (!ssnParagraph) return null;
  const index = all.indexOf(ssnParagraph);
  const dateParagraph = all.slice(index + 1).find((paragraph) => content(paragraph).includes(values.letterDate));
  return dateParagraph ? { ssnParagraph, dateParagraph } : null;
}
/** Suppresses only the inquiry heading; inquiry rows remain in the generated dispute document. */
function removeHardInquiryLabels(body: Element) {
  paragraphs(body).forEach((paragraph) => {
    const match = content(paragraph).match(HARD_INQUIRY_LABEL);
    if (!match) return;
    const inlineRecord = match[1]?.trim();
    if (inlineRecord) writeLines(paragraph, [inlineRecord]);
    else body.removeChild(paragraph);
  });
}
async function finalizeRenderedDisputeTemplate(blob: Blob, values: ReferenceDisputeValues) {
  const zip = new PizZip(await blob.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) return blob;
  const xml = new DOMParser().parseFromString(file.asText(), 'application/xml');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) return blob;
  const header = findPopulatedHeaderParagraphs(body, values);
  if (header) compactSsnDateBoundary(body, header.ssnParagraph, header.dateParagraph);
  removeHardInquiryLabels(body);
  applyLetterFlowRules(body);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
function resolved(values: ReferenceDisputeValues) {
  if (values.disputeItems || values.hardInquiryItems) return { accounts: values.disputeItems || [], inquiries: values.hardInquiryItems || [] };
  const combined = values.fraudItems || [];
  return {
    accounts: combined.filter((entry) => /^(Account|Creditor)\s+Name\s*:/i.test(entry.trim())),
    inquiries: combined.filter((entry) => !/^(Account|Creditor)\s+Name\s*:/i.test(entry.trim()))
  };
}
function disputeAddressLines(values: ReferenceDisputeValues) {
  return values.addressLines.map((line) => line.trim()).filter(Boolean).filter((line) => !DISPUTE_EXCLUDED_ADDRESS_FIELD.test(line));
}
function accountValues(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^(?:Account|Creditor)\s+Name\s*:/i.test(line)) || '').replace(/^(?:Account|Creditor)\s+Name\s*:\s*/i, '');
  const accountNumber = (lines.find((line) => /^Account\s+Number\s*:/i.test(line)) || '').replace(/^Account\s+Number\s*:\s*/i, '');
  return { account_name: accountName, account_number: accountNumber, account_line: [accountName, accountNumber].filter(Boolean).join(' - '), display_text: text };
}
function disputePlaceholderValues(values: ReferenceDisputeValues): PlaceholderValues {
  const source = resolved(values);
  const address = disputeAddressLines(values);
  const accounts = source.accounts.map(accountValues);
  const inquiries = source.inquiries.map((text) => ({ inquiry_line: text, display_text: text }));
  return {
    consumer_name: values.consumerName,
    client_name: values.consumerName,
    name: values.consumerName,
    address: address.join('\n'),
    address_inline: address.join(' '),
    address_line_1: address[0] || '',
    address_line_2: address.slice(1).join(' '),
    dob: values.dob,
    ssn: values.ssn,
    ssn_masked: values.ssn,
    date: values.letterDate,
    letter_date: values.letterDate,
    document_date: values.letterDate,
    bureau_name: values.bureauName,
    bureau_address: values.bureauAddressLines.join('\n'),
    bureau_address_line_1: values.bureauAddressLines[0] || '',
    bureau_address_line_2: values.bureauAddressLines.slice(1).join(' '),
    accounts,
    dispute_accounts: accounts,
    hard_inquiries: inquiries,
    account_lines: accounts.map((item) => item.display_text).join('\n\n'),
    hard_inquiry_lines: source.inquiries.join('\n')
  };
}
function terminalBodyBoundary(body: Element) {
  return Array.from(body.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'sectPr') || null;
}
function insertMappedDisputeItems(body: Element, source: { accounts: string[]; inquiries: string[] }) {
  if (!source.accounts.length && !source.inquiries.length) throw new Error('No matching account or inquiry records were found.');
  const all = paragraphs(body);
  const accountHeading = findParagraph(all, ACCOUNT_SECTION_PATTERNS);
  const legalBoundary = findParagraph(all, LEGAL_BOUNDARY_PATTERNS);
  const signatureBoundary = all.find((paragraph) => SIGNATURE_PATTERN.test(content(paragraph)));
  const terminalBoundary = terminalBodyBoundary(body);
  const standardBoundary = legalBoundary || signatureBoundary;
  const accountHeadingIndex = accountHeading ? all.indexOf(accountHeading) : -1;
  const standardBoundaryIndex = standardBoundary ? all.indexOf(standardBoundary) : -1;
  const reusableRegion = accountHeading && standardBoundary && standardBoundaryIndex > accountHeadingIndex
    ? all.slice(accountHeadingIndex + 1, standardBoundaryIndex)
    : [];
  const itemStyle = reusableRegion.find((paragraph) => content(paragraph) && !content(paragraph).startsWith(STATEMENT_PREFIX))
    || accountHeading
    || standardBoundary
    || all.find((paragraph) => content(paragraph))!;
  const statementStyle = reusableRegion.find((paragraph) => content(paragraph).startsWith(STATEMENT_PREFIX));
  const spacer = reusableRegion.find((paragraph) => !content(paragraph));
  if (reusableRegion.length) reusableRegion.forEach((paragraph) => body.removeChild(paragraph));
  const boundary = standardBoundary || (accountHeading ? accountHeading.nextSibling : terminalBoundary);
  const insert = (node: Node) => boundary ? body.insertBefore(node, boundary) : body.appendChild(node);
  const addSpace = () => { if (spacer) insert(spacer.cloneNode(true)); };
  if (!accountHeading) insert(cloneWithText(itemStyle, ['DISPUTED ACCOUNTS']));
  addSpace();
  source.accounts.forEach((account) => {
    insert(cloneWithText(itemStyle, account.split('\n')));
    if (statementStyle) insert(statementStyle.cloneNode(true));
    addSpace();
  });
  if (source.inquiries.length) {
    insert(cloneWithText(itemStyle, source.inquiries));
    addSpace();
  }
}

export async function renderReferenceDisputeDocx(reference: File, values: ReferenceDisputeValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('DOCX document XML is unavailable.');
  const documentXml = file.asText();
  if (/\{\{\s*[#\/^]?[\w.-]+\s*\}\}/.test(documentXml)) {
    return finalizeRenderedDisputeTemplate(await renderDocxTemplate(reference, disputePlaceholderValues(values)), values);
  }
  const xml = new DOMParser().parseFromString(documentXml, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('DOCX content could not be read.');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('DOCX body is unavailable.');
  const source = resolved(values);
  const all = paragraphs(body);
  const nonEmpty = all.filter((paragraph) => content(paragraph));
  if (nonEmpty.length < 3) throw new Error('Reference header layout is incomplete.');
  writeLines(nonEmpty[0], [values.consumerName, ...disputeAddressLines(values), `DOB: ${values.dob}`, `SSN: ${values.ssn}`]);
  writeLines(nonEmpty[1], [values.letterDate]);
  writeLines(nonEmpty[2], [values.bureauName, ...values.bureauAddressLines]);
  compactSsnDateBoundary(body, nonEmpty[0], nonEmpty[1]);
  removeHardInquiryLabels(body);
  insertMappedDisputeItems(body, source);
  const renderedParagraphs = paragraphs(body);
  const close = renderedParagraphs.find((paragraph) => SIGNATURE_PATTERN.test(content(paragraph)));
  if (close) {
    const signature = renderedParagraphs.slice(renderedParagraphs.indexOf(close) + 1).find((paragraph) => content(paragraph));
    if (signature) writeLines(signature, [values.consumerName]);
  }
  applyLetterFlowRules(body);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
export function isDocx(filename: string) { return /\.docx$/i.test(filename); }

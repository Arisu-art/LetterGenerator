import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const ACCOUNTS_HEADING = ['FRAUDULENT ACCOUNTS', ' FOR IMMEDIATE BLOCKING AND DELETION'].join('');
const LEGAL_HEADING = ['LEGAL DEMAND', ' AND NOTICE OF DUTY'].join('');
const STATEMENT_PREFIX = ['Pursuant to ', '15 USC'].join('');
const DISPUTE_EXCLUDED_ADDRESS_FIELD = /^(?:PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE|EMAIL|E-?MAIL|COUNTRY|DOB|SSN)\s*:/i;

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
  hardInquiryItems?: string[];
  fraudItems?: string[];
};

export async function renderDocxTemplate(template: File, values: PlaceholderValues): Promise<Blob> {
  const zip = new PizZip(await template.arrayBuffer());
  const document = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  document.render(values);
  return document.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
function paragraphs(body: Element) { return Array.from(body.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'p'); }
function content(paragraph: Element) { return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').trim(); }
function required(all: Element[], target: string) {
  const found = all.find((paragraph) => content(paragraph) === target);
  if (!found) throw new Error(`Reference DOCX is missing section: ${target}`);
  return found;
}
function styleOf(paragraph: Element) {
  const runs = Array.from(paragraph.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'r');
  return (runs.find((run) => content(run).length > 0) || runs[0] || paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r')).cloneNode(true) as Element;
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

export async function renderReferenceDisputeDocx(reference: File, values: ReferenceDisputeValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('DOCX document XML is unavailable.');
  const documentXml = file.asText();
  // Placeholder templates are authoritative: populate only their declared insertion tags and never reconstruct their layout.
  if (/\{\{\s*[#\/^]?[\w.-]+\s*\}\}/.test(documentXml)) return renderDocxTemplate(reference, disputePlaceholderValues(values));
  const xml = new DOMParser().parseFromString(documentXml, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('DOCX content could not be read.');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('DOCX body is unavailable.');
  const source = resolved(values);
  let all = paragraphs(body);
  const nonEmpty = all.filter((paragraph) => content(paragraph));
  if (nonEmpty.length < 3) throw new Error('Reference header layout is incomplete.');
  // Legacy reference-layout templates require these existing insertion positions; paragraph styling and spacing remain unchanged.
  writeLines(nonEmpty[0], [values.consumerName, ...disputeAddressLines(values), `DOB: ${values.dob}`, `SSN: ${values.ssn}`]);
  writeLines(nonEmpty[1], [values.letterDate]);
  writeLines(nonEmpty[2], [values.bureauName, ...values.bureauAddressLines]);
  all = paragraphs(body);
  const accountHeading = required(all, ACCOUNTS_HEADING);
  const legalHeading = required(all, LEGAL_HEADING);
  const region = all.slice(all.indexOf(accountHeading) + 1, all.indexOf(legalHeading));
  const itemStyle = region.find((paragraph) => content(paragraph) && !content(paragraph).startsWith(STATEMENT_PREFIX));
  const statementStyle = region.find((paragraph) => content(paragraph).startsWith(STATEMENT_PREFIX));
  const spacer = region.find((paragraph) => !content(paragraph));
  if (!itemStyle || !statementStyle) throw new Error('Reference item layout is incomplete.');
  if (!source.accounts.length && !source.inquiries.length) throw new Error('No matching account or inquiry records were found.');
  region.forEach((paragraph) => body.removeChild(paragraph));
  const insert = (node: Node) => body.insertBefore(node, legalHeading);
  const addSpace = () => { if (spacer) insert(spacer.cloneNode(true)); };
  addSpace();
  source.accounts.forEach((account) => {
    const node = itemStyle.cloneNode(true) as Element;
    writeLines(node, account.split('\n'));
    insert(node);
    insert(statementStyle.cloneNode(true));
    addSpace();
  });
  if (source.inquiries.length) {
    const node = itemStyle.cloneNode(true) as Element;
    writeLines(node, source.inquiries);
    insert(node);
    addSpace();
  }
  all = paragraphs(body);
  const close = required(all, 'Sincerely,');
  const signature = all.slice(all.indexOf(close) + 1).find((paragraph) => content(paragraph));
  if (signature) writeLines(signature, [values.consumerName]);
  // Do not run automatic flow/spacing normalization. Uploaded DOCX formatting is the layout authority.
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
export function isDocx(filename: string) { return /\.docx$/i.test(filename); }

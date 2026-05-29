import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { applyLetterFlowRules } from './docx-flow';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const ACCOUNTS_HEADING = ['FRAUDULENT ACCOUNTS', ' FOR IMMEDIATE BLOCKING AND DELETION'].join('');
const LEGAL_HEADING = ['LEGAL DEMAND', ' AND NOTICE OF DUTY'].join('');
const STATEMENT_PREFIX = ['Pursuant to ', '15 USC'].join('');

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

export async function renderReferenceDisputeDocx(reference: File, values: ReferenceDisputeValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('DOCX document XML is unavailable.');
  const xml = new DOMParser().parseFromString(file.asText(), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('DOCX content could not be read.');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('DOCX body is unavailable.');
  const source = resolved(values);
  let all = paragraphs(body);
  const nonEmpty = all.filter((paragraph) => content(paragraph));
  if (nonEmpty.length < 3) throw new Error('Reference header layout is incomplete.');
  writeLines(nonEmpty[0], [values.consumerName, ...values.addressLines, `DOB: ${values.dob}`, `SSN: ${values.ssn}`]);
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
    const node = statementStyle.cloneNode(true) as Element;
    writeLines(node, source.inquiries);
    insert(node);
    addSpace();
  }
  all = paragraphs(body);
  const close = required(all, 'Sincerely,');
  const signature = all.slice(all.indexOf(close) + 1).find((paragraph) => content(paragraph));
  if (signature) writeLines(signature, [values.consumerName]);
  applyLetterFlowRules(body);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
export function isDocx(filename: string) { return /\.docx$/i.test(filename); }

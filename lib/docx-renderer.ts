import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { hardenGeneratedDocx } from './docx-safety';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const STATEMENT_PREFIX = ['Pursuant to ', '15 USC'].join('');
const IDENTITY_THEFT_DISPUTE_STATEMENT = 'Pursuant to 15 USC 1681a(3), this account does not constitute a legitimate consumer obligation. My personal information was used without authorization, and this tradeline is the direct result of identity theft.';
const DISPUTE_EXCLUDED_ADDRESS_FIELD = /^(?:PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE|EMAIL|E-?MAIL|COUNTRY|DOB|SSN)\s*:/i;
const ACCOUNT_SECTION_PATTERNS = [
  /^DISPUTE(?:D)?\s+ACCOUNTS?(?:\s*[:\-–—].*)?$/i,
  /^ACCOUNTS?\s+(?:IN\s+DISPUTE|TO\s+BE\s+DISPUTED)(?:\s*[:\-–—].*)?$/i,
  /^(?:INACCURATE|UNVERIFIED|NEGATIVE)\s+ACCOUNTS?(?:\s*[:\-–—].*)?$/i,
  /^FRAUDULENT\s+ACCOUNTS?(?:\s*\([^)]*\))?(?:\s*[:\-–—].*)?$/i,
  /^FRAUDULENT\s+ACCOUNTS?\s+.*(?:DELETION|BLOCKING|RE-?ASSERTED).*$/i
];
const HARD_INQUIRY_LABEL = /^HARD\s+(?:CREDIT\s+)?INQUIR(?:Y|IES)(?:\s*[:\-]\s*(.*))?$/i;
const NEXT_SECTION_PATTERNS = [
  /^HARD\s+(?:CREDIT\s+)?INQUIR(?:Y|IES)(?:\s*[:\-–—].*)?$/i,
  /^LEGAL\s+DEMAND(?:\s+AND\s+NOTICE\s+OF\s+DUTY)?$/i,
  /^REQUEST(?:ED)?\s+ACTION$/i,
  /^NOTICE\s+OF\s+DUTY$/i,
  /^CONCLUSION$/i,
  /^CLOSING$/i,
  /^GOVERN\s+YOURSELF\s+ACCORDINGLY\.?$/i
];
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
  return hardenGeneratedDocx(document.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }));
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
function forceIdentityStatementColor(paragraph: Element) {
  if (!content(paragraph).includes(IDENTITY_THEFT_DISPUTE_STATEMENT)) return paragraph;
  const doc = paragraph.ownerDocument;
  Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 'r')).forEach((run) => {
    let properties = Array.from(run.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'rPr') as Element | undefined;
    if (!properties) {
      properties = doc.createElementNS(WORD_NS, 'w:rPr');
      run.insertBefore(properties, run.firstChild);
    }

    const currentProperties = properties;
    Array.from(currentProperties.children)
      .filter((node) => node.namespaceURI === WORD_NS && node.localName === 'color')
      .forEach((node) => currentProperties.removeChild(node));

    const color = doc.createElementNS(WORD_NS, 'w:color');
    color.setAttributeNS(WORD_NS, 'w:val', 'FF0000');
    currentProperties.appendChild(color);
  });
  return paragraph;
}
function cloneStatementWithTemplateStyle(source: Element, lines: string[]) {
  return forceIdentityStatementColor(cloneWithText(source, lines));
}
function paragraphProperties(paragraph: Element) {
  const existing = Array.from(paragraph.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'pPr') as Element | undefined;
  if (existing) return existing;
  const properties = paragraph.ownerDocument.createElementNS(WORD_NS, 'w:pPr');
  paragraph.insertBefore(properties, paragraph.firstChild);
  return properties;
}
function ensureParagraphProperty(paragraph: Element, localName: string) {
  const properties = paragraphProperties(paragraph);
  const existing = Array.from(properties.children).find((node) => node.namespaceURI === WORD_NS && node.localName === localName) as Element | undefined;

  if (existing) return existing;

  const property = paragraph.ownerDocument.createElementNS(WORD_NS, `w:${localName}`);
  properties.appendChild(property);
  return property;
}

function keepParagraphLinesTogether(paragraph: Element) {
  ensureParagraphProperty(paragraph, 'keepLines');
  ensureParagraphProperty(paragraph, 'widowControl');
}

function keepWithNextParagraph(paragraph: Element) {
  keepParagraphLinesTogether(paragraph);
  ensureParagraphProperty(paragraph, 'keepNext');
}

function keepDisputeBlockTogether(paragraphs: Element[]) {
  paragraphs.filter(Boolean).forEach((paragraph, index) => {
    if (index < paragraphs.length - 1) keepWithNextParagraph(paragraph);
    else keepParagraphLinesTogether(paragraph);
  });
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
  // Keep HARD INQUIRIES headings as anchors for 2nd, 3rd, and Final round templates.
  return;
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
  paragraphs(body).forEach(forceIdentityStatementColor);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return hardenGeneratedDocx(zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }));
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
  return {
    account_name: accountName,
    account_number: accountNumber,
    account_line: [accountName, accountNumber].filter(Boolean).join(' - '),
    display_text: text,
    statement_line: IDENTITY_THEFT_DISPUTE_STATEMENT,
    legal_statement: IDENTITY_THEFT_DISPUTE_STATEMENT,
    dispute_statement: IDENTITY_THEFT_DISPUTE_STATEMENT
  };
}

function inquiryValues(text: string) {
  const clean = text.replace(/\s*[–—]\s*/g, ' — ').replace(/\s+/g, ' ').trim();
  const match = clean.match(/^(.+?)\s+[—-]\s+(.+)$/);
  const inquiryName = match?.[1]?.trim() || clean;
  const inquiryDate = match?.[2]?.trim() || '';

  return {
    inquiry_name: inquiryName,
    inquiry_date: inquiryDate,
    inquiry_line: clean,
    display_text: clean,
    statement_line: IDENTITY_THEFT_DISPUTE_STATEMENT,
    legal_statement: IDENTITY_THEFT_DISPUTE_STATEMENT,
    dispute_statement: IDENTITY_THEFT_DISPUTE_STATEMENT
  };
}
function disputePlaceholderValues(values: ReferenceDisputeValues): PlaceholderValues {
  const source = resolved(values);
  const address = disputeAddressLines(values);
  const accounts = source.accounts.map(accountValues);
  const inquiries = source.inquiries.map(inquiryValues);
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
    account_lines: accounts.map((item) => [item.display_text, item.statement_line].join('\n')).join('\n\n'),
    hard_inquiry_lines: inquiries.map((item) => [item.inquiry_line, item.statement_line].join('\n')).join('\n\n')
  };
}
function terminalBodyBoundary(body: Element) {
  return Array.from(body.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'sectPr') || null;
}
function insertMappedDisputeItems(body: Element, source: { accounts: string[]; inquiries: string[] }) {
  if (!source.accounts.length && !source.inquiries.length) throw new Error('No matching account or inquiry records were found.');

  const all = paragraphs(body);
  const accountHeading = findParagraph(all, ACCOUNT_SECTION_PATTERNS);
  const hardInquiryHeading = findParagraph(all, [HARD_INQUIRY_LABEL]);
  const legalBoundary = findParagraph(all, LEGAL_BOUNDARY_PATTERNS);
  const signatureBoundary = all.find((paragraph) => SIGNATURE_PATTERN.test(content(paragraph)));
  const terminalBoundary = terminalBodyBoundary(body);
  const fallbackBoundary = legalBoundary || signatureBoundary || terminalBoundary;

  function indexOf(paragraph: Element | null | undefined) {
    return paragraph ? all.indexOf(paragraph) : -1;
  }

  function firstBoundaryAfter(start: Element | null | undefined, fallback: Node | null | undefined) {
    const startIndex = indexOf(start);
    if (startIndex < 0) return fallback || null;

    return all.slice(startIndex + 1).find((paragraph) =>
      NEXT_SECTION_PATTERNS.some((pattern) => pattern.test(content(paragraph))) ||
      LEGAL_BOUNDARY_PATTERNS.some((pattern) => pattern.test(content(paragraph))) ||
      SIGNATURE_PATTERN.test(content(paragraph))
    ) || fallback || null;
  }

  function regionBetween(start: Element | null | undefined, boundary: Node | null | undefined) {
    if (!start || !boundary || !(boundary instanceof Element)) return [];

    const startIndex = all.indexOf(start);
    const boundaryIndex = all.indexOf(boundary);

    return startIndex >= 0 && boundaryIndex > startIndex ? all.slice(startIndex + 1, boundaryIndex) : [];
  }

  function styleFrom(region: Element[], heading: Element | null | undefined, fallback: Node | null | undefined) {
    return region.find((paragraph) => content(paragraph) && !content(paragraph).startsWith(STATEMENT_PREFIX))
      || heading
      || (fallback instanceof Element ? fallback : undefined)
      || all.find((paragraph) => content(paragraph))!;
  }

  function statementStyleFrom(region: Element[], fallback: Element) {
    return region.find((paragraph) => content(paragraph).startsWith(STATEMENT_PREFIX)) || fallback;
  }

  function spacerFrom(region: Element[]) {
    return region.find((paragraph) => !content(paragraph));
  }

  function insertBefore(boundary: Node | null | undefined, node: Node) {
    return boundary ? body.insertBefore(node, boundary) : body.appendChild(node);
  }

  function addSpacer(boundary: Node | null | undefined, sourceSpacer: Element | undefined) {
    if (sourceSpacer) insertBefore(boundary, sourceSpacer.cloneNode(true));
  }

  const accountBoundary = accountHeading
    ? firstBoundaryAfter(accountHeading, hardInquiryHeading || fallbackBoundary)
    : hardInquiryHeading || fallbackBoundary;

  const accountRegion = regionBetween(accountHeading, accountBoundary);
  const accountStyle = styleFrom(accountRegion, accountHeading, accountBoundary);
  const accountStatementStyle = statementStyleFrom(accountRegion, accountStyle);
  const accountSpacer = spacerFrom(accountRegion);

  accountRegion.forEach((paragraph) => paragraph.parentNode?.removeChild(paragraph));

  if (!accountHeading) {
    insertBefore(accountBoundary, cloneWithText(accountStyle, ['DISPUTED ACCOUNTS']));
  }

  addSpacer(accountBoundary, accountSpacer);

  source.accounts.forEach((account) => {
    const accountParagraph = cloneWithText(accountStyle, account.split('\n'));
    const statementParagraph = cloneStatementWithTemplateStyle(accountStatementStyle, [IDENTITY_THEFT_DISPUTE_STATEMENT]);

    keepDisputeBlockTogether([accountParagraph, statementParagraph]);

    insertBefore(accountBoundary, accountParagraph);
    insertBefore(accountBoundary, statementParagraph);
    addSpacer(accountBoundary, accountSpacer);
  });

  if (!source.inquiries.length) return;

  const refreshedAfterAccounts = paragraphs(body);
  const liveInquiryHeading = refreshedAfterAccounts.find((paragraph) => HARD_INQUIRY_LABEL.test(content(paragraph)));
  const inquiryBoundary = liveInquiryHeading
    ? firstBoundaryAfter(liveInquiryHeading, legalBoundary || signatureBoundary || terminalBoundary)
    : legalBoundary || signatureBoundary || terminalBoundary;

  const inquiryHeading = liveInquiryHeading || cloneWithText(accountStyle, ['HARD INQUIRIES']);

  if (!liveInquiryHeading) {
    insertBefore(inquiryBoundary, inquiryHeading);
  }

  const refreshedAfterHeading = paragraphs(body);
  const finalInquiryHeading = refreshedAfterHeading.find((paragraph) => HARD_INQUIRY_LABEL.test(content(paragraph))) || inquiryHeading;
  const inquiryRegion = regionBetween(finalInquiryHeading, inquiryBoundary);
  const inquiryStyle = styleFrom(inquiryRegion, finalInquiryHeading, inquiryBoundary);
  const inquiryStatementStyle = statementStyleFrom(inquiryRegion, inquiryStyle);
  const inquirySpacer = spacerFrom(inquiryRegion);

  inquiryRegion.forEach((paragraph) => {
    if (paragraph !== finalInquiryHeading) paragraph.parentNode?.removeChild(paragraph);
  });

  addSpacer(inquiryBoundary, inquirySpacer);

  source.inquiries.forEach((inquiry) => {
    const inquiryParagraph = cloneWithText(inquiryStyle, [inquiry]);
    const statementParagraph = cloneStatementWithTemplateStyle(inquiryStatementStyle, [IDENTITY_THEFT_DISPUTE_STATEMENT]);

    keepDisputeBlockTogether([inquiryParagraph, statementParagraph]);

    insertBefore(inquiryBoundary, inquiryParagraph);
    insertBefore(inquiryBoundary, statementParagraph);
    addSpacer(inquiryBoundary, inquirySpacer);
  });
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
  paragraphs(body).forEach(forceIdentityStatementColor);
  const renderedParagraphs = paragraphs(body);
  const close = renderedParagraphs.find((paragraph) => SIGNATURE_PATTERN.test(content(paragraph)));
  if (close) {
    const signature = renderedParagraphs.slice(renderedParagraphs.indexOf(close) + 1).find((paragraph) => content(paragraph));
    if (signature) writeLines(signature, [values.consumerName]);
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return hardenGeneratedDocx(zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }));
}
export function isDocx(filename: string) { return /\.docx$/i.test(filename); }

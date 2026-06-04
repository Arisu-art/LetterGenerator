import PizZip from 'pizzip';
import { DOCX_MIME, renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import { applyLetterFlowRules } from './docx-flow';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const TOKEN = /\{\{\s*[#\/^]?\s*[\w.-]+\s*\}\}/g;
const CALENDAR_MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep(?:t)?\.?|Oct\.?|Nov\.?|Dec\.?)';

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
function visibleXmlText(xml: string) {
  return xml.replace(/<w:tab\b[^>]*\/>/gi, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/gi, '\n').replace(/<\/w:p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function canonical(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function runStyle(paragraph: Element): Element {
  const runs = Array.from(paragraph.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'r');
  return (runs.find((run) => text(run).length > 0) || runs[0] || paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r')).cloneNode(true) as Element;
}
function emptyRun(style: Element): Element {
  const run = style.cloneNode(true) as Element;
  Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node); });
  return run;
}
function replaceParagraph(paragraph: Element, lines: string[]) {
  const doc = paragraph.ownerDocument;
  const style = runStyle(paragraph);
  Array.from(paragraph.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) paragraph.removeChild(node); });
  lines.forEach((line, index) => {
    if (index) { const separator = emptyRun(style); separator.appendChild(doc.createElementNS(WORD_NS, 'w:br')); paragraph.appendChild(separator); }
    const run = emptyRun(style); const value = doc.createElementNS(WORD_NS, 'w:t');
    if (/^\s|\s$/.test(line)) value.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    value.textContent = line; run.appendChild(value); paragraph.appendChild(run);
  });
}
function cloneParagraph(source: Element, lines: string[]) {
  const clone = source.cloneNode(true) as Element;
  replaceParagraph(clone, lines);
  return clone;
}
function matching(all: Element[], expressions: RegExp[], start = -1): Element | undefined { return all.slice(start + 1).find((paragraph) => expressions.some((expression) => expression.test(text(paragraph)))); }
function exact(all: Element[], expression: RegExp, message: string): Element { const paragraph = all.find((entry) => expression.test(text(entry))); if (!paragraph) throw new Error(message); return paragraph; }
function normalizedLabel(value: string) { return value.replace(/[\[\]]/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').replace(/:$/, '').trim().toUpperCase(); }
function bureauGreeting(bureauName: string) { if (/^TransUnion/i.test(bureauName)) return 'TransUnion'; if (/^Equifax/i.test(bureauName)) return 'Equifax'; return 'Experian'; }
function isDateAnchor(value: string) {
  const raw = value.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
  const key = normalizedLabel(raw);
  if (/\bDOB\b|DATE\s+OF\s+BIRTH/i.test(key)) return false;
  return /^(?:DATE|LETTER DATE|DOCUMENT DATE|DATE OF LETTER)(?:\s*[:\-]\s*.*)?$/i.test(raw)
    || new RegExp(`^${CALENDAR_MONTH}\\s+\\d{1,2},?\\s+\\d{4}$`, 'i').test(raw)
    || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(raw);
}
function containsDateMarker(value: string) {
  return /(?:^|\s)(?:LETTER\s+|DOCUMENT\s+)?DATE(?:\s|:|\]|$)/i.test(value) && !/\bDOB\b|DATE\s+OF\s+BIRTH/i.test(value);
}
/** Maps legacy reference headers without forcing one exact date-label layout. */
function replaceHeaderFromReference(header: Element[], values: LateReferenceValues) {
  let individualMatches = 0;
  let clientBlockReplaced = false;
  let dateReplaced = false;
  let recipientBlockReplaced = false;
  let clientParagraph: Element | undefined;
  let recipientParagraph: Element | undefined;

  header.forEach((paragraph) => {
    const visible = text(paragraph);
    const key = normalizedLabel(visible);
    const hasDateMarker = containsDateMarker(visible);
    if (!clientBlockReplaced && /NAME/.test(key) && /ADDRESS/.test(key) && /DOB/.test(key) && /SSN/.test(key)) {
      replaceParagraph(paragraph, [values.consumerName, ...values.addressLines, `DOB: ${values.dob}`, `SSN: ${values.ssn}`, ...(hasDateMarker ? [values.letterDate] : [])]);
      clientBlockReplaced = true;
      clientParagraph = paragraph;
      if (hasDateMarker) dateReplaced = true;
      return;
    }
    if (!recipientBlockReplaced && /(CREDIT\s*BUREAU\s*NAME|BUREAU\s*NAME)/.test(key) && /(DISPUTE\s*ADDRESS|BUREAU\s*ADDRESS|CREDIT\s*BUREAU\s*ADDRESS)/.test(key)) {
      replaceParagraph(paragraph, [...(hasDateMarker ? [values.letterDate] : []), values.bureauName, ...values.bureauAddressLines]);
      recipientBlockReplaced = true;
      recipientParagraph = paragraph;
      if (hasDateMarker) dateReplaced = true;
      return;
    }
    if (/^(NAME|CLIENT NAME|CONSUMER NAME)$/.test(key)) { replaceParagraph(paragraph, [values.consumerName]); individualMatches += 1; }
    else if (/^(ADDRESS|STREET ADDRESS)$/.test(key)) { replaceParagraph(paragraph, [values.addressLines[0] || '']); individualMatches += 1; }
    else if (/^(CITY,? STATE ZIP|CITY,? STATE,? ZIP|CITY STATE ZIP)$/.test(key)) { replaceParagraph(paragraph, [values.addressLines.slice(1).join(' ') || '']); individualMatches += 1; }
    else if (/^DOB$/.test(key)) { replaceParagraph(paragraph, [`DOB: ${values.dob}`]); individualMatches += 1; }
    else if (/^SSN$/.test(key)) { replaceParagraph(paragraph, [`SSN: ${values.ssn}`]); individualMatches += 1; }
    else if (isDateAnchor(visible)) { replaceParagraph(paragraph, [values.letterDate]); dateReplaced = true; }
    else if (/^(CREDIT BUREAU NAME|BUREAU NAME)$/.test(key)) { replaceParagraph(paragraph, [values.bureauName]); individualMatches += 1; recipientParagraph = paragraph; }
    else if (/^(DISPUTE ADDRESS|BUREAU ADDRESS|CREDIT BUREAU ADDRESS)$/.test(key)) { replaceParagraph(paragraph, values.bureauAddressLines); individualMatches += 1; recipientParagraph = recipientParagraph || paragraph; }
  });

  if (!dateReplaced && clientBlockReplaced && recipientBlockReplaced && recipientParagraph) {
    recipientParagraph.parentNode?.insertBefore(cloneParagraph(recipientParagraph, [values.letterDate]), recipientParagraph);
    dateReplaced = true;
  }
  if (clientBlockReplaced && dateReplaced && recipientBlockReplaced) return;
  if (individualMatches >= 5) {
    if (!dateReplaced) {
      const target = recipientParagraph || header[header.length - 1];
      target.parentNode?.insertBefore(cloneParagraph(target, [values.letterDate]), target);
    }
    return;
  }
  if (header.length >= 9) { replaceParagraph(header[0], [values.consumerName]); replaceParagraph(header[1], [values.addressLines[0] || '']); replaceParagraph(header[2], [values.addressLines.slice(1).join(' ') || '']); replaceParagraph(header[3], [`DOB: ${values.dob}`]); replaceParagraph(header[4], [`SSN: ${values.ssn}`]); replaceParagraph(header[5], [values.letterDate]); replaceParagraph(header[6], [values.bureauName]); replaceParagraph(header[7], [values.bureauAddressLines[0] || '']); replaceParagraph(header[8], [values.bureauAddressLines.slice(1).join(' ') || '']); return; }
  if (header.length >= 3 && individualMatches === 0 && !clientBlockReplaced && !recipientBlockReplaced) { replaceParagraph(header[0], [values.consumerName, ...values.addressLines, `DOB: ${values.dob}`, `SSN: ${values.ssn}`]); replaceParagraph(header[1], [values.letterDate]); replaceParagraph(header[2], [values.bureauName, ...values.bureauAddressLines]); return; }
  throw new Error(`Late Payment reference header mapping incomplete: client block=${clientBlockReplaced ? 'found' : 'missing'}, date=${dateReplaced ? 'found' : 'missing'}, bureau block=${recipientBlockReplaced ? 'found' : 'missing'}, separate fields=${individualMatches}. Use placeholder tags or a reference layout with identifiable client and bureau blocks.`);
}
function sourceItemLines(value: string, accountNameLabel: string) { return value.split('\n').map((line) => line.trim()).filter(Boolean).filter((line) => !/^Late\s*Payment\s*:/i.test(line)).map((line) => line.replace(/^(Account|Creditor)\s+Name\s*:/i, accountNameLabel)); }
function itemValue(value: string) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^(?:Account|Creditor)\s+Name\s*:/i.test(line)) || '').replace(/^(?:Account|Creditor)\s+Name\s*:\s*/i, '');
  const accountNumber = (lines.find((line) => /^Account\s+Number\s*:/i.test(line)) || '').replace(/^Account\s+Number\s*:\s*/i, '');
  return { account_name: accountName, account_number: accountNumber, display_text: value, account_line: [accountName, accountNumber].filter(Boolean).join(' - ') };
}
function placeholderValues(values: LateReferenceValues): PlaceholderValues {
  const items = values.latePaymentItems.map(itemValue);
  return { consumer_name: values.consumerName, client_name: values.consumerName, name: values.consumerName, address: values.addressLines.join('\n'), address_inline: values.addressLines.join(' '), address_line_1: values.addressLines[0] || '', address_line_2: values.addressLines.slice(1).join(' '), dob: values.dob, ssn: values.ssn, ssn_masked: values.ssn, date: values.letterDate, letter_date: values.letterDate, document_date: values.letterDate, bureau_name: values.bureauName, bureau_address: values.bureauAddressLines.join('\n'), bureau_address_line_1: values.bureauAddressLines[0] || '', bureau_address_line_2: values.bureauAddressLines.slice(1).join(' '), accounts: items, late_accounts: items, late_payment_accounts: items, account_lines: values.latePaymentItems.join('\n\n') };
}
async function validateGenerated(blob: Blob, values: LateReferenceValues) {
  const xml = new PizZip(await blob.arrayBuffer()).file('word/document.xml')?.asText() || '';
  const output = visibleXmlText(xml);
  if (TOKEN.test(output)) throw new Error('Late Payment output contains unresolved placeholder tags.');
  if (!canonical(output).includes(canonical(values.bureauName))) throw new Error(`Late Payment output recipient integrity check failed: expected ${values.bureauName}.`);
  if (!canonical(output).includes(canonical(values.consumerName))) throw new Error(`Late Payment output consumer integrity check failed: expected ${values.consumerName}.`);
  if (!canonical(output).includes(canonical(values.letterDate))) throw new Error(`Late Payment output document-date integrity check failed: expected ${values.letterDate}.`);
  return blob;
}

/** Supports both placeholder DOCX templates and validated legacy Late Payment layouts. */
export async function renderLatePaymentReference(reference: File, values: LateReferenceValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer()); const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Late Payment DOCX is missing its document XML.');
  if (TOKEN.test(visibleXmlText(documentFile.asText()))) return validateGenerated(await renderDocxTemplate(reference, placeholderValues(values)), values);
  const xml = new DOMParser().parseFromString(documentFile.asText(), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Late Payment DOCX content could not be read.');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0]; if (!body) throw new Error('Late Payment DOCX is missing its document body.');
  let all = paragraphs(body); const subject = exact(all, /^Subject:\s*Dispute of Inaccurate Late Payment/i, 'Late Payment reference is missing its subject line.');
  replaceHeaderFromReference(all.slice(0, all.indexOf(subject)).filter((paragraph) => text(paragraph).length > 0), values);
  all = paragraphs(body); const greeting = matching(all, [/^Dear\s+.+,$/i, /^Dear\s*\[?CREDIT\s+BUREAU\s+NAME\]?\s*,?$/i]); if (greeting) replaceParagraph(greeting, [`Dear ${bureauGreeting(values.bureauName)},`]);
  const accountNameSample = exact(all, /^(Creditor|Account)\s+Name\s*:/i, 'Late Payment reference is missing its Creditor Name or Account Name placeholder line.');
  const accountNameLabel = /^Creditor/i.test(text(accountNameSample)) ? 'Creditor Name:' : 'Account Name:';
  const accountNameIndex = all.indexOf(accountNameSample); const accountNumberSample = matching(all, [/^Account\s+Number\s*:/i], accountNameIndex);
  if (!accountNumberSample) throw new Error('Late Payment reference is missing its Account Number placeholder line.');
  const statutory = matching(all, [/^Under\s+15\s+U\.S\.\s+Code/i, /^Under\s+15\s+USC/i], all.indexOf(accountNumberSample));
  if (!statutory) throw new Error('Late Payment reference is missing the statutory paragraph after its account placeholder block.');
  if (!values.latePaymentItems.length) throw new Error('No late-payment item was supplied.');
  const region = all.slice(accountNameIndex, all.indexOf(statutory)); const blankTemplate = region.find((paragraph) => text(paragraph).length === 0); region.forEach((paragraph) => body.removeChild(paragraph));
  values.latePaymentItems.forEach((item) => { const lines = sourceItemLines(item, accountNameLabel); const account = accountNameSample.cloneNode(true) as Element; const number = accountNumberSample.cloneNode(true) as Element; replaceParagraph(account, [lines.find((line) => /^(Creditor|Account)\s+Name\s*:/i.test(line)) || `${accountNameLabel} ${lines[0] || ''}`]); replaceParagraph(number, [lines.find((line) => /^Account\s+Number\s*:/i.test(line)) || 'Account Number:']); body.insertBefore(account, statutory); body.insertBefore(number, statutory); if (blankTemplate) body.insertBefore(blankTemplate.cloneNode(true), statutory); });
  all = paragraphs(body); const sincerely = matching(all, [/^Sincerely,?$/i]); if (sincerely) { const signature = all.slice(all.indexOf(sincerely) + 1).find((paragraph) => text(paragraph).length > 0); if (signature) replaceParagraph(signature, [values.consumerName]); }
  applyLetterFlowRules(body); zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return validateGenerated(zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }), values);
}

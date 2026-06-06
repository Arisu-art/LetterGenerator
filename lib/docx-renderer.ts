import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { hasTemplateInjectionTags } from './template-injection';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DISPUTE_EXCLUDED_ADDRESS_FIELD = /^(?:PHONE(?:\s+NO\.?)?|TELEPHONE|MOBILE|EMAIL|E-?MAIL|COUNTRY)\s*:/i;
const TOKEN = /\{\{\s*[#\/^]?\s*[\w.-]+\s*\}\}/g;

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

function visibleXmlText(xml: string) {
  return xml.replace(/<w:tab\b[^>]*\/>/gi, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/gi, '\n').replace(/<\/w:p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function canonical(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function resolved(values: ReferenceDisputeValues) {
  if (values.disputeItems || values.hardInquiryItems) return { accounts: values.disputeItems || [], inquiries: values.hardInquiryItems || [] };
  const combined = values.fraudItems || [];
  return { accounts: combined.filter((entry) => /^(Account|Creditor)\s+Name\s*:/i.test(entry.trim())), inquiries: combined.filter((entry) => !/^(Account|Creditor)\s+Name\s*:/i.test(entry.trim())) };
}
function consumerIdentityLines(values: ReferenceDisputeValues) {
  return [values.consumerName, ...values.addressLines.map((line) => line.trim()).filter(Boolean).filter((line) => !DISPUTE_EXCLUDED_ADDRESS_FIELD.test(line))].filter(Boolean);
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
function parseXml(xml: string) { return new DOMParser().parseFromString(xml, 'application/xml'); }
function childByName(parent: Element | null, localName: string) { return parent ? Array.from(parent.children).find((node) => node.namespaceURI === WORD_NS && node.localName === localName) as Element | undefined : undefined; }
function paragraphText(paragraph: Element) { return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').replace(/\s+/g, ' ').trim(); }
function allParagraphs(xml: Document) { return Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p')) as Element[]; }
function clearParagraphRuns(paragraph: Element) { Array.from(paragraph.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) paragraph.removeChild(node); }); }
function firstRun(paragraph: Element) { return childByName(paragraph, 'r'); }
function makeRun(doc: Document, source: Element | undefined, text: string) {
  const run = source ? source.cloneNode(true) as Element : doc.createElementNS(WORD_NS, 'w:r');
  Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node); });
  const t = doc.createElementNS(WORD_NS, 'w:t');
  if (/^\s|\s$/.test(text)) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  t.textContent = text;
  run.appendChild(t);
  return run;
}
function setParagraphText(paragraph: Element, text: string) {
  const doc = paragraph.ownerDocument;
  const sourceRun = firstRun(paragraph);
  clearParagraphRuns(paragraph);
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const run = makeRun(doc, sourceRun, line);
    if (index) run.insertBefore(doc.createElementNS(WORD_NS, 'w:br'), Array.from(run.children).find((node) => node.localName === 't') || null);
    paragraph.appendChild(run);
  });
}
function cloneWithText(source: Element, text: string) { const clone = source.cloneNode(true) as Element; setParagraphText(clone, text); return clone; }
function insertAfter(reference: Element, node: Element) { reference.parentNode?.insertBefore(node, reference.nextSibling); }
function removeRange(paragraphs: Element[], startExclusive: number, endExclusive: number) { for (let i = endExclusive - 1; i > startExclusive; i -= 1) paragraphs[i]?.parentNode?.removeChild(paragraphs[i]); }
function isDateText(text: string) { return /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i.test(text) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text); }
function looksLikeBureau(text: string) { return /\b(?:Equifax|Experian|TransUnion|Transunion|Information Services|PO Box|P\.O\. Box)\b/i.test(text); }
function looksLikeAccount(text: string) { return /^(?:Account|Creditor)\s+Name\s*:|^Account\s+Number\s*:|^Pursuant\s+to\s+15\s+USC/i.test(text); }
function accountLines(items: string[]) { return items.flatMap((item) => item.split('\n').map((line) => line.trim()).filter(Boolean)); }
function fallbackRenderDisputeDocx(reference: File, values: ReferenceDisputeValues, documentXml: string) {
  return reference.arrayBuffer().then((buffer) => {
    const zip = new PizZip(buffer);
    const xml = parseXml(documentXml);
    const paragraphs = allParagraphs(xml);
    const nonEmpty = paragraphs.map((p, i) => ({ p, i, text: paragraphText(p) })).filter((item) => item.text);
    const identity = consumerIdentityLines(values);
    const firstTextIndex = nonEmpty[0]?.i ?? 0;
    identity.slice(0, Math.min(identity.length, 6)).forEach((line, offset) => { if (paragraphs[firstTextIndex + offset]) setParagraphText(paragraphs[firstTextIndex + offset], line); });
    const dateCandidate = nonEmpty.find((item) => isDateText(item.text)) || nonEmpty.find((item) => item.i > firstTextIndex && item.i < firstTextIndex + 12);
    if (dateCandidate) setParagraphText(dateCandidate.p, values.letterDate);
    const bureauStart = nonEmpty.find((item) => looksLikeBureau(item.text));
    if (bureauStart) setParagraphText(bureauStart.p, [values.bureauName, ...values.bureauAddressLines].filter(Boolean).join('\n'));
    const heading = nonEmpty.find((item) => /FRAUDULENT\s+ACCOUNTS|IMMEDIATE\s+BLOCKING|DELETION/i.test(item.text));
    if (heading) {
      const liveParagraphs = allParagraphs(xml);
      const start = liveParagraphs.indexOf(heading.p);
      const end = liveParagraphs.findIndex((p, index) => index > start && /REQUIRED\s+ACTIONS|NO\s+FCRA|NOTICE|SUPPORTING\s+DOCUMENTS/i.test(paragraphText(p)));
      const nextBoundary = end > start ? end : Math.min(liveParagraphs.length, start + 30);
      const zone = liveParagraphs.slice(start + 1, nextBoundary);
      const accountTemplate = zone.find((p) => /^Account\s+Name\s*:/i.test(paragraphText(p))) || zone.find((p) => looksLikeAccount(paragraphText(p))) || heading.p;
      const redTemplate = zone.find((p) => /^Pursuant\s+to\s+15\s+USC/i.test(paragraphText(p))) || accountTemplate;
      removeRange(liveParagraphs, start, nextBoundary);
      let anchor = heading.p;
      accountLines(resolved(values).accounts).forEach((line) => {
        const paragraph = cloneWithText(/^Pursuant\s+to\s+15\s+USC/i.test(line) ? redTemplate : accountTemplate, line);
        insertAfter(anchor, paragraph);
        anchor = paragraph;
      });
    }
    zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
    return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
  });
}
async function validateStrictDisputeOutput(blob: Blob, values: ReferenceDisputeValues) {
  const xml = new PizZip(await blob.arrayBuffer()).file('word/document.xml')?.asText() || '';
  const output = visibleXmlText(xml);
  if (TOKEN.test(output)) throw new Error('Dispute output contains unresolved template placeholders. Check mapped tags/zones in the uploaded DOCX.');
  if (!canonical(output).includes(canonical(values.consumerName))) throw new Error(`Dispute output consumer integrity check failed: expected ${values.consumerName}.`);
  if (!canonical(output).includes(canonical(values.bureauName))) throw new Error(`Dispute output bureau integrity check failed: expected ${values.bureauName}.`);
  if (!canonical(output).includes(canonical(values.letterDate))) throw new Error(`Dispute output document-date integrity check failed: expected ${values.letterDate}.`);
  return blob;
}

export async function renderReferenceDisputeDocx(reference: File, values: ReferenceDisputeValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('DOCX document XML is unavailable.');
  const documentXml = file.asText();
  const rendered = hasTemplateInjectionTags(documentXml) ? await renderDocxTemplate(reference, disputePlaceholderValues(values)) : await fallbackRenderDisputeDocx(reference, values, documentXml);
  return validateStrictDisputeOutput(rendered, values);
}
export function isDocx(filename: string) { return /\.docx$/i.test(filename); }

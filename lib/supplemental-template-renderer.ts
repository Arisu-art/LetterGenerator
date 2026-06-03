import PizZip from 'pizzip';
import { DOCX_MIME, renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import { bureaus, type Bureau, type ParsedSource, type SourceItem } from './letter-engine';

export type MappedAppendixKind = 'AFFIDAVIT' | 'FTC';
export type MappedAppendixContext = {
  kind: MappedAppendixKind;
  bureau: Bureau;
  documentDate: string;
  recipientName: string;
  recipientAddressLines: string[];
  source: ParsedSource;
};
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

function rows(items: SourceItem[]) {
  return items.map((item) => {
    const lines = item.displayText.split('\n').map((line) => line.trim()).filter(Boolean);
    const itemName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '');
    const itemNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '');
    return { account_name: itemName, account_number: itemNumber, account_line: [itemName, itemNumber].filter(Boolean).join(' - '), display_text: item.displayText };
  });
}
function deduplicatedDisputeAccounts(source: ParsedSource) {
  const result: ReturnType<typeof rows> = [];
  const keys = new Set<string>();
  bureaus.forEach((bureau) => rows(source.dispute[bureau]).forEach((item) => {
    const key = `${item.account_name}|${item.account_number}`.toUpperCase();
    if (!keys.has(key)) { keys.add(key); result.push(item); }
  }));
  return result;
}
function mappedValues(context: MappedAppendixContext): PlaceholderValues {
  const bureauAccounts = rows(context.source.dispute[context.bureau]);
  const affidavitAccounts = deduplicatedDisputeAccounts(context.source);
  const accounts = context.kind === 'AFFIDAVIT' ? affidavitAccounts : bureauAccounts;
  const inquiries = context.source.inquiry[context.bureau].map((item) => ({ inquiry_line: item.displayText, display_text: item.displayText }));
  return {
    consumer_name: context.source.name,
    client_name: context.source.name,
    name: context.source.name,
    address: context.source.address.join('\n'),
    address_inline: context.source.address.join(' '),
    address_line_1: context.source.address[0] || '',
    address_line_2: context.source.address.slice(1).join(' '),
    dob: context.source.dob,
    ssn: context.source.ssn,
    ssn_masked: context.source.ssn,
    phone: context.source.phone,
    email: context.source.email,
    date: context.documentDate,
    letter_date: context.documentDate,
    document_date: context.documentDate,
    affidavit_state: context.source.affidavitState,
    affidavit_county: context.source.affidavitCounty,
    bureau_name: context.recipientName,
    bureau_address: context.recipientAddressLines.join('\n'),
    bureau_address_line_1: context.recipientAddressLines[0] || '',
    bureau_address_line_2: context.recipientAddressLines.slice(1).join(' '),
    accounts,
    dispute_accounts: accounts,
    hard_inquiries: inquiries,
    account_lines: accounts.map((item) => item.account_line).join('\n'),
    hard_inquiry_lines: inquiries.map((item) => item.inquiry_line).join('\n')
  };
}
function paragraphs(body: Element) { return Array.from(body.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'p'); }
function content(paragraph: Element) { return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').trim(); }
function paragraphStyle(paragraph: Element) {
  const runs = Array.from(paragraph.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'r');
  return (runs.find((run) => content(run).length > 0) || runs[0] || paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r')).cloneNode(true) as Element;
}
function emptyStyledRun(source: Element) {
  const run = source.cloneNode(true) as Element;
  Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node); });
  const style = Array.from(run.children).find((node) => node.namespaceURI === WORD_NS && node.localName === 'rPr') as Element | undefined;
  const highlight = style?.getElementsByTagNameNS(WORD_NS, 'highlight').item(0);
  if (highlight?.parentNode) highlight.parentNode.removeChild(highlight);
  return run;
}
function writeParagraph(paragraph: Element, text: string) {
  const doc = paragraph.ownerDocument;
  const style = paragraphStyle(paragraph);
  Array.from(paragraph.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) paragraph.removeChild(node); });
  const run = emptyStyledRun(style);
  const value = doc.createElementNS(WORD_NS, 'w:t');
  if (/^\s|\s$/.test(text)) value.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  value.textContent = text;
  run.appendChild(value);
  paragraph.appendChild(run);
}
function removeYellowHighlights(body: Element) {
  Array.from(body.getElementsByTagNameNS(WORD_NS, 'highlight')).forEach((highlight) => {
    const value = (highlight.getAttributeNS(WORD_NS, 'val') || highlight.getAttribute('w:val') || '').toLowerCase();
    if ((!value || value === 'yellow') && highlight.parentNode) highlight.parentNode.removeChild(highlight);
  });
}
async function renderHighlightedAffidavit(template: File, context: MappedAppendixContext) {
  const zip = new PizZip(await template.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('Affidavit DOCX document XML is unavailable.');
  const xml = new DOMParser().parseFromString(file.asText(), 'application/xml');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Affidavit DOCX body is unavailable.');
  let all = paragraphs(body);
  const accounts = deduplicatedDisputeAccounts(context.source);
  const find = (pattern: RegExp) => all.find((paragraph) => pattern.test(content(paragraph)));
  const state = find(/^State of\s*:/i);
  const county = find(/^County of\s*:/i);
  const opening = find(/^I,\s/i);
  const personal = find(/^(?:1\.\s*)?Personal Information\s*:/i);
  const date = find(/^Date\s*:/i);
  if (state) writeParagraph(state, `State of: ${context.source.affidavitState}`);
  if (county) writeParagraph(county, `County of: ${context.source.affidavitCounty}`);
  if (opening) writeParagraph(opening, `I, ${context.source.name} residing at ${context.source.address.join(' ')} being duly sworn, depose and state as follows:`);
  if (personal) writeParagraph(personal, `Personal Information: I am over the age of 18, and my current address is ${context.source.address.join(' ')}. My Social Security number is ${context.source.ssn}.`);
  if (date) writeParagraph(date, `Date: ${context.documentDate}`);
  all = paragraphs(body);
  const close = all.find((paragraph) => /^Sincerely,?$/i.test(content(paragraph)));
  const signature = close ? all.slice(all.indexOf(close) + 1).find((paragraph) => content(paragraph) && !/^Date\s*:/i.test(content(paragraph))) : undefined;
  if (signature) writeParagraph(signature, context.source.name);
  const accountHeading = all.find((paragraph) => /^Account Information\s*:/i.test(content(paragraph)));
  const statement = all.find((paragraph) => /^I declare that this account/i.test(content(paragraph)));
  if (accountHeading && statement) {
    const region = all.slice(all.indexOf(accountHeading) + 1, all.indexOf(statement));
    const rowTemplate = region.find((paragraph) => /Account\s+Name/i.test(content(paragraph)) && /Account\s+(?:number|Number)/i.test(content(paragraph))) || region.find((paragraph) => content(paragraph));
    region.forEach((paragraph) => body.removeChild(paragraph));
    if (rowTemplate) {
      accounts.forEach((account) => {
        const row = rowTemplate.cloneNode(true) as Element;
        writeParagraph(row, account.account_line);
        body.insertBefore(row, statement);
      });
    }
  }
  removeYellowHighlights(body);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

export async function renderMappedAppendix(template: File, context: MappedAppendixContext) {
  const text = await template.arrayBuffer().then((buffer) => new PizZip(buffer).file('word/document.xml')?.asText() || '');
  if (context.kind === 'AFFIDAVIT' && !text.includes('{{')) return renderHighlightedAffidavit(template, context);
  return renderDocxTemplate(template, mappedValues(context));
}

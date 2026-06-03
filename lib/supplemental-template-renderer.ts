import PizZip from 'pizzip';
import { DOCX_MIME, renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import { bureaus, ftcFraudMonthYearFromReportDate, MAX_FTC_ACCOUNTS, type Bureau, type FtcAffectedAccount, type ParsedSource, type SourceItem } from './letter-engine';

export type MappedAppendixKind = 'AFFIDAVIT' | 'FTC';
export type MappedAppendixContext = { kind: MappedAppendixKind; bureau: Bureau; documentDate: string; recipientName: string; recipientAddressLines: string[]; source: ParsedSource };
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
type RenderRow = { account_name: string; account_number: string; account_line: string; display_text: string };
type TemplateMode = 'PLACEHOLDER' | 'AFFIDAVIT_STANDARD' | 'FTC_STANDARD';

function rows(items: SourceItem[]) {
  return items.map((item) => {
    const lines = item.displayText.split('\n').map((line) => line.trim()).filter(Boolean);
    const itemName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '');
    const itemNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '');
    return { account_name: itemName, account_number: itemNumber, account_line: [itemName, itemNumber].filter(Boolean).join(' — '), display_text: item.displayText };
  });
}
function phoneForFtc(value: string) { const clean = value.trim(); if (!clean) return 'N/A'; const digits = clean.replace(/\D/g, ''); return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : clean; }
function titleCase(value: string) { return value.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`); }
function caseLike(sample: string, value: string) { if (sample && sample === sample.toUpperCase()) return value.toUpperCase(); if (/^[A-Z][a-z]+(?:[\s'-][A-Z][a-z]+)+$/.test(sample.trim())) return titleCase(value); return value; }
function consolidatedDisputeAccounts(source: ParsedSource) {
  const grouped = new Map<string, Map<string, { row: RenderRow; bureaus: Set<Bureau>; order: number }>>(); let order = 0;
  bureaus.forEach((bureau) => rows(source.dispute[bureau]).forEach((row) => {
    const name = row.account_name.toUpperCase(); const number = row.account_number.toUpperCase();
    if (!grouped.has(name)) grouped.set(name, new Map()); const versions = grouped.get(name)!;
    if (!versions.has(number)) versions.set(number, { row, bureaus: new Set(), order: order++ }); versions.get(number)!.bureaus.add(bureau);
  }));
  const result: Array<{ row: RenderRow; order: number }> = [];
  grouped.forEach((versions) => { const candidates = Array.from(versions.values()); const repeated = candidates.filter((candidate) => candidate.bureaus.size > 1); (repeated.length ? repeated : candidates).forEach((candidate) => result.push({ row: candidate.row, order: candidate.order })); });
  return result.sort((a, b) => a.order - b.order).map((entry) => entry.row);
}
function affidavitRows(source: ParsedSource) {
  const accountRows = consolidatedDisputeAccounts(source); const seen = new Set(accountRows.map((item) => item.account_line.toUpperCase())); const inquiryRows: RenderRow[] = [];
  bureaus.forEach((bureau) => source.inquiry[bureau].forEach((item) => { const line = item.displayText.replace(/\s+[-–—]\s+/g, ' — '); const key = line.toUpperCase(); if (!seen.has(key)) { seen.add(key); inquiryRows.push({ account_name: '', account_number: '', account_line: line, display_text: item.displayText }); } }));
  return [...accountRows, ...inquiryRows];
}
function ftcRows(items: FtcAffectedAccount[], reportDate: string) { const fraudBegan = ftcFraudMonthYearFromReportDate(reportDate); return items.slice(0, MAX_FTC_ACCOUNTS).map((item) => ({ account_name: item.accountName, account_number: item.accountNumber, fraud_began: fraudBegan, date_discovered: item.dateDiscovered, fraudulent_amount: item.fraudulentAmount, fraud_amount: item.fraudulentAmount })); }
function mappedValues(context: MappedAppendixContext): PlaceholderValues {
  const bureauAccounts = rows(context.source.dispute[context.bureau]); const affidavitAccounts = affidavitRows(context.source); const accounts = context.kind === 'AFFIDAVIT' ? affidavitAccounts : bureauAccounts; const inquiries = context.source.inquiry[context.bureau].map((item) => ({ inquiry_line: item.displayText, display_text: item.displayText })); const phone = context.kind === 'FTC' ? phoneForFtc(context.source.phone) : context.source.phone; const reportDate = context.source.ftcReportDate || context.documentDate;
  return { consumer_name: context.source.name, client_name: context.source.name, name: context.source.name, consumer_first_name: context.source.firstName, consumer_middle_name: context.kind === 'FTC' ? '' : context.source.middleName, consumer_last_name: context.source.lastName, address: context.source.address.join('\n'), address_inline: context.source.address.join(' '), address_line_1: context.source.address[0] || '', address_line_2: context.source.address.slice(1).join(' '), country: context.source.country || 'USA', dob: context.source.dob, ssn: context.source.ssn, ssn_masked: context.source.ssn, phone, email: context.kind === 'FTC' ? '' : context.source.email, date: context.documentDate, letter_date: context.documentDate, document_date: context.documentDate, affidavit_state: context.source.affidavitState, affidavit_county: context.source.affidavitCounty, ftc_report_number: context.source.ftcReportNumber, ftc_report_date: reportDate, bureau_name: context.recipientName, bureau_address: context.recipientAddressLines.join('\n'), bureau_address_line_1: context.recipientAddressLines[0] || '', bureau_address_line_2: context.recipientAddressLines.slice(1).join(' '), accounts, dispute_accounts: accounts, ftc_accounts: ftcRows(context.source.ftcAccounts, reportDate), hard_inquiries: inquiries, account_lines: accounts.map((item) => item.account_line).join('\n'), hard_inquiry_lines: inquiries.map((item) => item.inquiry_line).join('\n'), ...context.source.templateFields };
}
function paragraphs(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 'p')); }
function directParagraphs(root: Element) { return Array.from(root.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'p') as Element[]; }
function tables(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 'tbl')); }
function tableRows(table: Element) { return Array.from(table.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'tr') as Element[]; }
function rowCells(row: Element) { return Array.from(row.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === 'tc') as Element[]; }
function textNodes(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 't')); }
function rawContent(root: Element) { return textNodes(root).map((node) => node.textContent || '').join(''); }
function content(root: Element) { return rawContent(root).trim(); }
function setText(node: Element, value: string) { node.textContent = value; if (/^\s|\s$/.test(value)) node.setAttributeNS(XML_NS, 'xml:space', 'preserve'); else node.removeAttributeNS(XML_NS, 'space'); }
function replaceOffsets(root: Element, start: number, end: number, value: string) {
  const nodes = textNodes(root); let offset = 0; const spans = nodes.map((node) => { const begin = offset; offset += (node.textContent || '').length; return { node, begin, end: offset }; });
  const touched = spans.filter((span) => span.end > start && span.begin < end); if (!touched.length) return false;
  const first = touched[0], last = touched[touched.length - 1]; const before = (first.node.textContent || '').slice(0, Math.max(0, start - first.begin)); const after = (last.node.textContent || '').slice(Math.max(0, end - last.begin));
  setText(first.node, `${before}${value}${first === last ? after : ''}`);
  touched.slice(1, -1).forEach((span) => setText(span.node, ''));
  if (first !== last) setText(last.node, after);
  return true;
}
function replaceCaptured(root: Element, pattern: RegExp, groupIndex: number, value: string) {
  const text = rawContent(root); const match = text.match(pattern); if (!match || !match[groupIndex]) return false; const relative = match[0].indexOf(match[groupIndex]); if (relative < 0) return false; const start = (match.index || 0) + relative; return replaceOffsets(root, start, start + match[groupIndex].length, value);
}
function replaceAllMatches(root: Element, pattern: RegExp, value: string) {
  const text = rawContent(root); const matches = Array.from(text.matchAll(pattern)); let changed = false;
  matches.reverse().forEach((match) => { if (match.index !== undefined) changed = replaceOffsets(root, match.index, match.index + match[0].length, value) || changed; });
  return changed;
}
function firstRun(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 'r')).find((run) => content(run)) || root.getElementsByTagNameNS(WORD_NS, 'r').item(0); }
function emptyStyledRun(source: Element) { const run = source.cloneNode(true) as Element; Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node); }); return run; }
function setParagraphLines(paragraph: Element, lines: string[]) {
  const doc = paragraph.ownerDocument; const source = firstRun(paragraph) || doc.createElementNS(WORD_NS, 'w:r');
  Array.from(paragraph.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) paragraph.removeChild(node); });
  lines.forEach((line, index) => { const run = emptyStyledRun(source); if (index) run.appendChild(doc.createElementNS(WORD_NS, 'w:br')); const text = doc.createElementNS(WORD_NS, 'w:t'); setText(text, line); run.appendChild(text); paragraph.appendChild(run); });
}
function setCellLines(cell: Element, lines: string[]) { const p = paragraphs(cell)[0]; if (!p) throw new Error('Template cell does not contain an editable paragraph.'); setParagraphLines(p, lines); paragraphs(cell).slice(1).forEach((extra) => extra.parentNode?.removeChild(extra)); }
function setCellValue(cell: Element | undefined, value: string, preserveIndent = false) { if (!cell) throw new Error('Template table is missing an expected value cell.'); const prefix = preserveIndent ? (rawContent(cell).match(/^\s*/) || [''])[0] : ''; setCellLines(cell, [`${prefix}${value}`]); }
function cloneParagraphWithValue(template: Element, value: string) { const clone = template.cloneNode(true) as Element; setParagraphLines(clone, [value]); return clone; }
function formatMode(xmlText: string, kind: MappedAppendixKind): TemplateMode { if (xmlText.includes('{{')) return 'PLACEHOLDER'; return kind === 'AFFIDAVIT' ? 'AFFIDAVIT_STANDARD' : 'FTC_STANDARD'; }
async function openTemplate(template: File, label: string) { const zip = new PizZip(await template.arrayBuffer()), file = zip.file('word/document.xml'); if (!file) throw new Error(`${label} DOCX document XML is unavailable.`); const xmlText = file.asText(); const xml = new DOMParser().parseFromString(xmlText, 'application/xml'), body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0]; if (!body) throw new Error(`${label} DOCX body is unavailable.`); return { zip, xmlText, xml, body }; }
function finish(zip: PizZip, xml: XMLDocument) { zip.file('word/document.xml', new XMLSerializer().serializeToString(xml)); return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }); }

async function renderAffidavitStandard(template: File, context: MappedAppendixContext) {
  const { zip, xml, body } = await openTemplate(template, 'Affidavit'); const all = directParagraphs(body); const source = context.source; const street = source.address[0] || 'N/A';
  if (!all.some((p) => /AFFIDAVIT\s+OF\s+DISPUTE/i.test(content(p)))) throw new Error('Uploaded Affidavit template is not a recognized standard Affidavit document.');
  const state = all.find((p) => /^State\s+of\s*:/i.test(content(p))); const county = all.find((p) => /^County\s+of\s*:/i.test(content(p)));
  if (!state || !county) throw new Error('Uploaded Affidavit template is missing its State of / County of value positions.');
  replaceCaptured(state, /^(State\s+of\s*:\s*)(.*)$/i, 2, (source.affidavitState || 'N/A').toUpperCase());
  replaceCaptured(county, /^(County\s+of\s*:\s*)(.*)$/i, 2, (source.affidavitCounty || 'N/A').toUpperCase());
  const opening = all.find((p) => /^I,\s/i.test(content(p))); if (!opening) throw new Error('Uploaded Affidavit template is missing the declarant sentence.');
  replaceCaptured(opening, /^(I,\s*)(.*?)(\s+residing\s+at\s+)/i, 2, source.name.toUpperCase());
  replaceCaptured(opening, /(\s+residing\s+at\s+)(.*?)(\s+being\s+duly\s+)/i, 2, street.toUpperCase());
  const personal = all.find((p) => /Personal\s+Information/i.test(content(p))); if (!personal) throw new Error('Uploaded Affidavit template is missing the Personal Information sentence.');
  replaceCaptured(personal, /(current\s+address\s+is\s+)(.*?)(\.\s+My\s+(?:Social\s+)?Security)/i, 2, street.toUpperCase());
  replaceAllMatches(personal, /(?:X{3}|\d{3})-(?:X{2}|\d{2})-(?:X{4}|\d{4})/gi, source.ssn);
  const headingIndex = all.findIndex((p) => /^Account\s+Information\s*:/i.test(content(p))); const declarationIndex = all.findIndex((p) => /^I\s+declare\s+that\s+this\s+account/i.test(content(p)));
  if (headingIndex < 0 || declarationIndex <= headingIndex) throw new Error('Uploaded Affidavit template is missing the account-list boundaries.');
  const listRegion = all.slice(headingIndex + 1, declarationIndex); const variableRows = listRegion.filter((p) => content(p)); const rowTemplate = variableRows[0];
  if (!rowTemplate?.parentNode) throw new Error('Uploaded Affidavit template is missing its account-list row style.');
  const insertBefore = rowTemplate; affidavitRows(source).forEach((item) => insertBefore.parentNode!.insertBefore(cloneParagraphWithValue(rowTemplate, item.account_line), insertBefore));
  variableRows.forEach((p) => p.parentNode?.removeChild(p));
  const sincerelyIndex = all.findIndex((p) => /^Sincerely,?$/i.test(content(p))); const signature = sincerelyIndex >= 0 ? all.slice(sincerelyIndex + 1).find((p) => content(p)) : undefined;
  if (!signature) throw new Error('Uploaded Affidavit template is missing its signature value position.');
  const signatureExisting = content(signature); setParagraphLines(signature, [caseLike(signatureExisting, source.name)]);
  const date = all.find((p) => /^Date\s*:/i.test(content(p))); if (!date) throw new Error('Uploaded Affidavit template is missing its date value position.');
  replaceCaptured(date, /^(Date\s*:\s*)(.*)$/i, 2, context.documentDate);
  return finish(zip, xml);
}
function findContactTable(body: Element) { return tables(body).find((table) => { const rows = tableRows(table); return rows.length >= 4 && rowCells(rows[1] || table).length === 3 && rowCells(rows[3] || table).length === 3; }); }
function isAffectedTable(table: Element, contact: Element | undefined) { if (table === contact) return false; const rows = tableRows(table); const lastCells = rowCells(rows[rows.length - 1] || table); return rows.length >= 4 && lastCells.length === 3; }
function mapFtcTable(table: Element, item: FtcAffectedAccount, fraudBegan: string) {
  const rows = tableRows(table); const companyRow = rows[1]; const valueRow = rows[rows.length - 1]; if (!companyRow || rowCells(valueRow).length < 3) throw new Error('FTC affected-item table structure is incomplete.');
  setCellValue(rowCells(companyRow)[0], item.accountName, true);
  if (rows.length >= 5) setCellValue(rowCells(rows[2])[0], item.accountNumber, true);
  const values = rowCells(valueRow); setCellValue(values[0], fraudBegan); setCellValue(values[1], item.dateDiscovered); setCellValue(values[2], item.fraudulentAmount ? `$ ${item.fraudulentAmount}` : '');
}
async function renderFtcStandard(template: File, context: MappedAppendixContext) {
  const { zip, xml, body } = await openTemplate(template, 'FTC Report'); const source = context.source; const reportDate = source.ftcReportDate || context.documentDate; const fraudBegan = ftcFraudMonthYearFromReportDate(reportDate);
  if (!source.ftcReportNumber.trim()) throw new Error('FTC report number is required in source data before generating the FTC report.');
  if (!source.ftcAccounts.length) throw new Error('FTC AFFECTED ACCOUNTS must contain the exact selected FTC items and order before generating the FTC report.');
  const all = directParagraphs(body); const reportParagraphs = all.filter((p) => /FTC\s+Report\s+Number\s*:/i.test(rawContent(p)));
  if (!reportParagraphs.length) throw new Error('Uploaded FTC template is missing the FTC Report Number value area.');
  reportParagraphs.forEach((p) => replaceAllMatches(p, /\b\d{6,12}\b/g, source.ftcReportNumber));
  const contact = findContactTable(body); if (!contact) throw new Error('Uploaded FTC template is missing the standard contact-information table.');
  const contactRows = tableRows(contact); const nameCells = rowCells(contactRows[1]); const contactCells = rowCells(contactRows[3]);
  setCellValue(nameCells[0], source.firstName.toUpperCase()); setCellValue(nameCells[1], ''); setCellValue(nameCells[2], source.lastName.toUpperCase());
  setCellLines(contactCells[0], [...source.address, source.country || 'USA']); setCellValue(contactCells[1], phoneForFtc(source.phone)); setCellValue(contactCells[2], '');
  const itemTables = tables(body).filter((table) => isAffectedTable(table, contact)); if (!itemTables.length) throw new Error('Uploaded FTC template is missing standard affected-item table positions.');
  const items = source.ftcAccounts.slice(0, MAX_FTC_ACCOUNTS);
  items.forEach((item, index) => {
    const table = itemTables[index] || itemTables[Math.min(index, itemTables.length - 1)].cloneNode(true) as Element;
    if (!itemTables[index]) itemTables[itemTables.length - 1].parentNode?.insertBefore(table, itemTables[itemTables.length - 1].nextSibling);
    mapFtcTable(table, item, fraudBegan);
  });
  itemTables.slice(items.length).forEach((table) => table.parentNode?.removeChild(table));
  const dateIndex = all.findIndex((p) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(content(p))); if (dateIndex < 0) throw new Error('Uploaded FTC template is missing the signed report date value position.');
  const dateParagraph = all[dateIndex]; setParagraphLines(dateParagraph, [reportDate.replace(/^0/, '').replace(/\/(0)(\d)\//, '/$2/')]);
  const nameParagraphs = all.slice(0, dateIndex).filter((p) => /^([A-Z]+[\s'-]*){2,}$/.test(content(p))).slice(-2);
  nameParagraphs.forEach((p) => setParagraphLines(p, [source.name.toUpperCase()]));
  return finish(zip, xml);
}
export async function renderMappedAppendix(template: File, context: MappedAppendixContext) {
  const opened = await openTemplate(template, context.kind === 'AFFIDAVIT' ? 'Affidavit' : 'FTC Report'); const mode = formatMode(opened.xmlText, context.kind);
  if (mode === 'PLACEHOLDER') return renderDocxTemplate(template, mappedValues(context));
  return mode === 'AFFIDAVIT_STANDARD' ? renderAffidavitStandard(template, context) : renderFtcStandard(template, context);
}

import PizZip from 'pizzip';
import { DOCX_MIME, renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import { bureaus, ftcFraudMonthYearFromReportDate, MAX_FTC_ACCOUNTS, type Bureau, type FtcAffectedAccount, type ParsedSource, type SourceItem } from './letter-engine';

export type MappedAppendixKind = 'AFFIDAVIT' | 'FTC';
export type MappedAppendixContext = { kind: MappedAppendixKind; bureau: Bureau; documentDate: string; recipientName: string; recipientAddressLines: string[]; source: ParsedSource };
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
type RenderRow = { account_name: string; account_number: string; account_line: string; display_text: string };
type HighlightGroup = Element[];

function rows(items: SourceItem[]) {
  return items.map((item) => {
    const lines = item.displayText.split('\n').map((line) => line.trim()).filter(Boolean);
    const itemName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '');
    const itemNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '');
    return { account_name: itemName, account_number: itemNumber, account_line: [itemName, itemNumber].filter(Boolean).join(' — '), display_text: item.displayText };
  });
}
function phoneForFtc(value: string) { const clean = value.trim(); if (!clean) return 'N/A'; const digits = clean.replace(/\D/g, ''); return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : clean; }
function consolidatedDisputeAccounts(source: ParsedSource) {
  const grouped = new Map<string, Map<string, { row: RenderRow; bureaus: Set<Bureau> }>>();
  bureaus.forEach((bureau) => rows(source.dispute[bureau]).forEach((row) => {
    const name = row.account_name.toUpperCase(); const number = row.account_number.toUpperCase();
    if (!grouped.has(name)) grouped.set(name, new Map()); const versions = grouped.get(name)!;
    if (!versions.has(number)) versions.set(number, { row, bureaus: new Set() }); versions.get(number)!.bureaus.add(bureau);
  }));
  const result: RenderRow[] = [];
  grouped.forEach((versions) => { const candidates = Array.from(versions.values()); const repeated = candidates.filter((candidate) => candidate.bureaus.size > 1); (repeated.length ? repeated : candidates).forEach((candidate) => result.push(candidate.row)); });
  return result;
}
function affidavitRows(source: ParsedSource) {
  const accountRows = consolidatedDisputeAccounts(source); const seen = new Set(accountRows.map((item) => item.account_line.toUpperCase())); const inquiryRows: RenderRow[] = [];
  bureaus.forEach((bureau) => source.inquiry[bureau].forEach((item) => { const line = item.displayText.replace(/\s+-\s+/g, ' — '); const key = line.toUpperCase(); if (!seen.has(key)) { seen.add(key); inquiryRows.push({ account_name: '', account_number: '', account_line: line, display_text: item.displayText }); } }));
  return [...accountRows, ...inquiryRows];
}
function ftcRows(items: FtcAffectedAccount[], reportDate: string) { const fraudBegan = ftcFraudMonthYearFromReportDate(reportDate); return items.slice(0, MAX_FTC_ACCOUNTS).map((item) => ({ account_name: item.accountName, account_number: item.accountNumber, fraud_began: fraudBegan, date_discovered: item.dateDiscovered, fraudulent_amount: item.fraudulentAmount, fraud_amount: item.fraudulentAmount })); }
function mappedValues(context: MappedAppendixContext): PlaceholderValues {
  const bureauAccounts = rows(context.source.dispute[context.bureau]); const affidavitAccounts = affidavitRows(context.source); const accounts = context.kind === 'AFFIDAVIT' ? affidavitAccounts : bureauAccounts; const inquiries = context.source.inquiry[context.bureau].map((item) => ({ inquiry_line: item.displayText, display_text: item.displayText })); const phone = context.kind === 'FTC' ? phoneForFtc(context.source.phone) : context.source.phone; const reportDate = context.source.ftcReportDate || context.documentDate;
  return { consumer_name: context.source.name, client_name: context.source.name, name: context.source.name, consumer_first_name: context.source.firstName, consumer_middle_name: context.kind === 'FTC' ? '' : context.source.middleName, consumer_last_name: context.source.lastName, address: context.source.address.join('\n'), address_inline: context.source.address.join(' '), address_line_1: context.source.address[0] || '', address_line_2: context.source.address.slice(1).join(' '), country: context.source.country || 'USA', dob: context.source.dob, ssn: context.source.ssn, ssn_masked: context.source.ssn, phone, email: context.kind === 'FTC' ? '' : context.source.email, date: context.documentDate, letter_date: context.documentDate, document_date: context.documentDate, affidavit_state: context.source.affidavitState, affidavit_county: context.source.affidavitCounty, ftc_report_number: context.source.ftcReportNumber, ftc_report_date: reportDate, bureau_name: context.recipientName, bureau_address: context.recipientAddressLines.join('\n'), bureau_address_line_1: context.recipientAddressLines[0] || '', bureau_address_line_2: context.recipientAddressLines.slice(1).join(' '), accounts, dispute_accounts: accounts, ftc_accounts: ftcRows(context.source.ftcAccounts, reportDate), hard_inquiries: inquiries, account_lines: accounts.map((item) => item.account_line).join('\n'), hard_inquiry_lines: inquiries.map((item) => item.inquiry_line).join('\n'), ...context.source.templateFields };
}
function paragraphs(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 'p')); }
function tables(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 'tbl')); }
function content(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').trim(); }
function runs(root: Element) { return Array.from(root.getElementsByTagNameNS(WORD_NS, 'r')); }
function yellowHighlight(run: Element) { return Array.from(run.getElementsByTagNameNS(WORD_NS, 'highlight')).some((highlight) => { const value = (highlight.getAttributeNS(WORD_NS, 'val') || highlight.getAttribute('w:val') || '').toLowerCase(); return !value || value === 'yellow'; }); }
function highlightGroups(root: Element): HighlightGroup[] { const groups: HighlightGroup[] = []; let current: HighlightGroup | null = null; runs(root).forEach((run) => { if (yellowHighlight(run)) { if (!current) { current = []; groups.push(current); } current.push(run); } else current = null; }); return groups; }
function groupContent(group: HighlightGroup) { return group.map((run) => content(run)).join('').trim(); }
function removeYellow(run: Element) { Array.from(run.getElementsByTagNameNS(WORD_NS, 'highlight')).forEach((highlight) => { const value = (highlight.getAttributeNS(WORD_NS, 'val') || highlight.getAttribute('w:val') || '').toLowerCase(); if ((!value || value === 'yellow') && highlight.parentNode) highlight.parentNode.removeChild(highlight); }); }
function clearRunContent(run: Element) { Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node); }); }
function writeRunValue(run: Element, value: string) { const doc = run.ownerDocument; clearRunContent(run); removeYellow(run); value.replace(/\r/g, '').split('\n').forEach((line, index) => { if (index) run.appendChild(doc.createElementNS(WORD_NS, 'w:br')); const text = doc.createElementNS(WORD_NS, 'w:t'); if (/^\s|\s$/.test(line)) text.setAttributeNS(XML_NS, 'xml:space', 'preserve'); text.textContent = line; run.appendChild(text); }); }
function fillGroup(group: HighlightGroup | undefined, value: string) { if (!group?.length) return false; writeRunValue(group[0], value); group.slice(1).forEach((run) => { clearRunContent(run); removeYellow(run); }); return true; }
function fillValue(group: HighlightGroup | undefined, value: string) { if (!group) return false; const prefix = groupContent(group).match(/^([^:\n]{1,45}:\s*)/); return fillGroup(group, prefix ? `${prefix[1]}${value}` : value); }
function parentElementNamed(node: Element, localName: string, stop: Element) { let current: Element | null = node; while (current && current !== stop) { if (current.namespaceURI === WORD_NS && current.localName === localName) return current; current = current.parentElement; } return null; }
function fieldContext(group: HighlightGroup, body: Element) { return content(parentElementNamed(group[0], 'tc', body) || parentElementNamed(group[0], 'p', body) || group[0]); }
function uniqueGroups(groups: HighlightGroup[]) { const seen = new Set<Element>(); return groups.filter((group) => { if (!group[0] || seen.has(group[0])) return false; seen.add(group[0]); return true; }); }
function fillByLabel(groups: HighlightGroup[], body: Element, mappings: Array<{ pattern: RegExp; value: string }>) {
  const used = new Set<Element>();
  mappings.forEach(({ pattern, value }) => { const group = groups.find((candidate) => !used.has(candidate[0]) && pattern.test(fieldContext(candidate, body))); if (group && fillValue(group, value)) used.add(group[0]); });
  return used;
}
async function openTemplate(template: File, label: string) { const zip = new PizZip(await template.arrayBuffer()), file = zip.file('word/document.xml'); if (!file) throw new Error(`${label} DOCX document XML is unavailable.`); const xml = new DOMParser().parseFromString(file.asText(), 'application/xml'), body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0]; if (!body) throw new Error(`${label} DOCX body is unavailable.`); return { zip, xml, body }; }
function finalize(zip: PizZip, xml: XMLDocument) { zip.file('word/document.xml', new XMLSerializer().serializeToString(xml)); return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }); }
function fillSequential(groups: HighlightGroup[], values: string[], used: Set<Element>) { values.forEach((value) => { const group = groups.find((candidate) => !used.has(candidate[0])); if (group && fillValue(group, value)) used.add(group[0]); }); }

async function renderHighlightedAffidavit(template: File, context: MappedAppendixContext) {
  const { zip, xml, body } = await openTemplate(template, 'Affidavit'); const all = paragraphs(body); const source = context.source; const accountItems = affidavitRows(source); const street = source.address[0] || 'N/A'; const groups = highlightGroups(body); let mapped = 0;
  const labelled = fillByLabel(groups, body, [
    { pattern: /state\s+of/i, value: source.affidavitState || 'N/A' }, { pattern: /county\s+of/i, value: source.affidavitCounty || 'N/A' },
    { pattern: /signature|signed\s+by/i, value: source.name }, { pattern: /^\s*date\s*:/i, value: context.documentDate }
  ]); mapped += labelled.size;
  const opening = all.find((p) => /^I,\s/i.test(content(p))); const openingGroups = opening ? highlightGroups(opening) : []; openingGroups.slice(0, 2).forEach((group, index) => { if (!labelled.has(group[0]) && fillValue(group, index ? street : source.name)) { labelled.add(group[0]); mapped += 1; } });
  const personal = all.find((p) => /Personal Information/i.test(content(p))); const personalGroups = personal ? highlightGroups(personal) : []; personalGroups.slice(0, 2).forEach((group, index) => { if (!labelled.has(group[0]) && fillValue(group, index ? source.ssn : street)) { labelled.add(group[0]); mapped += 1; } });
  const headingIndex = all.findIndex((p) => /Account Information/i.test(content(p))); const declarationIndex = all.findIndex((p) => /I declare that this account/i.test(content(p)));
  if (headingIndex >= 0 && declarationIndex > headingIndex) {
    const region = all.slice(headingIndex + 1, declarationIndex); const sample = region.find((p) => highlightGroups(p).length > 0);
    if (sample?.parentNode && accountItems.length) {
      accountItems.forEach((item) => { const clone = sample.cloneNode(true) as Element; const fields = highlightGroups(clone); if (fields.length >= 2 && item.account_name) { fillValue(fields[0], item.account_name); fillValue(fields[1], item.account_number); } else fillValue(fields[0], item.account_line); sample.parentNode!.insertBefore(clone, sample); });
      region.filter((p) => highlightGroups(p).length > 0).forEach((p) => p.parentNode?.removeChild(p)); mapped += accountItems.length;
    }
  }
  if (!mapped) throw new Error('Affidavit template has no recognized yellow-highlighted insertion fields or supported placeholders. Re-upload the marked standard Affidavit template.');
  return finalize(zip, xml);
}

function isAffectedItemTable(table: Element) { const text = content(table); return /(company|organization|account\s*name)/i.test(text) && /(account\s*(number|no\.?|#)|fraud)/i.test(text) && /(discovered|fraudulent\s+amount|date\s+fraud)/i.test(text) && highlightGroups(table).length >= 3; }
function mapAffectedItemTable(table: Element, body: Element, item: FtcAffectedAccount, fraudBegan: string) {
  const groups = highlightGroups(table); const labelled = fillByLabel(groups, body, [
    { pattern: /company|organization|account\s*name/i, value: item.accountName }, { pattern: /account\s*(number|no\.?|#)/i, value: item.accountNumber },
    { pattern: /fraud\s*(began|begin)|date\s+fraud/i, value: fraudBegan }, { pattern: /date\s+discovered|discovered/i, value: item.dateDiscovered },
    { pattern: /fraudulent\s+amount|amount/i, value: item.fraudulentAmount ? `$ ${item.fraudulentAmount}` : '' }
  ]);
  fillSequential(groups, [item.accountName, item.accountNumber, fraudBegan, item.dateDiscovered, item.fraudulentAmount ? `$ ${item.fraudulentAmount}` : ''], labelled);
}
async function renderHighlightedFtc(template: File, context: MappedAppendixContext) {
  const { zip, xml, body } = await openTemplate(template, 'FTC Report'); const source = context.source; const reportDate = source.ftcReportDate || context.documentDate; const fraudBegan = ftcFraudMonthYearFromReportDate(reportDate); const phone = phoneForFtc(source.phone); const allGroups = uniqueGroups(highlightGroups(body));
  if (!source.ftcReportNumber.trim() || !reportDate.trim()) throw new Error('FTC report number and report date are required.');
  if (!source.ftcAccounts.length) throw new Error('At least one FTC affected item is required.');
  const affectedTables = tables(body).filter(isAffectedItemTable); const affectedGroups = new Set(affectedTables.flatMap((table) => highlightGroups(table).map((group) => group[0])));
  const documentGroups = allGroups.filter((group) => !affectedGroups.has(group[0]));
  const used = fillByLabel(documentGroups, body, [
    { pattern: /ftc\s*report\s*(number|no\.?|#)/i, value: source.ftcReportNumber }, { pattern: /first\s+name/i, value: source.firstName },
    { pattern: /middle\s+name/i, value: '' }, { pattern: /last\s+name/i, value: source.lastName }, { pattern: /mailing\s+address|street\s+address|address/i, value: source.address.join('\n') },
    { pattern: /country/i, value: source.country || 'USA' }, { pattern: /phone|telephone|mobile/i, value: phone }, { pattern: /e-?mail/i, value: '' },
    { pattern: /signature|signed\s+by/i, value: source.name }, { pattern: /printed\s+name|print\s+name/i, value: source.name }, { pattern: /^(?!.*(?:fraud|discovered))\s*date\s*:/i, value: reportDate }
  ]);
  const unlabelled = documentGroups.filter((group) => !used.has(group[0]));
  fillSequential(unlabelled, [source.ftcReportNumber, source.firstName, '', source.lastName, source.address.join('\n'), source.country || 'USA', phone, '', source.name, source.name, reportDate], used);
  if (!affectedTables.length) throw new Error('FTC template has no recognized yellow-highlighted affected-item table. Re-upload the marked standard FTC template with highlighted affected-item fields.');
  const itemCount = Math.min(source.ftcAccounts.length, MAX_FTC_ACCOUNTS); let anchor = affectedTables[affectedTables.length - 1];
  for (let index = 0; index < itemCount; index += 1) {
    const table = affectedTables[index] || affectedTables[0].cloneNode(true) as Element;
    if (!affectedTables[index]) { anchor.parentNode?.insertBefore(table, anchor.nextSibling); anchor = table; }
    mapAffectedItemTable(table, body, source.ftcAccounts[index], fraudBegan);
  }
  affectedTables.slice(itemCount).forEach((table) => table.parentNode?.removeChild(table));
  return finalize(zip, xml);
}
export async function renderMappedAppendix(template: File, context: MappedAppendixContext) { const text = await template.arrayBuffer().then((buffer) => new PizZip(buffer).file('word/document.xml')?.asText() || ''); if (text.includes('{{')) return renderDocxTemplate(template, mappedValues(context)); return context.kind === 'AFFIDAVIT' ? renderHighlightedAffidavit(template, context) : renderHighlightedFtc(template, context); }

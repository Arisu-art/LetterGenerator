import PizZip from 'pizzip';
import { DOCX_MIME, renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import { hardenGeneratedDocx } from './docx-safety';
import { bureaus, ftcFraudMonthYearFromReportDate, MAX_FTC_ACCOUNTS, type Bureau, type ParsedSource, type SourceItem } from './letter-engine';

export type MappedAppendixKind = 'AFFIDAVIT' | 'FTC';
export type MappedAppendixContext = { kind: MappedAppendixKind; bureau: Bureau; documentDate: string; recipientName: string; recipientAddressLines: string[]; source: ParsedSource };
export type AppendixRenderProgress = { phase: string; completed: number; total: number };
export type AppendixRenderOptions = { signal?: AbortSignal; onProgress?: (progress: AppendixRenderProgress) => void };
type RenderRow = { account_name: string; account_number: string; account_line: string; display_text: string };
type Opened = { zip: PizZip; xmlText: string; xml: XMLDocument; body: Element };
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const X = 'http://www.w3.org/XML/1998/namespace';
let activeController: AbortController | null = null;

function emitProgress(progress: AppendixRenderProgress) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<AppendixRenderProgress>('lettergenerator:appendix-progress', { detail: progress }));
}
export function cancelActiveAppendixRender() { activeController?.abort(); }
function abortError() { const error = new Error('Document generation was cancelled. Completed documents remain available in the review package.'); error.name = 'AbortError'; return error; }
function assertActive(options: AppendixRenderOptions) { if (options.signal?.aborted) throw abortError(); }
async function checkpoint(options: AppendixRenderOptions, phase: string, completed = 0, total = 1) {
  assertActive(options);
  const progress = { phase, completed, total };
  options.onProgress?.(progress);
  emitProgress(progress);
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
  assertActive(options);
}
function rows(items: SourceItem[]): RenderRow[] { return items.map((item) => { const lines = item.displayText.split('\n').map((v) => v.trim()).filter(Boolean); const name = (lines.find((v) => /^Account Name:/i.test(v)) || '').replace(/^Account Name:\s*/i, ''); const number = (lines.find((v) => /^Account Number:/i.test(v)) || '').replace(/^Account Number:\s*/i, ''); return { account_name: name, account_number: number, account_line: [name, number].filter(Boolean).join(' — '), display_text: item.displayText }; }); }
function phone(value: string) { const clean = value.trim(); if (!clean) return 'N/A'; const digits = clean.replace(/\D/g, ''); return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : clean; }
function title(value: string) { return value.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p: string, v: string) => `${p}${v.toUpperCase()}`); }
function similarCase(sample: string, value: string) { return sample === sample.toUpperCase() ? value.toUpperCase() : /^[A-Z][a-z]+(?:[\s'-][A-Z][a-z]+)+$/.test(sample.trim()) ? title(value) : value; }
function affidavitItems(source: ParsedSource) { const chosen: RenderRow[] = [], seen = new Set<string>(), grouped = new Map<string, Map<string, { item: RenderRow; count: number; pos: number }>>(); let pos = 0; bureaus.forEach((b) => rows(source.dispute[b]).forEach((item) => { const name = item.account_name.toUpperCase(), number = item.account_number.toUpperCase(); if (!grouped.has(name)) grouped.set(name, new Map()); const same = grouped.get(name)!; const found = same.get(number); if (found) found.count += 1; else same.set(number, { item, count: 1, pos: pos++ }); })); grouped.forEach((same) => { const values = Array.from(same.values()); const repeated = values.filter((value) => value.count > 1); (repeated.length ? repeated : values).sort((a, b) => a.pos - b.pos).forEach((value) => { chosen.push(value.item); seen.add(value.item.account_line.toUpperCase()); }); }); bureaus.forEach((b) => source.inquiry[b].forEach((item) => { const line = item.displayText.replace(/\s+[-–—]\s+/g, ' — '); if (!seen.has(line.toUpperCase())) { seen.add(line.toUpperCase()); chosen.push({ account_name: '', account_number: '', account_line: line, display_text: line }); } })); return chosen; }
function placeholders(ctx: MappedAppendixContext): PlaceholderValues { const s = ctx.source, date = s.ftcReportDate || ctx.documentDate, accounts = ctx.kind === 'AFFIDAVIT' ? affidavitItems(s) : rows(s.dispute[ctx.bureau]); const ftc = s.ftcAccounts.slice(0, MAX_FTC_ACCOUNTS).map((a) => ({ account_name: a.accountName, account_number: a.accountNumber, fraud_began: ftcFraudMonthYearFromReportDate(date), date_discovered: a.dateDiscovered, fraudulent_amount: a.fraudulentAmount, fraud_amount: a.fraudulentAmount })); return { consumer_name: s.name, client_name: s.name, name: s.name, consumer_first_name: s.firstName, consumer_middle_name: ctx.kind === 'FTC' ? '' : s.middleName, consumer_last_name: s.lastName, address: s.address.join('\n'), address_inline: s.address.join(' '), address_line_1: s.address[0] || '', address_line_2: s.address.slice(1).join(' '), country: s.country || 'USA', dob: s.dob, ssn: s.ssn, ssn_masked: s.ssn, phone: ctx.kind === 'FTC' ? phone(s.phone) : s.phone, email: ctx.kind === 'FTC' ? '' : s.email, date: ctx.documentDate, letter_date: ctx.documentDate, document_date: ctx.documentDate, affidavit_state: s.affidavitState, affidavit_county: s.affidavitCounty, ftc_report_number: s.ftcReportNumber, ftc_report_date: date, bureau_name: ctx.recipientName, bureau_address: ctx.recipientAddressLines.join('\n'), bureau_address_line_1: ctx.recipientAddressLines[0] || '', bureau_address_line_2: ctx.recipientAddressLines.slice(1).join(' '), accounts, dispute_accounts: accounts, ftc_accounts: ftc, hard_inquiries: s.inquiry[ctx.bureau].map((i) => ({ inquiry_line: i.displayText, display_text: i.displayText })), account_lines: (accounts as Array<{ account_line?: string; account_name?: string; account_number?: string }>).map((i) => i.account_line || [i.account_name, i.account_number].filter(Boolean).join(' — ')).join('\\n'), ...s.templateFields }; }
function nodes(root: Element, name: string) { return Array.from(root.getElementsByTagNameNS(W, name)); }
function paragraphs(root: Element) { return nodes(root, 'p'); }
function topParagraphs(root: Element) { return Array.from(root.children).filter((n) => n.namespaceURI === W && n.localName === 'p') as Element[]; }
function tables(root: Element) { return nodes(root, 'tbl'); }
function children(root: Element, name: string) { return Array.from(root.children).filter((n) => n.namespaceURI === W && n.localName === name) as Element[]; }
function texts(root: Element) { return nodes(root, 't'); }
function raw(root: Element) { return texts(root).map((n) => n.textContent || '').join(''); }
function text(root: Element) { return raw(root).trim(); }
function put(node: Element, value: string) { node.textContent = value; if (/^\s|\s$/.test(value)) node.setAttributeNS(X, 'xml:space', 'preserve'); else node.removeAttributeNS(X, 'space'); }
function replaceRange(root: Element, start: number, end: number, value: string) { let offset = 0; const spans = texts(root).map((node) => { const from = offset; offset += (node.textContent || '').length; return { node, from, to: offset }; }).filter((s) => s.to > start && s.from < end); if (!spans.length) return; const first = spans[0], last = spans[spans.length - 1]; const before = (first.node.textContent || '').slice(0, Math.max(0, start - first.from)), after = (last.node.textContent || '').slice(Math.max(0, end - last.from)); put(first.node, before + value + (first === last ? after : '')); spans.slice(1, -1).forEach((s) => put(s.node, '')); if (first !== last) put(last.node, after); }
function captured(root: Element, pattern: RegExp, index: number, value: string) { const valueText = raw(root), match = valueText.match(pattern); if (!match?.[index]) return; const start = (match.index || 0) + match[0].indexOf(match[index]); replaceRange(root, start, start + match[index].length, value); }
function allMatches(root: Element, pattern: RegExp, value: string) { Array.from(raw(root).matchAll(pattern)).reverse().forEach((match) => { if (match.index !== undefined) replaceRange(root, match.index, match.index + match[0].length, value); }); }
function styledRun(root: Element) { return nodes(root, 'r').find((run) => text(run)) || nodes(root, 'r')[0]; }
function lines(paragraph: Element, values: string[]) { const doc = paragraph.ownerDocument, source = styledRun(paragraph) || doc.createElementNS(W, 'w:r'); Array.from(paragraph.children).forEach((node) => { if (!(node.namespaceURI === W && node.localName === 'pPr')) paragraph.removeChild(node); }); values.forEach((value, index) => { const run = source.cloneNode(true) as Element; Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === W && node.localName === 'rPr')) run.removeChild(node); }); if (index) run.appendChild(doc.createElementNS(W, 'w:br')); const node = doc.createElementNS(W, 'w:t'); put(node, value); run.appendChild(node); paragraph.appendChild(run); }); }
function paragraphProperties(paragraph: Element) {
  const existing = children(paragraph, 'pPr')[0];
  if (existing) return existing;

  const pPr = paragraph.ownerDocument.createElementNS(W, 'w:pPr');
  paragraph.insertBefore(pPr, paragraph.firstChild);
  return pPr;
}

function addParagraphFlag(paragraph: Element, localName: string) {
  const pPr = paragraphProperties(paragraph);
  const existing = children(pPr, localName)[0];

  if (existing) return existing;

  const flag = paragraph.ownerDocument.createElementNS(W, `w:${localName}`);
  pPr.appendChild(flag);
  return flag;
}

function preventWordHyphenation(paragraph: Element) {
  const suppress = addParagraphFlag(paragraph, 'suppressAutoHyphens');
  suppress.setAttributeNS(W, 'w:val', '1');

  addParagraphFlag(paragraph, 'keepLines');
  addParagraphFlag(paragraph, 'wordWrap');
}

function normalizeSecurityNumberFormatting(paragraph: Element, ssn: string) {
  preventWordHyphenation(paragraph);

  // Preserve original template wording and paragraph flow.
  // Do not force a new line. Only protect the SSN value itself.
  const safeSsn = ssn.replace(/-/g, '\u2011');

  // Fix only accidental word-hyphenation artifacts such as "num- ber".
  allMatches(paragraph, /Security\s+num\s*[-‐-‒–—]\s*ber/gi, 'Security number');

  // Replace only the SSN value with a non-breaking-hyphen version.
  allMatches(paragraph, /(?:X{3}|\d{3})[-‐-‒–—](?:X{2}|\d{2})[-‐-‒–—](?:X{4}|\d{4})/gi, safeSsn);

  // Collapse only oversized spacing between the label and the SSN.
  const valueText = raw(paragraph);
  const ssnIndex = valueText.indexOf(safeSsn);
  if (ssnIndex < 0) return;

  const beforeSsn = valueText.slice(0, ssnIndex);
  const match = beforeSsn.match(/((?:Social\s+)?Security\s+number\s+is)\s*$/i);
  if (!match || match.index === undefined) return;

  const replacement = match[1].replace(/\s+/g, ' ') + ' ';
  replaceRange(paragraph, match.index, ssnIndex, replacement);
}

function cell(cellValue: Element | undefined, value: string, keepIndent = false) { if (!cellValue) throw new Error('Template table is missing an expected value cell.'); const p = paragraphs(cellValue)[0]; if (!p) throw new Error('Template cell does not contain an editable paragraph.'); const prefix = keepIndent ? (raw(cellValue).match(/^\s*/) || [''])[0] : ''; lines(p, [prefix + value]); paragraphs(cellValue).slice(1).forEach((extra) => extra.parentNode?.removeChild(extra)); }
async function open(file: File, label: string, options: AppendixRenderOptions): Promise<Opened> { await checkpoint(options, `Opening ${label} template`, 0, 3); const zip = new PizZip(await file.arrayBuffer()); await checkpoint(options, `Reading ${label} document XML`, 1, 3); const xmlFile = zip.file('word/document.xml'); if (!xmlFile) throw new Error(`${label} DOCX document XML is unavailable.`); const xmlText = xmlFile.asText(), xml = new DOMParser().parseFromString(xmlText, 'application/xml'), body = xml.getElementsByTagNameNS(W, 'body')[0]; if (!body) throw new Error(`${label} DOCX body is unavailable.`); await checkpoint(options, `Template loaded: ${label}`, 2, 3); return { zip, xmlText, xml, body }; }
async function save(opened: Opened, options: AppendixRenderOptions) { await checkpoint(options, 'Serializing DOCX output', 0, 2); opened.zip.file('word/document.xml', new XMLSerializer().serializeToString(opened.xml)); await checkpoint(options, 'Compressing DOCX output', 1, 2); assertActive(options); return hardenGeneratedDocx(opened.zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'STORE' })); }
async function affidavit(ctx: MappedAppendixContext, opened: Opened, options: AppendixRenderOptions) { const s = ctx.source, all = topParagraphs(opened.body), street = s.address[0] || 'N/A'; await checkpoint(options, 'Mapping affidavit identity fields', 0, 3); const state = all.find((p) => /^State\s+of\s*:/i.test(text(p))), county = all.find((p) => /^County\s+of\s*:/i.test(text(p))), opening = all.find((p) => /^I,\s/i.test(text(p))), personal = all.find((p) => /Personal\s+Information/i.test(text(p))); if (!state || !county || !opening || !personal) throw new Error('Uploaded Affidavit template is missing required standard value positions.'); captured(state, /^(State\s+of\s*:\s*)(.*)$/i, 2, (s.affidavitState || 'N/A').toUpperCase()); captured(county, /^(County\s+of\s*:\s*)(.*)$/i, 2, (s.affidavitCounty || 'N/A').toUpperCase()); captured(opening, /^(I,\s*)(.*?)(\s+residing\s+at\s+)/i, 2, s.name.toUpperCase()); captured(opening, /(\s+residing\s+at\s+)(.*?)(\s+being\s+duly\s+)/i, 2, street.toUpperCase()); captured(personal, /(current\s+address\s+is\s+)(.*?)(\.\s+My\s+(?:Social\s+)?Security)/i, 2, street.toUpperCase());
  normalizeSecurityNumberFormatting(personal, s.ssn); const start = all.findIndex((p) => /^Account\s+Information\s*:/i.test(text(p))), end = all.findIndex((p) => /^I\s+declare\s+that\s+this\s+account/i.test(text(p))), current = all.slice(start + 1, end).filter((p) => text(p)), sample = current[0]; if (start < 0 || end <= start || !sample?.parentNode) throw new Error('Uploaded Affidavit template is missing the account-list region.'); const items = affidavitItems(s); for (let index = 0; index < items.length; index += 1) { const copy = sample.cloneNode(true) as Element; lines(copy, [items[index].account_line]); sample.parentNode!.insertBefore(copy, sample); if (index % 4 === 0 || index === items.length - 1) await checkpoint(options, 'Writing affidavit account list', index + 1, items.length); } current.forEach((p) => p.parentNode?.removeChild(p)); await checkpoint(options, 'Completing affidavit signature', 2, 3); const sincere = all.findIndex((p) => /^Sincerely,?$/i.test(text(p))), signature = sincere >= 0 ? all.slice(sincere + 1).find((p) => text(p)) : undefined, date = all.find((p) => /^Date\s*:/i.test(text(p))); if (!signature || !date) throw new Error('Uploaded Affidavit template is missing signature or date positions.'); lines(signature, [similarCase(text(signature), s.name)]); captured(date, /^(Date\s*:\s*)(.*)$/i, 2, ctx.documentDate); return save(opened, options); }
async function ftc(ctx: MappedAppendixContext, opened: Opened, options: AppendixRenderOptions) { const s = ctx.source, reportDate = s.ftcReportDate || ctx.documentDate, began = ftcFraudMonthYearFromReportDate(reportDate), all = topParagraphs(opened.body), ftcReportNumber = s.ftcReportNumber.trim() || 'PENDING'; if (!s.ftcAccounts.length) throw new Error('FTC affected accounts are required before generating the FTC report. The system should auto-select up to 5 accounts from source fraud amount/date data.'); await checkpoint(options, 'Locating FTC report fields', 0, 4); const report = all.filter((p) => /FTC\s+Report\s+Number\s*:/i.test(raw(p))); if (!report.length) throw new Error('Uploaded FTC template is missing the report-number position.'); report.forEach((p) => allMatches(p, /\b\d{6,12}\b/g, ftcReportNumber)); const allTables = tables(opened.body), contact = allTables.find((table) => { const r = children(table, 'tr'); return r.length >= 4 && children(r[1], 'tc').length === 3 && children(r[3], 'tc').length === 3; }); if (!contact) throw new Error('Uploaded FTC template is missing its contact table.'); const contactRows = children(contact, 'tr'), names = children(contactRows[1], 'tc'), values = children(contactRows[3], 'tc'); cell(names[0], s.firstName.toUpperCase()); cell(names[1], ''); cell(names[2], s.lastName.toUpperCase()); const address = paragraphs(values[0])[0]; if (!address) throw new Error('FTC address cell is not editable.'); lines(address, [...s.address, s.country || 'USA']); cell(values[1], phone(s.phone)); cell(values[2], ''); await checkpoint(options, 'Writing FTC consumer information', 1, 4); const itemTables = allTables.filter((table) => { if (table === contact) return false; const rs = children(table, 'tr'); return rs.length >= 4 && children(rs[rs.length - 1], 'tc').length === 3; }); if (!itemTables.length) throw new Error('Uploaded FTC template is missing affected-item tables.'); const selected = s.ftcAccounts.slice(0, MAX_FTC_ACCOUNTS); for (let index = 0; index < selected.length; index += 1) { const item = selected[index], table = itemTables[index]; if (!table) break; const rs = children(table, 'tr'), bottom = children(rs[rs.length - 1], 'tc'); cell(children(rs[1], 'tc')[0], item.accountName, true); if (rs.length >= 5) cell(children(rs[2], 'tc')[0], item.accountNumber, true); cell(bottom[0], began); cell(bottom[1], item.dateDiscovered); cell(bottom[2], item.fraudulentAmount ? `$ ${item.fraudulentAmount}` : ''); await checkpoint(options, `Writing FTC affected item ${index + 1} of ${selected.length}`, index + 1, selected.length); } itemTables.slice(Math.min(s.ftcAccounts.length, MAX_FTC_ACCOUNTS)).forEach((table) => table.parentNode?.removeChild(table)); await checkpoint(options, 'Completing FTC signature fields', 3, 4); const date = all.find((p) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text(p))); if (!date) throw new Error('Uploaded FTC template is missing signed date position.'); lines(date, [reportDate.replace(/^0/, '').replace(/\/(0)(\d)\//, '/$2/')]); all.slice(0, all.indexOf(date)).filter((p) => /^([A-Z]+[\s'-]*){2,}$/.test(text(p))).slice(-2).forEach((p) => lines(p, [s.name.toUpperCase()])); return save(opened, options); }
export async function renderMappedAppendix(template: File, context: MappedAppendixContext, options: AppendixRenderOptions = {}) {
  const controller = new AbortController();
  activeController = controller;
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const effective = { ...options, signal: controller.signal };
  const label = context.kind === 'AFFIDAVIT' ? 'Affidavit' : 'FTC Report';
  try {
    const opened = await open(template, label, effective);
    if (opened.xmlText.includes('{{')) {
      await checkpoint(effective, `Mapping ${label} placeholders`, 0, 2);
      const output = await renderDocxTemplate(template, placeholders(context));
      await checkpoint(effective, `${label} document complete`, 2, 2);
      return output;
    }
    return context.kind === 'AFFIDAVIT' ? affidavit(context, opened, effective) : ftc(context, opened, effective);
  } finally {
    if (activeController === controller) activeController = null;
  }
}

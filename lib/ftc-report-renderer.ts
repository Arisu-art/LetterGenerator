import JSZip from 'jszip';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ORANGE = 'F8CBAD';
const GRAY = 'D9D9D9';
const PAGE_WIDTH = '12240';
const PAGE_HEIGHT = '15840';

const FTC_STATEMENT = [
  'I AM A VICTIM OF IDENTITY THEFT AND REQUEST THE IMMEDIATE ENFORCEMENT OF MY RIGHTS UNDER FCRA SECTION 605B (15 U.S.C. § 1681c-2).',
  'ANY FRAUDULENT ACCOUNTS, INQUIRIES, OR INFORMATION RESULTING FROM THIS THEFT MUST BE BLOCKED AND REMOVED FROM MY CREDIT FILE.',
  'UPON RECEIPT OF THIS NOTICE, YOU ARE LEGALLY REQUIRED TO BLOCK SUCH INFORMATION WITHIN FOUR (4) BUSINESS DAYS; THIS IS A STATUTORY OBLIGATION, NOT A REQUEST.',
  'ANY FAILURE TO COMPLY CONSTITUTES A VIOLATION OF FEDERAL LAW AND MAY RESULT IN LEGAL ACTION.',
  'I EXPECT FULL COMPLIANCE AND WRITTEN CONFIRMATION THAT ALL FRAUDULENT INFORMATION HAS BEEN REMOVED.'
].join(' ');

function xml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraph(
  text = '',
  options: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; fill?: string; after?: number } = {}
) {
  const size = options.size ?? 22;
  const bold = options.bold ? '<w:b/>' : '';
  const align = options.align && options.align !== 'left' ? `<w:jc w:val="${options.align}"/>` : '';
  const fill = options.fill ? `<w:shd w:fill="${options.fill}"/>` : '';
  const after = options.after ?? 120;

  return [
    '<w:p>',
    `<w:pPr>${align}${fill}<w:spacing w:after="${after}"/></w:pPr>`,
    `<w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`,
    '</w:p>'
  ].join('');
}

function sectionTitle(text: string) {
  return paragraph(text, { bold: true, fill: ORANGE, after: 100 });
}

function cell(text: string, width = 2500, shaded = false) {
  const border = [
    '<w:top w:val="single" w:sz="6"/>',
    '<w:left w:val="single" w:sz="6"/>',
    '<w:bottom w:val="single" w:sz="6"/>',
    '<w:right w:val="single" w:sz="6"/>'
  ].join('');

  const body = String(text || '')
    .split('\n')
    .map((line) => paragraph(line, { after: 40 }))
    .join('');

  return [
    '<w:tc>',
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcBorders>${border}</w:tcBorders>${shaded ? `<w:shd w:fill="${GRAY}"/>` : ''}</w:tcPr>`,
    body,
    '</w:tc>'
  ].join('');
}

function table(rows: string[][], widths?: number[], shadedRows = new Set<number>()) {
  return [
    '<w:tbl>',
    '<w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/><w:insideH w:val="single" w:sz="6"/><w:insideV w:val="single" w:sz="6"/></w:tblBorders></w:tblPr>',
    rows
      .map((row, rowIndex) => {
        return `<w:tr>${row.map((value, index) => cell(value, widths?.[index] || Math.floor(10000 / row.length), shadedRows.has(rowIndex))).join('')}</w:tr>`;
      })
      .join(''),
    '</w:tbl>'
  ].join('');
}

function monthYear(value: string) {
  const match = String(value || '').match(/(\d{1,2})\/(?:\d{1,2}\/)?(\d{2,4})/);
  if (!match) return value || '';
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${Number(match[1])}/${year}`;
}

function sourceMonthYear(source: ParsedSource) {
  const raw = (source as any).ftcReportDate || (source as any).date || new Date().toLocaleDateString('en-US');
  return monthYear(raw);
}

function deriveDisputeAccount(displayText: string, fallbackFraudDate: string): FtcAffectedAccount | null {
  const lines = String(displayText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '').trim();
  const accountNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '').trim();
  const tail = lines.join(' ').match(/(?:^|\s)(\d{2,7}(?:\.\d{1,2})?)?\s*((?:0?[1-9]|1[0-2])\/(?:19|20)?\d{2})(?:\s|$)/);

  if (!accountName) return null;

  return {
    accountName,
    accountNumber,
    fraudBegan: fallbackFraudDate,
    dateDiscovered: tail?.[2] ? monthYear(tail[2]) : '',
    fraudulentAmount: tail?.[1] || ''
  };
}

function deriveInquiryAccount(displayText: string, fallbackFraudDate: string): FtcAffectedAccount | null {
  const normalized = String(displayText || '').replace(/\s*[–—]\s*/g, ' - ').trim();
  const match = normalized.match(/^(.+?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
  if (!match) return null;

  return {
    accountName: match[1].trim(),
    accountNumber: '',
    fraudBegan: fallbackFraudDate,
    dateDiscovered: monthYear(match[2]),
    fraudulentAmount: ''
  };
}

export function buildFtcAffectedAccounts(source: ParsedSource): FtcAffectedAccount[] {
  const fallbackFraudDate = sourceMonthYear(source);
  const explicit = Array.isArray((source as any).ftcAccounts) ? ((source as any).ftcAccounts as FtcAffectedAccount[]) : [];

  const disputeItems = Object.values((source as any).dispute || {})
    .flat()
    .map((item: any) => deriveDisputeAccount(item?.displayText || '', fallbackFraudDate))
    .filter(Boolean) as FtcAffectedAccount[];

  const inquiryItems = Object.values((source as any).inquiry || {})
    .flat()
    .map((item: any) => deriveInquiryAccount(item?.displayText || '', fallbackFraudDate))
    .filter(Boolean) as FtcAffectedAccount[];

  const seen = new Set<string>();

  return [...explicit, ...disputeItems, ...inquiryItems]
    .map((item) => ({
      accountName: item.accountName || '',
      accountNumber: item.accountNumber || '',
      fraudBegan: item.fraudBegan || fallbackFraudDate,
      dateDiscovered: item.dateDiscovered || '',
      fraudulentAmount: item.fraudulentAmount || ''
    }))
    .filter((item) => {
      const key = `${item.accountName.toUpperCase()}|${item.accountNumber.toUpperCase()}|${item.dateDiscovered}`;
      if (!item.accountName || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function accountBlock(account: FtcAffectedAccount) {
  return [
    paragraph('Credit Card opened by the thief', { bold: true, after: 60 }),
    table(
      [
        ['Company or Organization', account.accountName],
        ['Account Number:', account.accountNumber],
        ['Date fraud began:', 'Date that I discovered it:', 'Total fraudulent amount:'],
        [account.fraudBegan, account.dateDiscovered, account.fraudulentAmount ? `$ ${account.fraudulentAmount}` : '']
      ],
      [3000, 3500, 3500],
      new Set([2])
    ),
    paragraph('', { after: 140 })
  ].join('');
}

function docxContentTypes() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    '</Types>'
  ].join('');
}

function rootRelationships() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
    '</Relationships>'
  ].join('');
}

export async function renderFtcIdentityTheftReportDocx(source: ParsedSource, documentDate: string) {
  const accounts = buildFtcAffectedAccounts(source);
  const sourceAny = source as any;
  const name = sourceAny.name || '';
  const nameParts = String(name).split(/\s+/).filter(Boolean);
  const firstName = sourceAny.firstName || nameParts[0] || '';
  const lastName = sourceAny.lastName || nameParts.slice(1).join(' ');
  const address = Array.isArray(sourceAny.address) ? [...sourceAny.address, sourceAny.country || 'USA'].filter(Boolean).join('\n') : '';
  const phone = String(sourceAny.phone || '').replace(/[()]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-');
  const reportNumber = sourceAny.ftcReportNumber || '';

  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:body>',
    paragraph('Federal Trade Commission', { bold: true, size: 18, after: 20 }),
    paragraph('Identity Theft Report', { bold: true, size: 40, after: 60 }),
    reportNumber ? paragraph(`FTC Report Number: ${reportNumber}`, { align: 'right', bold: true, after: 60 }) : '',
    paragraph('I am a victim of Identity theft. This is my official statement about the crime.'),
    sectionTitle('Contact Information'),
    table(
      [
        ['First Name:', 'Middle Name:', 'Last Name:'],
        [firstName, sourceAny.middleName || '', lastName],
        ['Address:', 'Phone:', 'Email:'],
        [address, phone, sourceAny.email || '']
      ],
      [3333, 3333, 3334],
      new Set([0, 2])
    ),
    sectionTitle('Personal Statement'),
    paragraph(FTC_STATEMENT, { after: 180 }),
    sectionTitle('Accounts Affected by the Crime'),
    accounts.length ? accounts.map(accountBlock).join('') : paragraph('No affected accounts were detected from the source data.', { after: 180 }),
    paragraph('Under penalty of perjury, I declare this information is true and correct to the best of my knowledge.'),
    paragraph('I understand that knowingly making any false statements to the government may violate federal, state, or local criminal statutes, and may result in a fine, imprisonment, or both.'),
    table([[name, documentDate], [name, 'Date']], [5000, 5000]),
    paragraph('Use this form to prove to businesses and credit bureaus that you have submitted an FTC Identity Theft Report to law enforcement. Some businesses might request that you also file a report with your local police.', { after: 80 }),
    `<w:sectPr><w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`,
    '</w:body>',
    '</w:document>'
  ].join('');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', docxContentTypes());
  zip.folder('_rels')?.file('.rels', rootRelationships());
  zip.folder('word')?.file('document.xml', documentXml);
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  zip.folder('docProps')?.file('core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>FTC Identity Theft Report</dc:title><dc:creator>LetterGenerator</dc:creator></cp:coreProperties>');
  zip.folder('docProps')?.file('app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LetterGenerator</Application></Properties>');

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

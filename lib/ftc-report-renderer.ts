'use client';

import JSZip from 'jszip';
import type { FtcAffectedAccount, ParsedSource } from './letter-engine';
import { ftcFraudMonthYearFromReportDate, MAX_FTC_ACCOUNTS } from './letter-engine';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FTC_STATEMENT =
  'I AM A VICTIM OF IDENTITY THEFT AND REQUEST THE IMMEDIATE ENFORCEMENT OF MY RIGHTS UNDER FCRA SECTION 605B (15 U.S.C. § 1681c-2). ANY FRAUDULENT ACCOUNTS, INQUIRIES, OR INFORMATION RESULTING FROM THIS THEFT MUST BE BLOCKED AND REMOVED FROM MY CREDIT FILE. UPON RECEIPT OF THIS NOTICE, YOU ARE LEGALLY REQUIRED TO BLOCK SUCH INFORMATION WITHIN FOUR (4) BUSINESS DAYS; THIS IS A STATUTORY OBLIGATION, NOT A REQUEST. ANY FAILURE TO COMPLY CONSTITUTES A VIOLATION OF FEDERAL LAW AND MAY RESULT IN LEGAL ACTION. I EXPECT FULL COMPLIANCE AND WRITTEN CONFIRMATION THAT ALL FRAUDULENT INFORMATION HAS BEEN REMOVED.';

function xml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function para(text = '', options: { bold?: boolean; size?: number; align?: 'center' | 'right'; spacing?: number } = {}) {
  const size = options.size || 22;
  const bold = options.bold ? '<w:b/>' : '';
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : '';
  const spacing = `<w:spacing w:after="${options.spacing ?? 120}"/>`;

  return `<w:p><w:pPr>${align}${spacing}</w:pPr><w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

function sectionTitle(text: string) {
  return `<w:p><w:pPr><w:shd w:fill="F8CBAD"/><w:spacing w:before="180" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${xml(text)}</w:t></w:r></w:p>`;
}

function cell(content: string, width = 3000, shaded = false) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/></w:tcBorders>${shaded ? '<w:shd w:fill="D9D9D9"/>' : ''}</w:tcPr>${content.split('\n').map((line) => para(line, { spacing: 40 })).join('')}</w:tc>`;
}

function table(rows: string[][], widths?: number[], headerRows = new Set<number>()) {
  return `<w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/><w:insideH w:val="single" w:sz="6"/><w:insideV w:val="single" w:sz="6"/></w:tblBorders></w:tblPr>${rows
    .map((row, rowIndex) => `<w:tr>${row.map((value, colIndex) => cell(value, widths?.[colIndex] || Math.floor(10000 / row.length), headerRows.has(rowIndex))).join('')}</w:tr>`)
    .join('')}</w:tbl>`;
}

function monthYearFromDate(value: string) {
  const match = value.match(/^(\d{1,2})\/\d{1,2}\/(\d{2,4})$/);
  if (!match) return value;
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${Number(match[1])}/${year}`;
}

function accountFromDisplay(displayText: string, fallbackDate: string): FtcAffectedAccount | null {
  const lines = displayText.split('\n').map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '').trim();
  const accountNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '').trim();
  const compact = lines.join(' ').match(/\$?\s*([\d,]+(?:\.\d{1,2})?)?\s*((?:0?[1-9]|1[0-2])\/(?:19|20)\d{2})/);

  if (!accountName) return null;

  return {
    accountName,
    accountNumber,
    fraudBegan: fallbackDate,
    dateDiscovered: compact?.[2] || '',
    fraudulentAmount: compact?.[1]?.replaceAll(',', '') || ''
  };
}

function inquiryFromDisplay(displayText: string, fallbackDate: string): FtcAffectedAccount | null {
  const value = displayText.replace(/\s*[-–—]\s*/g, ' - ').trim();
  const match = value.match(/^(.+?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
  if (!match) return null;

  return {
    accountName: match[1].trim(),
    accountNumber: '',
    fraudBegan: fallbackDate,
    dateDiscovered: monthYearFromDate(match[2]),
    fraudulentAmount: ''
  };
}

function uniqueAccounts(accounts: FtcAffectedAccount[]) {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    const key = `${account.accountName.toUpperCase()}|${account.accountNumber.toUpperCase()}|${account.dateDiscovered}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(account.accountName.trim());
  });
}

export function buildFtcAffectedAccounts(source: ParsedSource): FtcAffectedAccount[] {
  const fraudBegan = ftcFraudMonthYearFromReportDate(source.ftcReportDate);
  const explicit = source.ftcAccounts.map((account) => ({
    ...account,
    fraudBegan: account.fraudBegan || fraudBegan
  }));

  const disputeDerived = Object.values(source.dispute)
    .flat()
    .map((item) => accountFromDisplay(
      [
        item.displayText,
        item.ftcDerived?.fraudulentAmount && item.ftcDerived?.dateDiscovered ? `${item.ftcDerived.fraudulentAmount} ${item.ftcDerived.dateDiscovered}` : ''
      ].filter(Boolean).join('\n'),
      fraudBegan
    ))
    .filter(Boolean) as FtcAffectedAccount[];

  const inquiryDerived = Object.values(source.inquiry)
    .flat()
    .map((item) => inquiryFromDisplay(item.displayText, fraudBegan))
    .filter(Boolean) as FtcAffectedAccount[];

  return uniqueAccounts([...explicit, ...disputeDerived, ...inquiryDerived]).slice(0, MAX_FTC_ACCOUNTS);
}

function accountTable(account: FtcAffectedAccount) {
  return [
    para('Credit Card opened by the thief', { bold: true, spacing: 80 }),
    table([
      ['Company or Organization', account.accountName],
      ['Account Number:', account.accountNumber || ''],
      ['Date fraud began:', 'Date that I discovered it:', 'Total fraudulent amount:'],
      [account.fraudBegan || '', account.dateDiscovered || '', account.fraudulentAmount ? `$ ${account.fraudulentAmount}` : '']
    ], [3000, 3500, 3500], new Set([2])),
    para('', { spacing: 160 })
  ].join('');
}

export async function renderFtcIdentityTheftReportDocx(source: ParsedSource, documentDate: string) {
  const accounts = buildFtcAffectedAccounts(source);
  const reportNumber = source.ftcReportNumber || '';
  const address = [...source.address, source.country || 'USA'].filter(Boolean).join('\n');
  const phone = source.phone.replace(/[()]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-') || '';
  const accountXml = accounts.length ? accounts.map(accountTable).join('') : para('No affected accounts were selected from the source data.', { spacing: 160 });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${para('Federal Trade Commission', { bold: true, size: 18, spacing: 20 })}
    ${para('Identity Theft Report', { bold: true, size: 40, spacing: 80 })}
    ${reportNumber ? para(`FTC Report Number: ${reportNumber}`, { align: 'right', bold: true, spacing: 60 }) : ''}
    ${para('I am a victim of Identity theft. This is my official statement about the crime.', { spacing: 120 })}

    ${sectionTitle('Contact Information')}
    ${table([
      ['First Name:', 'Middle Name:', 'Last Name:'],
      [source.firstName || source.name.split(' ')[0] || '', source.middleName || '', source.lastName || source.name.split(' ').slice(1).join(' ') || ''],
      ['Address:', 'Phone:', 'Email:'],
      [address, phone, source.email || '']
    ], [3333, 3333, 3334], new Set([0, 2]))}

    ${sectionTitle('Personal Statement')}
    ${para(FTC_STATEMENT, { spacing: 180 })}

    ${sectionTitle('Accounts Affected by the Crime')}
    ${accountXml}

    ${para('Under penalty of perjury, I declare this information is true and correct to the best of my knowledge.', { spacing: 100 })}
    ${para('I understand that knowingly making any false statements to the government may violate federal, state, or local criminal statutes, and may result in a fine, imprisonment, or both.', { spacing: 160 })}

    ${table([
      [source.name || '', documentDate],
      [source.name || '', 'Date']
    ], [5000, 5000])}

    ${para('Use this form to prove to businesses and credit bureaus that you have submitted an FTC Identity Theft Report to law enforcement. Some businesses might request that you also file a report with your local police.', { spacing: 80 })}

    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  zip.folder('word')?.file('document.xml', documentXml);
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>FTC Identity Theft Report</dc:title><dc:creator>LetterGenerator</dc:creator></cp:coreProperties>`);
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LetterGenerator</Application></Properties>`);

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

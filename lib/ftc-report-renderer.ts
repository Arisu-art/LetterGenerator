import JSZip from 'jszip';
import { DOCX_MIME, renderDocxTemplate, type PlaceholderValues } from './docx-renderer';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

type FtcModel = {
  reportNumber: string;
  reportDate: string;
  fullName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  addressLines: string[];
  phone: string;
  email: string;
  statement: string;
  accounts: FtcAffectedAccount[];
};

const MAX_FTC_ACCOUNTS = 5;
const DEFAULT_REPORT_NUMBER = 'PENDING';
const FTC_STATEMENT =
  'I am a victim of identity theft and request enforcement of my rights under FCRA Section 605B, 15 U.S.C. § 1681c-2. I request that all fraudulent accounts, inquiries, and information resulting from identity theft be blocked and removed from my credit file.';

function xml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizePhone(value: string) {
  const clean = String(value || '').trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return clean;
}

function splitName(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

function monthYear(value: string) {
  const clean = String(value || '').trim();
  const match = clean.match(/(\d{1,2})\/(?:\d{1,2}\/)?(\d{2,4})/);
  if (!match) return clean;
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${Number(match[1])}/${year}`;
}

function reportMonthYear(source: ParsedSource) {
  const sourceAny = source as any;
  return monthYear(sourceAny.ftcReportDate || sourceAny.date || new Date().toLocaleDateString('en-US'));
}

function amountDisplay(value: string) {
  return String(value || '').replace(/^\$/, '').replace(/,/g, '').trim();
}

function deriveDisputeAccount(displayText: string, fallbackFraudDate: string): FtcAffectedAccount | null {
  const lines = String(displayText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const accountName = (lines.find((line) => /^Account Name:/i.test(line)) || '').replace(/^Account Name:\s*/i, '').trim();
  const accountNumber = (lines.find((line) => /^Account Number:/i.test(line)) || '').replace(/^Account Number:\s*/i, '').trim();
  const compact = lines.join(' ').match(/(?:^|\s)(\d{1,8}(?:\.\d{1,2})?)?\s*((?:0?[1-9]|1[0-2])\/(?:19|20)?\d{2})(?:\s|$)/);

  if (!accountName) return null;

  return {
    accountName,
    accountNumber,
    fraudBegan: fallbackFraudDate,
    dateDiscovered: compact?.[2] ? monthYear(compact[2]) : fallbackFraudDate,
    fraudulentAmount: amountDisplay(compact?.[1] || '')
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
  const sourceAny = source as any;
  const fallbackFraudDate = reportMonthYear(source);
  const explicit = Array.isArray(sourceAny.ftcAccounts) ? sourceAny.ftcAccounts as FtcAffectedAccount[] : [];

  const disputeItems = Object.values(sourceAny.dispute || {})
    .flat()
    .map((item: any) => {
      const base = deriveDisputeAccount(item?.displayText || '', fallbackFraudDate);
      if (!base) return null;

      return {
        ...base,
        dateDiscovered: item?.ftcDerived?.dateDiscovered || base.dateDiscovered,
        fraudulentAmount: amountDisplay(item?.ftcDerived?.fraudulentAmount || base.fraudulentAmount)
      };
    })
    .filter(Boolean) as FtcAffectedAccount[];

  const inquiryItems = Object.values(sourceAny.inquiry || {})
    .flat()
    .map((item: any) => deriveInquiryAccount(item?.displayText || '', fallbackFraudDate))
    .filter(Boolean) as FtcAffectedAccount[];

  const seen = new Set<string>();

  return [...explicit, ...disputeItems, ...inquiryItems]
    .map((item) => ({
      accountName: item.accountName || '',
      accountNumber: item.accountNumber || '',
      fraudBegan: item.fraudBegan || fallbackFraudDate,
      dateDiscovered: item.dateDiscovered || fallbackFraudDate,
      fraudulentAmount: amountDisplay(item.fraudulentAmount)
    }))
    .filter((item) => {
      const key = `${item.accountName.toUpperCase()}|${item.accountNumber.toUpperCase()}|${item.dateDiscovered}`;
      if (!item.accountName || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.fraudulentAmount || 0) - Number(a.fraudulentAmount || 0))
    .slice(0, MAX_FTC_ACCOUNTS);
}

function modelFromSource(source: ParsedSource, documentDate: string): FtcModel {
  const sourceAny = source as any;
  const fullName = sourceAny.name || '';
  const parts = splitName(fullName);
  const addressLines = Array.isArray(sourceAny.address) ? sourceAny.address.filter(Boolean) : [];

  return {
    reportNumber: sourceAny.ftcReportNumber || DEFAULT_REPORT_NUMBER,
    reportDate: sourceAny.ftcReportDate || documentDate,
    fullName,
    firstName: sourceAny.firstName || parts.firstName,
    middleName: sourceAny.middleName || parts.middleName,
    lastName: sourceAny.lastName || parts.lastName,
    addressLines,
    phone: normalizePhone(sourceAny.phone || ''),
    email: sourceAny.email || '',
    statement: sourceAny.ftcStatement || FTC_STATEMENT,
    accounts: buildFtcAffectedAccounts(source)
  };
}

function templateValues(source: ParsedSource, documentDate: string): PlaceholderValues {
  const model = modelFromSource(source, documentDate);
  const accounts = model.accounts.map((account) => ({
    account_name: account.accountName,
    account_number: account.accountNumber,
    fraud_began: account.fraudBegan,
    date_discovered: account.dateDiscovered,
    fraudulent_amount: account.fraudulentAmount,
    fraud_amount: account.fraudulentAmount,
    account_line: [account.accountName, account.accountNumber].filter(Boolean).join(' — ')
  }));

  const values: PlaceholderValues = {
    consumer_name: model.fullName,
    client_name: model.fullName,
    name: model.fullName,
    consumer_first_name: model.firstName,
    consumer_middle_name: model.middleName,
    consumer_last_name: model.lastName,
    address: model.addressLines.join('\n'),
    address_inline: model.addressLines.join(' '),
    address_line_1: model.addressLines[0] || '',
    address_line_2: model.addressLines.slice(1).join(' '),
    country: 'USA',
    phone: model.phone,
    email: model.email,
    date: documentDate,
    document_date: documentDate,
    ftc_report_date: model.reportDate,
    ftc_report_number: model.reportNumber,
    ftc_statement: model.statement,
    statement: model.statement,
    ftc_accounts: accounts,
    accounts,
    account_lines: accounts.map((account) => account.account_line).join('\n')
  };

  model.accounts.forEach((account, index) => {
    const n = index + 1;
    values[`account_${n}_name`] = account.accountName;
    values[`account_${n}_number`] = account.accountNumber;
    values[`account_${n}_fraud_began`] = account.fraudBegan;
    values[`account_${n}_date_discovered`] = account.dateDiscovered;
    values[`account_${n}_fraudulent_amount`] = account.fraudulentAmount;
  });

  return values;
}

function p(value: string) {
  return `<w:p><w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`;
}

function fallbackDocumentXml(source: ParsedSource, documentDate: string) {
  const model = modelFromSource(source, documentDate);
  const lines: string[] = [
    'FTC Identity Theft Report',
    `FTC Report Number: ${model.reportNumber}`,
    `Report Date: ${model.reportDate}`,
    '',
    'Consumer Information',
    `Name: ${model.fullName}`,
    `Address: ${model.addressLines.join(', ')}`,
    `Phone: ${model.phone}`,
    `Email: ${model.email}`,
    '',
    'Statement',
    model.statement,
    '',
    'Affected Accounts'
  ];

  if (!model.accounts.length) {
    lines.push('No affected accounts were selected.');
  } else {
    model.accounts.forEach((account, index) => {
      lines.push(
        '',
        `${index + 1}. ${account.accountName}`,
        `Account Number: ${account.accountNumber || 'N/A'}`,
        `Fraud Began: ${account.fraudBegan || 'N/A'}`,
        `Date Discovered: ${account.dateDiscovered || 'N/A'}`,
        `Fraudulent Amount: ${account.fraudulentAmount ? `$${account.fraudulentAmount}` : 'N/A'}`
      );
    });
  }

  lines.push('', 'Certification', `Printed Name: ${model.fullName}`, `Date: ${documentDate}`);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${lines.map(p).join('\n')}
<w:sectPr>
<w:pgSz w:w="12240" w:h="15840"/>
<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;
}

async function fallbackDocx(source: ParsedSource, documentDate: string) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  zip.folder('_rels')?.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
  zip.folder('word')?.file('document.xml', fallbackDocumentXml(source, documentDate));
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  zip.folder('docProps')?.file('core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>FTC Identity Theft Report</dc:title><dc:creator>LetterGenerator</dc:creator></cp:coreProperties>');
  zip.folder('docProps')?.file('app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LetterGenerator</Application></Properties>');

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

async function tryPlaceholderTemplate(templateFile: File, source: ParsedSource, documentDate: string) {
  const zip = await JSZip.loadAsync(await templateFile.arrayBuffer());
  const document = zip.file('word/document.xml');
  if (!document) return null;

  const documentXml = await document.async('string');
  if (!/\{\{\s*[#\/^]?[\w.-]+\s*\}\}/.test(documentXml)) return null;

  return renderDocxTemplate(templateFile, templateValues(source, documentDate));
}

export async function renderFtcIdentityTheftReportDocx(source: ParsedSource, documentDate: string, templateFile?: File) {
  if (templateFile) {
    try {
      const templated = await tryPlaceholderTemplate(templateFile, source, documentDate);
      if (templated) return templated;
    } catch (error) {
      console.warn('FTC placeholder template failed; using standard FTC fallback.', error);
    }
  }

  return fallbackDocx(source, documentDate);
}

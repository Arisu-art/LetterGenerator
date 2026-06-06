import PizZip from 'pizzip';
import { DOCX_MIME, type ReferenceDisputeValues } from './docx-renderer';
import type { LateReferenceValues } from './late-reference-renderer';

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function para(text = '', options: { bold?: boolean; color?: string } = {}) {
  const lines = text.split('\n');
  const rPr = options.bold || options.color ? `<w:rPr>${options.bold ? '<w:b/>' : ''}${options.color ? `<w:color w:val="${options.color.replace('#', '')}"/>` : ''}</w:rPr>` : '';
  const runs = lines.map((line, index) => `<w:r>${rPr}${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('');
  return `<w:p><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;
}
function heading(text: string) { return para(text, { bold: true }); }
function createDocx(paragraphs: string[]) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xml="http://www.w3.org/XML/1998/namespace"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word')?.file('document.xml', documentXml);
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
function identity(values: ReferenceDisputeValues | LateReferenceValues) {
  return [values.consumerName, ...values.addressLines, values.dob ? `DOB: ${values.dob}` : '', values.ssn ? `SSN: ${values.ssn}` : '', values.letterDate].filter(Boolean).join('\n');
}
function recipient(values: ReferenceDisputeValues | LateReferenceValues) {
  return [values.bureauName, ...values.bureauAddressLines].filter(Boolean).join('\n');
}
export function renderBuiltInDisputeDocx(values: ReferenceDisputeValues) {
  const accounts = values.disputeItems || values.fraudItems || [];
  const inquiries = values.hardInquiryItems || [];
  return createDocx([
    para(identity(values)),
    para(recipient(values), { bold: true }),
    heading('RE: FORMAL IDENTITY THEFT AFFIDAVIT, LEGAL NOTICE, AND DEMAND FOR IMMEDIATE BLOCKING AND DELETION PURSUANT TO FCRA §§ 605B, 611, AND 607(b)'),
    para('To Whom It May Concern,'),
    para('This correspondence constitutes a formal identity theft affidavit, sworn statement, and legal demand under the Fair Credit Reporting Act. I am a victim of identity theft. The accounts identified below were not opened, authorized, or incurred by me.'),
    heading('FRAUDULENT ACCOUNTS FOR IMMEDIATE BLOCKING AND DELETION'),
    ...(accounts.length ? accounts.flatMap((item) => [para(item, { bold: true }), para('Pursuant to 15 USC 1681a(3), this account does not constitute a legitimate consumer obligation. My personal information was used without authorization, and this tradeline is the direct result of identity theft.', { color: 'FF0000' })]) : [para('None')]),
    ...(inquiries.length ? [heading('INQUIRIES'), ...inquiries.map((item) => para(item, { bold: true }))] : []),
    heading('LEGAL DEMAND AND NOTICE OF DUTY'),
    para('Under FCRA § 605B, you are required to block the reporting of identity theft-related information within four (4) business days of receipt of this notice. This obligation is mandatory, not discretionary.'),
    para('Sincerely,'),
    para(values.consumerName)
  ]);
}
export function renderBuiltInLatePaymentDocx(values: LateReferenceValues) {
  return createDocx([
    para(identity(values)),
    para(recipient(values), { bold: true }),
    heading('RE: LATE PAYMENT REPORTING DISPUTE AND REQUEST FOR INVESTIGATION'),
    para('To Whom It May Concern,'),
    para('I am disputing the late payment information listed below and requesting a complete investigation, correction, or deletion of any inaccurate reporting.'),
    heading('DISPUTED LATE PAYMENT ITEMS'),
    ...(values.latePaymentItems.length ? values.latePaymentItems.map((item) => para(item, { bold: true })) : [para('None')]),
    para('Please investigate and provide the results of your reinvestigation as required by the Fair Credit Reporting Act.'),
    para('Sincerely,'),
    para(values.consumerName)
  ]);
}

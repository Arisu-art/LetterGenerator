import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

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
  fraudItems: string[];
};

export async function renderDocxTemplate(template: File, values: PlaceholderValues): Promise<Blob> {
  const content = await template.arrayBuffer();
  const zip = new PizZip(content);
  const document = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => ''
  });

  document.render(values);

  return document.getZip().generate({
    type: 'blob',
    mimeType: DOCX_MIME,
    compression: 'DEFLATE'
  });
}

function directParagraphs(body: Element): Element[] {
  return Array.from(body.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === 'p');
}

function paragraphText(paragraph: Element): string {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').trim();
}

function findParagraph(paragraphs: Element[], exactText: string): Element {
  const found = paragraphs.find((paragraph) => paragraphText(paragraph) === exactText);
  if (!found) throw new Error(`Reference DOCX is missing the required section: ${exactText}`);
  return found;
}

function firstFormattedRun(paragraph: Element): Element {
  const runs = Array.from(paragraph.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === 'r');
  return (runs.find((run) => paragraphText(run).length > 0) || runs[0] || paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r')).cloneNode(true) as Element;
}

function cleanedRun(templateRun: Element): Element {
  const run = templateRun.cloneNode(true) as Element;
  Array.from(run.children).forEach((child) => {
    if (!(child.namespaceURI === WORD_NS && child.localName === 'rPr')) run.removeChild(child);
  });
  return run;
}

function setParagraphLines(paragraph: Element, lines: string[]) {
  const doc = paragraph.ownerDocument;
  const templateRun = firstFormattedRun(paragraph);
  Array.from(paragraph.children).forEach((child) => {
    if (!(child.namespaceURI === WORD_NS && child.localName === 'pPr')) paragraph.removeChild(child);
  });
  lines.forEach((line, index) => {
    if (index > 0) {
      const breakRun = cleanedRun(templateRun);
      breakRun.appendChild(doc.createElementNS(WORD_NS, 'w:br'));
      paragraph.appendChild(breakRun);
    }
    const run = cleanedRun(templateRun);
    const text = doc.createElementNS(WORD_NS, 'w:t');
    if (/^\s|\s$/.test(line)) text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    text.textContent = line;
    run.appendChild(text);
    paragraph.appendChild(run);
  });
}

function firstNonEmptyAfter(paragraphs: Element[], startIndex: number): Element {
  const found = paragraphs.slice(startIndex + 1).find((paragraph) => paragraphText(paragraph).length > 0);
  if (!found) throw new Error('Reference DOCX is missing the expected signature name paragraph.');
  return found;
}

/**
 * Creates a dispute letter from a completed visual reference DOCX.
 * The renderer preserves the reference letter styling and replaces structural content:
 * client block, date, bureau block, fraud-item section and signature.
 */
export async function renderReferenceDisputeDocx(reference: File, values: ReferenceDisputeValues): Promise<Blob> {
  const zip = new PizZip(await reference.arrayBuffer());
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Uploaded DOCX does not contain word/document.xml.');

  const xml = new DOMParser().parseFromString(documentFile.asText(), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Uploaded DOCX document XML could not be read.');
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Uploaded DOCX is missing its document body.');

  let paragraphs = directParagraphs(body);
  const nonEmpty = paragraphs.filter((paragraph) => paragraphText(paragraph).length > 0);
  if (nonEmpty.length < 3) throw new Error('Dispute reference DOCX is missing its consumer, date or bureau layout blocks.');

  setParagraphLines(nonEmpty[0], [values.consumerName, ...values.addressLines, `DOB: ${values.dob}`, `SSN: ${values.ssn}`]);
  setParagraphLines(nonEmpty[1], [values.letterDate]);
  setParagraphLines(nonEmpty[2], [values.bureauName, ...values.bureauAddressLines]);

  paragraphs = directParagraphs(body);
  const fraudHeading = findParagraph(paragraphs, 'FRAUDULENT ACCOUNTS FOR IMMEDIATE BLOCKING AND DELETION');
  const legalHeading = findParagraph(paragraphs, 'LEGAL DEMAND AND NOTICE OF DUTY');
  const headingIndex = paragraphs.indexOf(fraudHeading);
  const legalIndex = paragraphs.indexOf(legalHeading);
  if (legalIndex <= headingIndex + 1) throw new Error('Dispute reference DOCX is missing a formatted fraud-item sample block.');

  const sampleRegion = paragraphs.slice(headingIndex + 1, legalIndex);
  const itemTemplate = sampleRegion.find((paragraph) => {
    const text = paragraphText(paragraph);
    return text.length > 0 && !text.startsWith('Pursuant to 15 USC');
  });
  const statementTemplate = sampleRegion.find((paragraph) => paragraphText(paragraph).startsWith('Pursuant to 15 USC'));
  const blankTemplate = sampleRegion.find((paragraph) => paragraphText(paragraph).length === 0);
  if (!itemTemplate || !statementTemplate) throw new Error('Reference DOCX must include one formatted item and the red identity-theft statement.');
  if (!values.fraudItems.length) throw new Error('No dispute or hard-inquiry items were supplied for this dispute output.');

  sampleRegion.forEach((paragraph) => body.removeChild(paragraph));
  let insertionPoint: ChildNode = legalHeading;
  const insertBeforeLegal = (node: Node) => body.insertBefore(node, insertionPoint);
  if (blankTemplate) insertBeforeLegal(blankTemplate.cloneNode(true));
  values.fraudItems.forEach((item) => {
    const itemParagraph = itemTemplate.cloneNode(true) as Element;
    setParagraphLines(itemParagraph, item.split('\n'));
    insertBeforeLegal(itemParagraph);
    insertBeforeLegal(statementTemplate.cloneNode(true));
    if (blankTemplate) insertBeforeLegal(blankTemplate.cloneNode(true));
  });

  paragraphs = directParagraphs(body);
  const sincerely = findParagraph(paragraphs, 'Sincerely,');
  const signature = firstNonEmptyAfter(paragraphs, paragraphs.indexOf(sincerely));
  setParagraphLines(signature, [values.consumerName]);

  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

export function isDocx(filename: string): boolean {
  return /\.docx$/i.test(filename);
}

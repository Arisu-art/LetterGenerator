import PizZip from 'pizzip';
import { hardenGeneratedDocx } from './docx-safety';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type FlowRule = 'keepNext' | 'keepLines' | 'widowControl';
const FLOW_ORDER: FlowRule[] = ['keepNext', 'keepLines', 'widowControl'];
const MAJOR_HEADING = /^(FRAUDULENT ACCOUNTS FOR IMMEDIATE BLOCKING AND DELETION|LEGAL DEMAND AND NOTICE OF DUTY|REQUIRED ACTIONS|SUPPORTING DOCUMENTS|ACCOUNT INFORMATION\s*:|AFFECTED ACCOUNTS?|AFFECTED ITEMS?|Subject:\s*Dispute of Inaccurate Late Payment.*)$/i;
const DISPUTE_STATEMENT = /^Pursuant to 15 USC/i;
const DYNAMIC_ITEM_GAP = '0';

function paragraphText(paragraph: Element): string {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('').replace(/\s+/g, ' ').trim();
}

function directParagraphs(body: Element): Element[] {
  return Array.from(body.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === 'p') as Element[];
}

function children(root: Element, localName: string): Element[] {
  return Array.from(root.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === localName) as Element[];
}

function paragraphProperties(paragraph: Element): Element {
  const existing = Array.from(paragraph.children).find((child) => child.namespaceURI === WORD_NS && child.localName === 'pPr') as Element | undefined;
  if (existing) return existing;
  const created = paragraph.ownerDocument.createElementNS(WORD_NS, 'w:pPr');
  paragraph.insertBefore(created, paragraph.firstChild);
  return created;
}

function applyRule(paragraph: Element, rule: FlowRule) {
  const properties = paragraphProperties(paragraph);
  const existing = Array.from(properties.children).find((child) => child.namespaceURI === WORD_NS && child.localName === rule);
  if (existing) return;
  const property = paragraph.ownerDocument.createElementNS(WORD_NS, `w:${rule}`);
  const ruleIndex = FLOW_ORDER.indexOf(rule);
  const insertionPoint = Array.from(properties.children).find((child) => {
    const otherIndex = FLOW_ORDER.indexOf(child.localName as FlowRule);
    return otherIndex < 0 || otherIndex > ruleIndex;
  });
  if (insertionPoint) properties.insertBefore(property, insertionPoint);
  else properties.appendChild(property);
}

function spacing(paragraph: Element): Element {
  const pPr = paragraphProperties(paragraph);
  const existing = children(pPr, 'spacing')[0];
  if (existing) return existing;
  const created = paragraph.ownerDocument.createElementNS(WORD_NS, 'w:spacing');
  pPr.appendChild(created);
  return created;
}

function setSpacing(paragraph: Element, before: string, after: string) {
  const node = spacing(paragraph);
  node.setAttributeNS(WORD_NS, 'w:before', before);
  node.setAttributeNS(WORD_NS, 'w:after', after);
  node.setAttributeNS(WORD_NS, 'w:lineRule', 'auto');
}

function protectParagraph(paragraph: Element, keepWithNext = false) {
  applyRule(paragraph, 'widowControl');
  applyRule(paragraph, 'keepLines');
  if (keepWithNext) applyRule(paragraph, 'keepNext');
}

function previousTextParagraph(paragraphs: Element[], index: number): Element | undefined {
  for (let pointer = index - 1; pointer >= 0; pointer -= 1) if (paragraphText(paragraphs[pointer])) return paragraphs[pointer];
  return undefined;
}

function nextTextParagraph(paragraphs: Element[], index: number): Element | undefined {
  for (let pointer = index + 1; pointer < paragraphs.length; pointer += 1) if (paragraphText(paragraphs[pointer])) return paragraphs[pointer];
  return undefined;
}

function normalizeSpacingAfterMajorHeadings(body: Element) {
  const paragraphs = directParagraphs(body);
  paragraphs.forEach((paragraph, index) => {
    if (!MAJOR_HEADING.test(paragraphText(paragraph))) return;
    const blanks: Element[] = [];
    for (let pointer = index + 1; pointer < paragraphs.length; pointer += 1) {
      if (paragraphText(paragraphs[pointer])) break;
      blanks.push(paragraphs[pointer]);
    }
    blanks.slice(1).forEach((blank) => { if (blank.parentNode === body) body.removeChild(blank); });
  });
}

function dynamicItemLabel(current: string, nextText: string) {
  if (/^(Account|Creditor)\s+Name\s*:/i.test(current)) return true;
  if (/^Account\s+Number\s*:/i.test(current)) return true;
  return Boolean(nextText && DISPUTE_STATEMENT.test(nextText));
}

function emptySpacerAfter(paragraph: Element): Element {
  const spacer = paragraph.cloneNode(true) as Element;
  Array.from(spacer.children).forEach((child) => {
    if (!(child.namespaceURI === WORD_NS && child.localName === 'pPr')) spacer.removeChild(child);
  });
  setSpacing(spacer, '0', '0');
  return spacer;
}

function normalizeOneBlankLineAfterDisputeStatements(body: Element) {
  const paragraphs = directParagraphs(body);
  paragraphs.forEach((paragraph, index) => {
    if (!DISPUTE_STATEMENT.test(paragraphText(paragraph))) return;

    const blanks: Element[] = [];
    let nextParagraph: Element | undefined;

    for (let pointer = index + 1; pointer < paragraphs.length; pointer += 1) {
      const candidate = paragraphs[pointer];
      const text = paragraphText(candidate);
      if (!text) {
        blanks.push(candidate);
        continue;
      }
      nextParagraph = candidate;
      break;
    }

    blanks.forEach((blank) => blank.parentNode === body && body.removeChild(blank));

    if (nextParagraph && !DISPUTE_STATEMENT.test(paragraphText(nextParagraph))) {
      body.insertBefore(emptySpacerAfter(paragraph), nextParagraph);
    }
  });
}

function normalizeDynamicItemSpacing(body: Element) {
  let paragraphs = directParagraphs(body);
  const accountNumber = /^Account\s+Number\s*:/i;

  paragraphs.forEach((paragraph, index) => {
    const current = paragraphText(paragraph);
    if (!current) return;
    const next = nextTextParagraph(paragraphs, index);
    const nextText = next ? paragraphText(next) : '';
    const previous = previousTextParagraph(paragraphs, index);
    const previousText = previous ? paragraphText(previous) : '';

    if (dynamicItemLabel(current, nextText)) {
      setSpacing(paragraph, '0', '0');
      applyRule(paragraph, 'keepNext');
    }

    if (DISPUTE_STATEMENT.test(current)) {
      setSpacing(paragraph, '0', DYNAMIC_ITEM_GAP);
      if (previous && (accountNumber.test(previousText) || dynamicItemLabel(previousText, current) || !MAJOR_HEADING.test(previousText))) applyRule(previous, 'keepNext');
    }
  });

  normalizeOneBlankLineAfterDisputeStatements(body);
  paragraphs = directParagraphs(body);
  paragraphs.forEach((paragraph, index) => {
    const current = paragraphText(paragraph);
    const next = nextTextParagraph(paragraphs, index);
    const nextText = next ? paragraphText(next) : '';
    if (dynamicItemLabel(current, nextText)) setSpacing(paragraph, '0', '0');
    if (DISPUTE_STATEMENT.test(current)) setSpacing(paragraph, '0', DYNAMIC_ITEM_GAP);
    if (!current) setSpacing(paragraph, '0', '0');
  });
}

function keepHeadingWithFirstContent(paragraphs: Element[], headingIndex: number) {
  applyRule(paragraphs[headingIndex], 'keepNext');
  for (let pointer = headingIndex + 1; pointer < paragraphs.length; pointer += 1) {
    if (paragraphText(paragraphs[pointer])) return;
    applyRule(paragraphs[pointer], 'keepNext');
  }
}

function protectTables(body: Element) {
  Array.from(body.getElementsByTagNameNS(WORD_NS, 'tc')).forEach((cell) => {
    Array.from(cell.getElementsByTagNameNS(WORD_NS, 'p')).forEach((paragraph) => protectParagraph(paragraph));
  });
}

export function applyLetterFlowRules(body: Element) {
  normalizeSpacingAfterMajorHeadings(body);
  normalizeDynamicItemSpacing(body);
  protectTables(body);
  const paragraphs = directParagraphs(body);
  const accountNumber = /^Account\s+Number\s*:/i;
  const statutoryParagraph = /^(Under\s+15\s+(U\.S\.\s+Code|USC)|You are not permitted|Any reinvestigation conducted|This letter serves)/i;

  paragraphs.forEach((paragraph, index) => {
    const content = paragraphText(paragraph);
    if (!content) return;
    protectParagraph(paragraph);
    if (MAJOR_HEADING.test(content)) { keepHeadingWithFirstContent(paragraphs, index); return; }
    const next = paragraphs.slice(index + 1).find((candidate) => paragraphText(candidate));
    const nextText = next ? paragraphText(next) : '';
    if (dynamicItemLabel(content, nextText)) { applyRule(paragraph, 'keepNext'); return; }
    if (accountNumber.test(content)) {
      if (next && (DISPUTE_STATEMENT.test(nextText) || statutoryParagraph.test(nextText))) applyRule(paragraph, 'keepNext');
      return;
    }
    if (DISPUTE_STATEMENT.test(content)) {
      const label = previousTextParagraph(paragraphs, index);
      if (label) applyRule(label, 'keepNext');
    }
  });
}

export async function applyDocxFlowRulesToBlob(blob: Blob): Promise<Blob> {
  const zip = new PizZip(await blob.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) return blob;
  const xml = new DOMParser().parseFromString(file.asText(), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) return blob;
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) return blob;
  applyLetterFlowRules(body);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return hardenGeneratedDocx(zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }));
}

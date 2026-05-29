const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

type FlowRule = 'keepNext' | 'keepLines' | 'widowControl';
const FLOW_ORDER: FlowRule[] = ['keepNext', 'keepLines', 'widowControl'];

function paragraphText(paragraph: Element): string {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't'))
    .map((node) => node.textContent || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function directParagraphs(body: Element): Element[] {
  return Array.from(body.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === 'p');
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

function protectParagraph(paragraph: Element, keepWithNext = false) {
  applyRule(paragraph, 'widowControl');
  applyRule(paragraph, 'keepLines');
  if (keepWithNext) applyRule(paragraph, 'keepNext');
}

function previousTextParagraph(paragraphs: Element[], index: number): Element | undefined {
  for (let pointer = index - 1; pointer >= 0; pointer -= 1) {
    if (paragraphText(paragraphs[pointer])) return paragraphs[pointer];
  }
  return undefined;
}

/**
 * Word's keepNext only links a paragraph to the paragraph immediately following it.
 * A visual template commonly contains blank spacing paragraphs after a heading. If those
 * blanks are not chained too, Word may still strand the heading at the bottom of a page.
 */
function keepHeadingWithFirstContent(paragraphs: Element[], headingIndex: number) {
  applyRule(paragraphs[headingIndex], 'keepNext');
  for (let pointer = headingIndex + 1; pointer < paragraphs.length; pointer += 1) {
    if (paragraphText(paragraphs[pointer])) return;
    applyRule(paragraphs[pointer], 'keepNext');
  }
}

/**
 * Applies deterministic native Word pagination controls to a generated letter.
 * This avoids AI guesswork: Word makes the final page calculation using fonts, margins and
 * printer layout, while these rules prevent orphan headings and split paragraph blocks.
 */
export function applyLetterFlowRules(body: Element) {
  const paragraphs = directParagraphs(body);
  const majorHeading = /^(FRAUDULENT ACCOUNTS FOR IMMEDIATE BLOCKING AND DELETION|LEGAL DEMAND AND NOTICE OF DUTY|REQUIRED ACTIONS|SUPPORTING DOCUMENTS|Subject:\s*Dispute of Inaccurate Late Payment.*)$/i;
  const accountName = /^(Account|Creditor)\s+Name\s*:/i;
  const accountNumber = /^Account\s+Number\s*:/i;
  const fraudStatement = /^Pursuant to 15 USC/i;
  const statutoryParagraph = /^(Under\s+15\s+(U\.S\.\s+Code|USC)|You are not permitted|Any reinvestigation conducted|This letter serves)/i;

  paragraphs.forEach((paragraph, index) => {
    const content = paragraphText(paragraph);

    // Preserve blank paragraphs as spacing, but only add flow properties to them when
    // they bridge a heading to its real content in keepHeadingWithFirstContent().
    if (!content) return;

    // Prevent paragraph splitting and widow/orphan lines wherever the content fits on a page.
    protectParagraph(paragraph);

    // A section title must move together with its first real body paragraph, even when the
    // uploaded template contains blank spacing paragraphs between them.
    if (majorHeading.test(content)) {
      keepHeadingWithFirstContent(paragraphs, index);
      return;
    }

    // Preserve account label/value blocks and attach the account identity to its explanation.
    if (accountName.test(content)) {
      applyRule(paragraph, 'keepNext');
      return;
    }
    if (accountNumber.test(content)) {
      const next = paragraphs.slice(index + 1).find((candidate) => paragraphText(candidate));
      if (next && (fraudStatement.test(paragraphText(next)) || statutoryParagraph.test(paragraphText(next)))) applyRule(paragraph, 'keepNext');
      return;
    }
    if (fraudStatement.test(content)) {
      const label = previousTextParagraph(paragraphs, index);
      if (label) applyRule(label, 'keepNext');
    }
  });
}

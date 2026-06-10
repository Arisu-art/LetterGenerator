const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

type FlowRule = 'keepNext' | 'keepLines' | 'widowControl';
const FLOW_ORDER: FlowRule[] = ['keepNext', 'keepLines', 'widowControl'];
const MAJOR_HEADING = /^(FRAUDULENT ACCOUNTS FOR IMMEDIATE BLOCKING AND DELETION|LEGAL DEMAND AND NOTICE OF DUTY|REQUIRED ACTIONS|SUPPORTING DOCUMENTS|Subject:\s*Dispute of Inaccurate Late Payment.*)$/i;

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
  for (let pointer = index - 1; pointer >= 0; pointer -= 1) {
    if (paragraphText(paragraphs[pointer])) return paragraphs[pointer];
  }
  return undefined;
}

function nextTextParagraph(paragraphs: Element[], index: number): Element | undefined {
  for (let pointer = index + 1; pointer < paragraphs.length; pointer += 1) {
    if (paragraphText(paragraphs[pointer])) return paragraphs[pointer];
  }
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
    blanks.slice(1).forEach((blank) => {
      if (blank.parentNode === body) body.removeChild(blank);
    });
  });
}

function normalizeDynamicItemSpacing(body: Element) {
  let paragraphs = directParagraphs(body);
  const fraudStatement = /^Pursuant to 15 USC/i;
  const accountName = /^(Account|Creditor)\s+Name\s*:/i;
  const accountNumber = /^Account\s+Number\s*:/i;

  paragraphs.forEach((paragraph, index) => {
    const current = paragraphText(paragraph);
    if (!current) return;
    const next = nextTextParagraph(paragraphs, index);
    const nextText = next ? paragraphText(next) : '';
    const previous = previousTextParagraph(paragraphs, index);
    const previousText = previous ? paragraphText(previous) : '';

    if (accountName.test(current)) setSpacing(paragraph, '0', '0');
    if (accountNumber.test(current)) setSpacing(paragraph, '0', '0');

    if (fraudStatement.test(current)) {
      setSpacing(paragraph, '0', '160');
      if (previous && (accountNumber.test(previousText) || !MAJOR_HEADING.test(previousText))) applyRule(previous, 'keepNext');
    }

    if (!accountName.test(current) && !accountNumber.test(current) && nextText && fraudStatement.test(nextText)) {
      setSpacing(paragraph, '160', '0');
      applyRule(paragraph, 'keepNext');
    }
  });

  paragraphs = directParagraphs(body);
  paragraphs.forEach((paragraph, index) => {
    if (!paragraphText(paragraph)) return;
    const blanks: Element[] = [];
    for (let pointer = index + 1; pointer < paragraphs.length; pointer += 1) {
      if (paragraphText(paragraphs[pointer])) break;
      blanks.push(paragraphs[pointer]);
    }
    const current = paragraphText(paragraph);
    if (/^Pursuant to 15 USC/i.test(current)) blanks.slice(1).forEach((blank) => blank.parentNode === body && body.removeChild(blank));
  });
}

function keepHeadingWithFirstContent(paragraphs: Element[], headingIndex: number) {
  applyRule(paragraphs[headingIndex], 'keepNext');
  for (let pointer = headingIndex + 1; pointer < paragraphs.length; pointer += 1) {
    if (paragraphText(paragraphs[pointer])) return;
    applyRule(paragraphs[pointer], 'keepNext');
  }
}

export function applyLetterFlowRules(body: Element) {
  normalizeSpacingAfterMajorHeadings(body);
  normalizeDynamicItemSpacing(body);
  const paragraphs = directParagraphs(body);
  const accountName = /^(Account|Creditor)\s+Name\s*:/i;
  const accountNumber = /^Account\s+Number\s*:/i;
  const fraudStatement = /^Pursuant to 15 USC/i;
  const statutoryParagraph = /^(Under\s+15\s+(U\.S\.\s+Code|USC)|You are not permitted|Any reinvestigation conducted|This letter serves)/i;

  paragraphs.forEach((paragraph, index) => {
    const content = paragraphText(paragraph);
    if (!content) return;

    protectParagraph(paragraph);

    if (MAJOR_HEADING.test(content)) {
      keepHeadingWithFirstContent(paragraphs, index);
      return;
    }

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

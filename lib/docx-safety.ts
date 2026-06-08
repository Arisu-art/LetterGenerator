import PizZip from 'pizzip';
import { DOCX_MIME } from './docx-renderer';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const SSN_PATTERN = /(?:X{3}|\d{3})[-‐-‒–—](?:X{2}|\d{2})[-‐-‒–—](?:X{4}|\d{4})/gi;
const XML_PART = /^word\/(?:document|header\d+|footer\d+)\.xml$/i;

function children(root: Element, name: string) {
  return Array.from(root.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === name) as Element[];
}

function textNodes(root: Element) {
  return Array.from(root.getElementsByTagNameNS(WORD_NS, 't')) as Element[];
}

function rawText(root: Element) {
  return textNodes(root).map((node) => node.textContent || '').join('');
}

function normalizedSsn(value: string) {
  return value.replace(/[-‐-‒–—]/g, '\u2011');
}

function putText(node: Element, value: string) {
  node.textContent = value;

  if (/^\s|\s$/.test(value)) {
    node.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  } else {
    node.removeAttributeNS(XML_NS, 'space');
  }
}

function paragraphProperties(paragraph: Element) {
  const existing = children(paragraph, 'pPr')[0];
  if (existing) return existing;

  const pPr = paragraph.ownerDocument.createElementNS(WORD_NS, 'w:pPr');
  paragraph.insertBefore(pPr, paragraph.firstChild);
  return pPr;
}

function ensureParagraphProperty(paragraph: Element, localName: string) {
  const pPr = paragraphProperties(paragraph);
  const existing = children(pPr, localName)[0];

  if (existing) return existing;

  const property = paragraph.ownerDocument.createElementNS(WORD_NS, `w:${localName}`);
  pPr.appendChild(property);
  return property;
}

function preventSensitiveBreaks(paragraph: Element) {
  const suppress = ensureParagraphProperty(paragraph, 'suppressAutoHyphens');
  suppress.setAttributeNS(WORD_NS, 'w:val', '1');

  ensureParagraphProperty(paragraph, 'keepLines');
  ensureParagraphProperty(paragraph, 'widowControl');
  ensureParagraphProperty(paragraph, 'wordWrap');
}

function styleRun(paragraph: Element) {
  const runs = children(paragraph, 'r');
  return (runs.find((run) => rawText(run).trim()) || runs[0] || paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r')).cloneNode(true) as Element;
}

function blankRun(source: Element) {
  const run = source.cloneNode(true) as Element;

  Array.from(run.children).forEach((node) => {
    if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) {
      run.removeChild(node);
    }
  });

  return run;
}

function writeLines(paragraph: Element, lines: string[]) {
  const doc = paragraph.ownerDocument;
  const source = styleRun(paragraph);

  Array.from(paragraph.children).forEach((node) => {
    if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) {
      paragraph.removeChild(node);
    }
  });

  lines.forEach((line, index) => {
    if (index) {
      const breakRun = blankRun(source);
      breakRun.appendChild(doc.createElementNS(WORD_NS, 'w:br'));
      paragraph.appendChild(breakRun);
    }

    const run = blankRun(source);
    const text = doc.createElementNS(WORD_NS, 'w:t');

    putText(text, line);

    run.appendChild(text);
    paragraph.appendChild(run);
  });
}

function normalizeRunsOnly(paragraph: Element) {
  textNodes(paragraph).forEach((node) => {
    const value = node.textContent || '';
    if (!SSN_PATTERN.test(value)) {
      SSN_PATTERN.lastIndex = 0;
      return;
    }

    SSN_PATTERN.lastIndex = 0;
    putText(node, value.replace(SSN_PATTERN, (match) => normalizedSsn(match)));
  });
}

function splitPersonalInformationSsnLine(paragraph: Element) {
  const original = rawText(paragraph).replace(/\s+/g, ' ').trim();
  const ssnMatch = original.match(SSN_PATTERN);

  if (!ssnMatch) return false;

  const ssn = normalizedSsn(ssnMatch[0]);
  const withoutBadHyphenation = original.replace(/Security\s+num\s*[-‐-‒–—]\s*ber/gi, 'Security number');
  const splitMatch = withoutBadHyphenation.match(/^(.*?\bcurrent\s+address\s+is\s+.*?\.?)\s+(My\s+(?:Social\s+)?Security\s+number\s+is)\s*(?:X{3}|\d{3})[-‐-‒–—](?:X{2}|\d{2})[-‐-‒–—](?:X{4}|\d{4})\.?$/i);

  if (!splitMatch) return false;

  const firstLine = splitMatch[1].replace(/\s+/g, ' ').replace(/\s*\.$/, '.').trim();
  const secondLine = `${splitMatch[2].replace(/\s+/g, ' ')} ${ssn}`;

  writeLines(paragraph, [firstLine, secondLine]);
  preventSensitiveBreaks(paragraph);

  return true;
}

function hardenParagraph(paragraph: Element) {
  const original = rawText(paragraph);

  if (!SSN_PATTERN.test(original)) {
    SSN_PATTERN.lastIndex = 0;
    return;
  }

  SSN_PATTERN.lastIndex = 0;
  preventSensitiveBreaks(paragraph);

  if (splitPersonalInformationSsnLine(paragraph)) return;

  normalizeRunsOnly(paragraph);
}

export async function hardenGeneratedDocx(blob: Blob): Promise<Blob> {
  const zip = new PizZip(await blob.arrayBuffer());
  let changed = false;

  for (const name of Object.keys(zip.files)) {
    if (!XML_PART.test(name)) continue;

    const file = zip.file(name);
    if (!file) continue;

    const xml = new DOMParser().parseFromString(file.asText(), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) continue;

    const before = new XMLSerializer().serializeToString(xml);

    Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p')).forEach((paragraph) => {
      hardenParagraph(paragraph);
    });

    const after = new XMLSerializer().serializeToString(xml);

    if (after !== before) {
      zip.file(name, after);
      changed = true;
    }
  }

  if (!changed) return blob;

  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

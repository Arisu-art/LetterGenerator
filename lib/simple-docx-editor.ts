import PizZip from 'pizzip';
import { DOCX_MIME } from './docx-renderer';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

type StyleInfo = { id: string; basedOn: string; pPr: Element | null; rPr: Element | null };
type StyleContext = { defaultPPr: Element | null; defaultRPr: Element | null; styles: Map<string, StyleInfo> };
export type ParagraphAlignment = 'left' | 'center' | 'right' | 'justify';
export type EditableParagraph = {
  id: string;
  originalIndex: number | null;
  templateIndex: number | null;
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  fontSize: number;
  fontFamily: string;
  alignment: ParagraphAlignment;
  lineSpacing: number;
  spacingBefore: number;
  spacingAfter: number;
  leftIndent: number;
  rightIndent: number;
  firstLineIndent: number;
  pageBreakBefore: boolean;
  dirty: boolean;
};

function documentParagraphs(body: Element) { return Array.from(body.getElementsByTagNameNS(WORD_NS, 'p')) as Element[]; }
function childrenByName(parent: Element | null, localName: string) { if (!parent) return []; return Array.from(parent.children).filter((node) => node.namespaceURI === WORD_NS && node.localName === localName) as Element[]; }
function firstByName(parent: Element | null, localName: string) { return childrenByName(parent, localName)[0] || null; }
function attribute(element: Element | null, localName: string) { return element?.getAttributeNS(WORD_NS, localName) || element?.getAttribute(`w:${localName}`) || ''; }
function firstRun(paragraph: Element) { return firstByName(paragraph, 'r'); }
function normalizedColor(value: string) { return /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : '#000000'; }
function twipsToPt(value: string, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed / 20 : fallback; }
function halfPt(value: string, fallback = 8) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed / 2 : fallback; }
function paragraphText(paragraph: Element) {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node instanceof Element && node.namespaceURI === WORD_NS) {
      if (node.localName === 'br' || node.localName === 'cr') return '\n';
      if (node.localName === 'tab') return '\t';
    }
    return Array.from(node.childNodes).map(read).join('');
  };
  return read(paragraph).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
function parseXml(text: string) { return new DOMParser().parseFromString(text, 'application/xml'); }
function styleId(style: Element) { return attribute(style, 'styleId') || attribute(style, 'id'); }
function readStyleContext(zip: PizZip): StyleContext {
  const stylesText = zip.file('word/styles.xml')?.asText();
  if (!stylesText) return { defaultPPr: null, defaultRPr: null, styles: new Map() };
  const xml = parseXml(stylesText);
  const defaultPPr = firstByName(firstByName(firstByName(xml.documentElement, 'docDefaults'), 'pPrDefault'), 'pPr');
  const defaultRPr = firstByName(firstByName(firstByName(xml.documentElement, 'docDefaults'), 'rPrDefault'), 'rPr');
  const styles = new Map<string, StyleInfo>();
  Array.from(xml.getElementsByTagNameNS(WORD_NS, 'style')).forEach((style) => {
    const id = styleId(style);
    if (!id) return;
    styles.set(id, { id, basedOn: attribute(firstByName(style, 'basedOn'), 'val'), pPr: firstByName(style, 'pPr'), rPr: firstByName(style, 'rPr') });
  });
  return { defaultPPr, defaultRPr, styles };
}
function styleChain(context: StyleContext, id: string) {
  const chain: StyleInfo[] = [];
  const seen = new Set<string>();
  let current = id;
  while (current && !seen.has(current)) {
    seen.add(current);
    const style = context.styles.get(current);
    if (!style) break;
    chain.push(style);
    current = style.basedOn;
  }
  return chain;
}
function firstSetting(sources: Array<Element | null>, localName: string) { return sources.map((source) => firstByName(source, localName)).find(Boolean) || null; }
function readFormatting(paragraph: Element, context: StyleContext) {
  const pPr = firstByName(paragraph, 'pPr');
  const pStyleId = attribute(firstByName(pPr, 'pStyle'), 'val');
  const paragraphStyles = styleChain(context, pStyleId);
  const pSources = [pPr, ...paragraphStyles.map((style) => style.pPr), context.defaultPPr];
  const run = firstRun(paragraph);
  const rPr = firstByName(run, 'rPr');
  const rStyleId = attribute(firstByName(rPr, 'rStyle'), 'val');
  const runStyles = styleChain(context, rStyleId);
  const rSources = [rPr, ...runStyles.map((style) => style.rPr), ...paragraphStyles.map((style) => style.rPr), context.defaultRPr];
  const alignValue = attribute(firstSetting(pSources, 'jc'), 'val');
  const alignment: ParagraphAlignment = alignValue === 'center' || alignValue === 'right' || alignValue === 'both' ? (alignValue === 'both' ? 'justify' : alignValue) : 'left';
  const spacing = firstSetting(pSources, 'spacing');
  const line = Number(attribute(spacing, 'line'));
  const before = twipsToPt(attribute(spacing, 'before'), 0);
  const after = twipsToPt(attribute(spacing, 'after'), 0);
  const ind = firstSetting(pSources, 'ind');
  const font = firstSetting(rSources, 'rFonts');
  const asciiFont = attribute(font, 'ascii') || attribute(font, 'hAnsi') || attribute(font, 'cs') || 'Arial';
  const size = halfPt(attribute(firstSetting(rSources, 'sz'), 'val'), 8);
  return {
    bold: Boolean(firstSetting(rSources, 'b')),
    italic: Boolean(firstSetting(rSources, 'i')),
    underline: Boolean(firstSetting(rSources, 'u')),
    color: normalizedColor(attribute(firstSetting(rSources, 'color'), 'val')),
    fontSize: Math.max(4, Math.min(72, size)),
    fontFamily: asciiFont,
    alignment,
    lineSpacing: line ? Math.max(0.75, Number((line / 240).toFixed(3))) : 1,
    spacingBefore: before,
    spacingAfter: after,
    leftIndent: twipsToPt(attribute(ind, 'left'), 0),
    rightIndent: twipsToPt(attribute(ind, 'right'), 0),
    firstLineIndent: twipsToPt(attribute(ind, 'firstLine') || attribute(ind, 'hanging'), 0) * (attribute(ind, 'hanging') ? -1 : 1),
    pageBreakBefore: Boolean(firstSetting(pSources, 'pageBreakBefore'))
  };
}
function parseDocument(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => {
    const zip = new PizZip(buffer);
    const file = zip.file('word/document.xml');
    if (!file) throw new Error('This DOCX does not include a readable document body.');
    const xml = parseXml(file.asText());
    if (xml.getElementsByTagName('parsererror').length) throw new Error('This DOCX could not be parsed for editing.');
    const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
    if (!body) throw new Error('This DOCX does not contain editable body paragraphs.');
    return { zip, xml, body, context: readStyleContext(zip) };
  });
}
export async function readEditableParagraphs(blob: Blob): Promise<EditableParagraph[]> {
  const { body, context } = await parseDocument(blob);
  const blocks = documentParagraphs(body).map((paragraph, index) => ({ paragraph, index })).filter(({ paragraph }) => paragraphText(paragraph).length > 0);
  return blocks.map(({ paragraph, index }) => ({ id: `paragraph-${index}`, originalIndex: index, templateIndex: index, text: paragraphText(paragraph), ...readFormatting(paragraph, context), dirty: false }));
}
function removeChildren(parent: Element, localName: string) { childrenByName(parent, localName).forEach((child) => parent.removeChild(child)); }
function requireChild(parent: Element, localName: string, first = false) { const existing = firstByName(parent, localName); if (existing) return existing; const child = parent.ownerDocument.createElementNS(WORD_NS, `w:${localName}`); if (first && parent.firstChild) parent.insertBefore(child, parent.firstChild); else parent.appendChild(child); return child; }
function setVal(element: Element, value: string) { element.setAttributeNS(WORD_NS, 'w:val', value); }
function setToggle(parent: Element, localName: string, enabled: boolean) { removeChildren(parent, localName); if (enabled) parent.appendChild(parent.ownerDocument.createElementNS(WORD_NS, `w:${localName}`)); }
function setPageBreakBefore(parent: Element, enabled: boolean) { removeChildren(parent, 'pageBreakBefore'); if (enabled) parent.appendChild(parent.ownerDocument.createElementNS(WORD_NS, 'w:pageBreakBefore')); }
function writeFormattedParagraph(paragraph: Element, block: EditableParagraph) {
  const doc = paragraph.ownerDocument;
  const pPr = requireChild(paragraph, 'pPr', true);
  setPageBreakBefore(pPr, Boolean(block.pageBreakBefore));
  removeChildren(pPr, 'jc'); const alignment = doc.createElementNS(WORD_NS, 'w:jc'); setVal(alignment, block.alignment === 'justify' ? 'both' : block.alignment); pPr.appendChild(alignment);
  removeChildren(pPr, 'spacing'); const spacing = doc.createElementNS(WORD_NS, 'w:spacing'); spacing.setAttributeNS(WORD_NS, 'w:line', String(Math.round(block.lineSpacing * 240))); spacing.setAttributeNS(WORD_NS, 'w:lineRule', 'auto'); spacing.setAttributeNS(WORD_NS, 'w:before', String(Math.round((block.spacingBefore || 0) * 20))); spacing.setAttributeNS(WORD_NS, 'w:after', String(Math.round(block.spacingAfter * 20))); pPr.appendChild(spacing);
  removeChildren(pPr, 'ind'); const ind = doc.createElementNS(WORD_NS, 'w:ind'); ind.setAttributeNS(WORD_NS, 'w:left', String(Math.round((block.leftIndent || 0) * 20))); ind.setAttributeNS(WORD_NS, 'w:right', String(Math.round((block.rightIndent || 0) * 20))); if (block.firstLineIndent) ind.setAttributeNS(WORD_NS, block.firstLineIndent < 0 ? 'w:hanging' : 'w:firstLine', String(Math.round(Math.abs(block.firstLineIndent) * 20))); pPr.appendChild(ind);
  const sourceRun = firstRun(paragraph); const run = sourceRun ? sourceRun.cloneNode(true) as Element : doc.createElementNS(WORD_NS, 'w:r');
  Array.from(run.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'rPr')) run.removeChild(node); });
  const rPr = requireChild(run, 'rPr', true); setToggle(rPr, 'b', block.bold); setToggle(rPr, 'i', block.italic); removeChildren(rPr, 'u');
  if (block.underline) { const underline = doc.createElementNS(WORD_NS, 'w:u'); setVal(underline, 'single'); rPr.appendChild(underline); }
  removeChildren(rPr, 'rFonts'); const font = doc.createElementNS(WORD_NS, 'w:rFonts'); ['ascii', 'hAnsi', 'cs'].forEach((name) => font.setAttributeNS(WORD_NS, `w:${name}`, block.fontFamily || 'Arial')); rPr.appendChild(font);
  removeChildren(rPr, 'color'); const color = doc.createElementNS(WORD_NS, 'w:color'); setVal(color, block.color.replace('#', '').toUpperCase()); rPr.appendChild(color);
  removeChildren(rPr, 'sz'); const size = doc.createElementNS(WORD_NS, 'w:sz'); setVal(size, String(Math.round(block.fontSize * 2))); rPr.appendChild(size);
  removeChildren(rPr, 'szCs'); const complexSize = doc.createElementNS(WORD_NS, 'w:szCs'); setVal(complexSize, String(Math.round(block.fontSize * 2))); rPr.appendChild(complexSize);
  Array.from(paragraph.children).forEach((node) => { if (!(node.namespaceURI === WORD_NS && node.localName === 'pPr')) paragraph.removeChild(node); });
  block.text.replace(/\r/g, '').split('\n').forEach((line, index) => { const nextRun = run.cloneNode(true) as Element; if (index) nextRun.appendChild(doc.createElementNS(WORD_NS, 'w:br')); const text = doc.createElementNS(WORD_NS, 'w:t'); if (/^\s|\s$/.test(line)) text.setAttributeNS(XML_NS, 'xml:space', 'preserve'); text.textContent = line; nextRun.appendChild(text); paragraph.appendChild(nextRun); });
}
export async function saveEditedParagraphs(original: Blob, blocks: EditableParagraph[]) {
  const { zip, xml, body } = await parseDocument(original);
  const originals = documentParagraphs(body);
  const retained = new Set(blocks.filter((block) => block.originalIndex !== null).map((block) => block.originalIndex as number));
  originals.forEach((paragraph, index) => { if (paragraphText(paragraph) && !retained.has(index)) paragraph.parentNode?.removeChild(paragraph); });
  let anchor: Element | null = null;
  blocks.forEach((block) => {
    let paragraph = block.originalIndex === null ? null : originals[block.originalIndex];
    if (paragraph && !paragraph.parentNode) paragraph = null;
    if (!paragraph) {
      const template = block.templateIndex === null ? anchor : originals[block.templateIndex];
      paragraph = template ? template.cloneNode(true) as Element : xml.createElementNS(WORD_NS, 'w:p');
      const parent = anchor?.parentNode || template?.parentNode || body;
      if (anchor?.nextSibling && anchor.parentNode === parent) parent.insertBefore(paragraph, anchor.nextSibling); else parent.appendChild(paragraph);
      writeFormattedParagraph(paragraph, block);
    } else if (block.dirty) writeFormattedParagraph(paragraph, block);
    anchor = paragraph;
  });
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

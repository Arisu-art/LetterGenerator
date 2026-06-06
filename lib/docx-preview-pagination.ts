import PizZip from 'pizzip';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TWIPS_PER_INCH = 1440;
const DEFAULT_TWIPS = { width: 12240, height: 15840, top: 1440, right: 1440, bottom: 1440, left: 1440 };
const PAPER = {
  Letter: { widthIn: 8.5, heightIn: 11 },
  Legal: { widthIn: 8.5, heightIn: 14 },
  A4: { widthIn: 8.268, heightIn: 11.693 },
  A3: { widthIn: 11.693, heightIn: 16.535 }
} as const;
export type PaperName = keyof typeof PAPER | 'Custom';
export type DocxPageLayout = {
  name: PaperName;
  source: 'template' | 'fallback';
  orientation: 'portrait' | 'landscape';
  widthIn: number;
  heightIn: number;
  marginTopIn: number;
  marginRightIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
};
export type PreviewQuality = 'verified-pagination' | 'native-fallback';
export type PaginatedPreview = { pages: HTMLElement[]; oversizedPages: number[]; layout: DocxPageLayout; quality: PreviewQuality; notice?: string };
type PageShell = { section: HTMLElement; body: HTMLElement };

function attr(element: Element | undefined, name: string) { return element?.getAttributeNS(WORD_NS, name) || element?.getAttribute(`w:${name}`) || element?.getAttribute(name) || ''; }
function positiveTwips(element: Element | undefined, name: string, fallback: number) { const parsed = Number(attr(element, name)); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function marginTwips(element: Element | undefined, name: string, fallback: number) { const parsed = Number(attr(element, name)); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
function inches(twips: number) { return Math.round((twips / TWIPS_PER_INCH) * 1000) / 1000; }
function near(a: number, b: number, tolerance = 0.05) { return Math.abs(a - b) <= tolerance; }
function paperName(widthIn: number, heightIn: number): PaperName {
  const width = Math.min(widthIn, heightIn);
  const height = Math.max(widthIn, heightIn);
  return (Object.entries(PAPER) as Array<[keyof typeof PAPER, { widthIn: number; heightIn: number }]>).find(([, paper]) => near(width, paper.widthIn) && near(height, paper.heightIn))?.[0] || 'Custom';
}
function fallbackLayout(): DocxPageLayout { return { name: 'Letter', source: 'fallback', orientation: 'portrait', widthIn: 8.5, heightIn: 11, marginTopIn: 1, marginRightIn: 1, marginBottomIn: 1, marginLeftIn: 1 }; }
function safeNativeLayout(layout: DocxPageLayout): DocxPageLayout {
  const widthIn = Math.max(2, Math.min(40, Number(layout.widthIn) || 8.5));
  const heightIn = Math.max(2, Math.min(40, Number(layout.heightIn) || 11));
  const limitX = Math.max(0, widthIn / 2 - 0.25);
  const limitY = Math.max(0, heightIn / 2 - 0.25);
  return { ...layout, widthIn, heightIn, name: paperName(widthIn, heightIn), orientation: widthIn > heightIn ? 'landscape' : 'portrait', marginTopIn: Math.min(limitY, Math.max(0, Number(layout.marginTopIn) || 0)), marginRightIn: Math.min(limitX, Math.max(0, Number(layout.marginRightIn) || 0)), marginBottomIn: Math.min(limitY, Math.max(0, Number(layout.marginBottomIn) || 0)), marginLeftIn: Math.min(limitX, Math.max(0, Number(layout.marginLeftIn) || 0)) };
}
export async function readDocxPageLayout(blob: Blob): Promise<DocxPageLayout> {
  try {
    const xmlText = new PizZip(await blob.arrayBuffer()).file('word/document.xml')?.asText();
    if (!xmlText) return fallbackLayout();
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    const sections = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sectPr'));
    const section = sections[sections.length - 1];
    if (!section) return fallbackLayout();
    const size = Array.from(section.getElementsByTagNameNS(WORD_NS, 'pgSz'))[0];
    const margin = Array.from(section.getElementsByTagNameNS(WORD_NS, 'pgMar'))[0];
    const widthIn = inches(positiveTwips(size, 'w', DEFAULT_TWIPS.width));
    const heightIn = inches(positiveTwips(size, 'h', DEFAULT_TWIPS.height));
    return safeNativeLayout({ name: paperName(widthIn, heightIn), source: 'template', orientation: widthIn > heightIn ? 'landscape' : 'portrait', widthIn, heightIn, marginTopIn: inches(marginTwips(margin, 'top', DEFAULT_TWIPS.top)), marginRightIn: inches(marginTwips(margin, 'right', DEFAULT_TWIPS.right)), marginBottomIn: inches(marginTwips(margin, 'bottom', DEFAULT_TWIPS.bottom)), marginLeftIn: inches(marginTwips(margin, 'left', DEFAULT_TWIPS.left)) });
  } catch { return fallbackLayout(); }
}
function normalizedText(value: string | null | undefined) { return (value || '').replace(/\s+/g, ' ').trim(); }
function sourcePages(host: HTMLElement) { const pages = Array.from(host.querySelectorAll<HTMLElement>('section.packet-inline-docx, section.docx')); return pages.filter((page, index) => !pages.some((other, otherIndex) => otherIndex < index && other.contains(page))); }
function flowRoot(page: HTMLElement) { return page.querySelector<HTMLElement>(':scope > article') || page.querySelector<HTMLElement>('article') || page; }
function meaningfulNodes(root: HTMLElement) { return Array.from(root.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())); }
function isSafeLeaf(element: HTMLElement) { return /^(P|TABLE|IMG|SVG|FIGURE|UL|OL|BLOCKQUOTE|HR)$/i.test(element.tagName); }
function leafBlocks(root: HTMLElement): Node[] {
  const result: Node[] = [];
  meaningfulNodes(root).forEach((node) => {
    if (!(node instanceof HTMLElement) || isSafeLeaf(node)) { result.push(node); return; }
    const nested = leafBlocks(node);
    if (nested.length && normalizedText(nested.map((child) => child.textContent || '').join(' ')) === normalizedText(node.textContent)) result.push(...nested);
    else result.push(node);
  });
  return result;
}
function hasPageBreakBefore(node: Node) { return node instanceof HTMLElement && (node.classList.contains('docx-edit-page-break-before') || node.style.breakBefore === 'page' || node.style.pageBreakBefore === 'always'); }
function contentBlocks(page: HTMLElement) { return leafBlocks(flowRoot(page)); }
function setNativeLayoutVariables(section: HTMLElement, layout: DocxPageLayout) {
  section.style.setProperty('--docx-page-width', `${layout.widthIn}in`); section.style.setProperty('--docx-page-height', `${layout.heightIn}in`);
  section.style.setProperty('--docx-margin-top', `${layout.marginTopIn}in`); section.style.setProperty('--docx-margin-right', `${layout.marginRightIn}in`);
  section.style.setProperty('--docx-margin-bottom', `${layout.marginBottomIn}in`); section.style.setProperty('--docx-margin-left', `${layout.marginLeftIn}in`);
  section.style.setProperty('--docx-content-width', `${Math.max(0.5, layout.widthIn - layout.marginLeftIn - layout.marginRightIn)}in`);
  section.style.setProperty('--docx-content-height', `${Math.max(0.5, layout.heightIn - layout.marginTopIn - layout.marginBottomIn)}in`);
}
function newPage(reference: HTMLElement, parent: HTMLElement, anchor: HTMLElement, layout: DocxPageLayout): PageShell {
  const section = reference.cloneNode(false) as HTMLElement;
  section.classList.remove('docx-page-overflow', 'docx-page-oversized'); section.classList.add('measured-docx-page'); section.removeAttribute('style'); setNativeLayoutVariables(section, layout);
  const sourceBody = flowRoot(reference); const body = sourceBody === reference ? document.createElement('article') : sourceBody.cloneNode(false) as HTMLElement;
  body.classList.add('measured-docx-content'); body.removeAttribute('style'); section.appendChild(body); parent.insertBefore(section, anchor); return { section, body };
}
function overflows(body: HTMLElement) { return body.scrollHeight > body.clientHeight + 1; }
function nativeFallback(host: HTMLElement, nativeMarkup: string, layout: DocxPageLayout, notice: string): PaginatedPreview {
  host.innerHTML = nativeMarkup;
  const pages = sourcePages(host);
  pages.forEach((page, index) => { page.classList.add('native-docx-proof-page'); page.dataset.pageNumber = String(index + 1); setNativeLayoutVariables(page, layout); });
  return { pages, oversizedPages: [], layout, quality: 'native-fallback', notice };
}
export function paginateDocxPreview(host: HTMLElement, layout: DocxPageLayout): PaginatedPreview {
  const nativeMarkup = host.innerHTML;
  const sourceText = normalizedText(host.textContent);
  const originals = sourcePages(host); const parent = originals[0]?.parentElement;
  if (!originals.length || !parent) return { pages: originals, oversizedPages: [], layout, quality: 'native-fallback', notice: 'No page containers were available for measured pagination.' };
  const anchor = originals[0]; const built: PageShell[] = [];
  const addPage = () => { const page = newPage(originals[0], parent, anchor, layout); built.push(page); return page; };
  let current = addPage();
  originals.forEach((source, sourceIndex) => {
    if (sourceIndex > 0 && current.body.childNodes.length) current = addPage();
    contentBlocks(source).forEach((block) => {
      if (hasPageBreakBefore(block) && current.body.childNodes.length) current = addPage();
      current.body.appendChild(block);
      if (!overflows(current.body)) return;
      if (current.body.childNodes.length === 1) { current.section.classList.add('docx-page-oversized'); return; }
      current.body.removeChild(block); current = addPage(); current.body.appendChild(block);
      if (overflows(current.body)) current.section.classList.add('docx-page-oversized');
    });
  });
  originals.forEach((page) => page.remove());
  const pages = built.map((page, index) => { page.section.dataset.pageNumber = String(index + 1); return page.section; });
  const renderedText = normalizedText(host.textContent);
  if (sourceText !== renderedText) return nativeFallback(host, nativeMarkup, layout, 'Measured pagination did not preserve all document text. Native preview shown without clipping.');
  return { pages, oversizedPages: pages.flatMap((page, index) => page.classList.contains('docx-page-oversized') ? [index + 1] : []), layout, quality: 'verified-pagination' };
}

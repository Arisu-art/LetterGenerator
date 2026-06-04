import PizZip from 'pizzip';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TWIPS_PER_INCH = 1440;
const DEFAULT_TWIPS = { width: 12240, height: 15840, top: 1440, right: 1440, bottom: 1440, left: 1440 };

export type DocxPageLayout = {
  name: string;
  source: 'template' | 'fallback';
  orientation: 'portrait' | 'landscape';
  widthIn: number;
  heightIn: number;
  marginTopIn: number;
  marginRightIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
};
export type PaginatedPreview = { pages: HTMLElement[]; oversizedPages: number[]; layout: DocxPageLayout };
type PageShell = { section: HTMLElement; body: HTMLElement };

function numberAttr(element: Element | undefined, name: string, fallback: number) {
  if (!element) return fallback;
  const value = element.getAttributeNS(WORD_NS, name) || element.getAttribute(`w:${name}`) || element.getAttribute(name);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function inches(twips: number) { return Math.round((twips / TWIPS_PER_INCH) * 1000) / 1000; }
function near(a: number, b: number, tolerance = 70) { return Math.abs(a - b) <= tolerance; }
function paperName(width: number, height: number) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (near(short, 12240) && near(long, 15840)) return 'Letter';
  if (near(short, 12240) && near(long, 20160)) return 'Legal';
  if (near(short, 11906) && near(long, 16838)) return 'A4';
  if (near(short, 16838) && near(long, 23811)) return 'A3';
  return 'Custom';
}
function fallbackLayout(): DocxPageLayout {
  return { name: 'Letter', source: 'fallback', orientation: 'portrait', widthIn: 8.5, heightIn: 11, marginTopIn: 1, marginRightIn: 1, marginBottomIn: 1, marginLeftIn: 1 };
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
    const width = numberAttr(size, 'w', DEFAULT_TWIPS.width);
    const height = numberAttr(size, 'h', DEFAULT_TWIPS.height);
    return {
      name: paperName(width, height), source: 'template', orientation: width > height ? 'landscape' : 'portrait',
      widthIn: inches(width), heightIn: inches(height),
      marginTopIn: inches(numberAttr(margin, 'top', DEFAULT_TWIPS.top)), marginRightIn: inches(numberAttr(margin, 'right', DEFAULT_TWIPS.right)),
      marginBottomIn: inches(numberAttr(margin, 'bottom', DEFAULT_TWIPS.bottom)), marginLeftIn: inches(numberAttr(margin, 'left', DEFAULT_TWIPS.left))
    };
  } catch { return fallbackLayout(); }
}
export function describePageLayout(layout: DocxPageLayout) {
  const dimension = `${layout.widthIn.toFixed(2).replace(/\.00$/, '')} × ${layout.heightIn.toFixed(2).replace(/\.00$/, '')} in`;
  return `${layout.name}${layout.orientation === 'landscape' ? ' Landscape' : ''} · ${dimension}`;
}
function sourcePages(host: HTMLElement) {
  const pages = Array.from(host.querySelectorAll<HTMLElement>('section.packet-inline-docx, section.docx'));
  return pages.filter((page, index) => !pages.some((other, otherIndex) => otherIndex < index && other.contains(page)));
}
function flowRoot(page: HTMLElement) {
  return page.querySelector<HTMLElement>(':scope > article') || page.querySelector<HTMLElement>('article') || page;
}
function meaningfulNodes(root: HTMLElement) {
  return Array.from(root.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
}
function contentBlocks(page: HTMLElement) {
  let root = flowRoot(page);
  let nodes = meaningfulNodes(root);
  while (nodes.length === 1 && nodes[0] instanceof HTMLElement && !/^(P|TABLE|IMG|SVG|UL|OL)$/i.test(nodes[0].tagName)) {
    const nested = meaningfulNodes(nodes[0]);
    if (!nested.length) break;
    root = nodes[0];
    nodes = nested;
  }
  return nodes;
}
function setLayoutVariables(section: HTMLElement, layout: DocxPageLayout) {
  section.style.setProperty('--docx-page-width', `${layout.widthIn}in`);
  section.style.setProperty('--docx-page-height', `${layout.heightIn}in`);
  section.style.setProperty('--docx-margin-top', `${layout.marginTopIn}in`);
  section.style.setProperty('--docx-margin-right', `${layout.marginRightIn}in`);
  section.style.setProperty('--docx-margin-bottom', `${layout.marginBottomIn}in`);
  section.style.setProperty('--docx-margin-left', `${layout.marginLeftIn}in`);
  section.style.setProperty('--docx-content-width', `${Math.max(0.5, layout.widthIn - layout.marginLeftIn - layout.marginRightIn)}in`);
  section.style.setProperty('--docx-content-height', `${Math.max(0.5, layout.heightIn - layout.marginTopIn - layout.marginBottomIn)}in`);
}
function newPage(reference: HTMLElement, parent: HTMLElement, anchor: HTMLElement, layout: DocxPageLayout): PageShell {
  const section = reference.cloneNode(false) as HTMLElement;
  section.classList.remove('docx-page-overflow', 'docx-page-oversized');
  section.classList.add('measured-docx-page');
  section.removeAttribute('style');
  setLayoutVariables(section, layout);
  const body = document.createElement('article');
  body.className = 'measured-docx-content';
  section.appendChild(body);
  parent.insertBefore(section, anchor);
  return { section, body };
}
function overflows(body: HTMLElement) { return body.scrollHeight > body.clientHeight + 2; }

/**
 * Paginates only real rendered content blocks inside a printable content box.
 * It never uses the docx-preview page wrapper as a measured object.
 */
export function paginateDocxPreview(host: HTMLElement, layout: DocxPageLayout): PaginatedPreview {
  const originals = sourcePages(host);
  const parent = originals[0]?.parentElement;
  if (!originals.length || !parent) return { pages: originals, oversizedPages: [], layout };
  const anchor = originals[0];
  const built: PageShell[] = [];
  const addPage = () => { const page = newPage(originals[0], parent, anchor, layout); built.push(page); return page; };
  let current = addPage();
  originals.forEach((source, sourceIndex) => {
    if (sourceIndex > 0 && current.body.childNodes.length) current = addPage();
    contentBlocks(source).forEach((block) => {
      current.body.appendChild(block);
      if (!overflows(current.body)) return;
      if (current.body.childNodes.length === 1) { current.section.classList.add('docx-page-oversized'); return; }
      current.body.removeChild(block);
      current = addPage();
      current.body.appendChild(block);
      if (overflows(current.body)) current.section.classList.add('docx-page-oversized');
    });
  });
  originals.forEach((page) => page.remove());
  const pages = built.map((page, index) => { page.section.dataset.pageNumber = String(index + 1); return page.section; });
  return { pages, oversizedPages: pages.flatMap((page, index) => page.classList.contains('docx-page-oversized') ? [index + 1] : []), layout };
}

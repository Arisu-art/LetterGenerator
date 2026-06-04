type PageShell = {
  section: HTMLElement;
  body: HTMLElement;
};
export type PaginatedPreview = {
  pages: HTMLElement[];
  oversizedPages: number[];
};

function uniquePageSections(host: HTMLElement) {
  const pages = Array.from(host.querySelectorAll<HTMLElement>('section.packet-inline-docx, section.docx'));
  return pages.filter((page, index) => !pages.some((other, otherIndex) => otherIndex < index && other.contains(page)));
}
function contentBody(page: HTMLElement) {
  return (Array.from(page.children).find((child) => child instanceof HTMLElement && child.tagName.toLowerCase() === 'article') as HTMLElement | undefined) || page;
}
function fixedPageSize(page: HTMLElement) {
  const style = getComputedStyle(page);
  const width = page.style.width || style.width || '8.5in';
  const height = page.style.height || page.style.minHeight || style.height || '11in';
  page.style.setProperty('--docx-page-width', width);
  page.style.setProperty('--docx-page-height', height);
}
function shellFrom(reference: HTMLElement): PageShell {
  const section = reference.cloneNode(false) as HTMLElement;
  section.removeAttribute('data-page-number');
  section.classList.remove('docx-page-oversized');
  fixedPageSize(section);
  const originalBody = contentBody(reference);
  if (originalBody === reference) {
    section.classList.add('packet-paged-body');
    return { section, body: section };
  }
  const body = originalBody.cloneNode(false) as HTMLElement;
  body.classList.add('packet-paged-body');
  section.appendChild(body);
  return { section, body };
}
function hasFlowContent(body: HTMLElement) {
  return Array.from(body.childNodes).some((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
}
function overflowing(section: HTMLElement) {
  return section.scrollHeight > section.clientHeight + 3;
}

/**
 * Flows rendered DOCX body blocks into fixed page sheets for browser-side review.
 * Existing source page boundaries are retained; a continuous source page is split
 * only when its next block no longer fits on the visible printable sheet.
 */
export function paginateDocxPreview(host: HTMLElement): PaginatedPreview {
  const originals = uniquePageSections(host);
  if (!originals.length) return { pages: [], oversizedPages: [] };
  const parent = originals[0].parentElement;
  if (!parent) return { pages: originals, oversizedPages: [] };
  const reference = originals[0];
  const sourceGroups = originals.map((page) => Array.from(contentBody(page).childNodes));
  const anchor = originals[0];
  const built: PageShell[] = [];
  const addPage = () => {
    const shell = shellFrom(reference);
    parent.insertBefore(shell.section, anchor);
    built.push(shell);
    return shell;
  };
  let current = addPage();
  sourceGroups.forEach((blocks, sourcePageIndex) => {
    if (sourcePageIndex > 0 && hasFlowContent(current.body)) current = addPage();
    blocks.forEach((block) => {
      current.body.appendChild(block);
      if (!overflowing(current.section)) return;
      if (!hasFlowContent(current.body) || current.body.childNodes.length === 1) {
        current.section.classList.add('docx-page-oversized');
        return;
      }
      current.body.removeChild(block);
      current = addPage();
      current.body.appendChild(block);
      if (overflowing(current.section)) current.section.classList.add('docx-page-oversized');
    });
  });
  originals.forEach((page) => page.remove());
  const pages = built.map((page, index) => {
    page.section.dataset.pageNumber = String(index + 1);
    return page.section;
  });
  return {
    pages,
    oversizedPages: pages.flatMap((page, index) => page.classList.contains('docx-page-oversized') ? [index + 1] : [])
  };
}

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type PlaceholderValues = Record<string, string>;

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

export function isDocx(filename: string): boolean {
  return /\.docx$/i.test(filename);
}

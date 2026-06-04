import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function candidateBinaries() {
  const configured = process.env.SOFFICE_BIN || process.env.LIBREOFFICE_BIN;
  return [configured, 'soffice', 'libreoffice', '/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice', '/usr/local/bin/libreoffice'].filter(Boolean) as string[];
}
async function findLibreOffice() {
  for (const binary of candidateBinaries()) {
    try {
      await execFileAsync(binary, ['--version'], { timeout: 5000, windowsHide: true });
      return binary;
    } catch {
      // Try the next candidate.
    }
  }
  return '';
}
function safeName(value: string) {
  const base = value.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  return `${base}.docx`;
}
async function convertWithLibreOffice(binary: string, inputPath: string, outputDir: string, profileDir: string) {
  const args = [
    '--headless', '--nologo', '--nofirststartwizard', '--nolockcheck', '--norestore',
    `-env:UserInstallation=file://${profileDir}`,
    '--convert-to', 'pdf:writer_pdf_Export',
    '--outdir', outputDir,
    inputPath
  ];
  await execFileAsync(binary, args, { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}
export async function POST(request: NextRequest) {
  const workDir = await mkdir(path.join(os.tmpdir(), `letter-generator-docx-proof-${randomUUID()}`), { recursive: true }).then(() => path.join(os.tmpdir(), `letter-generator-docx-proof-${randomUUID()}`)).catch(async () => {
    const fallback = path.join(os.tmpdir(), `letter-generator-docx-proof-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(fallback, { recursive: true });
    return fallback;
  });
  try {
    const binary = await findLibreOffice();
    if (!binary) {
      return NextResponse.json({ error: 'LibreOffice/soffice is not installed or is not available on PATH. Install LibreOffice in the Codespace/server or set SOFFICE_BIN.' }, { status: 503 });
    }
    const data = await request.formData();
    const file = data.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Missing DOCX file upload.' }, { status: 400 });
    if (!/\.docx$/i.test(file.name) && file.type && file.type !== DOCX_MIME) return NextResponse.json({ error: 'Only DOCX files can be converted to proof PDF.' }, { status: 415 });
    const inputName = safeName(file.name || 'document.docx');
    const inputPath = path.join(workDir, inputName);
    const outputDir = path.join(workDir, 'out');
    const profileDir = path.join(workDir, 'profile');
    await mkdir(outputDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    await convertWithLibreOffice(binary, inputPath, outputDir, profileDir);
    const expectedPdf = path.join(outputDir, inputName.replace(/\.docx$/i, '.pdf'));
    const pdf = await readFile(expectedPdf);
    return new NextResponse(pdf, { headers: { 'content-type': PDF_MIME, 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DOCX proof conversion failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

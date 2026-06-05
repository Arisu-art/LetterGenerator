import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function candidateBinaries() {
  const configured = process.env.SOFFICE_BIN || process.env.LIBREOFFICE_BIN;
  return [configured, 'soffice', 'libreoffice', '/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice', '/usr/local/bin/libreoffice'].filter(Boolean) as string[];
}
async function findLibreOffice() {
  for (const binary of candidateBinaries()) {
    try {
      const result = await execFileAsync(binary, ['--version'], { timeout: 5000, windowsHide: true });
      return { available: true, binary, version: `${result.stdout || result.stderr}`.trim() };
    } catch {
      // Continue searching.
    }
  }
  return { available: false, binary: '', version: '' };
}
export async function GET() {
  const status = await findLibreOffice();
  return NextResponse.json({
    ...status,
    requirement: status.available ? 'ready' : 'Install LibreOffice or set SOFFICE_BIN/LIBREOFFICE_BIN for DOCX proof previews.'
  }, { headers: { 'cache-control': 'no-store' } });
}

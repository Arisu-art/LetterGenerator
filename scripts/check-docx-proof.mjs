import { execFileSync } from 'node:child_process';

const candidates = [process.env.SOFFICE_BIN, process.env.LIBREOFFICE_BIN, 'soffice', 'libreoffice', '/usr/bin/soffice', '/usr/bin/libreoffice'].filter(Boolean);
let found = null;
for (const binary of candidates) {
  try {
    const version = execFileSync(binary, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    found = { binary, version };
    break;
  } catch {
    // Try next candidate.
  }
}
if (!found) {
  console.error('DOCX proof converter unavailable. Install LibreOffice and set SOFFICE_BIN if needed.');
  console.error('Codespace install command: sudo apt-get update && sudo apt-get install -y libreoffice libreoffice-writer fonts-dejavu fonts-liberation fontconfig');
  process.exit(1);
}
console.log(`DOCX proof converter ready: ${found.binary}`);
console.log(found.version);

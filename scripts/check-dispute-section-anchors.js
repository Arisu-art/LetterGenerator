const fs = require('fs');

const file = 'lib/docx-renderer.ts';
const text = fs.readFileSync(file, 'utf8');

const required = [
  'FRAUDULENT\\\\s+ACCOUNTS?(?:\\\\s*\\\\([^)]*\\\\))?',
  'NEXT_SECTION_PATTERNS',
  'GOVERN\\\\s+YOURSELF\\\\s+ACCORDINGLY',
  'nextSectionBoundary || legalBoundary || signatureBoundary'
];

const missing = required.filter((item) => !text.includes(item));

if (missing.length) {
  console.error('Missing dispute anchor framework pieces:', missing);
  process.exit(1);
}

console.log('Dispute section anchor framework present.');

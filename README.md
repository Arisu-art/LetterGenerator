# LetterGenerator

A precision DOCX automation website for connecting uploaded Word templates to pasted or uploaded TXT source data.

## What this app does

- Upload DOCX templates.
- Paste or upload structured TXT source data.
- Parse consumer information, dispute accounts, late payments, open accounts, and hard inquiries.
- Generate separate bureau-specific DOCX letters only when matching bureau data exists.
- Preserve the DOCX template exactly except for approved placeholder replacement.

## Template preservation rule

The uploaded DOCX file is the source of truth. The app does not rewrite legal content, colors, borders, fonts, spacing, images, tables, headers, footers, or static wording.

Only placeholders such as `{{consumer.name}}`, `{{bureau.name}}`, `{{accounts_block}}`, and `{{today.us_long}}` are replaced.

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Generation logic

Dispute data creates one file per bureau:

- TRANSUNION data creates a TransUnion dispute letter.
- EQUIFAX data creates an Equifax dispute letter.
- EXPERIAN data creates an Experian dispute letter.

Late-payment data follows the same per-bureau logic.

Empty bureau sections are skipped.

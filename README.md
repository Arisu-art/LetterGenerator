# LetterGenerator

Credit report extraction website for PDF-to-TXT processing using the locked extraction process.

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Core workflow

1. Upload one credit report PDF.
2. The app creates a fresh extraction session.
3. The parser extracts text and detects bureau order.
4. The rule engine classifies open accounts, late payments, dispute accounts, collections, public records, and hard inquiries.
5. The output generator creates a TXT file with the locked section order.

## Important rule

Every extraction must use the current uploaded PDF only. Never reuse prior output or prior client data.

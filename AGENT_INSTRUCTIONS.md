# Agent Instructions

Build a Next.js App Router website for credit report extraction.

## Required stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Server Components by default
- Client Components only for upload, progress, preview, and interactions

## Extraction requirements

- Every extraction must be a fresh rebuild from the current uploaded PDF.
- Never reuse previous output or previous client data.
- Detect bureau order from the current PDF.
- Verify every output item exists in the current PDF.
- Use first and last name only in the client header.
- Output section order must be client information, OPEN ACCOUNTS, LATE PAYMENTS, FOR DISPUTE.
- Hard inquiries must be inside FOR DISPUTE under the matching bureau.
- Hard inquiry dates must use M/D/YYYY.
- Open plus balance greater than zero is OPEN ACCOUNTS unless collection-only.
- Open plus confirmed late is LATE PAYMENTS.
- Closed, transferred, or sold plus confirmed late is FOR DISPUTE.
- Collection, charge-off, unpaid loss, bankruptcy, and public record are FOR DISPUTE.
- Open zero balance with no confirmed late and no severe derogatory status is SKIP.
- Comment-only delinquency does not create a LATE PAYMENT entry.
- Remove hard inquiries that strongly match OPEN ACCOUNTS.

## Coding rules

- Keep extraction logic deterministic and unit-testable.
- Do not hardcode one bureau order.
- Do not store secrets in the repo.
- Do not log full SSNs or sensitive full account values.
- Add regression tests for each rule.

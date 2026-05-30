# LetterGenerator

A DOCX automation workspace for connecting uploaded Word references to uploaded or pasted TXT source data.

## What this app does

- Upload completed DOCX reference documents by output type and round.
- Paste or upload structured TXT source data.
- Parse consumer information, dispute records, late payments and hard inquiries by bureau.
- Protect supplemental source fields such as phone, email and unmapped notes without silently deleting them.
- Generate bureau-specific DOCX letters only when matching data exists.
- Open a generated DOCX in a simple built-in editor for correction and formatting changes.
- Save edited DOCX files back into one final ZIP delivery package.

## Reference preservation rule

The uploaded DOCX reference is the source of truth for the generated document format. The generator changes detected variable regions while preserving surrounding document content and styling wherever it is not directly edited.

## Simple document editor

The output screen contains one primary **Edit Document** action for each generated letter. No external document server is required.

Editable controls:

- Paragraph text.
- Bold, italic and underline.
- Text color and text size.
- Left, center, right and justified alignment.
- Single, 1.15, 1.5 and double line spacing.
- Paragraph spacing after a selected block.
- Highlight selected legal text for manual review.
- **Page break before** for preventing a heading or section from being split at an unsuitable page boundary.
- Add or delete paragraphs.

Workflow:

1. Generate the output package.
2. Open **Outputs** and select **Edit Document** for a letter.
3. Select a paragraph and modify its text or formatting.
4. Use **Page break before** where a section heading should begin cleanly on the next page.
5. Select **Save to Package**.
6. Download the updated ZIP package.

### Editing boundary

This is a lightweight paragraph-level DOCX editor, not a Microsoft Word replacement. It is designed for corrections to generated letter text and basic paragraph styling. Complex Word elements such as tables, shapes, images, headers, footers, comments and tracked changes are not directly edited in this workspace.

## Non-destructive source normalization

The **Source Data** screen supports a safe normalization workflow. It distinguishes between data that may be inserted into the current generated letters and data that must be preserved for other documents or future mapping.

### Example: phone and email

A source file may contain:

```text
PHONE: 516-660-8573
EMAIL: veronicaj87@yahoo.com
```

These fields are recognized as supplemental client data. They are **not** inserted into a Dispute Letter automatically because the current dispute-letter output maps client name, address, DOB and SSN only. Phone and email remain preserved for another first-round document or a future template rule.

### Normalize review copy workflow

1. Upload the original TXT source.
2. Select **Normalize review copy**.
3. The system rebuilds a clearly structured working copy containing standardized identity, dispute, inquiry and late-payment sections.
4. Supplemental and unrecognized text is moved into a visible section named **PRESERVED SOURCE DATA - NOT INSERTED UNLESS A TEMPLATE MAPS IT**.
5. Select **Restore original source** at any time to return to the untouched input text.

The normalization action does not silently delete text. Excess or accidental entries remain visible for review instead of being injected into a letter without a mapping rule.

## Recommended TXT source structure

```text
NAME: CLIENT FULL NAME
ADDRESS: STREET ADDRESS
CITY, STATE ZIP
DOB: MM/DD/YYYY
SSN: XXX-XX-1234
PHONE: OPTIONAL SUPPLEMENTAL VALUE
EMAIL: OPTIONAL SUPPLEMENTAL VALUE

DISPUTE ACCOUNTS
TRANSUNION
Account Name: EXAMPLE BANK
Account Number: XXXX1234

HARD INQUIRIES
TRANSUNION
EXAMPLE LENDER - 08/08/2024

LATE PAYMENTS
EQUIFAX
Account Name: EXAMPLE AUTO
Account Number: XXXX5678
Late Payment: 30 Days Late - 01/2025
```

## Local application setup

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

## Output logic

Dispute and late-payment data create one matching document per bureau when source data for that output exists. Hard inquiries are retained per bureau as dispute-letter content. Empty categories are skipped. Supplemental or unmapped source content is preserved separately and is not used in output unless a document mapping is implemented for it.

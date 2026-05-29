# LetterGenerator

A DOCX automation workspace for connecting uploaded Word references to uploaded or pasted TXT source data.

## What this app does

- Upload completed DOCX reference documents by output type and round.
- Paste or upload structured TXT source data.
- Parse consumer information, dispute records, late payments and hard inquiries by bureau.
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
- Text color.
- Left, center, right and justified alignment.
- Single, 1.15, 1.5 and double line spacing.
- Add or delete paragraphs.

Workflow:

1. Generate the output package.
2. Open **Outputs** and select **Edit Document** for a letter.
3. Select a paragraph, modify text or basic formatting, and add/delete paragraphs when required.
4. Select **Save to Package**.
5. Download the updated ZIP package.

### Editing boundary

This is a lightweight paragraph-level DOCX editor, not a Microsoft Word replacement. It is designed for corrections to generated letter text and basic paragraph styling. Complex Word elements such as tables, shapes, images, headers, footers, comments and tracked changes are not directly edited in this workspace.

## Local application setup

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

## Output logic

Dispute and late-payment data create one matching document per bureau when source data for that output exists. Hard inquiries are retained per bureau as dispute-letter content. Empty categories are skipped.

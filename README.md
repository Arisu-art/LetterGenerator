# LetterGenerator

A browser-based document packet workspace that connects reusable DOCX/PDF references to normalized client TXT source data, produces editable review documents, and assembles final bureau-specific PDF packets.

## Active production workflow

**FTC Identity Theft Report generation is temporarily disabled and excluded from all active packet processing.** Existing FTC values in prior TXT input or browser storage are ignored by generation and finalization until a replacement approach is implemented.

### 1. Templates

Configure reusable packet files per round. Packet cards remain collapsed until opened.

| Packet position | Document | Required file type | Processing |
|---:|---|---|---|
| 01 | Dispute Letter | DOCX | Generated from source and editable before finalization |
| 02 | Supporting Documents | Uploaded in Source Data | One aligned evidence page inserted inside the letter |
| 03 | FCRA Legal Exhibit | PDF | Merged unchanged into final Dispute PDF |
| 04 | Affidavit | DOCX | Generated from source and editable before finalization |
| 05 | Attachment | PDF | Merged unchanged into final Dispute PDF |
| 01 | Late Payment Letter | DOCX | Generated from source and editable before finalization |
| 02 | Supporting Documents | Uploaded in Source Data | One aligned evidence page inserted inside the letter |

FCRA, Affidavit and Attachment are dispute-packet components only. They are not included in Late Payment outputs.

### 2. Source Data

Only two kinds of uploads belong in Source Data:

- The client TXT source.
- Client-specific Supporting Document images.

TXT input is normalized into a review copy. Supporting Document images are arranged vertically on one clean page and appended inside each generated letter when a matching bureau output exists.

### 3. Generate

Generation follows detected bureau routes only:

- A Dispute route prepares an editable Dispute Letter DOCX and, when configured, an editable Affidavit DOCX document.
- A Late Payment route prepares an editable Late Payment Letter DOCX.
- Supporting Documents do not create outputs by themselves.
- FTC data is not validated, mapped, generated, packaged, or finalized.

### 4. Outputs and finalization

Outputs are reviewed before final delivery:

- Open editable Dispute, Late Payment and Affidavit documents.
- Correct paragraph text and basic formatting.
- Display page boundaries and page-end lines while checking layout.
- Apply **Page break before** when a section must begin on the next page.
- Save edits back into the working ZIP package.
- Select **Finalize PDF Packets** to merge the final ordered PDF files.

## Final PDF order

### Dispute packet

```text
01 Dispute Letter       DOCX converted to PDF; includes Supporting Documents page
02 Supporting Documents One aligned page already inside the converted letter
03 FCRA                 Static PDF merged unchanged
04 Affidavit            Generated DOCX converted to PDF
05 Attachment           Static PDF merged unchanged
```

### Late Payment packet

```text
01 Late Payment Letter  DOCX converted to PDF; includes Supporting Documents page
02 Supporting Documents One aligned page already inside the converted letter
```

## Affidavit placeholder mappings

Affidavit DOCX templates are populated with `{{placeholder}}` values through Docxtemplater. Supported values include:

```text
{{consumer_name}}      {{client_name}}       {{name}}
{{address}}            {{address_line_1}}    {{address_line_2}}
{{dob}}                {{ssn}}               {{phone}}
{{email}}              {{date}}              {{letter_date}}
{{bureau_name}}        {{bureau_address}}
{{account_lines}}      {{hard_inquiry_lines}}
```

Repeat account rows using:

```text
{{#accounts}}
{{account_name}} - {{account_number}}
{{/accounts}}
```

Repeat inquiry rows using:

```text
{{#hard_inquiries}}
{{inquiry_line}}
{{/hard_inquiries}}
```

## Local setup

```bash
npm ci
npm run build
npm run dev -- --hostname 0.0.0.0 --port 3000
```

The locked dependency install is required after syncing changes because browser-side PDF finalization uses `pdf-lib` and `html2canvas`.

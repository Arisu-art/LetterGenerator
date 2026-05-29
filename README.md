# LetterGenerator

A DOCX automation workspace for connecting uploaded Word references to uploaded or pasted TXT source data.

## What this app does

- Upload completed DOCX reference documents by output type and round.
- Paste or upload structured TXT source data.
- Parse consumer information, dispute records, late payments and hard inquiries by bureau.
- Generate bureau-specific DOCX letters only when matching data exists.
- Review and edit each generated DOCX in an embedded word-processing workspace.
- Apply saved edits back into one final ZIP delivery package.

## Reference preservation rule

The uploaded DOCX reference is the source of truth for the generated document format. The generator changes detected variable regions while preserving the surrounding document layout and styling.

## Live DOCX editing

Generated output cards open the embedded ONLYOFFICE Docs editor. The user can edit document text, formatting, spacing, alignment and colors directly in the browser.

Workflow:

1. Generate the output package.
2. Open **Outputs** and select **Edit Document**.
3. Edit the DOCX inside the live editor.
4. Use the editor save command.
5. Select **Apply Saved Edits to Package**.
6. Download the updated ZIP package.

The document list does not provide per-document replacement or download controls; document corrections are performed inside the live editor.

## ONLYOFFICE configuration

The website requires an accessible ONLYOFFICE Docs Community Edition server. Configure a local `.env.local` file from `.env.example`:

```bash
cp .env.example .env.local
```

Required values:

```bash
LETTERGENERATOR_PUBLIC_URL=https://YOUR-LETTERGENERATOR-APP-URL
NEXT_PUBLIC_ONLYOFFICE_URL=https://YOUR-ONLYOFFICE-DOCS-URL
ONLYOFFICE_INTERNAL_URL=https://YOUR-ONLYOFFICE-DOCS-URL
ONLYOFFICE_JWT_SECRET=replace-with-a-long-random-secret
```

`LETTERGENERATOR_PUBLIC_URL` must be reachable by the ONLYOFFICE document server, because the editor loads a generated DOCX and posts saved document callbacks to this application. `ONLYOFFICE_JWT_SECRET` must match the JWT secret configured on the ONLYOFFICE server.

For local or Codespaces testing, run ONLYOFFICE Docs Community Edition on a second available port and expose both the application port and the document-server port before testing document editing.

## Local application setup

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

## Output logic

Dispute and late-payment data create one matching document per bureau when source data for that output exists. Hard inquiries are retained per bureau as dispute-letter content. Empty categories are skipped.

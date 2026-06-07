# Agent Instructions

**LetterGenerator** is a browser-based document operations platform. It normalizes client credit report data from TXT input, generates personalized dispute and late-payment letters, and assembles bureau-specific PDF packets for final delivery.

## Tech Stack

- **Next.js 16** App Router (all `'use client'` components — no SSR)
- **React 19** with hooks (no Redux; props-driven state management)
- **TypeScript 5.7** (strict mode, no `any`)
- **Custom CSS** (45 feature-scoped files, no Tailwind; CSS variables in [globals.css](app/globals.css))
- **DOCX Processing**: docxtemplater, pizzip, docx-preview
- **PDF Processing**: pdf-lib, pdfjs-dist
- **Storage**: IndexedDB (templates, client cases), LocalStorage (UI prefs)

## Project Structure

| Path | Purpose |
|------|---------|
| [app/](app/) | React components + layout + 45 CSS files (feature-scoped) |
| [components/](components/) | Main UI components; master state in [LetterGeneratorWorkspaceV2.tsx](components/LetterGeneratorWorkspaceV2.tsx) |
| [lib/](lib/) | Business logic: parsing, rendering, PDF assembly. 28 files organized by domain. See [lib/types.ts](lib/types.ts) for type definitions. |
| [docs/](docs/) | Detailed architecture, workflow rules, and performance guidance |

## Key Components & Patterns

**Architecture**: Multi-panel workspace (Templates → Source Data → Generate → Outputs → Settings) with centralized state and child components receiving props + callbacks.

**Master component**: [LetterGeneratorWorkspaceV2.tsx](components/LetterGeneratorWorkspaceV2.tsx) (550+ lines) holds all state and persists to IndexedDB/LocalStorage.

**Parsing engine**: [lib/letter-engine.ts](lib/letter-engine.ts) (500+ lines) uses deterministic regex to parse TXT source, detect bureaus, classify items, and return diagnostics.

**Document rendering**: 
- [lib/docx-renderer.ts](lib/docx-renderer.ts) — DOCX template substitution via docxtemplater
- [lib/final-pdf-packet.ts](lib/final-pdf-packet.ts) — PDF assembly (letter + exhibits + supporting docs per bureau)
- [lib/packet-renderer.ts](lib/packet-renderer.ts) — Image evidence → PDF via html2canvas + pdf-lib

**Error recovery**: [ApplicationRecoveryBoundary.tsx](components/ApplicationRecoveryBoundary.tsx) catches render failures.

## Active Workflow (See [docs/workflow-framework-v3-canvas.md](docs/workflow-framework-v3-canvas.md))

### 1. Templates
Configure reusable DOCX/PDF files per round (Dispute Letter, Affidavit, FCRA Exhibit, Late Payment Letter, etc.). Loaded into IndexedDB via [lib/template-exhibits.ts](lib/template-exhibits.ts).

### 2. Source Data
Upload client TXT (parsed into normalized credit data) + evidence images (arranged into one PDF page per bureau).

### 3. Generate
- Parse TXT → Detect bureaus (TRANSUNION, EQUIFAX, EXPERIAN) → Classify items (OPEN ACCOUNTS, LATE PAYMENTS, DISPUTE, HARD INQUIRIES)
- Detect letter routes (Dispute or Late Payment per bureau)
- Render DOCX templates with substituted client data
- Assemble optional exhibits (Affidavit, FCRA, etc.)

### 4. Outputs & Finalization
Edit generated letters (paragraph-level via [SimpleDocxEditor.tsx](components/SimpleDocxEditor.tsx)), preview PDF pages, assemble final packets, export as ZIP.

**Note**: FTC Identity Theft Report is currently disabled and excluded from all generation and finalization ([README.md](README.md)).

## Critical Conventions

### Deterministic Parsing (See [docs/EXTRACTION_RULES.md](docs/EXTRACTION_RULES.md))

- ✅ Every parse is fresh from current TXT (no reuse of prior output)
- ✅ Bureau order detected dynamically (not hardcoded in code)
- ✅ All items verified to exist in source (regex-validated)
- ✅ No SSN or full account logging; safe logging for PII
- ✅ Deterministic order (line-by-line, deduplicated by text)

### Component Naming & File Organization

- **Components**: PascalCase suffixed with intent: `*Workspace.tsx`, `*Editor.tsx`, `*Viewer.tsx`, `*Boundary.tsx`
- **Libraries**: kebab-case: `letter-engine.ts`, `final-pdf-packet.ts`, `workflow-execution.ts`
- **Types**: Prefixed with context: `Parsed*`, `*Diagnostic`, `*Route`, `*Item`
- **CSS**: Feature-scoped files imported in [app/layout.tsx](app/layout.tsx); no namespacing. Load order matters (last class wins).

### Type Safety

- All types defined in [lib/types.ts](lib/types.ts)
- Key unions: `Bureau` (TRANSUNION | EQUIFAX | EXPERIAN), `LetterType` (DISPUTE | LATE_PAYMENT), `ItemType` (DISPUTE_ACCOUNT, HARD_INQUIRY, LATE_PAYMENT)
- Record<Bureau, T> for parallel data by bureau

### State Management & Callbacks

- **State storage**: `useState` at top component, props drilled to children
- **Persistence**: IndexedDB (via [lib/reference-store.ts](lib/reference-store.ts), [lib/client-operations-store.ts](lib/client-operations-store.ts)), LocalStorage (workspace prefs)
- **Callbacks**: Passed via `useCallback` to avoid re-renders; naming pattern: `on<Action>` (e.g., `onStatusChange`, `onItemSelect`)
- **Memoization**: Heavy use of `useMemo` to prevent expensive re-renders

## Workflow Rules (Extraction & Routing)

See [docs/EXTRACTION_RULES.md](docs/EXTRACTION_RULES.md) for detailed rules. Key summary:

### Section Order (Output)
1. Client information
2. OPEN ACCOUNTS
3. LATE PAYMENTS
4. FOR DISPUTE (each bureau, hard inquiries nested)

### Open Accounts
- Open + balance > 0 → OPEN ACCOUNTS (unless collection-only)
- Open + zero balance + no late + no derogatory → SKIP

### Late Payments
- Confirmed by payment history or payment status → LATE PAYMENTS
- Comment-only delinquency → SKIP

### Dispute / Collections / Public Records
- Closed, transferred, sold + confirmed late → FOR DISPUTE
- Collection, charge-off, unpaid loss, bankruptcy, public record → FOR DISPUTE

### Hard Inquiries
- Placed under FOR DISPUTE, nested by bureau
- Remove if they strongly match an OPEN ACCOUNTS entry

## Development Workflow

### Scripts
```bash
npm run dev      # Next.js dev server (http://localhost:3000)
npm run build    # Type check + Next.js build
npm start        # Production server
```

### Build Configuration
- Server Action body limit: **25MB** ([next.config.mjs](next.config.mjs)) for large PDF/DOCX uploads
- TypeScript: Strict mode enabled, path alias `@/*` → `./src/*` (unused; code in `/lib`)
- No ESLint, Prettier, or Jest visible (add as needed)

### To Add Features

| Task | Location |
|------|----------|
| New data type | Add to [lib/types.ts](lib/types.ts); extend `ParsedSource` if persistent |
| New parsing rule | Extend regex in [lib/letter-engine.ts](lib/letter-engine.ts); add diagnostics |
| New panel | Create component in `/components`, add to `Panel` type in [LetterGeneratorWorkspaceV2.tsx](components/LetterGeneratorWorkspaceV2.tsx) |
| New DOCX template | Add `ExhibitKind` to [lib/template-exhibits.ts](lib/template-exhibits.ts); load via `loadTemplateExhibits()` |
| New CSS | Create feature file in `/app`, import in [app/layout.tsx](app/layout.tsx) |

### To Debug

- **"Source not parsing?"** → Check regex patterns and diagnostics in [lib/letter-engine.ts](lib/letter-engine.ts)
- **"Output missing?"** → Trace route detection (`detectRoutes()`) and generation flags in [lib/workflow-execution.ts](lib/workflow-execution.ts)
- **"PDF merge failing?"** → Check [lib/final-pdf-packet.ts](lib/final-pdf-packet.ts) and page count assumptions; see [docs/performance-architecture.md](docs/performance-architecture.md) for caching details
- **"DOCX template not rendering?"** → Verify placeholder names in [lib/docx-renderer.ts](lib/docx-renderer.ts) match data keys
- **"UI not updating?"** → Check [LetterGeneratorWorkspaceV2.tsx](components/LetterGeneratorWorkspaceV2.tsx) for `useEffect` dependencies and callback chain

## Coding Rules

- Keep extraction logic **deterministic and testable**
- Do not hardcode bureau order; detect dynamically
- Do not store secrets in repo
- Do not log full SSNs or full account numbers
- Add regression tests for each rule
- Use strict TypeScript (no `any`)
- Favor explicit types over inference
- Return diagnostics for invalid input (don't throw)

## Performance & Testing (See [docs/performance-architecture.md](docs/performance-architecture.md))

- DOCX render caching: intermediate PDF reused across packets
- Binary read caching: repeated loads share one ArrayBuffer
- Font embedding caching: fonts embedded once per packet
- Cooperative browser yielding: DOCX rendering yields between pages
- Automatic cache release: WeakMap allows GC when blobs unreferenced

**Validation before merge**: Test single-bureau and multi-bureau packets with optional/required components.

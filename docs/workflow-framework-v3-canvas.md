# Workflow Framework V3 — Platform Transformation Canvas

## Objective

Transform LetterGenerator from a browser-side feature collection into a reliable document operations platform with a single workflow contract, controlled execution, validated releases, and a disciplined UI system.

## Current failure diagnosis

The principal instability is not caused by Next.js or React being obsolete. The project already uses Next.js 16 and React 19. Failures occurred because workflow rules were copied across components and document stages:

- FTC remained represented in source input and UI logic after it was retired from final packet generation.
- Packet order text and position counts were repeated across Templates, Outputs, packet editing and PDF assembly.
- A duplicate PDF helper was added without becoming the active finalization route.
- Changes were merged without an automated build/type-check gate.
- Runtime UI failure had no application-level recovery surface.

## V3 foundation implemented in this change

| Area | V3 implementation | Outcome |
|---|---|---|
| Workflow contract | `lib/workflow-framework.ts` declares active packet order and disabled FTC capability | New surfaces consume one authoritative policy |
| FTC retirement | Source Data no longer presents FTC entry or validation; manual drafts omit FTC fields | Retired workflow no longer blocks or confuses users |
| Templates UI | Packet messaging and active insert list consume workflow policy | No active FTC template position |
| Outputs UI | Order display and position count consume workflow policy | Final review reflects actual packet delivery |
| Interface resilience | Root-level application recovery boundary | Unexpected render failures produce a recoverable screen |
| Product visibility | Platform Quality Canvas on dashboard | Operators can see active contract and improvement posture |
| Release quality | GitHub Actions quality gate with `npm ci`, TypeScript check and Next.js build | Regressions fail before merge |
| Finalization clarity | Removed unused alternate final-PDF helper | One active finalization implementation remains |

## Active packet contract

### Dispute Packet

1. Dispute Letter — generated DOCX converted to PDF.
2. Supporting Documents — evidence PDF included immediately after the letter.
3. FCRA Legal Exhibit — configured PDF insert.
4. Affidavit — generated DOCX converted to PDF.
5. Attachment — configured PDF insert.

FTC Identity Theft Report processing is disabled and excluded from the active packet contract until a replacement approach is designed and validated.

### Late Payment Packet

1. Late Payment Letter — generated DOCX converted to PDF.
2. Supporting Documents — evidence PDF included after the letter.

## Next-grade architecture roadmap

### Phase 2 — Generation domain service

Extract generation and finalization orchestration from `LetterGeneratorWorkspaceV2.tsx` into typed services:

- `DocumentGenerationJob` state model.
- `PacketAssemblyService` consuming `workflow-framework.ts` directly.
- Component surfaces that render state instead of owning business rules.
- Unit fixtures for ordered PDF parts and disabled components.

### Phase 3 — Design system consolidation

The stylesheet layer has accumulated many sequential overrides. Replace it with:

- A single application shell and page-header component.
- Design tokens for spacing, type, border, elevation and feedback state.
- Shared `Panel`, `StageHeader`, `StatusBadge`, `ActionBar` and `EmptyState` components.
- Removal of duplicate/retired stylesheet overrides once migrated.

### Phase 4 — Document processing isolation

Move computationally expensive transformation into an isolated execution model:

- Browser worker as the privacy-preserving first option.
- Typed progress events, cancellation and bounded concurrency.
- Automated fixture testing for DOCX-to-PDF and evidence packet ordering.
- A server-side durable worker only after encryption, access control and data retention requirements are approved.

## Engineering standard

Every future functional change should meet these gates before merge:

1. It uses the authoritative workflow policy instead of recreating document order locally.
2. It does not restore a disabled capability through hidden UI, stored metadata, or output logic.
3. It passes automated TypeScript and production-build validation.
4. It provides a recoverable, actionable user state for any failure introduced by the workflow.

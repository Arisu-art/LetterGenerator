# Packet rendering performance architecture

## Current framework position

LetterGenerator already runs on Next.js 16 and React 19. For browser-based DOCX/PDF assembly, upgrading the JavaScript framework itself does not remove the primary cost: rasterizing reusable DOCX components and repeatedly loading binary packet assets for each bureau output.

## Implemented execution upgrade

The PDF assembly engine now uses an asset-reuse pipeline designed for large multi-bureau workloads:

- **DOCX render caching:** a document `Blob` is rasterized to an intermediate PDF once, then copied into each packet that reuses it. This is especially important for shared Affidavit and FTC report documents.
- **Binary read caching:** repeat loads of the same uploaded PDF or generated intermediate PDF reuse one `ArrayBuffer` read.
- **Font embedding caching:** generated blank/placeholder pages embed Helvetica fonts only once per assembled packet.
- **Cooperative browser yielding:** DOCX page rasterization yields between pages so long documents do not monopolize the browser event loop.
- **Automatic cache release:** `WeakMap` keys allow cached data to be garbage collected when uploaded/generated document blobs are no longer referenced.

## Why this approach

Multi-bureau finalization reuses the same appendices across multiple packets. Re-rendering every shared DOCX per packet multiplies the most expensive browser operation. Reuse improves throughput and responsiveness while preserving packet order, validation, and final PDF semantics.

## Validation focus

Before merging, validate in the browser with:

1. A single-bureau dispute packet containing Affidavit and FTC DOCX components.
2. A three-bureau dispute packet that reuses the same Affidavit and FTC components.
3. Missing optional components in preview mode to confirm placeholder-page generation.
4. Missing required components in final-delivery mode to confirm strict validation errors remain intact.

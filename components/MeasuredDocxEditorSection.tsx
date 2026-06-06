'use client';

import DocxProofPreview from './DocxProofPreview';
import type { ReviewOutput } from './OutputReviewWorkspace';

type Props = { label: string; slotId: string; output: ReviewOutput; onSave: (output: ReviewOutput, file: File) => void | Promise<void> };

/**
 * Packet Editor DOCX review surface.
 *
 * The DOCX itself remains the source of truth and the downloaded file remains editable
 * in Word-compatible tools. Inside the browser workspace, the only visual document
 * surface is the live PDF proof rendered from the generated DOCX binary. This avoids
 * the previous strict-canvas/editor loop where browser HTML attempted to impersonate
 * Word layout and introduced page-boundary, hook, and save-state failures.
 */
export default function MeasuredDocxEditorSection({ label, slotId, output }: Props) {
  return <article className="packet-focus-section packet-stack-editable docx-proof-only-editor" data-slot={slotId}>
    <DocxProofPreview output={output} label={label} />
  </article>;
}

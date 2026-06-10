'use client';

import { useRef, useState } from 'react';
import {
  createWorkspaceSnapshot,
  importWorkspaceSnapshot,
  parseWorkspaceSnapshotFile,
  workspaceSnapshotName
} from '../lib/workspace-snapshot';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterReference, Round } from '../lib/reference-store';
import type { TemplateExhibits } from '../lib/template-exhibits';
import type { WorkspacePreferences } from '../lib/workspace-preferences';

type StatusTone = 'info' | 'success' | 'error';

type Props = {
  round: Round;
  caseId: string;
  clientName: string;
  source: string;
  originalSource: string;
  normalized: boolean;
  preferences: WorkspacePreferences;
  disabled?: boolean;
  onImported: (value: {
    round: Round;
    caseId: string;
    source: string;
    originalSource: string;
    normalized: boolean;
    references: LetterReference[];
    templates: TemplateExhibits;
    evidence: PacketAssets;
    notices: string[];
  }) => void;
  onMessage: (message: string, tone?: StatusTone) => void;
};

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function WorkspacePortabilityPanel(props: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportWorkspace() {
    if (!props.source.trim()) {
      props.onMessage('Load source data before exporting a workspace snapshot.', 'error');
      return;
    }

    setBusy(true);
    try {
      const snapshot = await createWorkspaceSnapshot({
        round: props.round,
        caseId: props.caseId,
        source: props.source,
        originalSource: props.originalSource,
        normalized: props.normalized,
        preferences: props.preferences
      });
      downloadJson(workspaceSnapshotName(props.clientName, props.round), snapshot);
      props.onMessage('Workspace snapshot exported. Import this file on another device to reproduce the same templates, source data, and evidence layout.', 'success');
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : 'Workspace export failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function importWorkspace(file: File | null) {
    if (!file) return;

    setBusy(true);
    try {
      const snapshot = await parseWorkspaceSnapshotFile(file);
      const result = await importWorkspaceSnapshot(snapshot);
      props.onImported(result);
      props.onMessage([
        'Workspace snapshot imported. This device now uses the same source data, templates, and evidence layout from the exported device.',
        ...result.notices
      ].join(' '), result.notices.length ? 'info' : 'success');
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : 'Workspace import failed.', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return <section className="panel workspace-portability-panel">
    <div>
      <p className="eyebrow">Device consistency</p>
      <h2>Workspace Snapshot</h2>
      <p>Export or import the browser-local workspace state so another computer uses the same round, source data, uploaded templates, supporting documents, and saved evidence layout.</p>
    </div>
    <div className="workspace-portability-actions">
      <button type="button" className="secondary-button" disabled={busy || props.disabled} onClick={() => void exportWorkspace()}>{busy ? 'Working…' : 'Export Workspace Snapshot'}</button>
      <button type="button" className="action-button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Working…' : 'Import Workspace Snapshot'}</button>
      <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importWorkspace(event.target.files?.[0] || null)} />
    </div>
  </section>;
}

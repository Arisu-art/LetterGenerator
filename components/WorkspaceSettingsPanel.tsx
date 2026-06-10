'use client';

import { useState } from 'react';
import { rounds, type Round } from '../lib/reference-store';
import type { WorkspacePreferences } from '../lib/workspace-preferences';

type Props = {
  preferences: WorkspacePreferences;
  caseCount: number;
  filingCount: number;
  onChange: (next: WorkspacePreferences) => void;
  onExportRecords: () => void;
  onClearRecords: () => void;
};

function Toggle({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return <label className="settings-toggle">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className="settings-switch" aria-hidden="true" />
    <span className="settings-toggle-copy"><strong>{title}</strong><small>{description}</small></span>
  </label>;
}

export default function WorkspaceSettingsPanel({ preferences, caseCount, filingCount, onChange, onExportRecords, onClearRecords }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  function update(values: Partial<WorkspacePreferences>) { onChange({ ...preferences, ...values }); }

  return <section className="settings-workspace operations-workspace">
    <section className="panel settings-command">
      <div className="settings-command-copy">
        <p className="eyebrow">Workspace Vault</p>
        <h2>Device-safe workspace controls</h2>
        <p>Keep round defaults, local records, and device transfer controls in one minimal place.</p>
      </div>
      <div className="settings-summary">
        <span><strong>{preferences.defaultRound}</strong><small>Default round</small></span>
        <span><strong>{caseCount}</strong><small>Case records</small></span>
        <span><strong>{filingCount}</strong><small>Delivery records</small></span>
      </div>
    </section>

    <div className="settings-grid">
      <section className="panel settings-group">
        <header><p className="eyebrow">Production defaults</p><h3>Case startup rules</h3></header>
        <div className="settings-required-rule">
          <strong>Template authority</strong>
          <p>The latest uploaded template controls document layout. The app only maps source data into the detected sections.</p>
          <span>Automatic</span>
        </div>
        <label className="settings-select">
          <span><strong>Default round for new cases</strong><small>Used when the operator starts a fresh client workspace.</small></span>
          <select value={preferences.defaultRound} onChange={(event) => update({ defaultRound: event.target.value as Round })}>
            {rounds.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <Toggle checked={preferences.strictValidation} onChange={(checked) => update({ strictValidation: checked })} title="Strict readiness checks" description="Require every checklist item before package generation." />
        <Toggle checked={preferences.openTrackerAfterFinalization} onChange={(checked) => update({ openTrackerAfterFinalization: checked })} title="Open Delivery Center after package completion" description="Move directly to delivery handoff when final package preparation is complete." />
      </section>

      <section className="panel settings-group settings-privacy">
        <header><p className="eyebrow">Local vault</p><h3>Records and transfer</h3></header>
        <div className="settings-privacy-notice">
          <strong>Browser-local storage</strong>
          <p>Templates and source files live on this device unless exported through a workspace snapshot. Export records only includes operational metadata.</p>
        </div>
        <button type="button" className="settings-record-action" onClick={onExportRecords}>
          <div><strong>Export operational records</strong><small>Download case and delivery metadata for review or backup.</small></div><span>Export</span>
        </button>
        {!confirmClear ? <button type="button" className="settings-record-action danger" onClick={() => setConfirmClear(true)}>
          <div><strong>Clear local operation history</strong><small>Remove case and delivery records without removing uploaded templates.</small></div><span>Clear</span>
        </button> : <div className="settings-clear-confirm">
          <strong>Clear all local case and delivery records?</strong>
          <p>This does not remove uploaded templates, source data, or evidence files.</p>
          <div><button type="button" className="secondary-button" onClick={() => setConfirmClear(false)}>Cancel</button><button type="button" className="danger-button" onClick={() => { onClearRecords(); setConfirmClear(false); }}>Clear Records</button></div>
        </div>}
      </section>
    </div>
  </section>;
}

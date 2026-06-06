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

function Toggle({
  checked,
  onChange,
  title,
  description
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="settings-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="settings-switch" aria-hidden="true" />
      <span className="settings-toggle-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

export default function WorkspaceSettingsPanel({
  preferences,
  caseCount,
  filingCount,
  onChange,
  onExportRecords,
  onClearRecords
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  function update(values: Partial<WorkspacePreferences>) {
    onChange({ ...preferences, ...values });
  }

  return (
    <section className="settings-workspace operations-workspace">
      <section className="panel settings-command">
        <div className="settings-command-copy">
          <p className="eyebrow">Workspace control</p>
          <h2>Workflow defaults and privacy</h2>
          <p>Control validation, delivery routing, and local operational records.</p>
        </div>

        <div className="settings-summary">
          <span>
            <strong>{caseCount}</strong>
            <small>Case records</small>
          </span>
          <span>
            <strong>{filingCount}</strong>
            <small>Filing records</small>
          </span>
        </div>
      </section>

      <div className="settings-grid">
        <section className="panel settings-group">
          <header>
            <p className="eyebrow">Workflow defaults</p>
            <h3>Packet production</h3>
          </header>

          <div className="settings-required-rule">
            <strong>Client-facing package flow</strong>
            <p>Generated packets stay in the live-proof review flow before ordered ZIP delivery.</p>
            <span>Production mode</span>
          </div>

          <label className="settings-select">
            <span>
              <strong>Default filing round</strong>
              <small>Applied when starting a new client case.</small>
            </span>
            <select value={preferences.defaultRound} onChange={(event) => update({ defaultRound: event.target.value as Round })}>
              {rounds.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <Toggle
            checked={preferences.strictValidation}
            onChange={(checked) => update({ strictValidation: checked })}
            title="Strict template validation"
            description="Keep disabled for client-facing workflow unless template enforcement is required."
          />

          <Toggle
            checked={preferences.openTrackerAfterFinalization}
            onChange={(checked) => update({ openTrackerAfterFinalization: checked })}
            title="Open Filing Tracker after finalization"
            description="Move directly to delivery tracking after packet finalization."
          />
        </section>

        <section className="panel settings-group settings-privacy">
          <header>
            <p className="eyebrow">Privacy and records</p>
            <h3>Local operational history</h3>
          </header>

          <div className="settings-privacy-notice">
            <strong>Metadata only</strong>
            <p>Case and filing history stores client name, status, round, and delivery dates locally. Raw source TXT and document file contents are not included in records export.</p>
          </div>

          <button type="button" className="settings-record-action" onClick={onExportRecords}>
            <div>
              <strong>Export records</strong>
              <small>Download local case and filing metadata as JSON.</small>
            </div>
            <span>Export</span>
          </button>

          {!confirmClear ? (
            <button type="button" className="settings-record-action danger" onClick={() => setConfirmClear(true)}>
              <div>
                <strong>Clear operational history</strong>
                <small>Remove local case and filing tracker records.</small>
              </div>
              <span>Clear</span>
            </button>
          ) : (
            <div className="settings-clear-confirm">
              <strong>Clear all local case and filing records?</strong>
              <p>This does not remove configured templates.</p>
              <div>
                <button type="button" className="secondary-button" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    onClearRecords();
                    setConfirmClear(false);
                  }}
                >
                  Clear Records
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

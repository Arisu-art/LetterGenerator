import type { Round } from './reference-store';

export type WorkspacePreferences = {
  defaultRound: Round;
  strictValidation: boolean;
  openTrackerAfterFinalization: boolean;
};

const KEY = 'lettergenerator-workspace-preferences-v1';
export const defaultWorkspacePreferences: WorkspacePreferences = {
  defaultRound: '1st Round',
  strictValidation: false,
  openTrackerAfterFinalization: false
};

export function loadWorkspacePreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return defaultWorkspacePreferences;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<WorkspacePreferences>;
    return {
      defaultRound: saved.defaultRound || defaultWorkspacePreferences.defaultRound,
      strictValidation: Boolean(saved.strictValidation),
      openTrackerAfterFinalization: Boolean(saved.openTrackerAfterFinalization)
    };
  } catch {
    return defaultWorkspacePreferences;
  }
}

export function saveWorkspacePreferences(preferences: WorkspacePreferences) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(preferences));
  return preferences;
}

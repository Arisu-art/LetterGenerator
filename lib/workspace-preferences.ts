import type { Round } from './reference-store';

export type WorkspacePreferences = {
  defaultRound: Round;
  strictValidation: boolean;
  requireEvidenceForFinalPdf: boolean;
  openTrackerAfterFinalization: boolean;
};

const KEY = 'lettergenerator-workspace-preferences-v1';
export const defaultWorkspacePreferences: WorkspacePreferences = {
  defaultRound: '1st Round',
  strictValidation: false,
  requireEvidenceForFinalPdf: false,
  openTrackerAfterFinalization: false
};

export function loadWorkspacePreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return defaultWorkspacePreferences;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<WorkspacePreferences>;
    return { ...defaultWorkspacePreferences, ...saved };
  } catch {
    return defaultWorkspacePreferences;
  }
}

export function saveWorkspacePreferences(preferences: WorkspacePreferences) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(preferences));
  return preferences;
}

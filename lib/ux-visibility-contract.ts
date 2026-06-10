export type UxPanel = 'Dashboard' | 'Templates' | 'Source Data' | 'Outputs' | 'Filing Tracker' | 'Settings';
export type UxTone = 'info' | 'success' | 'error';

export type UxVisibilityInput = {
  panel: UxPanel;
  statusTone: UxTone;
  hasSource: boolean;
  hasPreflightBlockers: boolean;
  hasPreflightWarnings: boolean;
  generateAttempted: boolean;
  busy: boolean;
  hasGeneratedOutput: boolean;
};

export type UxVisibilityRules = {
  showHeaderNextAction: boolean;
  showStatusText: boolean;
  showPreflightPanel: boolean;
  showOutputWarnings: boolean;
  showBusyState: boolean;
  allowGlobalWarningSurface: boolean;
  compressEmptyAssetContainers: boolean;
  hideSecondaryManagementTools: boolean;
};

export function resolveUxVisibility(input: UxVisibilityInput): UxVisibilityRules {
  const blockedAfterGenerate = input.generateAttempted && input.statusTone === 'error' && input.hasPreflightBlockers;
  const reviewNeededAfterGenerate = input.generateAttempted && input.statusTone === 'error' && input.hasPreflightWarnings;

  return {
    showHeaderNextAction: true,
    showStatusText: input.statusTone === 'success' || input.statusTone === 'error' || input.busy,
    showPreflightPanel: input.panel === 'Source Data' && input.hasSource && (blockedAfterGenerate || reviewNeededAfterGenerate),
    showOutputWarnings: input.panel === 'Outputs' && input.hasGeneratedOutput,
    showBusyState: input.busy,
    allowGlobalWarningSurface: false,
    compressEmptyAssetContainers: true,
    hideSecondaryManagementTools: true
  };
}

export function shouldKeepMainLayoutQuiet(rules: UxVisibilityRules) {
  return !rules.showStatusText && !rules.showPreflightPanel && !rules.showBusyState;
}

export function shouldRevealPreflightAfterAction(rules: UxVisibilityRules) {
  return rules.showPreflightPanel;
}

export type UiMessageTone = 'info' | 'success' | 'error';

export type UiMessage = {
  title: string;
  detail: string;
  actionLabel?: string;
  targetPanel?: 'Dashboard' | 'Templates' | 'Source Data' | 'Outputs' | 'Filing Tracker' | 'Settings';
};

const copyRules: Array<[RegExp, UiMessage]> = [
  [/hydrating|populating data|array processing/i, { title: 'Assembling workspace', detail: 'Finalizing document layout.' }],
  [/validation failed|null string|empty variable/i, { title: 'Action required', detail: 'Preflight checklist incomplete.', actionLabel: 'Review checklist', targetPanel: 'Source Data' }],
  [/fetching payload|executing server action/i, { title: 'Updating workspace', detail: 'Preparing workspace.' }],
  [/loop error|deduplication/i, { title: 'Cross-bureau verification', detail: 'Document alignment sync is being reviewed.' }],
  [/array mapping|rendering list element/i, { title: 'Itemized breakdown', detail: 'Records view updated.' }],
  [/terminal error|object mutation exception/i, { title: 'Workspace updating', detail: 'Please refresh the page.', actionLabel: 'Refresh page' }],
  [/timed out/i, { title: 'Workspace needs another moment', detail: 'Please try again. The document package may need more time to prepare.', actionLabel: 'Try again', targetPanel: 'Source Data' }],
  [/missing|required component|could not be generated|source data is not ready|preflight/i, { title: 'Required information missing', detail: 'Please ensure your profile checklist is fully configured to generate this document suite.', actionLabel: 'Review checklist', targetPanel: 'Source Data' }],
  [/failed|error|exception|unavailable|cannot|could not/i, { title: 'Action could not be completed', detail: 'Review the required workspace items, then try again.', actionLabel: 'Review workspace', targetPanel: 'Source Data' }]
];

export function userFacingMessage(raw: string, tone: UiMessageTone = 'info'): UiMessage {
  const value = raw.trim();
  const matched = copyRules.find(([pattern]) => pattern.test(value));
  if (matched) return matched[1];
  if (tone === 'success') return { title: value, detail: 'You can continue to the next step.' };
  if (tone === 'error') return { title: 'Action required', detail: value || 'Review the workspace and try again.', actionLabel: 'Review workspace', targetPanel: 'Source Data' };
  return { title: value || 'Workspace ready', detail: 'Continue with the next available step.' };
}

export function userFacingText(raw: string, tone: UiMessageTone = 'info') {
  const message = userFacingMessage(raw, tone);
  return message.detail ? `${message.title}: ${message.detail}` : message.title;
}

export function recoveryPanelForMessage(raw: string) {
  return userFacingMessage(raw, 'error').targetPanel;
}

export type UiMessageTone = 'info' | 'success' | 'warning' | 'error';

export type UiMessageCode =
  | 'WORKSPACE_EXPORTED'
  | 'WORKSPACE_IMPORTED'
  | 'SOURCE_IMPORTED'
  | 'SOURCE_STANDARDIZED'
  | 'TEMPLATE_MISSING'
  | 'TEMPLATE_UPLOADED'
  | 'EVIDENCE_MISSING'
  | 'PREFLIGHT_BLOCKED'
  | 'GENERATION_STARTED'
  | 'GENERATION_READY'
  | 'GENERATION_FAILED'
  | 'PACKET_REBUILT'
  | 'DOWNLOAD_READY'
  | 'UNKNOWN';

export type UiMessage = {
  code: UiMessageCode;
  tone: UiMessageTone;
  title: string;
  body: string;
  action?: string;
};

type UiMessageInput = {
  code?: UiMessageCode;
  raw?: string;
  detail?: string;
};

const rules: Array<{ pattern: RegExp; message: UiMessage }> = [
  {
    pattern: /DOCX reference is missing|letter template/i,
    message: { code: 'TEMPLATE_MISSING', tone: 'error', title: 'Template needed', body: 'Upload the required letter template before generating.', action: 'Open Templates' }
  },
  {
    pattern: /Required Templates items|Missing required packet item|AFFIDAVIT|FCRA|ATTACHMENT|FTC/i,
    message: { code: 'TEMPLATE_MISSING', tone: 'error', title: 'Packet template needed', body: 'Add the missing packet templates to complete this workflow.', action: 'Open Templates' }
  },
  {
    pattern: /supporting document|evidence/i,
    message: { code: 'EVIDENCE_MISSING', tone: 'error', title: 'Supporting documents needed', body: 'Add at least one supporting document image before generating.', action: 'Add Evidence' }
  },
  {
    pattern: /Generation blocked|Generation stopped|preflight|not ready/i,
    message: { code: 'PREFLIGHT_BLOCKED', tone: 'error', title: 'Packet is not ready yet', body: 'Complete the highlighted readiness items before generating.', action: 'Review Readiness' }
  },
  {
    pattern: /generation failed|Ordered package generation failed|timed out/i,
    message: { code: 'GENERATION_FAILED', tone: 'error', title: 'Generation failed', body: 'The packet could not be generated. Review the listed issue and try again.' }
  },
  {
    pattern: /ready for review|package is ready|Complete ordered packet/i,
    message: { code: 'GENERATION_READY', tone: 'success', title: 'Packet ready', body: 'The ordered packet package is ready for live proofing and download.', action: 'Review Outputs' }
  },
  {
    pattern: /Workspace snapshot imported/i,
    message: { code: 'WORKSPACE_IMPORTED', tone: 'success', title: 'Workspace restored', body: 'This device now uses the imported source data, templates, and evidence layout.' }
  },
  {
    pattern: /Workspace snapshot exported/i,
    message: { code: 'WORKSPACE_EXPORTED', tone: 'success', title: 'Workspace exported', body: 'Save this snapshot so another device can reproduce the same output.' }
  }
];

const catalog: Record<UiMessageCode, UiMessage> = {
  WORKSPACE_EXPORTED: { code: 'WORKSPACE_EXPORTED', tone: 'success', title: 'Workspace exported', body: 'Save this snapshot so another device can reproduce the same output.' },
  WORKSPACE_IMPORTED: { code: 'WORKSPACE_IMPORTED', tone: 'success', title: 'Workspace restored', body: 'This device now uses the imported source data, templates, and evidence layout.' },
  SOURCE_IMPORTED: { code: 'SOURCE_IMPORTED', tone: 'success', title: 'Source data imported', body: 'The source data is standardized and ready for review.' },
  SOURCE_STANDARDIZED: { code: 'SOURCE_STANDARDIZED', tone: 'success', title: 'Source data standardized', body: 'The working source draft has been cleaned and protected.' },
  TEMPLATE_MISSING: { code: 'TEMPLATE_MISSING', tone: 'error', title: 'Template needed', body: 'Upload the required template before generating.', action: 'Open Templates' },
  TEMPLATE_UPLOADED: { code: 'TEMPLATE_UPLOADED', tone: 'success', title: 'Template saved', body: 'The template has been added to the active workflow.' },
  EVIDENCE_MISSING: { code: 'EVIDENCE_MISSING', tone: 'error', title: 'Supporting documents needed', body: 'Add at least one supporting document image before generating.', action: 'Add Evidence' },
  PREFLIGHT_BLOCKED: { code: 'PREFLIGHT_BLOCKED', tone: 'error', title: 'Packet is not ready yet', body: 'Complete the highlighted readiness items before generating.', action: 'Review Readiness' },
  GENERATION_STARTED: { code: 'GENERATION_STARTED', tone: 'info', title: 'Generating packet', body: 'The ordered packet package is being prepared.' },
  GENERATION_READY: { code: 'GENERATION_READY', tone: 'success', title: 'Packet ready', body: 'The ordered packet package is ready for live proofing and download.', action: 'Review Outputs' },
  GENERATION_FAILED: { code: 'GENERATION_FAILED', tone: 'error', title: 'Generation failed', body: 'The packet could not be generated. Review the listed issue and try again.' },
  PACKET_REBUILT: { code: 'PACKET_REBUILT', tone: 'success', title: 'Package updated', body: 'Your edits were saved and the ordered package was rebuilt.' },
  DOWNLOAD_READY: { code: 'DOWNLOAD_READY', tone: 'success', title: 'Download ready', body: 'The ordered ZIP package is ready to download.' },
  UNKNOWN: { code: 'UNKNOWN', tone: 'info', title: 'Update', body: 'The workflow status was updated.' }
};

export function userMessage(input: UiMessageInput): UiMessage {
  if (input.code) {
    const base = catalog[input.code] || catalog.UNKNOWN;
    return input.detail ? { ...base, body: input.detail } : base;
  }

  const raw = input.raw || '';
  const matched = rules.find((rule) => rule.pattern.test(raw));
  if (matched) {
    return input.detail ? { ...matched.message, body: input.detail } : matched.message;
  }

  return { code: 'UNKNOWN', tone: 'info', title: 'Workflow update', body: raw || catalog.UNKNOWN.body };
}

export function userMessageText(input: UiMessageInput) {
  const message = userMessage(input);
  return `${message.title}: ${message.body}`;
}

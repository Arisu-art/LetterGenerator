import type { LetterRoute, ParsedSource } from './letter-engine';
import type { TemplateFieldContract } from './template-contracts';

export type SourceReadinessState = {
  hasSource: boolean;
  identityReady: boolean;
  routeReady: boolean;
  customReady: boolean;
  standardizedReady: boolean;
  canAutoStandardize: boolean;
  canLock: boolean;
  badge: 'Standardized draft' | 'Ready to standardize' | 'Editing draft';
  badgeTone: 'success' | 'warning' | 'neutral';
  summary: string;
  lockButtonLabel: string;
  lockBlockedMessage: string;
  sourceStatusDetail: string;
};

type Args = {
  source: string;
  normalized: boolean;
  parsed: ParsedSource;
  routes: LetterRoute[];
  customFields: TemplateFieldContract[];
};

export function evaluateSourceReadiness({ source, normalized, parsed, routes, customFields }: Args): SourceReadinessState {
  const hasSource = Boolean(source.trim());
  const identityReady = Boolean(parsed.name.trim());
  const routeReady = routes.length > 0;
  const customReady = customFields.every((field) => !field.required || Boolean(parsed.templateFields[field.key]?.trim()));
  const standardizedReady = Boolean(normalized && identityReady);
  const canAutoStandardize = Boolean(hasSource && !normalized && identityReady && routeReady);
  const canLock = Boolean((standardizedReady || canAutoStandardize) && routeReady && customReady);
  const missing = [
    !hasSource ? 'Add or import source TXT.' : '',
    hasSource && !identityReady ? 'Client name was not detected.' : '',
    hasSource && identityReady && !routeReady ? 'No dispute or late-payment route was detected.' : '',
    !customReady ? 'Required template fields are incomplete.' : ''
  ].filter(Boolean);
  return {
    hasSource,
    identityReady,
    routeReady,
    customReady,
    standardizedReady,
    canAutoStandardize,
    canLock,
    badge: standardizedReady ? 'Standardized draft' : canAutoStandardize ? 'Ready to standardize' : 'Editing draft',
    badgeTone: standardizedReady ? 'success' : canAutoStandardize ? 'warning' : 'neutral',
    summary: canLock
      ? canAutoStandardize
        ? 'Lock will standardize the working draft and continue.'
        : 'Working draft is standardized and ready to lock.'
      : missing.join(' '),
    lockButtonLabel: canAutoStandardize ? 'Standardize & Lock Source Data' : 'Lock Source Data',
    lockBlockedMessage: missing[0] || 'Source prerequisites are incomplete.',
    sourceStatusDetail: standardizedReady ? 'Ready for validation' : canAutoStandardize ? 'Parsed and ready to lock' : 'Standardize after editing'
  };
}

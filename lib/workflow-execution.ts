import type { LetterRoute, LetterType } from './letter-engine';
import { isFeatureEnabled } from './feature-flags';
import { packetOrderText } from './workflow-framework';

export type GeneratedLetterRecord = {
  type: LetterType;
  bureau: string;
  role?: string;
};
export type RouteExecutionRecord = {
  key: string;
  type: LetterType;
  bureau: string;
  label: string;
  order: string;
  generated: boolean;
};
export type RouteCoverage = {
  expected: number;
  generated: number;
  complete: boolean;
  routes: RouteExecutionRecord[];
  missing: RouteExecutionRecord[];
};

type Diagnostic = { level?: string; message: string };

export function routeKey(type: LetterType, bureau: string) {
  return `${type}:${bureau}`;
}

export function assessRouteCoverage(routes: LetterRoute[], documents: GeneratedLetterRecord[]): RouteCoverage {
  const generatedKeys = new Set(
    documents
      .filter((document) => !document.role || document.role === 'LETTER')
      .map((document) => routeKey(document.type, document.bureau))
  );
  const planned = routes.map((route) => {
    const generated = generatedKeys.has(routeKey(route.type, route.bureau));
    return {
      key: routeKey(route.type, route.bureau),
      type: route.type,
      bureau: route.bureau,
      label: route.type === 'DISPUTE' ? 'Dispute Letter' : 'Late Payment Letter',
      order: packetOrderText(route.type),
      generated
    };
  });
  const missing = planned.filter((route) => !route.generated);
  return { expected: planned.length, generated: planned.length - missing.length, complete: planned.length > 0 && missing.length === 0, routes: planned, missing };
}

export function activeWorkflowDiagnostics(diagnostics: Diagnostic[]) {
  return diagnostics.filter((diagnostic) => isFeatureEnabled('FTC_IDENTITY_THEFT_REPORT') || !/\bFTC\b|identity\s+theft\s+report|affected\s+accounts?/i.test(diagnostic.message));
}

export function requiredGenerationFailureMessage(coverage: RouteCoverage, detail?: string) {
  const missing = coverage.missing.map((route) => `${route.bureau} ${route.label}`).join(', ');
  const suffix = detail ? ` ${detail}` : '';
  return `Generation stopped. Required output${coverage.missing.length === 1 ? '' : 's'} not created: ${missing}.${suffix}`;
}

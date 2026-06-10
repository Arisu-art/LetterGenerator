'use client';

import type { GenerationPreflightResult, PreflightCheck } from '../lib/preflight-validation';

type Props = {
  result: GenerationPreflightResult;
};

function tone(check: PreflightCheck) {
  if (check.severity === 'pass') return 'success';
  if (check.severity === 'warning') return 'warning';
  return 'error';
}

function marker(check: PreflightCheck) {
  if (check.severity === 'pass') return '✓';
  if (check.severity === 'warning') return '!';
  return 'x';
}

export default function GenerationPreflightChecklist({ result }: Props) {
  const blockers = result.blockers.length;
  const warnings = result.warnings.length;
  let instruction = 'Your workspace has the required items for this document suite.';
  if (!result.ready && blockers) instruction = `${blockers} checklist item${blockers === 1 ? '' : 's'} need attention before the package can be prepared.`;
  if (!result.ready && !blockers) instruction = `${warnings} item${warnings === 1 ? '' : 's'} should be reviewed before continuing.`;

  return <section className="panel generation-preflight-checklist" data-ready={result.ready ? 'true' : 'false'}>
    <div>
      <p className="eyebrow">Readiness checklist</p>
      <h2>{result.ready ? 'Ready to prepare package' : 'Action required before preparing package'}</h2>
      <p>{instruction}</p>
    </div>
    <div className="preflight-check-grid">
      {result.checks.map((check) => <article className={`preflight-check ${tone(check)}`} key={check.id}>
        <strong><span aria-hidden="true">{marker(check)}</span> {check.label}</strong>
        <p>{check.detail}</p>
      </article>)}
    </div>
  </section>;
}

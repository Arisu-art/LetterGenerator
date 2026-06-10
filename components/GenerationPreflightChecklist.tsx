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
  return '×';
}

export default function GenerationPreflightChecklist({ result }: Props) {
  return <section className="panel generation-preflight-checklist" data-ready={result.ready ? 'true' : 'false'}>
    <div>
      <p className="eyebrow">Preflight validation</p>
      <h2>{result.ready ? 'Generation Ready' : 'Generation Blocked'}</h2>
      <p>{result.summary}</p>
    </div>
    <div className="preflight-check-grid">
      {result.checks.map((check) => <article className={`preflight-check ${tone(check)}`} key={check.id}>
        <strong><span aria-hidden="true">{marker(check)}</span> {check.label}</strong>
        <p>{check.detail}</p>
      </article>)}
    </div>
  </section>;
}

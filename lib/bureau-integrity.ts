export type BureauIntegrityInput = { bureauName: string; bureauAddressLines: string[] };

function canonical(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export function bureauIntegrityTokens(input: BureauIntegrityInput) {
  const name = canonical(input.bureauName);
  const identity = name.includes('TRANSUNION') ? 'TRANSUNION' : name.includes('EQUIFAX') ? 'EQUIFAX' : name.includes('EXPERIAN') ? 'EXPERIAN' : name;
  const addressTokens = input.bureauAddressLines.map(canonical).filter((line) => line.length >= 5).slice(0, 3);
  return Array.from(new Set([identity, ...addressTokens].filter(Boolean)));
}

export function assertBureauIntegrity(outputText: string, input: BureauIntegrityInput, context: string) {
  const output = canonical(outputText);
  const missing = bureauIntegrityTokens(input).filter((token) => !output.includes(token));
  if (missing.length) throw new Error(`${context} bureau integrity check failed: missing ${missing.join(', ')} for ${input.bureauName}.`);
}

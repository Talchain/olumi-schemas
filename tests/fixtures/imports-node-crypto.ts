// POSITIVE CONTROL for tests/graph-hash-browser-runtime.test.ts (trap-13 — an
// absence assertion is vacuous unless it can see a presence). This module does
// exactly what the OLD graph-hash did: a top-level `import ... from
// 'node:crypto'`. Under the browser shim (node:crypto mocked to throw at
// import), importing THIS module must REJECT — which proves the shim genuinely
// blocks node builtins, so the graph-hash module's SUCCESSFUL import under the
// same shim is meaningful (it truly does not touch node:crypto), not vacuous.
import { createHash } from 'node:crypto';

export function digest(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

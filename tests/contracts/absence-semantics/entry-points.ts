// ============================================================================
// The walk roots — and the guard that keeps this list from becoming a mirror.
//
// The namespace objects below are STATICALLY imported (a dynamic `import()`
// over a computed specifier would resolve differently under vitest than under
// tsc, and a walk root that silently fails to load is the exact vacuity this
// whole gate exists to prevent). A static list is a hand-maintained mirror —
// the estate's dominant defect class — so it is paired with a DERIVED check:
// `declaredJsEntryPoints()` reads `package.json` `exports` and the census gate
// asserts the two agree. Adding `./analysis` to `exports` without adding it
// here turns the suite RED with the missing key named, rather than silently
// shrinking the census's coverage to a subset nobody notices.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import * as rootNs from '../../../src/index.js';
import * as boundaryNs from '../../../src/boundary/index.js';
import * as orchestratorNs from '../../../src/orchestrator/index.js';
import * as fixturesNs from '../../../src/fixtures/index.js';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

/**
 * Namespace label → the module namespace object. The label is the first
 * segment of every census key, so renaming one rewrites the whole table:
 * these are chosen to match the `exports` subpath (`.` → `root`).
 */
export const WALKED_NAMESPACES: Readonly<Record<string, Record<string, unknown>>> = {
  root: rootNs as unknown as Record<string, unknown>,
  boundary: boundaryNs as unknown as Record<string, unknown>,
  orchestrator: orchestratorNs as unknown as Record<string, unknown>,
  fixtures: fixturesNs as unknown as Record<string, unknown>,
};

/**
 * Every `exports` subpath that resolves to JavaScript, as the namespace label
 * this file would use for it. Derived from package.json at read time — the
 * source of truth for what this package actually offers a consumer.
 */
export function declaredJsEntryPoints(): string[] {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  const labels: string[] = [];
  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    if (subpath.includes('*')) continue; // static asset globs (json-schema, contracts)
    const importTarget =
      typeof target === 'string'
        ? target
        : ((target as Record<string, string> | null)?.import ?? '');
    if (!importTarget.endsWith('.js')) continue;
    labels.push(subpath === '.' ? 'root' : subpath.replace(/^\.\//, ''));
  }
  return labels.sort();
}

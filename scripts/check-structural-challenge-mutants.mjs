#!/usr/bin/env node
// Local evidence check for PR #86. No build/network/commit: temporarily remove ONE refinement,
// run its identity-bound negative matrix, then restore and byte-verify the original source in finally.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src/boundary/structural-challenge.ts');
const original = readFileSync(source, 'utf8');
const test = 'tests/contracts/structural-challenge-evidence-0.76.0.test.ts';
const scratch = mkdtempSync(join(tmpdir(), 'sch86-mutants-'));
const mutants = [
  ['constraint changed', 'constraint boundaries', "      if (basis === 'constraint_side_changed' && same) fail('C5: a constraint crossing has different sides');", 20],
  ['constraint same', 'constraint boundaries', "      if (basis === 'constraint_side_same' && !same) fail('C5: a constraint hold has equal sides');", 16],
  ['constraint boundary missing', 'constraint boundaries', "      fail('C5: a constraint boundary names its probability threshold and comparator');", 2],
  ['leader signal', 'leader entitlement', "      if (noise !== 'signal') fail('C2: every leader hold needs a signal-qualified lead');", 4],
  ['completed seed', 'completed provenance', "        if (!r.pair_provenance.seed_equal) fail('S3: a completed challenge pins the seed', ['pair_provenance', 'seed_equal']);", 6],
  ['completed budget', 'completed provenance', "        if (!r.pair_provenance.n_equal) fail('S3: a completed challenge pins the sample budget', ['pair_provenance', 'n_equal']);", 6],
  ['completed builds', 'completed provenance', "          fail('S3: a completed challenge proves equal engine builds', ['pair_provenance', 'builds_equal']);", 12],
  ['delta sides', 'missing or withheld sides', "    if (!bothSides) fail('C3: delta_only compares two present sides');", 60],
  ['absence sides', 'missing or withheld sides', "      fail('C4: a missing or withheld claim has at least one null side');", 8],
  ['non-completed provenance', 'non-completed provenance', "      if (r.pair_provenance !== null) fail(`S1: a ${r.status} challenge has null pair provenance`, ['pair_provenance']);", 15],
];
function run(label, filter) {
  const report = join(scratch, `${label.replaceAll(' ', '-')}.json`);
  const child = spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', test,
    '--reporter=json', `--outputFile=${report}`, ...(filter ? ['-t', `negative matrix: ${filter}`] : [])],
  { cwd: root, encoding: 'utf8', timeout: 60000 });
  if (child.error) throw child.error;
  const data = JSON.parse(readFileSync(report, 'utf8'));
  const failures = data.testResults.flatMap((r) => r.assertionResults).filter((r) => r.status === 'failed');
  // Guard against import/syntax errors masquerading as killed mutants.
  if (data.numFailedTestSuites && failures.length === 0) throw new Error(`${label}: no assertion failures\n${child.stderr}`);
  return { status: child.status, failed: failures.length, passed: data.numPassedTests };
}
let killed = 0;
try {
  const baseline = run('baseline');
  if (baseline.status !== 0 || baseline.failed !== 0) throw new Error(`Baseline is not green: ${JSON.stringify(baseline)}`);
  console.log(`baseline: ${baseline.passed} tests passed`);
  for (const [label, filter, needle, expected] of mutants) {
    if (original.split(needle).length !== 2) throw new Error(`${label}: expected exactly one refinement`);
    writeFileSync(source, original.replace(needle, '// MUTANT: refinement removed'), 'utf8');
    const measured = run(label, filter);
    if (measured.status !== 1 || measured.failed !== expected) {
      throw new Error(`${label}: expected ${expected} failing matrix rows; got ${JSON.stringify(measured)}`);
    }
    killed++;
    console.log(`${label}: KILLED; ${measured.failed} formerly rejected rows accepted`);
    writeFileSync(source, original, 'utf8');
  }
  console.log(`mutants: ${killed}/${mutants.length} killed`);
} finally {
  writeFileSync(source, original, 'utf8');
  if (readFileSync(source, 'utf8') !== original) throw new Error('Source restoration failed');
  rmSync(scratch, { recursive: true, force: true });
  console.log('source restored and byte-verified');
}

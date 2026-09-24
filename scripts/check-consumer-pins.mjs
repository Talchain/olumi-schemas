#!/usr/bin/env node
/**
 * CONSUMER PIN DRIFT — the check nothing in this estate performs.
 *
 * ⚠ THE GAP THIS CLOSES, MEASURED 2026-09-21. Every consumer pins a HAND-VENDORED
 * tarball (`file:./vendor/talchain-schemas-0.55.0.tgz`) while this repo publishes
 * a new version. Nothing compares the two. `check-schemas-resolution.mjs` in each
 * consumer is INTRA-REPO — it asserts the package a repo BINDS matches its own
 * PIN, which is a different question and cannot see this one.
 *
 * The consequence is not corruption, it is PARALYSIS: a field added here is
 * undeliverable until three separate manual vendoring commits land, and nothing
 * says so. `analysis_participation_withheld` (0.56.0) is in that state today.
 *
 * ⭐ WHY IT WARNS RATHER THAN FAILS BY DEFAULT. Drift is the NORMAL state for a
 * short window after a release — consumers cannot re-vendor before the version
 * exists. A check that fails on the expected state gets disabled within a week.
 * `--strict` makes it fail, for a release workflow that has decided the window
 * has closed.
 *
 * ⛔ IT REPORTS, IT DOES NOT INFER AGREEMENT. A consumer it cannot read is
 * UNREADABLE, never "current" — the same rule the wire stamp's absence semantics
 * follow. An unreadable consumer is counted as drift when `--strict` is set.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');

/** The consumers of this contract. A repo absent here is INVISIBLE to the check. */
const CONSUMERS = [
  { name: 'CEE', repo: 'Talchain/olumi-assistants-service', ref: 'staging' },
  { name: 'UI', repo: 'Talchain/DecisionGuideAI', ref: 'staging' },
  { name: 'PLoT', repo: 'Talchain/plot-lite-service', ref: 'staging' },
];

const PKG = '@talchain/schemas';

/** Vendored tarball or bare semver -> version. Returns null when underivable. */
function versionFromPin(pin) {
  if (typeof pin !== 'string' || pin.length === 0) return null;
  const tarball = pin.match(/talchain-schemas-(\d+\.\d+\.\d+)\.tgz$/);
  if (tarball) return tarball[1];
  const bare = pin.match(/^\^?~?(\d+\.\d+\.\d+)$/);
  if (bare) return bare[1];
  return null;
}

async function pinFor(consumer) {
  const url = `repos/${consumer.repo}/contents/package.json?ref=${consumer.ref}`;
  const proc = await import('node:child_process');
  let raw;
  try {
    raw = proc.execFileSync('gh', ['api', url, '--jq', '.content'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return { ...consumer, status: 'UNREADABLE', detail: 'gh api could not read package.json' };
  }
  let pkg;
  try {
    pkg = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'));
  } catch {
    return { ...consumer, status: 'UNREADABLE', detail: 'package.json did not parse' };
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const pin = deps[PKG];
  if (pin === undefined) {
    return { ...consumer, status: 'UNREADABLE', detail: `${PKG} is not a dependency` };
  }
  const version = versionFromPin(pin);
  if (version === null) {
    return { ...consumer, status: 'UNREADABLE', pin, detail: 'no version derivable from the pin' };
  }
  return { ...consumer, status: 'READ', pin, version };
}

const ours = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
const rows = await Promise.all(CONSUMERS.map(pinFor));

console.log(`contract: ${PKG}@${ours}\n`);
let drifted = 0;
let unreadable = 0;
for (const r of rows) {
  if (r.status === 'UNREADABLE') {
    unreadable += 1;
    console.log(`  ?  ${r.name.padEnd(5)} UNREADABLE — ${r.detail}`);
    continue;
  }
  const current = r.version === ours;
  if (!current) drifted += 1;
  console.log(
    `  ${current ? 'OK' : '!!'} ${r.name.padEnd(5)} ${r.version}${current ? '' : `  (behind ${ours})`}  ${r.pin}`,
  );
}

// A per-item probe returning the same answer for every item is suspect. If NOTHING
// was readable the check learned nothing, and saying "no drift" would be a lie.
if (unreadable === rows.length) {
  console.error('\nREFUSING: every consumer was UNREADABLE — this check measured nothing.');
  process.exit(2);
}

console.log(
  `\n${drifted} of ${rows.length} consumer(s) behind${unreadable > 0 ? `, ${unreadable} unreadable` : ''}.`,
);
if (drifted > 0 || unreadable > 0) {
  console.log(
    'A consumer behind this version CANNOT RECEIVE anything added since its pin. New optional\n' +
      'top-level keys are inert there (demoted to the `__additive__` sidecar), not fatal — but the\n' +
      'field does not arrive, and without the wire stamp nothing at runtime says so.',
  );
}
if (STRICT && (drifted > 0 || unreadable > 0)) process.exit(1);

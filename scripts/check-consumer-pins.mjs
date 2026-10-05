#!/usr/bin/env node
/**
 * CONSUMER PIN DRIFT — does every service parse the contract it is being sent?
 *
 * ⚠ THE GAP THIS CLOSES. Every consumer pins a HAND-VENDORED tarball
 * (`file:./vendor/talchain-schemas-X.Y.Z.tgz`) while this repo publishes new versions.
 * Each consumer's own `check-schemas-resolution.mjs` is INTRA-REPO (does the package a
 * repo binds match that repo's pin?) and cannot see this question. On 5 Oct 2026 the
 * estate sat at CEE 0.76.0 · UI 0.74.0 · PLoT 0.61.0 and nothing went red.
 *
 * ⚠ WHY THE FIRST VERSION OF THIS CHECK (#64) COULD NEVER FAIL. It warned by default,
 * `--strict` was reachable only by manual dispatch, and the workflow piped it through
 * `tee` under Actions' default `bash -e` (no pipefail), so even a strict failure exited 0.
 * It now FAILS by default after a lag window (see `scripts/lib/consumer-pins.mjs`), and
 * the workflow invokes it without a pipe.
 *
 * Usage: node scripts/check-consumer-pins.mjs [--strict] [--report-only] [--max-lag-hours N]
 *   default        fail when a consumer is behind the newest release older than 48 h
 *   --strict       window 0: fail when any consumer is behind the newest release
 *   --report-only  print the table, exit 0 (still exits 2 when it measured nothing)
 * Exit: 0 ok · 1 skew (or an unreadable/untagged consumer) · 2 could not measure.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSUMERS,
  DEFAULT_MAX_LAG_HOURS,
  versionFromPin,
  releasesFromTagLines,
  assess,
} from './lib/consumer-pins.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@talchain/schemas';
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const REPORT_ONLY = argv.includes('--report-only');
const lagIdx = argv.indexOf('--max-lag-hours');
const lagArg = lagIdx >= 0 ? Number(argv[lagIdx + 1]) : DEFAULT_MAX_LAG_HOURS;
if (!Number.isFinite(lagArg) || lagArg < 0) {
  console.error(`--max-lag-hours must be a non-negative number, got ${argv[lagIdx + 1]}`);
  process.exit(2);
}
const MAX_LAG_HOURS = STRICT ? 0 : lagArg;

function pinFor(consumer) {
  const url = `repos/${consumer.repo}/contents/package.json?ref=${consumer.ref}`;
  let raw;
  try {
    raw = execFileSync('gh', ['api', url, '--jq', '.content'], {
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

function readReleases() {
  try {
    const out = execFileSync(
      'git',
      ['for-each-ref', '--format=%(refname:strip=2)%09%(creatordate:iso-strict)', 'refs/tags/v*'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return releasesFromTagLines(out);
  } catch {
    return [];
  }
}

const ours = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
const releases = readReleases();
const rows = CONSUMERS.map(pinFor);
const result = assess(rows, releases, { nowMs: Date.now(), maxLagHours: MAX_LAG_HOURS, reportOnly: REPORT_ONLY });

console.log(`contract: ${PKG}@${ours} (package.json) · newest release tag: ${result.newest ?? 'NONE READ'}`);
console.log(
  `lag window: ${MAX_LAG_HOURS} h · every consumer must be at or above: ${result.required ?? '(no release older than the window)'}\n`,
);
const MARK = { CURRENT: 'OK', WITHIN_WINDOW: '~ ', BEHIND: '!!', UNTAGGED: '!!', UNREADABLE: '? ' };
for (const v of result.verdicts) {
  const what = v.verdict === 'UNREADABLE' ? v.detail : `${v.version}  ${v.pin}`;
  console.log(`  ${MARK[v.verdict]} ${v.name.padEnd(5)} ${v.verdict.padEnd(13)} ${what}`);
}
const distinct = [...new Set(result.verdicts.filter((v) => v.version).map((v) => v.version))];
console.log(`\ndistinct consumer pins: ${distinct.length} (${distinct.join(', ') || 'none read'})`);

if (result.measuredNothing) {
  console.error(
    releases.length === 0
      ? '\nREFUSING: no release tag was readable (shallow checkout?) — this check measured nothing.'
      : '\nREFUSING: every consumer was UNREADABLE — this check measured nothing.',
  );
} else if (result.exitCode === 1) {
  console.error(
    '\nSKEW: a consumer is behind the contract past the lag window (or unreadable/untagged). Re-vendor it\n' +
      "per that repo's vendor/README.md. A producer on a newer pin can emit what this consumer cannot parse.",
  );
}
process.exit(result.exitCode);

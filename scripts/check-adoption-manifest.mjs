#!/usr/bin/env node
// Adoption-manifest checker (arch step 2, S0).
//
// WHY THIS EXISTS: the estate already shipped meaning fields with no producer and
// no consumer (framing_question / framing_quality / decision_classification).
// Nothing failed, so nobody noticed for two minor versions. This script is the
// thing that fails.
//
// FAILS when:
//   E_STATE_WITHOUT_TESTS  a row is `enforced` without BOTH producer_test and consumer_test
//   E_UNKNOWN_REPO         a test reference names a repo key absent from repo-map.json
//   E_BAD_TEST_REF         a test reference is not `<repo>:<path>::<name>`
//   E_MISSING_TEST_FILE    (only with OLUMI_ESTATE_ROOT) the referenced file is not on disk
//   E_DEADLINE_PASSED      n_minus_1_removal_date has passed while the row is still dark
//   E_SCHEMA               a row is structurally malformed / states or dates are invalid
//   E_MANIFEST_SHA_STALE   contracts/manifest.sha256 does not match the manifest bytes
//
// Usage:
//   node scripts/check-adoption-manifest.mjs [--manifest PATH] [--repo-map PATH]
//                                            [--sha-file PATH] [--today YYYY-MM-DD]
//                                            [--require-existence] [--write-sha]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DARK_STATES = ['declared', 'produced_dark', 'consumed_dark'];
const STATES = [...DARK_STATES, 'enforced'];
const TEST_REF = /^([a-z][a-z0-9_-]*):([^:\s][^\s]*?)::(.+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WARN_WINDOW_DAYS = 21;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const manifestPath = resolve(arg('manifest', join(ROOT, 'contracts/adoption-manifest.json')));
const repoMapPath = resolve(arg('repo-map', join(ROOT, 'contracts/repo-map.json')));
const shaFilePath = resolve(arg('sha-file', join(ROOT, 'contracts/manifest.sha256')));
const today = arg('today', new Date().toISOString().slice(0, 10));
const estateRoot = process.env.OLUMI_ESTATE_ROOT || '';
const requireExistence = flag('require-existence');

const errors = [];
const warnings = [];
const fail = (code, msg) => errors.push(`${code}: ${msg}`);

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const repoMap = JSON.parse(readFileSync(repoMapPath, 'utf8'));
const knownRepos = Object.keys(repoMap.repos ?? {});

// --- contract_manifest_sha: the value services must publish on /health --------
const manifestSha = createHash('sha256').update(manifestBytes).digest('hex');
if (flag('write-sha')) {
  writeFileSync(shaFilePath, `${manifestSha}\n`);
  console.log(`wrote ${shaFilePath} = ${manifestSha}`);
} else if (!existsSync(shaFilePath)) {
  fail('E_MANIFEST_SHA_STALE', `${shaFilePath} missing; run with --write-sha`);
} else {
  const recorded = readFileSync(shaFilePath, 'utf8').trim();
  if (recorded !== manifestSha) {
    fail(
      'E_MANIFEST_SHA_STALE',
      `contracts/manifest.sha256 is ${recorded} but the manifest hashes to ${manifestSha}. ` +
        `Run: node scripts/check-adoption-manifest.mjs --write-sha`,
    );
  }
}

// --- row validation -----------------------------------------------------------
function checkTestRef(rowId, label, ref) {
  const m = TEST_REF.exec(ref);
  if (!m) {
    fail('E_BAD_TEST_REF', `${rowId}.${label} = ${JSON.stringify(ref)} is not "<repo>:<path>::<test name>"`);
    return;
  }
  const [, repo, path] = m;
  if (!knownRepos.includes(repo)) {
    fail('E_UNKNOWN_REPO', `${rowId}.${label} names repo "${repo}"; repo-map.json declares [${knownRepos.join(', ')}]`);
    return;
  }
  if (!estateRoot) return; // existence handled after the loop
  const abs = join(estateRoot, repoMap.repos[repo].local_dir, path);
  if (!existsSync(abs)) {
    fail('E_MISSING_TEST_FILE', `${rowId}.${label} points at ${abs}, which does not exist`);
  }
}

const rows = manifest.fields;
if (!Array.isArray(rows)) {
  fail('E_SCHEMA', 'manifest.fields must be an array');
} else {
  const seen = new Set();
  for (const row of rows) {
    const id = row?.field ? `${row.field}@${row.producer ?? 'none'}` : '<row with no field>';
    for (const k of ['field', 'state', 'n_minus_1_removal_date']) {
      if (typeof row?.[k] !== 'string' || !row[k]) fail('E_SCHEMA', `${id}: "${k}" is required`);
    }
    if (seen.has(row?.field)) fail('E_SCHEMA', `${id}: duplicate field row`);
    seen.add(row?.field);

    if (row?.state && !STATES.includes(row.state)) {
      fail('E_SCHEMA', `${id}: state "${row.state}" not in [${STATES.join(' | ')}]`);
    }
    if (row?.n_minus_1_removal_date && !DATE.test(row.n_minus_1_removal_date)) {
      fail('E_SCHEMA', `${id}: n_minus_1_removal_date "${row.n_minus_1_removal_date}" is not YYYY-MM-DD`);
    }

    // THE RULE: enforced means both sides are proven by a named test.
    if (row?.state === 'enforced') {
      for (const k of ['producer_test', 'consumer_test']) {
        if (!row[k]) {
          fail('E_STATE_WITHOUT_TESTS', `${id}: state=enforced but ${k} is absent — enforcement without proof`);
        }
      }
    }
    for (const k of ['producer_test', 'consumer_test']) {
      if (row?.[k]) checkTestRef(id, k, row[k]);
    }

    // THE DEAD-MAN'S SWITCH: a dark field cannot outlive its own deadline.
    if (row?.state && DARK_STATES.includes(row.state) && DATE.test(row?.n_minus_1_removal_date ?? '')) {
      const days = Math.round((Date.parse(row.n_minus_1_removal_date) - Date.parse(today)) / 86_400_000);
      if (days < 0) {
        fail(
          'E_DEADLINE_PASSED',
          `${id}: state=${row.state} and n_minus_1_removal_date ${row.n_minus_1_removal_date} passed ` +
            `${-days} day(s) ago. Adopt it (producer + consumer test) or delete the field.`,
        );
      } else if (days <= WARN_WINDOW_DAYS) {
        warnings.push(`${id}: state=${row.state}, ${days} day(s) until n_minus_1_removal_date`);
      }
    }
  }
}

// --- report -------------------------------------------------------------------
const mode = estateRoot
  ? `test-file existence: CHECKED against OLUMI_ESTATE_ROOT=${estateRoot}`
  : 'test-file existence: SKIPPED (OLUMI_ESTATE_ROOT unset — repo-key validation only)';
console.log(`adoption-manifest: ${rows?.length ?? 0} row(s) · today=${today}`);
console.log(`adoption-manifest: contract_manifest_sha=${manifestSha}`);
console.log(`adoption-manifest: ${mode}`);
if (requireExistence && !estateRoot) {
  fail('E_SCHEMA', '--require-existence was passed but OLUMI_ESTATE_ROOT is unset');
}
for (const w of warnings) console.log(`adoption-manifest: WARN ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`adoption-manifest: FAIL ${e}`);
  process.exit(1);
}
console.log('adoption-manifest: OK');

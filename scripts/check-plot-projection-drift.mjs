#!/usr/bin/env node
// ============================================================================
// GRAPH TRUTH CONTRACT — the CROSS-REPO BOND.
//
// `AXIS_BOUNDARY_FATES` is the one hand-written part of the suite that
// describes ANOTHER repo's code. Left alone that is the hand-maintained-mirror
// defect wearing a new hat: it was true when written, it will drift, and the
// drift reads as green. This script is the thing that fails.
//
// It DERIVES each PLoT projection's real key set from PLoT's source and
// asserts, in BOTH directions:
//   * a fate of `carried` names a key the projection actually emits;
//   * a fate of `dropped` names a key it does not.
// The second direction is the one usually omitted, and it is what makes a
// CLOSED gap visible instead of letting a fix land silently.
//
// ⚠ EVERY PARSE ANCHOR IS ASSERTED. If a symbol cannot be found, or its key set
// comes back empty, that is COULD-NOT-MEASURE (exit 2) — never a pass. A
// source-parsing check that silently matches nothing agrees with every fate
// table ever written, including a completely wrong one.
//
// EXIT CODES:  0 OK (or loudly SKIPPED)  ·  1 drift  ·  2 could-not-measure
//
// SKIPPING IS LOUD, BY DESIGN. Without `OLUMI_ESTATE_ROOT` there is no PLoT
// checkout to read, so the script prints SKIPPED and exits 0 — but it prints
// it every run, so "we stopped checking" can never look like "we checked".
// Pass `--require-estate` (CI does) to turn a missing checkout into a failure.
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist/boundary/semantic-axes.js');
const flag = (n) => process.argv.includes(`--${n}`);

function cannotMeasure(why) {
  console.error(`plot-projection-drift: COULD-NOT-MEASURE — ${why}`);
  console.error('plot-projection-drift: exit 2 is a FAILURE, not a pass.');
  process.exit(2);
}

if (!existsSync(DIST)) cannotMeasure(`${DIST} missing — run \`npm run build\` first`);
const { PLOT_PROJECTIONS, reconcileProjection, MEASUREMENT_SHAS } = await import(pathToFileURL(DIST).href);
if (!PLOT_PROJECTIONS || !reconcileProjection) cannotMeasure('the built contract is missing the projection bond exports');

const estateRoot = process.env.OLUMI_ESTATE_ROOT ?? '';
const repoMap = JSON.parse(readFileSync(join(ROOT, 'contracts/repo-map.json'), 'utf8'));
const plotDir = repoMap?.repos?.plot?.local_dir;
if (!plotDir) cannotMeasure('contracts/repo-map.json declares no `plot.local_dir`');

if (!estateRoot) {
  const msg =
    `SKIPPED — OLUMI_ESTATE_ROOT is unset, so PLoT's source was not read and the fate ` +
    `table was NOT reconciled against it. The fates remain a CLAIM about plot@` +
    `${MEASUREMENT_SHAS.plot?.slice(0, 8)}, not a verified one.`;
  if (flag('require-estate')) {
    console.error(`plot-projection-drift: ${msg}`);
    process.exit(2);
  }
  console.log(`plot-projection-drift: ${msg}`);
  process.exit(0);
}

const plotRoot = join(estateRoot, plotDir);
if (!existsSync(plotRoot)) cannotMeasure(`OLUMI_ESTATE_ROOT is set but ${plotRoot} does not exist`);

/**
 * Keys of the object literal a named function RETURNS. Anchored on the
 * `export function <symbol>` line and the first `return {` after it, taking
 * only depth-1 keys of that literal.
 */
function objectLiteralKeys(source, symbol) {
  const decl = source.indexOf(`export function ${symbol}(`);
  if (decl === -1) return null;
  const retIdx = source.indexOf('return {', decl);
  if (retIdx === -1) return null;
  let depth = 0;
  const keys = [];
  let i = source.indexOf('{', retIdx);
  const start = i;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = source.slice(start + 1, i);
  let d = 0;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '');
    if (d === 0) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(line);
      if (m) keys.push(m[1]);
    }
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') d += 1;
      else if (ch === '}' || ch === ']' || ch === ')') d -= 1;
    }
  }
  return keys;
}

/** String literals of a `export const <symbol> = [ ... ] as const` array. */
function constArrayMembers(source, symbol) {
  const decl = source.indexOf(`export const ${symbol} = [`);
  if (decl === -1) return null;
  const open = source.indexOf('[', decl);
  const close = source.indexOf(']', open);
  if (open === -1 || close === -1) return null;
  return [...source.slice(open + 1, close).matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
}

const problems = [];
const summary = [];

for (const projection of PLOT_PROJECTIONS) {
  const file = join(plotRoot, projection.file);
  if (!existsSync(file)) cannotMeasure(`${projection.boundary}: ${file} does not exist`);
  const source = readFileSync(file, 'utf8');

  const keys =
    projection.form === 'const-array'
      ? constArrayMembers(source, projection.symbol)
      : objectLiteralKeys(source, projection.symbol);

  // ANCHOR ASSERTED. A parse that found nothing must not read as "emits nothing".
  if (keys === null) {
    cannotMeasure(
      `${projection.boundary}: could not locate ${projection.symbol} (${projection.form}) in ` +
        `${projection.file}. The parse anchor moved — re-derive it rather than letting the ` +
        `check silently match nothing.`,
    );
  }
  if (keys.length === 0) {
    cannotMeasure(
      `${projection.boundary}: ${projection.symbol} parsed to ZERO keys. Every projection in ` +
        `this estate emits at least one field, so a zero is the parser failing, not the code.`,
    );
  }

  summary.push(`${projection.boundary} (${projection.symbol}): ${keys.length} key(s) [${keys.join(', ')}]`);
  problems.push(...reconcileProjection(projection, keys));
}

// POSITIVE CONTROL, after the real run and on the same machinery: a fabricated
// key set must produce drift. Without it, "no drift" is consistent with a
// reconciler that reports nothing whatever it is handed.
const control = reconcileProjection(
  PLOT_PROJECTIONS.find((p) => p.boundary === 'plot.isl_observed_state'),
  ['value'],
);
if (control.length === 0) {
  cannotMeasure(
    'POSITIVE CONTROL FAILED: reconciling against a deliberately truncated key set ' +
      'produced no drift, so the reconciler cannot report drift at all and its silence ' +
      'on the real projections means nothing.',
  );
}

console.log(`plot-projection-drift: estate root ${estateRoot} · plot dir ${plotDir}`);
for (const s of summary) console.log(`plot-projection-drift: ${s}`);
console.log(`plot-projection-drift: positive control produced ${control.length} drift report(s) — reconciler is sighted`);

if (problems.length) {
  for (const p of problems) console.error(`plot-projection-drift: FAIL ${p.code} ${p.subject} — ${p.message}`);
  process.exit(1);
}
console.log('plot-projection-drift: OK — every declared fate agrees with the projection it describes');

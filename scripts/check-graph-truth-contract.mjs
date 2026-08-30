#!/usr/bin/env node
// ============================================================================
// GRAPH TRUTH CONTRACT — build-time gate (Limb 0 + Limb 1).
//
// Joins `npm run check:contracts`, which `npm test` and `prepublishOnly` both
// run, so a field minted without a classification cannot be published.
//
// WHY THIS EXISTS ALONGSIDE check-adoption-manifest.mjs. That checker validates
// the ROWS the manifest happens to contain; it has no notion of COMPLETENESS,
// so a field can be minted in graph.ts, never appear in the manifest, and
// nothing fails. This gate is the completeness half, scoped to the canonical
// graph: the set of things to classify is DERIVED from the Zod tree, so the
// human cannot forget to add a row — only to fill one in.
//
// EXIT CODES — and the middle one is the point:
//   0  OK
//   1  FAIL      the contract and the classification disagree
//   2  COULD-NOT-MEASURE   the gate did not run to a verdict
//
// ⚠ 2 IS A FAILURE, NEVER A PASS (the `handover-readiness.sh` convention). A
// gate that returns 0 when it could not measure is the "instrument that cannot
// fail" this estate keeps finding: it agrees with everything, including with
// the defect. Every early return below is a 2.
//
// Discipline (global CLAUDE.md trap 15 — "your own script is not exempt"):
// absolute paths, `set -o pipefail` semantics via explicit rejection handling,
// and a POSITIVE CONTROL on the gate itself before its verdict is believed.
// ============================================================================

import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist/boundary/semantic-axes.js');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const today = arg('today', new Date().toISOString().slice(0, 10));

function cannotMeasure(why) {
  console.error(`graph-truth: COULD-NOT-MEASURE — ${why}`);
  console.error('graph-truth: exit 2 is a FAILURE, not a pass. Fix the measurement, do not skip it.');
  process.exit(2);
}

if (!existsSync(DIST)) {
  cannotMeasure(`${DIST} is missing — run \`npm run build\` first (this gate reads the built contract, not the source)`);
}

let mod;
try {
  mod = await import(pathToFileURL(DIST).href);
} catch (err) {
  cannotMeasure(`importing the built contract threw: ${err?.message ?? err}`);
}

const {
  LIVE_REGISTRY,
  CANONICAL_GRAPH_ROOTS,
  checkGraphTruthContract,
  checkClassificationCompleteness,
  canonicalGraphLeafPaths,
  walkCanonicalGraph,
  unqualifiedCrossings,
  graphTruthEpistemics,
} = mod;

for (const [name, value] of Object.entries({
  LIVE_REGISTRY,
  checkGraphTruthContract,
  checkClassificationCompleteness,
  canonicalGraphLeafPaths,
  walkCanonicalGraph,
  unqualifiedCrossings,
  graphTruthEpistemics,
})) {
  if (value === undefined) cannotMeasure(`the built contract does not export ${name}`);
}

// --- POSITIVE CONTROL, BEFORE THE VERDICT ------------------------------------
// An absence assertion with no positive control is vacuous: a gate that derives
// ZERO leaves reports "everything is classified" and is indistinguishable from
// a gate that works. Two controls, and they are deliberately DIFFERENT
// questions — a blind instrument can fake agreement, but it cannot fake a
// discrimination it is not making.
//
//   CONTROL A (sighting)      the walk must find leaves at all.
//   CONTROL B (discrimination) a leaf the contract does NOT declare must be
//                              reported unclassified. If B is silent the
//                              completeness check is not checking anything.
const walk = walkCanonicalGraph();
const leafCount = new Set(walk.leaves.map((l) => l.path)).size;
if (leafCount < 20) {
  cannotMeasure(
    `CONTROL A FAILED: the canonical walk derived only ${leafCount} leaf path(s). ` +
      `The contract has far more than that, so the walker is blind — a "fully classified" ` +
      `verdict from a blind walker is the vacuous pass this control exists to catch.`,
  );
}

let controlB;
try {
  const { z } = await import('zod');
  const probeName = '__graph_truth_positive_control__';
  const grown = {
    ...CANONICAL_GRAPH_ROOTS,
    node: CANONICAL_GRAPH_ROOTS.node.extend({ [probeName]: z.string().optional() }),
  };
  controlB = checkClassificationCompleteness({ ...LIVE_REGISTRY, roots: grown }).filter(
    (p) => p.code === 'E_UNCLASSIFIED' && p.subject === `node.${probeName}`,
  );
} catch (err) {
  cannotMeasure(`CONTROL B could not be constructed: ${err?.message ?? err}`);
}
if (controlB.length !== 1) {
  cannotMeasure(
    `CONTROL B FAILED: an undeclared field added to the node schema produced ` +
      `${controlB.length} E_UNCLASSIFIED report(s), expected exactly 1. The completeness ` +
      `check cannot see a new field, so its silence on the real contract means nothing.`,
  );
}

// --- THE VERDICT --------------------------------------------------------------
let problems;
try {
  problems = checkGraphTruthContract(LIVE_REGISTRY, today);
} catch (err) {
  cannotMeasure(`the check threw: ${err?.message ?? err}`);
}
if (!Array.isArray(problems)) cannotMeasure('the check returned a non-array');

// --- EPISTEMICS, PRINTED RATHER THAN ASSUMED ----------------------------------
const e = graphTruthEpistemics();
console.log(`graph-truth: today=${today} · controls A(${leafCount} leaves) B(1 discrimination) both green`);
console.log(
  `graph-truth: ${e.leaves} derived leaves = ${e.axisMembers} axis member(s) + ${e.notSemantic} not-semantic · ` +
    `${e.quantities} quantit(ies) · ${e.boundaries} boundaries · ${e.declaredFates} declared fate(s) ` +
    `(${e.unmeasuredFates} unmeasured) · ${e.knownDropped} known drop(s) · ${e.passthroughSites} passthrough site(s)`,
);
console.log(
  `graph-truth: measured at schemas=${e.shas.schemas?.slice(0, 8)} cee=${e.shas.cee?.slice(0, 8)} ` +
    `plot=${e.shas.plot?.slice(0, 8)} isl=${e.shas.isl ?? 'NOT MEASURED'} · rung: CODE EXISTS ` +
    `(no fate below is wire-witnessed)`,
);
for (const c of unqualifiedCrossings()) {
  console.log(
    `graph-truth: BARE FLOAT (recorded) ${c.quantity} crosses ${c.boundary} with every declared ` +
      `qualifier lost [${c.lostQualifiers.join(', ')}]`,
  );
}

if (problems.length) {
  for (const p of problems) console.error(`graph-truth: FAIL ${p.code} ${p.subject} — ${p.message}`);
  console.error(`graph-truth: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('graph-truth: OK');

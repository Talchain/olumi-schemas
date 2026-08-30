#!/usr/bin/env node
// ============================================================================
// GRAPH TRUTH CONTRACT — LIMB 2 (RUNTIME) and LIMB 3 (ROUND-TRIP ON THE WIRE).
//
// The build-time limbs prove the CONTRACT and its classification agree. They
// cannot prove a user's meaning survives a real run: a field can be declared,
// classified, fated `carried`, and still never arrive. This limb is what raises
// a fate from CODE EXISTS to WIRE-WITNESSED, and it is the only thing here that
// can.
//
// WHAT IT DOES, per brief in the corpus:
//   1. real CEE draft turn          -> the canonical committed graph
//   2. persist, then RELOAD          -> Limb 3 on the wire (leaf differ, 0/0/0)
//   3. real analysis turn            -> the science input
//   4. capture PLoT's record of what it sent ISL, from
//      `enrichment.downstream_calls.isl[0]` in the turn payload — so the
//      science input is observed WITHOUT ISL credentials
//
// THE COMPLETION TEST, per semantic object:
//   the object is resolved BY IDENTITY (its `source_quote` contains the stating
//   phrase -> a node/option/constraint id), then every assertion is made on
//   THAT id; the stated quantity's `raw_value` is present; and each qualifier
//   either REACHES THE ISL INPUT or the run is REFUSED with a `reason_code`
//   that names the missing thing.
//
//   ⚠ THE THIRD STATE IS THE FAILURE: the qualifier carried as prose in a
//   label while the number is computed on silently. That is not a partial
//   pass. A run that computes on a quantity whose scale nobody attested is
//   exactly the defect this suite exists to make loud, and it is reported as
//   FAIL, never as a warning.
//
// ── WHY THIS SCRIPT REFUSES TO PRODUCE A GREEN FROM A SELF-AUTHORED CORPUS ──
// A fixture you wrote yourself is not evidence about the wire: it silently
// encodes your model of the producer rather than the producer. For a predicate
// over natural language the author's corpus is a development aid and an
// OUTSIDE corpus is the evidence. So `corpus.provenance` must be `captured` or
// `external`, and the script EXITS 2 on `authored`. A green from briefs the
// author invented would be a perfect score on the wrong exam.
//
// EXIT CODES:
//   0  every object's meaning survived, or was honestly refused
//   1  FAIL      meaning was lost silently on a real run
//   2  COULD-NOT-MEASURE
//
// ⚠ 2 IS A FAILURE, NEVER A PASS. Every early return below is a 2, including
// "no credentials". A limb that reports success when it could not run is the
// instrument that cannot fail — it agrees with everything, including with the
// defect it was built to catch.
//
// USAGE:
//   OLUMI_CEE_BASE=... OLUMI_CEE_AUTH='Bearer ...' \
//   node scripts/graph-truth-runtime-limb.mjs --corpus contracts/graph-truth-corpus.json \
//        --out evidence/
// ============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist/boundary/semantic-axes.js');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const started = new Date().toISOString();
const findings = [];
const record = (level, object, message, detail) => findings.push({ level, object, message, detail });

function cannotMeasure(why, extra = {}) {
  const artefact = {
    limb: 'graph-truth-runtime',
    verdict: 'COULD_NOT_MEASURE',
    started,
    finished: new Date().toISOString(),
    why,
    ...extra,
    findings,
  };
  writeArtefact(artefact);
  console.error(`graph-truth-runtime: COULD-NOT-MEASURE — ${why}`);
  console.error('graph-truth-runtime: exit 2 is a FAILURE, not a pass.');
  process.exit(2);
}

let outDir = null;
function writeArtefact(artefact) {
  // A standing mechanism that cannot prove it ran is worth nothing. The dated
  // artefact IS the proof; a status of RUNNING without one is a failure.
  if (!outDir) return;
  try {
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `graph-truth-runtime-${started.slice(0, 10)}.json`);
    writeFileSync(file, `${JSON.stringify(artefact, null, 2)}\n`, 'utf8');
    const readBack = readFileSync(file, 'utf8');
    if (!readBack.includes(artefact.verdict)) {
      console.error(`graph-truth-runtime: VERIFY FAILED — ${file} does not contain the verdict`);
      process.exit(2);
    }
    console.log(`graph-truth-runtime: artefact written ${file}`);
  } catch (err) {
    console.error(`graph-truth-runtime: could not write artefact: ${err?.message ?? err}`);
    process.exit(2);
  }
}

// --- inputs -------------------------------------------------------------------
outDir = resolve(arg('out', join(ROOT, 'evidence')));
const corpusPath = resolve(arg('corpus', join(ROOT, 'contracts/graph-truth-corpus.json')));
const ceeBase = process.env.OLUMI_CEE_BASE ?? '';
const ceeAuth = process.env.OLUMI_CEE_AUTH ?? '';

if (!existsSync(DIST)) cannotMeasure(`${DIST} missing — run \`npm run build\` first`);

let mod;
try {
  mod = await import(pathToFileURL(DIST).href);
} catch (err) {
  cannotMeasure(`importing the built contract threw: ${err?.message ?? err}`);
}
const { LIVE_REGISTRY, SEMANTIC_OBJECTS, diffGraphLeaves, enumerateValueLeaves, fateKey } = mod;
if (!SEMANTIC_OBJECTS || !diffGraphLeaves) cannotMeasure('the built contract is missing exports this limb needs');

if (!existsSync(corpusPath)) {
  cannotMeasure(
    `no corpus at ${corpusPath}. This limb needs REAL briefs — captured from users or ` +
      `written by someone other than the author of the code under test.`,
  );
}
let corpus;
try {
  corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
} catch (err) {
  cannotMeasure(`corpus is not readable JSON: ${err?.message ?? err}`);
}

// --- THE CORPUS PROVENANCE GATE ----------------------------------------------
if (!['captured', 'external'].includes(corpus?.provenance)) {
  cannotMeasure(
    `corpus.provenance is ${JSON.stringify(corpus?.provenance)}. This limb accepts only ` +
      `"captured" (real user briefs) or "external" (written by someone other than the ` +
      `author of the code under test). A corpus drawn from the author's head cannot see ` +
      `the class the author did not imagine, and a full pass against one is a perfect ` +
      `score on the wrong exam.`,
    { corpus_provenance: corpus?.provenance ?? null, corpus_size: corpus?.briefs?.length ?? 0 },
  );
}
if (!Array.isArray(corpus.briefs) || corpus.briefs.length === 0) {
  cannotMeasure('corpus.briefs is empty — a suite that runs zero cases reports zero failures');
}

if (!ceeBase || !ceeAuth) {
  cannotMeasure(
    'OLUMI_CEE_BASE and/or OLUMI_CEE_AUTH are unset, so no live turn was attempted. ' +
      'This is COULD-NOT-MEASURE, not a pass: the build-time limbs say the contract ' +
      'and its classification agree, and say nothing whatever about the wire.',
    { cee_base_set: Boolean(ceeBase), cee_auth_set: Boolean(ceeAuth) },
  );
}

// --- transport ----------------------------------------------------------------
async function turn(body) {
  const res = await fetch(`${ceeBase.replace(/\/$/, '')}/orchestrate/v2/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: ceeAuth },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* left null deliberately — an unreadable body is a hard error below */
  }
  return { status: res.status, json, text };
}

/** Resolve an object BY IDENTITY from its stating phrase — never by value. */
function resolveByStatedPhrase(graph, phrase) {
  const hits = [];
  const consider = (kind, id, quote) => {
    if (typeof quote === 'string' && quote.toLowerCase().includes(phrase.toLowerCase())) {
      hits.push({ kind, id });
    }
  };
  for (const n of graph?.nodes ?? []) {
    consider('node', n?.id, n?.observed_state?.source_quote ?? n?.source_quote);
  }
  for (const c of graph?.goal_constraints ?? []) consider('goal_constraint', c?.constraint_id, c?.source_quote);
  for (const o of graph?.options ?? []) consider('option', o?.id, o?.source_quote);
  return hits;
}

/** PLoT's own record of what it sent ISL — the science input, without ISL creds. */
function islInput(turnJson) {
  const blocks = turnJson?.blocks ?? [];
  for (const b of blocks) {
    const calls = b?.enrichment?.downstream_calls?.isl;
    if (Array.isArray(calls) && calls.length > 0) return calls[0];
  }
  const direct = turnJson?.enrichment?.downstream_calls?.isl;
  return Array.isArray(direct) && direct.length > 0 ? direct[0] : null;
}

/** Every reason_code the run offered for refusing. A refusal that NAMES the gap is a PASS. */
function refusalCodes(turnJson) {
  const codes = new Set();
  const visit = (v) => {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    for (const [k, val] of Object.entries(v)) {
      if ((k === 'reason_code' || k === 'blocked_reason') && typeof val === 'string') codes.add(val);
      visit(val);
    }
  };
  visit(turnJson);
  return [...codes];
}

// --- the run -------------------------------------------------------------------
let failures = 0;
const perBrief = [];

for (const brief of corpus.briefs) {
  const caseId = brief.id ?? '<unnamed>';
  const draft = await turn({ session_id: brief.session_id ?? undefined, message: brief.text });
  if (draft.status !== 200 || !draft.json) {
    cannotMeasure(`brief ${caseId}: draft turn returned HTTP ${draft.status} with no readable JSON`, {
      case: caseId,
      body_head: draft.text.slice(0, 400),
    });
  }
  const sessionId = draft.json.session_id ?? brief.session_id;
  const graphBefore = draft.json.draft_graph ?? draft.json.blocks?.find?.((b) => b?.type === 'draft_graph');
  if (!graphBefore) {
    cannotMeasure(`brief ${caseId}: the draft turn carried no draft_graph — nothing to assert about`, { case: caseId });
  }

  // --- LIMB 3 ON THE WIRE: reload and diff ------------------------------------
  const reload = await turn({ session_id: sessionId, message: brief.reload_message ?? 'Show me the current model.' });
  if (reload.status !== 200 || !reload.json) {
    cannotMeasure(`brief ${caseId}: reload turn returned HTTP ${reload.status}`, { case: caseId });
  }
  const graphAfter = reload.json.draft_graph ?? reload.json.blocks?.find?.((b) => b?.type === 'draft_graph');
  if (!graphAfter) cannotMeasure(`brief ${caseId}: the reload turn carried no draft_graph`, { case: caseId });

  const roundtrip = diffGraphLeaves(graphBefore, graphAfter);
  // CONTRAST IN THE SAME RUN: if the differ read nothing, a clean diff is
  // meaningless. Assert it saw a real graph before believing it saw no loss.
  const census = enumerateValueLeaves(graphBefore);
  if (census.leaves.size < 10) {
    cannotMeasure(`brief ${caseId}: the graph census found ${census.leaves.size} leaves — too few to diff meaningfully`, {
      case: caseId,
    });
  }
  if (roundtrip.lost.length > 0) {
    failures += 1;
    record('FAIL', 'round_trip', `brief ${caseId}: a no-op reload LOST ${roundtrip.lost.length} leaf/leaves`, roundtrip.lost);
  }

  // --- LIMB 2: analyse, then read the science input ----------------------------
  const analysis = await turn({ session_id: sessionId, message: brief.analyse_message ?? 'Run the analysis.' });
  if (analysis.status !== 200 || !analysis.json) {
    cannotMeasure(`brief ${caseId}: analysis turn returned HTTP ${analysis.status}`, { case: caseId });
  }
  const science = islInput(analysis.json);
  const codes = refusalCodes(analysis.json);
  if (!science && codes.length === 0) {
    cannotMeasure(
      `brief ${caseId}: no enrichment.downstream_calls.isl record AND no reason_code. ` +
        `Neither the science input nor a refusal is observable, so nothing can be concluded ` +
        `about this run in either direction.`,
      { case: caseId },
    );
  }

  const objectResults = [];
  for (const expectation of brief.expectations ?? []) {
    const { object, stated_phrase: phrase, quantity_path: quantityPath, qualifiers = [] } = expectation;
    const declared = SEMANTIC_OBJECTS.find((o) => o.id === object);
    if (!declared) {
      cannotMeasure(`brief ${caseId}: expectation names semantic object "${object}", which the contract does not declare`, {
        case: caseId,
      });
    }

    // BIND BY IDENTITY. A value predicate (`value === 0.12`) can be satisfied by
    // a sibling, and an entire extractor can then be deleted under a green suite.
    const hits = resolveByStatedPhrase(graphAfter, phrase);
    if (hits.length !== 1) {
      failures += 1;
      record(
        'FAIL',
        object,
        `brief ${caseId}: the stating phrase ${JSON.stringify(phrase)} resolved to ${hits.length} object(s); ` +
          `exactly one is required before anything can be asserted ON it`,
        hits,
      );
      objectResults.push({ object, verdict: 'UNRESOLVED', hits });
      continue;
    }
    const { kind, id } = hits[0];

    // The quantity must be present, in the user's own units.
    const quantity = readPath(graphAfter, kind, id, quantityPath);
    if (quantity === undefined) {
      failures += 1;
      record('FAIL', object, `brief ${caseId}: ${kind} ${id} carries no ${quantityPath} — the stated magnitude is gone`, null);
      objectResults.push({ object, id, verdict: 'QUANTITY_LOST' });
      continue;
    }

    // Each qualifier: REACHES the science input, or the run REFUSED naming it.
    const lost = [];
    for (const q of qualifiers) {
      const inGraph = readPath(graphAfter, kind, id, q.graph_path) !== undefined;
      const inScience = science ? JSON.stringify(science).includes(q.science_marker) : false;
      const namedInRefusal = codes.some((c) => q.refusal_codes?.includes(c));
      if (!inScience && !namedInRefusal) {
        lost.push({ qualifier: q.graph_path, present_in_graph: inGraph, refusal_codes: codes });
      }
    }
    if (lost.length > 0) {
      failures += 1;
      record(
        'FAIL',
        object,
        `brief ${caseId}: ${kind} ${id} — ${lost.length} qualifier(s) reached neither the science input nor a ` +
          `refusal that names them. The number was computed on while what it MEANS was not sent. ` +
          `This is the third state, and it is a failure, not a partial pass.`,
        lost,
      );
      objectResults.push({ object, id, verdict: 'SILENTLY_UNQUALIFIED', lost });
      continue;
    }
    objectResults.push({ object, id, verdict: science ? 'SURVIVED' : 'HONESTLY_REFUSED', refusal_codes: codes });
  }

  perBrief.push({
    case: caseId,
    session_id: sessionId,
    round_trip: { lost: roundtrip.lost, gained: roundtrip.gained, changed: roundtrip.changed.map((c) => c.path) },
    leaf_census: census.leaves.size,
    science_input_observed: Boolean(science),
    refusal_codes: codes,
    objects: objectResults,
  });
}

function readPath(graph, kind, id, path) {
  const collection = kind === 'node' ? graph?.nodes : kind === 'option' ? graph?.options : graph?.goal_constraints;
  const idKey = kind === 'goal_constraint' ? 'constraint_id' : 'id';
  const target = (collection ?? []).find((x) => x?.[idKey] === id);
  if (!target) return undefined;
  let cur = target;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

// --- verdict + artefact ---------------------------------------------------------
const artefact = {
  limb: 'graph-truth-runtime',
  verdict: failures === 0 ? 'PASS' : 'FAIL',
  rung_reached: 'WIRE_WITNESSED',
  started,
  finished: new Date().toISOString(),
  cee_base: ceeBase,
  corpus: { path: corpusPath, provenance: corpus.provenance, briefs: corpus.briefs.length },
  measurement_shas: LIVE_REGISTRY ? mod.MEASUREMENT_SHAS : null,
  briefs: perBrief,
  findings,
};
writeArtefact(artefact);

console.log(
  `graph-truth-runtime: ${perBrief.length} brief(s) · corpus provenance=${corpus.provenance} · ` +
    `${findings.filter((f) => f.level === 'FAIL').length} failure(s)`,
);
for (const f of findings) console.error(`graph-truth-runtime: ${f.level} [${f.object}] ${f.message}`);
if (failures > 0) process.exit(1);
console.log('graph-truth-runtime: OK — every semantic object survived or was honestly refused');
void fateKey;

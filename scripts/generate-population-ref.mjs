#!/usr/bin/env node
// ============================================================================
// Generates src/contracts/generated-population-ref.ts from
// contracts/population-registry.json (arch step 2, S0 — Codex F4).
//
// WHY THIS IS GENERATED AND NOT HAND-WRITTEN.
//
// The obvious hand-written shape for design §7's `population: {id, stage, ...}`
// is `{ id: z.string().min(1), stage: z.enum(STAGES) }` — id a free string,
// stage an INDEPENDENT enum. That shape validates NOTHING the registry says:
//   * `{ id: 'typo@1', stage: 'raw' }`                          passes
//   * `{ id: 'olumi.mc.model_only@1', stage: 'transformed' }`    passes
// The second one is the dangerous case: a REAL id paired with the WRONG stage.
// A consumer reading it computes on a population that does not exist, and the
// validator that was supposed to prevent exactly that reports success. Per
// tests/contracts/s0-gates.test.ts: a validator that passes everything is worse
// than none, because it converts "nobody checked" into "CI is green".
//
// So the pairing is DERIVED, never mirrored (global CLAUDE.md trap 12): each
// registry id becomes a `z.literal` pinned to ITS OWN registry-owned stage,
// parent and transform, assembled into a discriminated union on `id`.
//
// The regeneration-diff check is what keeps it honest in BOTH directions:
//   * hand-edit the generated file        -> `npm run generate:population-ref:check` FAILS
//   * change the registry, forget to regen -> the same check FAILS
// There is no third state in which the schema and the registry disagree
// quietly.
//
// FAILS when:
//   E_NO_POPULATIONS  registry.populations is empty — a zero-branch union would
//                     accept nothing (or throw); either way the gate would stop
//                     meaning what it claims, so refuse to emit it
//   E_BAD_ID          an id/parent_id/transform_id does not match the registry
//                     id grammar (also enforced by check-population-registry.mjs;
//                     re-checked here because this script WRITES CODE from these
//                     strings — global CLAUDE.md trap 15, own script not exempt)
//   E_BAD_STAGE       an entry's stage is outside registry.stages
//   E_UNSAFE_LITERAL  a string bound for a TS literal is outside the emittable
//                     grammar (the id regex does not cover `stages`, so this is
//                     the guard that stops a quote in a stage name from writing
//                     arbitrary source)
//   E_MISSING         default mode: the generated artefact does not exist
//   E_STALE           default mode: the checked-in artefact is not byte-identical
//                     to what this generator produces from the registry
//
// Default mode VERIFIES and exits 1 when stale. `--write` regenerates.
// Usage: node scripts/generate-population-ref.mjs [--write] [--registry PATH] [--out PATH]
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argPath = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback;
};

const REGISTRY = argPath('--registry', join(ROOT, 'contracts/population-registry.json'));
const OUT = argPath('--out', join(ROOT, 'src/contracts/generated-population-ref.ts'));

// Same grammar as check-population-registry.mjs. Deliberately duplicated rather
// than imported: this script turns these strings into SOURCE CODE, so it must
// refuse anything it cannot safely emit even if the other checker changed.
const ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+@[1-9]\d*$/;

const errors = [];
const fail = (code, msg) => errors.push(`${code}: ${msg}`);
const die = () => {
  for (const e of errors) console.error(`population-ref: FAIL ${e}`);
  process.exit(1);
};

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const stages = reg.stages ?? [];
const pops = reg.populations ?? [];

// `not_yet_emitted.populations` is DELIBERATELY excluded: those ids have no
// producer by construction (see the registry's own $comment), so putting them
// in the wire schema would license a value nothing is allowed to emit — the
// non-adoption failure this scaffolding exists to prevent.
if (pops.length === 0) {
  fail('E_NO_POPULATIONS', 'registry.populations is empty — refusing to emit a union that discriminates nothing');
  die();
}

// Every string this script emits into source code must first prove it needs no
// escaping. Anything outside this grammar is refused rather than quoted-and-hoped
// (global CLAUDE.md trap 15 — your own script is not exempt).
const SAFE = /^[a-z0-9_.@]+$/;
const q = (s) => {
  if (!SAFE.test(s)) {
    fail('E_UNSAFE_LITERAL', `${JSON.stringify(s)} is outside the emittable grammar ${SAFE}`);
    return "''";
  }
  return `'${s}'`;
};
const lit = (s) => `z.literal(${q(s)})`;

const branches = [];
for (const p of pops) {
  if (!ID.test(p?.id ?? '')) {
    fail('E_BAD_ID', `population id ${JSON.stringify(p?.id)} must match ${ID}`);
    continue;
  }
  if (!stages.includes(p.stage)) {
    fail('E_BAD_STAGE', `${p.id}: stage ${JSON.stringify(p.stage)} not in closed enum [${stages.join(' | ')}]`);
    continue;
  }
  for (const key of ['parent_id', 'transform_id']) {
    if (p[key] !== undefined && !ID.test(p[key])) {
      fail('E_BAD_ID', `${p.id}: ${key} ${JSON.stringify(p[key])} must match ${ID}`);
    }
  }

  const fields = [`      id: ${lit(p.id)},`, `      stage: ${lit(p.stage)},`];
  // Optional, but literal-pinned: a producer need not restate the lineage the
  // registry already owns — and may not restate it WRONG.
  if (p.parent_id !== undefined) fields.push(`      parent_id: ${lit(p.parent_id)}.optional(),`);
  if (p.transform_id !== undefined) fields.push(`      transform_id: ${lit(p.transform_id)}.optional(),`);

  branches.push(`  z\n    .object({\n${fields.join('\n')}\n    })\n    .strict(),`);
}

if (errors.length) die();

const idList = pops.map((p) => `  ${q(p.id)},`).join('\n');
const stageList = stages.map((s) => `  ${q(s)},`).join('\n');

if (errors.length) die();

const body = `// GENERATED by scripts/generate-population-ref.mjs from contracts/population-registry.json
// — do not edit by hand. Regenerate with: npm run generate:population-ref
//
// A hand edit here, or a registry change without a regeneration, FAILS
// \`npm run generate:population-ref:check\` (wired into \`check:contracts\`, so it
// runs in the PR gate). The schema and the registry cannot disagree quietly.
//
// WHAT THIS ENFORCES that a free-string \`id\` + independent \`stage\` enum does not:
// each id is pinned to the stage, parent and transform THE REGISTRY GIVES IT, so
// a real id carrying the wrong stage is rejected — not just an unknown id.
//
// See ../../contracts/population-registry.json for what each population MEANS,
// which ISL metrics land on it, and the wire labels it maps to.

import { z } from 'zod';

/** The closed stage vocabulary, from registry.stages. */
export const POPULATION_STAGES = [
${stageList}
] as const;
export type PopulationStage = (typeof POPULATION_STAGES)[number];

/** Every registered population id, in registry order. */
export const POPULATION_IDS = [
${idList}
] as const;
export type PopulationId = (typeof POPULATION_IDS)[number];

/**
 * A reference to a registered sample population.
 *
 * Discriminated on \`id\`: the accepted (id, stage) pairs are exactly the pairs
 * the registry declares, and \`parent_id\` / \`transform_id\` — optional, because
 * the registry already owns the lineage — may only ever repeat the registry's
 * own values.
 */
export const PopulationRefSchema = z.discriminatedUnion('id', [
${branches.join('\n')}
]);

export type PopulationRef = z.infer<typeof PopulationRefSchema>;
`;

if (process.argv.includes('--write')) {
  writeFileSync(OUT, body);
  // Re-read and byte-verify: a generator that cannot fail is theatre.
  if (readFileSync(OUT, 'utf8') !== body) {
    console.error(`population-ref: FAIL write verification — ${OUT} does not match intended bytes`);
    process.exit(1);
  }
  console.log(`population-ref: wrote ${OUT}`);
  console.log(`population-ref: ${pops.length} population(s) [${pops.map((p) => `${p.id}=${p.stage}`).join(', ')}]`);
  process.exit(0);
}

if (!existsSync(OUT)) {
  console.error(`population-ref: FAIL E_MISSING: ${OUT} does not exist — run with --write`);
  process.exit(1);
}
if (readFileSync(OUT, 'utf8') !== body) {
  console.error(
    `population-ref: FAIL E_STALE: ${OUT} is not what this generator produces from ${REGISTRY}.\n` +
      '  Either the file was hand-edited, or the registry changed without a regeneration.\n' +
      '  run: npm run generate:population-ref',
  );
  process.exit(1);
}
console.log(`population-ref: ${pops.length} population(s) [${pops.map((p) => `${p.id}=${p.stage}`).join(', ')}]`);
console.log('population-ref: OK (generated-population-ref.ts matches the registry)');

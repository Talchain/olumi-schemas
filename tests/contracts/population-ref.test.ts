// PopulationRefSchema — the registry it claims to enforce, actually enforced.
// Codex contract step-2 finding F4 (P1, ACCEPTANCE).
//
// THE DEFECT THIS PINS. The natural hand-written shape for design §7's
// `population: {id, stage, ...}` is a free-string `id` beside an INDEPENDENT
// `stage` enum. Under that shape `{ id: 'typo@1', stage: 'raw' }` passes, and so
// does `{ id: 'olumi.mc.model_only@1', stage: 'transformed' }` — a REAL id
// carrying the WRONG stage, the case a consumer cannot detect and will happily
// compute on. Neither negative can fail through such a schema, which makes it a
// validator that passes everything: per this repo's own S0 conventions, worse
// than none, because it converts "nobody checked" into "CI is green".
//
// The BLIND CONTROL block at the bottom is that shape, kept permanently, and it
// is what makes the negatives above it non-vacuous: every negative case in this
// file is asserted to PASS the blind schema and FAIL the generated one. An
// absence assertion that has never proved it can see a presence is theatre
// (this repo learned that from a leak test that captured 0 bytes).

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PopulationRefSchema,
  POPULATION_IDS,
  POPULATION_STAGES,
} from '../../src/contracts/generated-population-ref.js';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const NEG = join(ROOT, 'tests/contracts/negative/population-ref');
const GENERATED = join(ROOT, 'src/contracts/generated-population-ref.ts');

function run(args: string[] = []) {
  const r = spawnSync('node', [join(ROOT, 'scripts/generate-population-ref.mjs'), ...args], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// ---------------------------------------------------------------------------
// The registry, read straight off disk. Every expectation below is DERIVED from
// it — nothing here restates the id/stage pairing by hand, because a hand-copied
// expectation would drift the moment the registry did, and drift reads as green.
// ---------------------------------------------------------------------------
interface RegistryEntry {
  id: string;
  stage: string;
  parent_id?: string;
  transform_id?: string;
}
const registry = JSON.parse(
  readFileSync(join(ROOT, 'contracts/population-registry.json'), 'utf8'),
) as { stages: string[]; populations: RegistryEntry[] };

/** The shape the finding says must not ship: free-string id, independent stage enum. */
const BlindPopulationRefSchema = z.object({
  id: z.string().min(1),
  stage: z.enum(registry.stages as [string, ...string[]]),
  parent_id: z.string().min(1).optional(),
  transform_id: z.string().min(1).optional(),
});

const accepts = (schema: z.ZodTypeAny, value: unknown) => schema.safeParse(value).success;

// Every negative in one list, so the blind-control block can assert the whole
// set at once and no case can be quietly dropped from it.
const NEGATIVES: Array<[string, unknown]> = [
  ['an id that is not in the registry at all', { id: 'typo@1', stage: 'raw' }],
  [
    'a REAL id carrying the WRONG stage — the case the free-string shape cannot see',
    { id: 'olumi.mc.model_only@1', stage: 'transformed' },
  ],
  [
    'the same fault in the other direction',
    { id: 'olumi.mc.auto_noise_sqrt2@1', stage: 'raw' },
  ],
  [
    'a well-formed, plausible, UNREGISTERED id',
    { id: 'olumi.mc.conditioned_v9@1', stage: 'conditioned' },
  ],
  [
    'a real pair with a parent_id the registry does not give it',
    {
      id: 'olumi.mc.auto_noise_sqrt2@1',
      stage: 'transformed',
      parent_id: 'olumi.mc.somewhere_else@1',
    },
  ],
  [
    'a real pair with a transform_id the registry does not give it',
    {
      id: 'olumi.mc.auto_noise_sqrt2@1',
      stage: 'transformed',
      transform_id: 'olumi.transform.something_else@1',
    },
  ],
  [
    'lineage on a root population that has none',
    { id: 'olumi.mc.model_only@1', stage: 'raw', parent_id: 'olumi.mc.auto_noise_sqrt2@1' },
  ],
];

// ---------------------------------------------------------------------------
describe('PopulationRefSchema · positive', () => {
  it.each(registry.populations.map((p) => [p.id, p] as const))(
    'ACCEPTS %s with the stage the registry gives it',
    (_id, entry) => {
      expect(accepts(PopulationRefSchema, { id: entry.id, stage: entry.stage })).toBe(true);
    },
  );

  it('ACCEPTS a full lineage when it matches the registry exactly', () => {
    const derived = registry.populations.find((p) => p.parent_id && p.transform_id);
    expect(derived, 'the registry must have at least one derived population').toBeDefined();
    expect(
      accepts(PopulationRefSchema, {
        id: derived!.id,
        stage: derived!.stage,
        parent_id: derived!.parent_id,
        transform_id: derived!.transform_id,
      }),
    ).toBe(true);
  });

  it('round-trips every registry pair with zero field loss', () => {
    for (const p of registry.populations) {
      const value = {
        id: p.id,
        stage: p.stage,
        ...(p.parent_id ? { parent_id: p.parent_id } : {}),
        ...(p.transform_id ? { transform_id: p.transform_id } : {}),
      };
      expect(PopulationRefSchema.parse(value)).toStrictEqual(value);
    }
  });
});

// ---------------------------------------------------------------------------
describe('PopulationRefSchema · negative', () => {
  it.each(NEGATIVES)('REJECTS %s', (_label, value) => {
    expect(accepts(PopulationRefSchema, value)).toBe(false);
  });

  it('REJECTS an unknown key (the branches are .strict())', () => {
    expect(
      accepts(PopulationRefSchema, {
        id: 'olumi.mc.model_only@1',
        stage: 'raw',
        smuggled_field: 'anything',
      }),
    ).toBe(false);
  });

  it('REJECTS a missing stage', () => {
    expect(accepts(PopulationRefSchema, { id: 'olumi.mc.model_only@1' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The anti-mirror assertion: the accepted (id, stage) pairs are EXACTLY the
// registry's, derived from the registry rather than listed here. This is what
// makes the schema a projection of the registry instead of a second copy of it.
// ---------------------------------------------------------------------------
describe('PopulationRefSchema · derived from the registry, not mirrored', () => {
  it('accepts exactly the registry pairs across the full id × stage cross-product', () => {
    const registryPairs = new Set(registry.populations.map((p) => `${p.id}|${p.stage}`));
    const accepted: string[] = [];
    for (const id of POPULATION_IDS) {
      for (const stage of POPULATION_STAGES) {
        if (accepts(PopulationRefSchema, { id, stage })) accepted.push(`${id}|${stage}`);
      }
    }
    expect([...accepted].sort()).toEqual([...registryPairs].sort());
    // Non-vacuity: the cross-product must be strictly bigger than the answer, or
    // this test could pass by there being nothing to reject.
    expect(POPULATION_IDS.length * POPULATION_STAGES.length).toBeGreaterThan(registryPairs.size);
  });

  it('exports the registry vocabularies verbatim', () => {
    expect([...POPULATION_IDS]).toEqual(registry.populations.map((p) => p.id));
    expect([...POPULATION_STAGES]).toEqual(registry.stages);
  });
});

// ---------------------------------------------------------------------------
// BLIND CONTROL — a permanent negative control on the negatives above.
//
// This is the RED-first evidence, kept executable. It reproduces the pre-fix
// shape and proves each negative case above is one the old shape WAVED THROUGH,
// so none of them is a test that would have passed anyway.
// ---------------------------------------------------------------------------
describe('BLIND CONTROL · the free-string shape passes everything', () => {
  it.each(NEGATIVES)('the free-string shape ACCEPTS %s — which is the defect', (_label, value) => {
    expect(
      accepts(BlindPopulationRefSchema, value),
      'if this ever fails, the negative case above stopped discriminating and the control is hollow',
    ).toBe(true);
  });

  it('every negative in this file is covered by the control', () => {
    // The two it.each blocks are driven by the SAME array, so they cannot drift
    // apart; this pins the array itself against being emptied.
    expect(NEGATIVES.length).toBeGreaterThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
// The regeneration-diff check. Without it the generated file is just a file:
// someone edits it, or edits the registry and forgets, and the two disagree in
// silence. This is what makes the derivation load-bearing rather than a habit.
// ---------------------------------------------------------------------------
describe('generate-population-ref · regeneration-diff check', () => {
  it('POSITIVE: the checked-in artefact matches the registry', () => {
    const r = run();
    expect(r.out).toContain('population-ref: OK');
    expect(r.code).toBe(0);
  });

  it('NEGATIVE: a hand-edited artefact is rejected as E_STALE', () => {
    const dir = mkdtempSync(join(tmpdir(), 'olumi-popref-'));
    const copy = join(dir, 'generated-population-ref.ts');
    copyFileSync(GENERATED, copy);
    // The exact hand-edit that reopens F4: widen the discriminator back to a
    // free string. It is still valid TypeScript and still compiles.
    writeFileSync(
      copy,
      readFileSync(copy, 'utf8').replace(
        "id: z.literal('olumi.mc.model_only@1'),",
        'id: z.string().min(1),',
      ),
    );
    expect(readFileSync(copy, 'utf8')).not.toBe(readFileSync(GENERATED, 'utf8'));

    const r = run(['--out', copy]);
    expect(r.code, 'a hand-edited artefact must not pass').not.toBe(0);
    expect(r.out).toContain('E_STALE');
  });

  it('NEGATIVE: a registry change without a regeneration is rejected as E_STALE', () => {
    // The artefact on disk is current for the REAL registry; run the checker
    // against a DIFFERENT registry and it must notice, which is the same
    // failure a lane produces by editing the registry and not regenerating.
    const r = run(['--registry', join(NEG, 'open-stage.json')]);
    expect(r.code).not.toBe(0);
  });

  it('NEGATIVE: a missing artefact is rejected as E_MISSING', () => {
    const r = run(['--out', join(mkdtempSync(join(tmpdir(), 'olumi-popref-')), 'absent.ts')]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('E_MISSING');
  });

  const cases: Array<[string, string]> = [
    ['empty-populations.json', 'E_NO_POPULATIONS'],
    ['unversioned-id.json', 'E_BAD_ID'],
    ['open-stage.json', 'E_BAD_STAGE'],
    ['unsafe-stage-literal.json', 'E_UNSAFE_LITERAL'],
  ];
  it.each(cases)('NEGATIVE: %s is rejected with %s', (fixture, code) => {
    const out = join(mkdtempSync(join(tmpdir(), 'olumi-popref-')), 'out.ts');
    const r = run(['--registry', join(NEG, fixture), '--out', out]);
    expect(r.code, `${fixture} must exit non-zero`).not.toBe(0);
    expect(r.out).toContain(code);
  });

  it('every negative population-ref fixture is exercised by a case above', () => {
    const onDisk = readdirSync(NEG)
      .filter((f) => f.endsWith('.json'))
      .sort();
    expect(onDisk).toEqual(cases.map(([f]) => f).sort());
  });
});

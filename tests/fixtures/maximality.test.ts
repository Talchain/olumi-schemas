// ============================================================================
// W2E-1 MAXIMALITY guard — the ratchet that enforces the library's actual
// value proposition.
//
// WHY THIS EXISTS (the hole it closes): the completeness ratchet
// (completeness.test.ts) only checks schema IDENTITY membership — "does this
// exported schema have SOME registry entry?". Two consequences, both verified
// live before this suite was written:
//
//   1. It is satisfied by an EMPTY/TRIVIAL fixture. Stripping four optional
//      fields off `maximalDecisionRecordPrediction` left the whole suite green.
//   2. The DOMINANT real-world drift path — adding a new optional field to an
//      EXISTING exported schema — tripped NOTHING. Adding a field to
//      `DecisionRecordPredictionSchema` left the whole suite green.
//
// Case 2 is the shape of EVERY historical silent-drop incident on this
// platform: coaching, evidence, and enrichment were all NEW FIELDS ON EXISTING
// SHAPES. The guarantee this package sells is maximality; before this suite,
// maximality was upheld by authoring discipline alone and would have silently
// rotted on the next schema change.
//
// Both failure modes above are replicated below as PERMANENT negative
// controls, so the guard itself cannot regress into a no-op.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import * as rootNs from '../../src/index.js';
import * as boundaryNs from '../../src/boundary/index.js';
import * as orchestratorNs from '../../src/orchestrator/index.js';
import {
  MAXIMAL_FIXTURES,
  MAXIMALITY_EXCLUSIONS,
  auditMaximality,
  auditMaximalityRaw,
  maximalityStats,
  type MaximalFixtureEntry,
} from '../../src/fixtures/index.js';
import {
  DecisionRecordPredictionSchema,
  DecisionRecordSchema,
} from '../../src/boundary/decision-record.js';

// ----------------------------------------------------------------------------
// Stable gap keys need the exported name of each schema identity.
// ----------------------------------------------------------------------------
function buildSchemaNames(): Map<z.ZodTypeAny, string> {
  const namespaces: Record<string, Record<string, unknown>> = {
    root: rootNs as unknown as Record<string, unknown>,
    boundary: boundaryNs as unknown as Record<string, unknown>,
    orchestrator: orchestratorNs as unknown as Record<string, unknown>,
  };
  const names = new Map<z.ZodTypeAny, string>();
  for (const [nsName, ns] of Object.entries(namespaces)) {
    for (const [exportName, value] of Object.entries(ns)) {
      // First name wins, so a re-export under a second name does not flip the
      // key from run to run.
      if (value instanceof z.ZodType && !names.has(value)) {
        names.set(value, `${nsName}/${exportName}`);
      }
    }
  }
  return names;
}

const schemaNames = buildSchemaNames();
const opts = { schemaNames, exclusions: MAXIMALITY_EXCLUSIONS };

function describeGaps(gaps: { key: string; kind: string; detail: string }[]): string {
  return gaps.map((g) => `  [${g.kind}] ${g.key}\n      ${g.detail}`).join('\n');
}

describe('maximality — every optional field, collection, and union branch is exercised', () => {
  it('the registry is fully maximal (no unpopulated field, empty collection, or dead union branch)', () => {
    const gaps = auditMaximality(MAXIMAL_FIXTURES, opts);
    expect(
      gaps,
      'The fixture library is no longer maximal. Each gap below is a field a ' +
        'consumer on an older pin could silently drop with no test noticing — ' +
        'the exact hazard this package exists to detect.\n' +
        describeGaps(gaps) +
        '\nFix by populating the field in the fixture, OR — only if it genuinely ' +
        'cannot be populated — add the printed key to MAXIMALITY_EXCLUSIONS in ' +
        'src/fixtures/index.ts with a documented reason.',
    ).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // ANTI-VACUITY. A walker that stopped introspecting (a Zod internals change,
  // an unrecognised wrapper) reports zero gaps and passes vacuously. Assert the
  // walk actually reached real surface, so "0 gaps" means "maximal" and not
  // "never looked".
  // --------------------------------------------------------------------------
  it('the walk reaches a non-trivial surface (guards against a vacuous pass)', () => {
    const stats = maximalityStats(MAXIMAL_FIXTURES, opts);
    expect(stats.objectSchemas).toBeGreaterThan(50);
    expect(stats.fieldSites).toBeGreaterThan(300);
    expect(stats.unions).toBeGreaterThan(3);
    expect(stats.collections).toBeGreaterThan(20);
    // Maximality means EVERY reached field site is populated somewhere, except
    // the ones a documented exclusion consciously carves out. Written as a sum
    // so this assertion and the zero-gaps assertion above stay simultaneously
    // satisfiable the moment MAXIMALITY_EXCLUSIONS is non-empty — otherwise the
    // escape hatch the walker documents would be unusable in practice.
    expect(stats.populatedFieldSites + stats.excludedFieldSites).toBe(stats.fieldSites);
    // An exclusion can never exceed the declared hatch — a non-zero count here
    // with an empty MAXIMALITY_EXCLUSIONS would mean the walker invented one.
    expect(stats.excludedFieldSites).toBeLessThanOrEqual(
      Object.keys(MAXIMALITY_EXCLUSIONS).length,
    );
  });

  it('recurses into nested shapes, not just top-level keys', () => {
    // DecisionRecordSchema only carries scalars + nested objects; if the walker
    // did not recurse, its nested prediction/outcome fields would never be
    // reached and the whole guard would be shallow.
    const nestedOnly = MAXIMAL_FIXTURES.filter(
      (e) => e.family === 'boundary/DecisionRecordSchema',
    );
    expect(nestedOnly).toHaveLength(1);
    const stats = maximalityStats(nestedOnly, { schemaNames });
    expect(stats.objectSchemas).toBeGreaterThan(1); // reached the nested objects
    expect(stats.fieldSites).toBeGreaterThan(10);
  });
});

// ----------------------------------------------------------------------------
// NEGATIVE CONTROLS — replicate, permanently, the two drift paths that the
// completeness ratchet provably does NOT catch.
// ----------------------------------------------------------------------------
describe('negative control 1 — a stripped fixture is caught', () => {
  const STRIPPED_OPTIONALS = [
    'confidence',
    'confidence_source',
    'probability_of_goal',
    'probability_of_joint_goal',
  ];

  /**
   * Rebuild the registry with the prediction fixture stripped to its single
   * required field, at EVERY site it appears (standalone entry AND nested
   * inside the DecisionRecord fixture) — the walker aggregates by schema
   * identity, so a half-strip would be legitimately covered by the other site.
   */
  function strippedRegistry(): MaximalFixtureEntry[] {
    const strippedPrediction = { statement: 'FIXTURE stripped prediction.' };
    return MAXIMAL_FIXTURES.map((entry) => {
      if (entry.schema === DecisionRecordPredictionSchema) {
        return { ...entry, fixture: strippedPrediction };
      }
      if (entry.schema === DecisionRecordSchema) {
        const record = entry.fixture as Record<string, unknown>;
        return { ...entry, fixture: { ...record, prediction: strippedPrediction } };
      }
      return entry;
    });
  }

  it('the stripped fixture still PARSES and still round-trips (why the old suite missed it)', () => {
    // This is the point: nothing about validity is wrong. The fixture is a
    // perfectly legal DecisionRecordPrediction. Only maximality is violated,
    // and only a maximality check can see it.
    const stripped = { statement: 'FIXTURE stripped prediction.' };
    expect(DecisionRecordPredictionSchema.parse(stripped)).toStrictEqual(stripped);
  });

  it('the walker flags exactly the four stripped optional fields', () => {
    const gaps = auditMaximality(strippedRegistry(), opts);
    expect(gaps.map((g) => g.key).sort()).toStrictEqual(
      STRIPPED_OPTIONALS.map((f) => `boundary/DecisionRecordPredictionSchema.${f}`).sort(),
    );
    for (const gap of gaps) expect(gap.kind).toBe('unpopulated-field');
  });

  it('an EMPTY registry entry (the trivial-fixture case) is caught', () => {
    // The completeness ratchet is satisfied by identity membership alone, so a
    // `fixture: {}` entry would pass it. Not here.
    const gaps = auditMaximality(
      [
        {
          family: 'boundary/DecisionRecordPredictionSchema',
          schema: DecisionRecordPredictionSchema,
          fixture: {},
        },
      ],
      { schemaNames },
    );
    // every field, required `statement` included, is unpopulated
    expect(gaps.length).toBe(5);
    expect(gaps.map((g) => g.key)).toContain(
      'boundary/DecisionRecordPredictionSchema.statement',
    );
  });
});

describe('negative control 2 — a new optional field on an EXISTING schema is caught', () => {
  // The dominant drift path, and the shape of every historical silent-drop
  // incident (coaching / evidence / enrichment). `.extend()` simulates the next
  // additive schema change WITHOUT touching a real schema definition.
  const Extended = DecisionRecordPredictionSchema.extend({
    negative_control_new_field: z.string().optional(),
  });

  it('the un-fixtured new field trips the walker', () => {
    const entry = MAXIMAL_FIXTURES.find(
      (e) => e.family === 'boundary/DecisionRecordPredictionSchema',
    );
    expect(entry).toBeDefined();
    const gaps = auditMaximality(
      [{ family: 'control/Extended', schema: Extended, fixture: entry!.fixture }],
      { schemaNames },
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe('unpopulated-field');
    expect(gaps[0].key).toBe('control/Extended.negative_control_new_field');
  });

  it('populating the new field clears the gap (the guard is satisfiable, not just noisy)', () => {
    const entry = MAXIMAL_FIXTURES.find(
      (e) => e.family === 'boundary/DecisionRecordPredictionSchema',
    );
    const fixture = {
      ...(entry!.fixture as Record<string, unknown>),
      negative_control_new_field: 'FIXTURE synthetic value.',
    };
    expect(
      auditMaximality(
        [{ family: 'control/Extended', schema: Extended, fixture }],
        { schemaNames },
      ),
    ).toEqual([]);
  });
});

describe('negative control 3 — empty collections and dead union branches are caught', () => {
  it('an array left empty where the schema allows contents is flagged', () => {
    const Schema = z.object({ items: z.array(z.object({ a: z.string() })) });
    const gaps = auditMaximality(
      [{ family: 'control/EmptyArray', schema: Schema, fixture: { items: [] } }],
      {},
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe('empty-collection');
  });

  it('an empty record where the schema allows contents is flagged', () => {
    const Schema = z.object({ map: z.record(z.string(), z.number()) });
    const gaps = auditMaximality(
      [{ family: 'control/EmptyRecord', schema: Schema, fixture: { map: {} } }],
      {},
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe('empty-collection');
  });

  it('an un-exercised union branch is flagged, and an exercised one is not', () => {
    const Schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('a'), a: z.string() }),
      z.object({ type: z.literal('b'), b: z.string() }),
    ]);
    const oneBranch = auditMaximality(
      [{ family: 'control/Union', schema: Schema, fixture: { type: 'a', a: 'x' } }],
      {},
    );
    expect(oneBranch).toHaveLength(1);
    expect(oneBranch[0].kind).toBe('unexercised-union-branch');
    expect(oneBranch[0].key).toContain('type=b');

    // Both branches exercised across the registry → no gap (aggregation).
    expect(
      auditMaximality(
        [
          { family: 'control/Union#a', schema: Schema, fixture: { type: 'a', a: 'x' } },
          { family: 'control/Union#b', schema: Schema, fixture: { type: 'b', b: 'y' } },
        ],
        {},
      ),
    ).toEqual([]);
  });

  it('terminates on a recursive (lazy) schema instead of hanging', () => {
    interface Tree { value: string; child?: Tree }
    const Tree: z.ZodType<Tree> = z.lazy(() =>
      z.object({ value: z.string(), child: Tree.optional() }),
    );
    const gaps = auditMaximality(
      [
        {
          family: 'control/Tree',
          schema: Tree,
          fixture: { value: 'a', child: { value: 'b', child: { value: 'c' } } },
        },
      ],
      {},
    );
    // Depth-capped walk completes; the leaf's absent `child` is a real gap.
    expect(gaps.every((g) => g.kind === 'unpopulated-field')).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// NEGATIVE CONTROL 4 — the escape hatch actually works.
//
// `exclusions` is the documented way to say "this gap is a conscious, reasoned
// decision". An option that is DECLARED but IGNORED is precisely the
// "machinery that looks like a guarantee but isn't" this package exists to
// prevent — so the hatch is proven end-to-end here, in both directions:
// auditMaximality drops the excluded gap AND maximalityStats accounts for it,
// so the suite's two assertions can coexist.
// ----------------------------------------------------------------------------
describe('negative control 4 — the exclusions escape hatch is honoured, not ignored', () => {
  const STRIPPED = { statement: 'FIXTURE stripped prediction.' };
  const EXCLUDED_KEY = 'boundary/DecisionRecordPredictionSchema.confidence';

  /** One entry with one real, deliberate gap: `confidence` is unpopulated. */
  function oneGapRegistry(): MaximalFixtureEntry[] {
    return [
      {
        family: 'boundary/DecisionRecordPredictionSchema',
        schema: DecisionRecordPredictionSchema,
        fixture: {
          ...STRIPPED,
          confidence_source: 'llm_self_report',
          probability_of_goal: 0.5,
          probability_of_joint_goal: 0.25,
        },
      } as MaximalFixtureEntry,
    ];
  }

  const exclusions = Object.freeze({
    [EXCLUDED_KEY]: 'Negative control: a documented, deliberate exclusion.',
  });

  it('auditMaximality drops the excluded gap and keeps the rest', () => {
    const raw = auditMaximalityRaw(oneGapRegistry(), { schemaNames });
    expect(raw.map((g) => g.key)).toStrictEqual([EXCLUDED_KEY]);
    expect(auditMaximality(oneGapRegistry(), { schemaNames, exclusions })).toEqual([]);
  });

  it('maximalityStats accounts for the exclusion instead of ignoring it', () => {
    const without = maximalityStats(oneGapRegistry(), { schemaNames });
    expect(without.excludedFieldSites).toBe(0);
    expect(without.populatedFieldSites).toBe(without.fieldSites - 1);

    const withExclusion = maximalityStats(oneGapRegistry(), { schemaNames, exclusions });
    // Same surface reached — an exclusion narrows the GUARANTEE, never the walk.
    expect(withExclusion.fieldSites).toBe(without.fieldSites);
    expect(withExclusion.populatedFieldSites).toBe(without.populatedFieldSites);
    expect(withExclusion.excludedFieldSites).toBe(1);
  });

  it('the suite’s two assertions coexist when an exclusion exists', () => {
    // Before this fix these were mutually exclusive: auditMaximality honoured
    // the exclusion (→ []) while maximalityStats ignored it, so
    // populatedFieldSites < fieldSites and the anti-vacuity assertion failed.
    const opts2 = { schemaNames, exclusions };
    expect(auditMaximality(oneGapRegistry(), opts2)).toEqual([]);
    const stats = maximalityStats(oneGapRegistry(), opts2);
    expect(stats.populatedFieldSites + stats.excludedFieldSites).toBe(stats.fieldSites);
  });

  it('an exclusion on a collection / union branch is accounted for too', () => {
    const Arr = z.object({ items: z.array(z.object({ a: z.string() })) });
    const arrEntry = [{ family: 'control/EmptyArray', schema: Arr, fixture: { items: [] } }];
    const arrKey = auditMaximalityRaw(arrEntry, {})[0].key;
    expect(auditMaximality(arrEntry, { exclusions: { [arrKey]: 'documented reason' } })).toEqual([]);
    expect(
      maximalityStats(arrEntry, { exclusions: { [arrKey]: 'documented reason' } })
        .excludedCollections,
    ).toBe(1);

    const Union = z.discriminatedUnion('type', [
      z.object({ type: z.literal('a'), a: z.string() }),
      z.object({ type: z.literal('b'), b: z.string() }),
    ]);
    const uEntry = [{ family: 'control/Union', schema: Union, fixture: { type: 'a', a: 'x' } }];
    const uKey = auditMaximalityRaw(uEntry, {})[0].key;
    expect(auditMaximality(uEntry, { exclusions: { [uKey]: 'documented reason' } })).toEqual([]);
    expect(
      maximalityStats(uEntry, { exclusions: { [uKey]: 'documented reason' } })
        .excludedUnionBranches,
    ).toBe(1);
  });

  it('a stale exclusion changes nothing (it excludes no real gap)', () => {
    const stats = maximalityStats(MAXIMAL_FIXTURES, {
      schemaNames,
      exclusions: { 'boundary/NoSuchSchema.no_such_field': 'stale' },
    });
    expect(stats.excludedFieldSites).toBe(0);
  });
});

describe('maximality exclusions hygiene', () => {
  it('every exclusion carries a documented reason', () => {
    for (const [key, reason] of Object.entries(MAXIMALITY_EXCLUSIONS)) {
      expect(reason, `Exclusion ${key} must document a reason`).toBeTruthy();
      expect(reason.length, `Exclusion ${key} reason too thin`).toBeGreaterThan(20);
    }
  });

  it('has no stale exclusion (each key still describes a real gap)', () => {
    const realGapKeys = new Set(
      auditMaximalityRaw(MAXIMAL_FIXTURES, { schemaNames }).map((g) => g.key),
    );
    const stale = Object.keys(MAXIMALITY_EXCLUSIONS).filter((k) => !realGapKeys.has(k));
    expect(
      stale,
      'Exclusions that no longer describe a real gap — delete them; a stale ' +
        'exclusion silently widens the hole it once documented.',
    ).toEqual([]);
  });
});

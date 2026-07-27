// AnalysisFact — the dishonest state, made unrepresentable.
// Arch step 2, contract slice 4. Codex contract step-2 finding F3 (P1).
//
// THE DEFECT THIS PINS. The shape this union replaces is a flat `status` field
// beside a separate option-keyed value map. Under that shape
// `status: 'suppressed'` and a still-present plausible number BOTH parse:
// nothing in the type system relates the two, so a guard can withhold a metric
// in one field while the number it withheld rides along in another, and a
// consumer reads the number and states it. No producer discipline closes that,
// because the contract cannot see it.
//
// THE BLIND CONTROL at the bottom of this file is that flat shape, reconstructed
// and kept permanently. It is what makes every negative above it non-vacuous:
// each DISCRIMINATING negative is asserted to PASS the flat shape and FAIL the
// union. An absence assertion that has never proved it can see a presence is
// theatre (this repo learned that from a leak test that captured 0 bytes).
//
// HONESTY ABOUT THAT CONTROL, stated rather than glossed: the flat shape was
// never shipped — `git grep AnalysisFact` at main tip `e048e35` returns nothing,
// and no `MetricProvenanceSchema` was ever published. So the RED evidence is a
// RECONSTRUCTION of the shape `CONTRACT-STEP2-DESIGN-2026-07-26.md` §item-3
// proposed, not a measurement of shipped code. That is the same disposition PR
// #23 took for F4, and it is stated here for the same reason: a control whose
// provenance is unstated invites the reader to believe it measured more than it
// did.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AnalysisFactSchema,
  ComputedFactSchema,
  UnavailableFactSchema,
  SuppressedFactSchema,
  SuppressionGuardSchema,
  AnalysisFactSubjectSchema,
  ANALYSIS_FACT_STATUSES,
  ANALYSIS_FACT_SUBJECT_KINDS,
  MetricStatusSchema,
} from '../../src/contracts/analysis-fact.js';
import {
  PopulationRefSchema,
  POPULATION_IDS,
  POPULATION_STAGES,
} from '../../src/contracts/generated-population-ref.js';
import { RunAnalysisResultSchema } from '../../src/orchestrator/handler-results.js';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

const accepts = (schema: z.ZodTypeAny, value: unknown) => schema.safeParse(value).success;

// The registry, read straight off disk. Population expectations below are
// DERIVED from it — a hand-copied id/stage pairing would drift the moment the
// registry did, and drift reads as green.
interface RegistryEntry {
  id: string;
  stage: string;
  parent_id?: string;
  transform_id?: string;
}
const registry = JSON.parse(
  readFileSync(join(ROOT, 'contracts/population-registry.json'), 'utf8'),
) as { stages: string[]; populations: RegistryEntry[] };

const realPopulation = registry.populations[0];
const wrongStageForRealPopulation = registry.stages.find((s) => s !== realPopulation.stage);

// ---------------------------------------------------------------------------
// Valid values, one per branch. Everything below is a mutation of one of these,
// so a negative can never differ from its positive in more than the one way it
// claims to.
// ---------------------------------------------------------------------------
const VALID_COMPUTED = {
  status: 'computed',
  fact_id: 'fact_wp_option_a',
  analysis_id: 'analysis_01J0TEST',
  metric_id: 'win_probability',
  subject: { kind: 'option', id: 'option_a' },
  value: 0.62,
  units: 'probability',
  method_id: 'isl.robustness.mc@2',
  population: { id: realPopulation.id, stage: realPopulation.stage },
} as const;

const VALID_UNAVAILABLE = {
  status: 'unavailable',
  fact_id: 'fact_evpi_goal_1',
  analysis_id: 'analysis_01J0TEST',
  metric_id: 'evpi',
  subject: { kind: 'goal', id: 'goal_1' },
  reason_code: 'solver_timeout',
} as const;

const VALID_SUPPRESSED = {
  status: 'suppressed',
  fact_id: 'fact_wp_option_c',
  analysis_id: 'analysis_01J0TEST',
  metric_id: 'win_probability',
  subject: { kind: 'option', id: 'option_c' },
  guard: {
    id: 'G02',
    version: '3',
    reason_code: 'insufficient_separation',
    evidence_fact_ids: ['fact_wp_option_b'],
  },
} as const;

/** Drop a key from a fact without mutating the source. */
function without<T extends Record<string, unknown>>(obj: T, key: keyof T): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...obj };
  delete copy[key as string];
  return copy;
}

// ---------------------------------------------------------------------------
// DISCRIMINATING negatives: the union REJECTS each; the flat shape ACCEPTS each.
// These are the cases the flat shape cannot see, which is the finding.
// ---------------------------------------------------------------------------
const DISCRIMINATING: Array<[string, unknown]> = [
  [
    'THE HEADLINE — a SUPPRESSED fact carrying a plausible number',
    { ...VALID_SUPPRESSED, value: 0.78 },
  ],
  [
    'the same fault with a value the eye skips over',
    { ...VALID_SUPPRESSED, value: 0 },
  ],
  ['an UNAVAILABLE fact carrying a number', { ...VALID_UNAVAILABLE, value: 0.41 }],
  ['a COMPUTED fact with no value at all', without(VALID_COMPUTED, 'value')],
  [
    'a computed value that is not finite — a failed computation wearing a computed label',
    { ...VALID_COMPUTED, value: Number.POSITIVE_INFINITY },
  ],
  ['a fact with NO SUBJECT — the metric is about nothing', without(VALID_COMPUTED, 'subject')],
  ['a fact with no fact_id — nothing can cite it', without(VALID_COMPUTED, 'fact_id')],
  ['a fact with no analysis_id — nothing can date it', without(VALID_COMPUTED, 'analysis_id')],
  ['a fact with no metric_id — nothing can say what it measures', without(VALID_COMPUTED, 'metric_id')],
  ['a computed fact with no units', without(VALID_COMPUTED, 'units')],
  ['a computed fact with no method_id', without(VALID_COMPUTED, 'method_id')],
  ['a computed fact with no population', without(VALID_COMPUTED, 'population')],
  [
    'a computed fact whose population id is not in the registry at all',
    { ...VALID_COMPUTED, population: { id: 'olumi.mc.typo@1', stage: 'raw' } },
  ],
  [
    'a computed fact with a REAL population id carrying the WRONG stage — the case F4 closed, inherited here',
    {
      ...VALID_COMPUTED,
      population: { id: realPopulation.id, stage: wrongStageForRealPopulation },
    },
  ],
  ['a suppressed fact that names no guard', without(VALID_SUPPRESSED, 'guard')],
  ['an unavailable fact that gives no reason', without(VALID_UNAVAILABLE, 'reason_code')],
  [
    'a suppressed fact whose guard is missing its version',
    { ...VALID_SUPPRESSED, guard: without(VALID_SUPPRESSED.guard, 'version') },
  ],
];

// ---------------------------------------------------------------------------
// NON-DISCRIMINATING negatives: the union rejects them, and so does the flat
// shape. Kept because they pin real rules — but counted separately and NEVER
// claimed as evidence for the finding. A control that returns the same answer
// as the test case is a blind instrument; the honest response is to say which
// cases those are, not to fold them into the total.
// ---------------------------------------------------------------------------
const NON_DISCRIMINATING: Array<[string, unknown, string]> = [
  [
    'an unknown status',
    { ...VALID_COMPUTED, status: 'withheld' },
    'both shapes close the status vocabulary — the flat shape had this rule too',
  ],
  [
    'an unknown extra key',
    { ...VALID_COMPUTED, sneaky_value: 0.78 },
    'both shapes are .strict()',
  ],
];

// ---------------------------------------------------------------------------
// NO FLAT COUNTERPART: rules about `subject`, which the flat shape does not
// declare AT ALL. The control cannot answer these either way, so they are held
// apart from both lists above rather than being scored as wins. (The ABSENCE of
// a subject IS scored, above — a fact about nothing is a defect the flat shape
// genuinely accepts.)
// ---------------------------------------------------------------------------
const NO_FLAT_COUNTERPART: Array<[string, unknown]> = [
  ['a subject kind outside the closed five', { ...VALID_COMPUTED, subject: { kind: 'planet', id: 'x' } }],
  ['a subject with an empty id', { ...VALID_COMPUTED, subject: { kind: 'option', id: '' } }],
];

// ===========================================================================
describe('AnalysisFactSchema · positive controls — one per valid variant', () => {
  it('ACCEPTS a ComputedFact', () => {
    expect(accepts(AnalysisFactSchema, VALID_COMPUTED)).toBe(true);
    expect(accepts(ComputedFactSchema, VALID_COMPUTED)).toBe(true);
  });

  it('ACCEPTS an UnavailableFact', () => {
    expect(accepts(AnalysisFactSchema, VALID_UNAVAILABLE)).toBe(true);
    expect(accepts(UnavailableFactSchema, VALID_UNAVAILABLE)).toBe(true);
  });

  it('ACCEPTS a SuppressedFact', () => {
    expect(accepts(AnalysisFactSchema, VALID_SUPPRESSED)).toBe(true);
    expect(accepts(SuppressedFactSchema, VALID_SUPPRESSED)).toBe(true);
  });

  it('ACCEPTS the optional storage row id, and it is NOT the fact id', () => {
    const withRow = { ...VALID_COMPUTED, storage_fact_row_id: 'row_0001' };
    const parsed = AnalysisFactSchema.parse(withRow);
    expect(parsed.storage_fact_row_id).toBe('row_0001');
    expect(parsed.fact_id).not.toBe(parsed.storage_fact_row_id);
  });

  it('ACCEPTS an empty evidence list — a structural guard may cite nothing', () => {
    expect(
      accepts(AnalysisFactSchema, {
        ...VALID_SUPPRESSED,
        guard: { ...VALID_SUPPRESSED.guard, evidence_fact_ids: [] },
      }),
    ).toBe(true);
  });

  it('ACCEPTS every subject kind the vocabulary declares', () => {
    for (const kind of ANALYSIS_FACT_SUBJECT_KINDS) {
      expect(accepts(AnalysisFactSubjectSchema, { kind, id: 'entity_1' }), kind).toBe(true);
    }
  });

  it('narrows on the discriminator — a parsed computed fact yields its value', () => {
    const parsed = AnalysisFactSchema.parse(VALID_COMPUTED);
    // This is the consumer-side point of the union: the number is reachable
    // ONLY after the status has been read, by construction.
    if (parsed.status === 'computed') expect(parsed.value).toBe(0.62);
    else throw new Error('discriminator did not select the computed branch');
  });
});

describe('AnalysisFactSchema · negative — the dishonest states', () => {
  it.each(DISCRIMINATING)('REJECTS %s', (_label, value) => {
    expect(accepts(AnalysisFactSchema, value)).toBe(false);
  });

  it.each(NON_DISCRIMINATING)('REJECTS %s', (_label, value) => {
    expect(accepts(AnalysisFactSchema, value)).toBe(false);
  });

  it.each(NO_FLAT_COUNTERPART)('REJECTS %s', (_label, value) => {
    expect(accepts(AnalysisFactSchema, value)).toBe(false);
  });

  it('the headline rejection names the offending key, not something vague', () => {
    const r = AnalysisFactSchema.safeParse({ ...VALID_SUPPRESSED, value: 0.78 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const issue = r.error.issues.find((i) => i.code === 'unrecognized_keys');
    expect(issue, 'a suppressed fact carrying a value must fail as an UNRECOGNIZED KEY').toBeDefined();
    expect((issue as z.ZodIssue & { keys: string[] }).keys).toContain('value');
  });

  it('`value` is not declared on the withholding branches — forbidden, not optional', () => {
    // The guarantee stated structurally rather than only behaviourally: if a
    // later edit added `value: z.number().optional()` to either branch, every
    // negative above would still fail for other reasons on some inputs, but
    // THIS assertion goes red immediately and says why.
    expect(Object.keys(UnavailableFactSchema.shape)).not.toContain('value');
    expect(Object.keys(SuppressedFactSchema.shape)).not.toContain('value');
    expect(Object.keys(ComputedFactSchema.shape)).toContain('value');
    for (const branch of [UnavailableFactSchema, SuppressedFactSchema]) {
      expect(branch._def.unknownKeys, 'a withholding branch MUST be strict').toBe('strict');
    }
  });
});

describe('AnalysisFactSchema · the population ref is REUSED, not re-implemented', () => {
  it('is the SAME schema object the registry generates (identity, not resemblance)', () => {
    // The anti-mirror assertion. A hand-written `{id: string, stage: enum}` here
    // would pass every behavioural test that only used registry-valid values —
    // and would silently re-open F4. Identity cannot be faked.
    expect(ComputedFactSchema.shape.population).toBe(PopulationRefSchema);
  });

  it('accepts exactly the (id, stage) pairs the registry declares — full cross-product', () => {
    const accepted: string[] = [];
    for (const id of POPULATION_IDS) {
      for (const stage of POPULATION_STAGES) {
        if (accepts(AnalysisFactSchema, { ...VALID_COMPUTED, population: { id, stage } })) {
          accepted.push(`${id}|${stage}`);
        }
      }
    }
    const declared = registry.populations.map((p) => `${p.id}|${p.stage}`).sort();
    expect(accepted.sort()).toEqual(declared);
    // Non-vacuity: the cross-product must be strictly larger than the answer,
    // or this test would pass by having nothing to reject.
    expect(POPULATION_IDS.length * POPULATION_STAGES.length).toBeGreaterThan(declared.length);
  });
});

describe('AnalysisFactSchema · the status vocabulary is one vocabulary, not two', () => {
  it("the union's discriminator values EQUAL MetricStatusSchema's — derived from both", () => {
    // MetricStatusSchema and the three branch literals are two statements of
    // one vocabulary; a mirror that nobody checks is this estate's dominant
    // defect. Derived from the runtime schemas on both sides so it fails loud.
    const branchLiterals = AnalysisFactSchema.options
      .map((o) => (o.shape.status as z.ZodLiteral<string>)._def.value)
      .sort();
    expect(branchLiterals).toEqual([...ANALYSIS_FACT_STATUSES].sort());
    expect(branchLiterals).toEqual([...MetricStatusSchema.options].sort());
    expect(AnalysisFactSchema._def.discriminator).toBe('status');
  });

  it('every branch is reachable — no declared status parses to the wrong branch', () => {
    const byStatus: Record<string, unknown> = {
      computed: VALID_COMPUTED,
      unavailable: VALID_UNAVAILABLE,
      suppressed: VALID_SUPPRESSED,
    };
    for (const status of ANALYSIS_FACT_STATUSES) {
      const parsed = AnalysisFactSchema.parse(byStatus[status]);
      expect(parsed.status, `${status} must select its own branch`).toBe(status);
    }
  });
});

describe('RunAnalysisResult.analysis_facts · the attachment actually validates', () => {
  const base = {
    scenario_id: '00000000-0000-4000-8000-000000000000',
    leading_option_id: 'option_a',
    summary: 'FIXTURE summary',
  };

  it('ACCEPTS a result carrying a mixed array of facts', () => {
    expect(
      accepts(RunAnalysisResultSchema, {
        ...base,
        analysis_facts: [VALID_COMPUTED, VALID_UNAVAILABLE, VALID_SUPPRESSED],
      }),
    ).toBe(true);
  });

  it('ACCEPTS a result with no analysis_facts at all — every historic row', () => {
    expect(accepts(RunAnalysisResultSchema, base)).toBe(true);
  });

  it('ACCEPTS an EMPTY array — "this producer emitted none" is a different claim from absence', () => {
    expect(accepts(RunAnalysisResultSchema, { ...base, analysis_facts: [] })).toBe(true);
  });

  it('REJECTS a dishonest fact nested inside the array', () => {
    // The attachment is NOT z.array(z.unknown()). If it were, every assertion
    // in this file would be true of a schema nothing on the persisted path ever
    // consults — the guarantee-theatre shape.
    expect(
      accepts(RunAnalysisResultSchema, {
        ...base,
        analysis_facts: [VALID_COMPUTED, { ...VALID_SUPPRESSED, value: 0.78 }],
      }),
    ).toBe(false);
  });

  it('RETAINS the legacy maps — this slice removes nothing', () => {
    expect(
      accepts(RunAnalysisResultSchema, {
        ...base,
        win_probabilities: { option_a: 0.62, option_c: 0.38 },
        analysis_facts: [VALID_COMPUTED],
      }),
    ).toBe(true);
  });

  it('DISCLOSED LIMIT — the legacy map can still contradict a suppressed fact', () => {
    // Stated as an assertion rather than left for a reader to discover. The
    // union makes the dishonest state unrepresentable WITHIN A FACT; it does
    // not, and cannot, delete `win_probabilities`, which is deliberately
    // RETAINED for the compatibility window. So a producer emitting BOTH can
    // still put a withheld number on the record via the legacy map. Closing
    // that is the removal train, gated on a verified consumer of the facts —
    // tracked in the adoption-manifest row, not asserted away here.
    expect(
      accepts(RunAnalysisResultSchema, {
        ...base,
        win_probabilities: { option_c: 0.78 },
        analysis_facts: [VALID_SUPPRESSED],
      }),
    ).toBe(true);
  });
});

// ===========================================================================
// BLIND CONTROL — the flat shape, reconstructed and kept permanently.
//
// Transcribed from CONTRACT-STEP2-DESIGN-2026-07-26.md §item-3's own code
// block (`MetricProvenanceSchema`: flat `status` enum, `units?`, `method_id?`,
// `population?`, `fact_id?`, `.strict()`), extended with the `value` member a
// lane would naturally put beside them when writing a fact RECORD rather than
// a union. Note what the design's block does NOT declare: any `subject`. That
// omission is itself one of the negatives above.
// ===========================================================================
describe('BLIND CONTROL · the flat shape accepts what the union rejects', () => {
  const BlindPopulationRefSchema = z
    .object({
      id: z.string().min(1),
      stage: z.enum(registry.stages as [string, ...string[]]),
    })
    .strict();

  const BlindAnalysisFactSchema = z
    .object({
      // Flat enum, NOT a discriminator — this is the whole finding.
      status: z.enum(ANALYSIS_FACT_STATUSES),
      value: z.number().optional(),
      units: z.string().min(1).optional(),
      method_id: z.string().min(1).optional(),
      population: BlindPopulationRefSchema.optional(),
      fact_id: z.string().min(1).optional(),
      analysis_id: z.string().min(1).optional(),
      metric_id: z.string().min(1).optional(),
      reason_code: z.string().min(1).optional(),
      guard: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

  /**
   * The flat shape declares NO `subject` member — that omission is one of the
   * things this slice fixes, and it means a fact carrying `subject` fails the
   * flat shape on `.strict()` alone, for a reason that has nothing to do with
   * honesty. So each negative is compared against the flat shape through its
   * PROJECTION onto that shape: `subject` removed, everything else untouched.
   * Stating the projection is the point — a control that quietly reshaped its
   * inputs would be measuring something other than what it claims.
   */
  const projectOntoFlat = (value: unknown) =>
    value && typeof value === 'object'
      ? without(value as Record<string, unknown>, 'subject')
      : value;

  it.each(DISCRIMINATING)('the flat shape ACCEPTS %s', (_label, value) => {
    expect(
      accepts(BlindAnalysisFactSchema, projectOntoFlat(value)),
      'if this ever fails, the negative above stopped discriminating and the control is hollow',
    ).toBe(true);
  });

  it.each(NON_DISCRIMINATING)(
    'the flat shape ALSO rejects %s — recorded, never counted as evidence',
    (_label, value, _why) => {
      expect(accepts(BlindAnalysisFactSchema, projectOntoFlat(value))).toBe(false);
    },
  );

  it.each(NO_FLAT_COUNTERPART)(
    'the flat shape cannot answer %s at all — no `subject` member exists in it',
    (_label, value) => {
      // Both directions, so the "no counterpart" label is proved rather than
      // asserted: with the subject present the flat shape trips on the KEY (not
      // on the fault), and with it projected away the fault is gone entirely.
      expect(accepts(BlindAnalysisFactSchema, value)).toBe(false);
      expect(accepts(BlindAnalysisFactSchema, projectOntoFlat(value))).toBe(true);
    },
  );

  it('the control is not hollow — it accepts the valid facts too', () => {
    // A "control" that rejected everything would make every ACCEPTS assertion
    // above meaningless in the other direction.
    for (const v of [VALID_COMPUTED, VALID_UNAVAILABLE, VALID_SUPPRESSED]) {
      expect(accepts(BlindAnalysisFactSchema, projectOntoFlat(v))).toBe(true);
    }
  });

  it('THE F3 SENTENCE, executable: flat status + a live value map both parse', () => {
    // Codex F3 in one payload. Under the flat design, `win_probability` on
    // option_c is marked SUPPRESSED in the provenance map and is simultaneously
    // present, as a plausible number, in the value map. Nothing rejects it.
    const BlindResultSchema = z
      .object({
        win_probabilities: z.record(z.string(), z.number()).optional(),
        metric_provenance: z.record(z.string(), BlindAnalysisFactSchema).optional(),
      })
      .strict();

    const dishonest = {
      win_probabilities: { option_c: 0.78 },
      metric_provenance: { 'win_probability/option_c': { status: 'suppressed' as const } },
    };
    expect(accepts(BlindResultSchema, dishonest)).toBe(true);

    // The same claim, expressed as ONE fact, in the shipped union:
    expect(
      accepts(AnalysisFactSchema, { ...VALID_SUPPRESSED, value: 0.78 }),
      'the union must not be able to express what the flat shape just did',
    ).toBe(false);
  });

  it('every negative in this file is driven through the control', () => {
    // The it.each blocks above are driven by the SAME arrays, so the two sides
    // cannot drift apart; this pins the arrays against being emptied.
    expect(DISCRIMINATING.length).toBeGreaterThanOrEqual(17);
    expect(NON_DISCRIMINATING.length).toBeGreaterThanOrEqual(2);
    expect(NO_FLAT_COUNTERPART.length).toBeGreaterThanOrEqual(2);
    // Every case is distinct — a duplicated entry would inflate the count
    // without adding a rule.
    const labels = [...DISCRIMINATING, ...NON_DISCRIMINATING, ...NO_FLAT_COUNTERPART].map(
      ([l]) => l,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('SuppressionGuardSchema · guard identity is complete', () => {
  it('REJECTS a guard missing any required member', () => {
    for (const key of ['id', 'version', 'reason_code', 'evidence_fact_ids'] as const) {
      expect(
        accepts(SuppressionGuardSchema, without(VALID_SUPPRESSED.guard, key)),
        `guard without ${key} must be rejected`,
      ).toBe(false);
    }
  });

  it('REJECTS an evidence id that is an empty string', () => {
    expect(
      accepts(SuppressionGuardSchema, { ...VALID_SUPPRESSED.guard, evidence_fact_ids: [''] }),
    ).toBe(false);
  });
});

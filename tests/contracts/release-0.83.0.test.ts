import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AnalysisEnrichmentSchema,
  DecisionRecordPredictionSchema,
  DraftGoalConstraintSchema,
  EnrichmentConstraintResultSchema,
  EnrichmentOptionComparisonEntrySchema,
  EnrichmentProbabilityPrecisionSchema,
  LegacyGoalConstraintStubSchema,
  V2RunRequestSchema,
} from '../../src/boundary/index.js';
import { RunInputSnapshotSchema } from '../../src/orchestrator/run-input-snapshot.js';
import { maximalV2RunRequest } from '../../src/fixtures/index.js';

// Frozen 0.82.0 shapes: no precision, existing inclusive comparisons.
const constraint = { constraint_id: 'conversion', node_id: 'conversion', operator: '>=', value: 15 };
const snapshot = {
  snapshot_version: 1,
  sent_digest: 'a'.repeat(64),
  goal: { node_id: 'conversion', operator: '>=', target_raw: 15, unit: '%' },
  options: [{ option_id: 'launch', settings: [] }],
  options_not_sent: [], factors: [], links: [],
  constraints: [{ constraint_id: 'conversion', node_id: 'conversion', operator: '>=', raw: 15 }],
};
const option = { option_id: 'launch', probability_of_joint_goal: 0.58, constraint_probabilities: { conversion: 0.7 } };
const marginal = { ...constraint, probability: 0.7 };
const prediction = { statement: 'Both launch targets met', probability_of_joint_goal: 0.58 };
const precision = { n_informative: 1000, standard_error: 0.0156 };

describe('0.83.0 comparison transport', () => {
  it.each(['>', '<', '>=', '<='])('retains %s on the draft, Run snapshot and V2 request', (operator) => {
    expect(DraftGoalConstraintSchema.parse({ ...constraint, operator }).operator).toBe(operator);
    const input = {
      ...snapshot, goal: { ...snapshot.goal, operator },
      constraints: [{ ...snapshot.constraints[0], operator }],
    };
    expect(RunInputSnapshotSchema.parse(input)).toStrictEqual(input);
    const request = {
      ...maximalV2RunRequest,
      constraints: [{ ...maximalV2RunRequest.constraints[0], bound: operator }],
    };
    expect(V2RunRequestSchema.parse(request)).toStrictEqual(request);
    expect(EnrichmentConstraintResultSchema.parse({ ...marginal, operator }).operator).toBe(operator);
  });

  it('rejects an unknown operator in every closed request comparator', () => {
    expect(DraftGoalConstraintSchema.safeParse({ ...constraint, operator: 'above' }).success).toBe(false);
    expect(RunInputSnapshotSchema.safeParse({ ...snapshot, goal: { ...snapshot.goal, operator: 'above' } }).success).toBe(false);
    expect(RunInputSnapshotSchema.safeParse({ ...snapshot, constraints: [{ ...snapshot.constraints[0], operator: 'above' }] }).success).toBe(false);
    expect(LegacyGoalConstraintStubSchema.safeParse({ ...maximalV2RunRequest.constraints[0], bound: 'above' }).success).toBe(false);
  });

  it.each(['lt', 'lte', 'gt', 'gte', 'eq'])('preserves legacy V2 bound %s', (bound) => {
    const old = { ...maximalV2RunRequest.constraints[0], bound };
    expect(LegacyGoalConstraintStubSchema.parse(old)).toStrictEqual(old);
  });

  it('preserves 0.82.0-shaped payloads without introducing precision defaults', () => {
    expect(RunInputSnapshotSchema.parse(snapshot)).toStrictEqual(snapshot);
    expect(DraftGoalConstraintSchema.parse(constraint)).toStrictEqual(constraint);
    const enrichment = { option_comparison: [option], constraint_results: [marginal] };
    expect(AnalysisEnrichmentSchema.parse(enrichment)).toStrictEqual(enrichment);
    expect(DecisionRecordPredictionSchema.parse(prediction)).toStrictEqual(prediction);
    // This result vocabulary was open in 0.82.0 and must remain open.
    expect(EnrichmentConstraintResultSchema.parse({ ...marginal, operator: 'future_operator' }).operator).toBe('future_operator');
  });
});

// PLoT #448 is the producer and its names win (independent check C round 1):
//   option_comparison[].probability_of_joint_goal_precision   (engine-v3.ts OptionComparisonV3)
//   option_comparison[].constraint_probabilities_precision{id} (engine-v3.ts OptionComparisonV3)
//   constraint_results[].probability_precision                 (engine-v3.ts ConstraintResult)
// The stored decision prediction is not a PLoT wire key and keeps its own name.
const carriers = [
  {
    name: 'joint option result', schema: EnrichmentOptionComparisonEntrySchema, base: option,
    field: 'probability_of_joint_goal_precision', wrap: (v: unknown) => v,
  },
  {
    name: 'per-option constraint results', schema: EnrichmentOptionComparisonEntrySchema, base: option,
    field: 'constraint_probabilities_precision', wrap: (v: unknown) => ({ conversion: v }),
  },
  {
    name: 'top-level constraint result', schema: EnrichmentConstraintResultSchema, base: marginal,
    field: 'probability_precision', wrap: (v: unknown) => v,
  },
  {
    name: 'stored prediction', schema: DecisionRecordPredictionSchema, base: prediction,
    field: 'joint_probability_precision', wrap: (v: unknown) => v,
  },
] as const;

describe.each(carriers)('0.83.0 precision on $name ($field)', ({ schema, base, field, wrap }) => {
  it('is optional and retains both members when present', () => {
    expect(schema.parse(base)).toStrictEqual(base);
    const input = { ...base, [field]: wrap(precision) };
    expect(schema.parse(input)).toStrictEqual(input);
  });

  it.each([
    { n_informative: 1, standard_error: 0 }, // p = 0 or 1 gives a plug-in SE of 0
    { n_informative: 4, standard_error: 0.5 }, // the largest SE a proportion can have
  ])('accepts the producer bounds %j', (edge) => {
    const input = { ...base, [field]: wrap(edge) };
    expect(schema.parse(input)).toStrictEqual(input);
  });

  it.each([
    null, {}, { n_informative: 1000 }, { standard_error: 0.01 },
    { ...precision, n_informative: 0 }, { ...precision, n_informative: -1 },
    { ...precision, n_informative: 1.5 }, { ...precision, n_informative: '1000' },
    { ...precision, n_informative: Infinity },
    { ...precision, standard_error: -0.01 }, { ...precision, standard_error: 0.5000001 },
    { ...precision, standard_error: Infinity }, { ...precision, standard_error: NaN },
    { ...precision, standard_error: '0.01' },
    { ...precision, extra: true },
  ])('refuses malformed precision %j', (invalid) => {
    expect(schema.safeParse({ ...base, [field]: wrap(precision) }).success).toBe(true);
    expect(schema.safeParse({ ...base, [field]: wrap(invalid) }).success).toBe(false);
  });
});

describe('0.83.0 precision names match the producer', () => {
  const typed = (schema: { shape: Record<string, unknown> }) => Object.keys(schema.shape);
  const jsonProps = (name: string) => Object.keys((JSON.parse(
    readFileSync(new URL(`../../json-schema/${name}.json`, import.meta.url), 'utf8'),
  ) as { definitions: Record<string, { properties: Record<string, unknown> }> }).definitions[name].properties);

  it('types PLoT\'s option-entry keys, in Zod and in the published JSON schema', () => {
    for (const keys of [typed(EnrichmentOptionComparisonEntrySchema), jsonProps('EnrichmentOptionComparisonEntrySchema')]) {
      expect(keys).toContain('probability_of_joint_goal_precision');
      expect(keys).toContain('constraint_probabilities_precision');
      expect(keys).not.toContain('joint_probability_precision');
    }
  });

  it('types PLoT\'s constraint-result key, in Zod and in the published JSON schema', () => {
    for (const keys of [typed(EnrichmentConstraintResultSchema), jsonProps('EnrichmentConstraintResultSchema')]) {
      expect(keys).toContain('probability_precision');
      expect(keys).not.toContain('prob_satisfied_precision');
    }
  });

  it('leaves the old names untyped: passthrough keeps them unvalidated, so they carry no contract', () => {
    const bad = { n_informative: -1 };
    expect(EnrichmentOptionComparisonEntrySchema.parse({ ...option, joint_probability_precision: bad }))
      .toStrictEqual({ ...option, joint_probability_precision: bad });
    expect(EnrichmentConstraintResultSchema.parse({ ...marginal, prob_satisfied_precision: bad }))
      .toStrictEqual({ ...marginal, prob_satisfied_precision: bad });
  });
});

it('retains a PLoT #448-shaped enrichment with all three precision keys', () => {
  const input = {
    option_comparison: [{
      ...option,
      probability_of_joint_goal_precision: precision,
      constraint_probabilities_precision: { conversion: precision },
    }],
    constraint_results: [{ ...marginal, option_id: 'launch', probability_precision: precision }],
  };
  expect(AnalysisEnrichmentSchema.parse(input)).toStrictEqual(input);
});

it('refuses a zero informative count: PLoT never sends precision without an informative draw', () => {
  expect(EnrichmentProbabilityPrecisionSchema.safeParse({ n_informative: 0, standard_error: 0 }).success).toBe(false);
  expect(EnrichmentProbabilityPrecisionSchema.parse({ n_informative: 1, standard_error: 0 }))
    .toStrictEqual({ n_informative: 1, standard_error: 0 });
});

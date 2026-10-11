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

const carriers = [
  { name: 'joint option result', schema: EnrichmentOptionComparisonEntrySchema, base: option, field: 'joint_probability_precision' },
  { name: 'marginal result', schema: EnrichmentConstraintResultSchema, base: marginal, field: 'prob_satisfied_precision' },
  { name: 'stored prediction', schema: DecisionRecordPredictionSchema, base: prediction, field: 'joint_probability_precision' },
] as const;

describe.each(carriers)('0.83.0 precision on $name', ({ schema, base, field }) => {
  it('is optional and retains both members when present', () => {
    expect(schema.parse(base)).toStrictEqual(base);
    const input = { ...base, [field]: precision };
    expect(schema.parse(input)).toStrictEqual(input);
  });

  it.each([
    null, {}, { n_informative: 1000 }, { standard_error: 0.01 },
    { ...precision, n_informative: -1 }, { ...precision, n_informative: 1.5 },
    { ...precision, n_informative: '1000' }, { ...precision, n_informative: Infinity },
    { ...precision, standard_error: -0.01 }, { ...precision, standard_error: Infinity },
    { ...precision, standard_error: NaN }, { ...precision, standard_error: '0.01' },
    { ...precision, extra: true },
  ])('refuses malformed precision %j', (invalid) => {
    expect(schema.safeParse({ ...base, [field]: precision }).success).toBe(true);
    expect(schema.safeParse({ ...base, [field]: invalid }).success).toBe(false);
  });
});

it('retains precision through the full enrichment parse', () => {
  const input = {
    option_comparison: [{ ...option, joint_probability_precision: precision }],
    constraint_results: [{ ...marginal, prob_satisfied_precision: precision }],
  };
  expect(AnalysisEnrichmentSchema.parse(input)).toStrictEqual(input);
});

it('allows zero-valued count and error without claiming a precision licence', () => {
  const zero = { n_informative: 0, standard_error: 0 };
  expect(EnrichmentProbabilityPrecisionSchema.parse(zero)).toStrictEqual(zero);
});

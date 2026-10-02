import { describe, expect, it } from 'vitest';
import { ModelVersionDiffV1Schema, ModelVersionDiffV2Schema, RunDeltaSchema } from '../../src/boundary/index.js';
import * as built from '../../dist/boundary/index.js';
import {
  maximalModelVersionDiffV1,
  maximalModelVersionDiffV2,
  maximalModelVersionDiffV2SharedRun,
  maximalModelVersionDiffV2Unavailable,
} from '../../src/fixtures/index.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('version results use the selected pair and one comparison authority', () => {
  it.each([maximalModelVersionDiffV2, maximalModelVersionDiffV2SharedRun, maximalModelVersionDiffV2Unavailable])(
    'round-trips each result arm through source and published boundary', (fixture) => {
      expect(ModelVersionDiffV2Schema.parse(fixture)).toStrictEqual(fixture);
      expect(built.ModelVersionDiffV2Schema.parse(fixture)).toStrictEqual(fixture);
    },
  );

  it('uses the canonical RunDelta schema by object identity', () => {
    const results = ModelVersionDiffV2Schema._def.schema.shape.result_comparison;
    expect(results._def.options[0].shape.run_delta).toBe(RunDeltaSchema);
  });

  it('keeps v1 byte-compatible and strict; v2 is explicitly requested', () => {
    expect(ModelVersionDiffV1Schema.parse(maximalModelVersionDiffV1)).toStrictEqual(maximalModelVersionDiffV1);
    expect(ModelVersionDiffV1Schema.safeParse(maximalModelVersionDiffV2).success).toBe(false);
    expect(ModelVersionDiffV2Schema.safeParse(maximalModelVersionDiffV1).success).toBe(false);
    expect(ModelVersionDiffV1Schema.safeParse({ ...maximalModelVersionDiffV1, result_comparison: {} }).success).toBe(false);
  });

  it.each(['missing_run', 'unconfirmed_identity', 'incompatible_results'])('has figure-free %s', (reason) => {
    const fixture = { ...maximalModelVersionDiffV2Unavailable, result_comparison: { status: 'unavailable', reason } };
    expect(ModelVersionDiffV2Schema.parse(fixture)).toStrictEqual(fixture);
    expect(ModelVersionDiffV2Schema.safeParse({ ...fixture,
      result_comparison: { ...fixture.result_comparison, run_delta: maximalModelVersionDiffV2.result_comparison.run_delta },
    }).success).toBe(false);
  });

  it('carries a shared Run once and forbids a duplicated pair or delta', () => {
    const shared = copy(maximalModelVersionDiffV2SharedRun);
    expect(ModelVersionDiffV2Schema.safeParse({ ...shared, result_comparison: {
      ...shared.result_comparison, run_delta: maximalModelVersionDiffV2.result_comparison.run_delta,
    } }).success).toBe(false);
    const run = shared.result_comparison.recorded_run;
    const delta = {
      attribution_case: 'C0_identical',
      pair_provenance: { seed_equal: true, hash_equal: true, builds_equal: 'equal', n_equal: true },
      leader: { changed: false, noise_verdict: 'not_noise_qualified' },
      win_probabilities: [], flip_thresholds: [],
      endpoints: { prior: { run_id: run.run_id, computed_at: run.computed_at },
        current: { run_id: run.run_id, computed_at: run.computed_at } },
      input_coverage: 'complete', input_changes: [],
    };
    // The canonical delta already refuses comparing a Run with itself.
    expect(RunDeltaSchema.safeParse(delta).success).toBe(false);
    expect(ModelVersionDiffV2Schema.safeParse({ ...shared, result_comparison: {
      status: 'available', kind: 'paired_runs', prior_run: run, current_run: run, run_delta: delta,
    } }).success).toBe(false);
    expect(ModelVersionDiffV2Schema.safeParse({ ...shared, analysis_equivalent: false }).success).toBe(false);
  });

  it.each(['prior', 'current'] as const)('refuses a %s endpoint from another pair or date', (side) => {
    for (const field of ['run_id', 'computed_at'] as const) {
      const fixture = copy(maximalModelVersionDiffV2);
      fixture.result_comparison.run_delta.endpoints[side][field] = field === 'run_id'
        ? 'fixture_other_run' : '2026-10-01T00:00:00.000Z';
      expect(ModelVersionDiffV2Schema.safeParse(fixture).success).toBe(false);
    }
  });

  it('requires endpoint identity, not figures alone', () => {
    const fixture = copy(maximalModelVersionDiffV2);
    const { endpoints: _endpoints, ...delta } = fixture.result_comparison.run_delta;
    expect(ModelVersionDiffV2Schema.safeParse({ ...fixture,
      result_comparison: { ...fixture.result_comparison, run_delta: delta },
    }).success).toBe(false);
  });

  it.each(['prior_run', 'current_run'] as const)('refuses a cross-scenario %s', (side) => {
    const fixture = copy(maximalModelVersionDiffV2);
    fixture.result_comparison[side].scenario_id = '11111111-1111-4111-8111-111111111111';
    expect(ModelVersionDiffV2Schema.safeParse(fixture).success).toBe(false);
  });

  it.each(['', 'a'.repeat(64), 'A'.repeat(16), 'not-a-hash'])('refuses unsupported Run identity %s', (hash) => {
    const fixture = copy(maximalModelVersionDiffV2);
    fixture.result_comparison.prior_run.graph_hash_at_run = hash;
    expect(ModelVersionDiffV2Schema.safeParse(fixture).success).toBe(false);
  });

  it('checks version/Run equality against the producer provenance', () => {
    const fixture = copy(maximalModelVersionDiffV2);
    fixture.result_comparison.current_run.graph_hash_at_run = fixture.result_comparison.prior_run.graph_hash_at_run;
    expect(ModelVersionDiffV2Schema.safeParse(fixture).success).toBe(false);
    expect(ModelVersionDiffV2Schema.safeParse({ ...maximalModelVersionDiffV2, analysis_equivalent: true }).success).toBe(false);
  });

  it('rejects impossible attribution through the original RunDelta rules', () => {
    const fixture = copy(maximalModelVersionDiffV2);
    fixture.result_comparison.run_delta.pair_provenance.seed_equal = false;
    expect(ModelVersionDiffV2Schema.safeParse(fixture).success).toBe(false);
  });

  it('never accepts raw result envelopes as a second comparison source', () => {
    expect(ModelVersionDiffV2Schema.safeParse({ ...maximalModelVersionDiffV2,
      result_comparison: { ...maximalModelVersionDiffV2.result_comparison, prior_result: {}, current_result: {} },
    }).success).toBe(false);
  });

  it('retains all v1 model-diff honesty rules', () => {
    const cases = [
      { ...maximalModelVersionDiffV1, relation: 'identical' },
      { ...maximalModelVersionDiffV1, to_version_id: maximalModelVersionDiffV1.from_version_id },
      { ...maximalModelVersionDiffV1, coverage: { ...maximalModelVersionDiffV1.coverage, known_uninterpreted_paths: [] } },
    ];
    for (const fixture of cases) {
      expect(ModelVersionDiffV1Schema.safeParse(fixture).success).toBe(false);
      expect(ModelVersionDiffV2Schema.safeParse({ ...fixture, schema: 'model_version_diff.v2',
        result_comparison: maximalModelVersionDiffV2.result_comparison }).success).toBe(false);
    }
  });
});

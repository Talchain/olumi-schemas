/**
 * 0.39.0 car 3 — `run_delta` (ROADMAP 2.698-S2; RUN-DELTA-DESIGN-2026-08-08).
 *
 * The run-over-run delta block CEE emits per completed rerun, carried on the
 * turn envelope beside `analysis_ready`. The design's fabrication rule lifted
 * into the type system (the analysis-fact doctrine — "where a rule can live in
 * the type system, it must not live in producer discipline"):
 *
 *   - causal entitlement (C1) and identity (C0) REQUIRE their §b pair-
 *     provenance preconditions — a `run_delta` claiming C1 with unequal seed
 *     echoes FAILS TO PARSE;
 *   - an edit list may only travel on a ¬hash_equal pair, and never empty
 *     (design rule 2: hash and list derive from ONE whitelist and cannot
 *     disagree).
 *
 * RED-first at pristine 371e18c8: fails at collect (no run-delta exports).
 */
import { describe, it, expect } from 'vitest';
import {
  RunDeltaSchema,
  RunDeltaAttributionCase,
  RunDeltaPairProvenanceSchema,
  RunDeltaNoiseVerdict,
} from '../../src/boundary/run-delta.js';
import { OlumiResponseSchema } from '../../src/boundary/olumi-response.js';
import { maximalRunDelta, maximalOlumiResponse } from '../../src/fixtures/index.js';

const C1_PROVENANCE = {
  seed_equal: true,
  hash_equal: false,
  builds_equal: 'equal',
  n_equal: true,
} as const;

const C2_PROVENANCE = {
  seed_equal: false,
  hash_equal: false,
  builds_equal: 'equal',
  n_equal: true,
} as const;

const VALID_C1 = {
  attribution_case: 'C1_attributable',
  pair_provenance: C1_PROVENANCE,
  leader: {
    changed: true,
    prior_leading_option_id: 'opt_a',
    current_leading_option_id: 'opt_b',
    noise_verdict: 'signal',
  },
  win_probabilities: [
    { option_id: 'opt_a', prior: 0.61, current: 0.44, noise_verdict: 'signal' },
    { option_id: 'opt_b', prior: 0.39, current: 0.56, noise_verdict: 'signal' },
  ],
  flip_thresholds: [
    {
      factor_id: 'fac_alpha',
      prior_median: 0.42,
      current_median: 0.63,
      band_verdict: 'bands_disjoint',
    },
  ],
  edit_list: ['nodes.fac_alpha.observed_state.value'],
} as const;

const VALID_C2 = {
  attribution_case: 'C2_unpaired',
  pair_provenance: C2_PROVENANCE,
  leader: { changed: false, noise_verdict: 'within_noise' },
  win_probabilities: [],
  flip_thresholds: [],
} as const;

describe('RunDelta vocabulary (0.39.0 car 3)', () => {
  it('the attribution case enum is exactly the §b C0–C4 table', () => {
    expect(RunDeltaAttributionCase.options).toStrictEqual([
      'C0_identical',
      'C1_attributable',
      'C2_unpaired',
      'C3_engine_drift',
      'C4_budget_drift',
    ]);
  });

  it('the noise verdict vocabulary carries the §a not-noise-qualified state (never collapsed into signal)', () => {
    expect(RunDeltaNoiseVerdict.options).toStrictEqual([
      'signal',
      'within_noise',
      'not_noise_qualified',
    ]);
  });

  it('pair provenance builds_equal is TRI-STATE — unknown when _meta.builds is absent, never defaulted to equal', () => {
    expect(
      RunDeltaPairProvenanceSchema.shape.builds_equal.options,
    ).toStrictEqual(['equal', 'unequal', 'unknown']);
  });
});

describe('RunDeltaSchema (0.39.0 car 3)', () => {
  it('parses a C1 attributable delta with edit list', () => {
    expect(RunDeltaSchema.parse(VALID_C1)).toStrictEqual(VALID_C1);
  });

  it('parses a C2 unpaired delta (no edit list, leader ids absent-able)', () => {
    expect(RunDeltaSchema.parse(VALID_C2)).toStrictEqual(VALID_C2);
  });

  it('FABRICATION GUARD: rejects C1 with unequal seed echoes (causal connectives constructible only from C1\'s preconditions)', () => {
    expect(
      RunDeltaSchema.safeParse({ ...VALID_C1, pair_provenance: C2_PROVENANCE }).success,
    ).toBe(false);
  });

  it('FABRICATION GUARD: rejects C1 with builds_equal unknown', () => {
    expect(
      RunDeltaSchema.safeParse({
        ...VALID_C1,
        pair_provenance: { ...C1_PROVENANCE, builds_equal: 'unknown' },
      }).success,
    ).toBe(false);
  });

  it('FABRICATION GUARD: rejects C1 on an equal-hash pair (nothing changed to attribute)', () => {
    expect(
      RunDeltaSchema.safeParse({
        ...VALID_C1,
        pair_provenance: { ...C1_PROVENANCE, hash_equal: true },
        edit_list: undefined,
      }).success,
    ).toBe(false);
  });

  it('FABRICATION GUARD: rejects C0 with an unequal hash', () => {
    expect(
      RunDeltaSchema.safeParse({
        attribution_case: 'C0_identical',
        pair_provenance: C1_PROVENANCE,
        leader: { changed: false, noise_verdict: 'within_noise' },
        win_probabilities: [],
        flip_thresholds: [],
      }).success,
    ).toBe(false);
  });

  it('EDIT-LIST RULE: rejects an edit list on an equal-hash pair', () => {
    expect(
      RunDeltaSchema.safeParse({
        attribution_case: 'C0_identical',
        pair_provenance: { seed_equal: true, hash_equal: true, builds_equal: 'equal', n_equal: true },
        leader: { changed: false, noise_verdict: 'within_noise' },
        win_probabilities: [],
        flip_thresholds: [],
        edit_list: ['nodes.fac_alpha.observed_state.value'],
      }).success,
    ).toBe(false);
  });

  it('EDIT-LIST RULE: rejects an EMPTY edit list (hash and list derive from one whitelist — an empty list under an unequal hash is a disagreement)', () => {
    expect(RunDeltaSchema.safeParse({ ...VALID_C1, edit_list: [] }).success).toBe(false);
  });

  it('honest absence: a C1 delta MAY omit the edit list (prior fact predates edit tracking — §d degradation)', () => {
    const { edit_list: _dropped, ...withoutList } = VALID_C1;
    expect(RunDeltaSchema.parse(withoutList)).toStrictEqual(withoutList);
  });

  it('rejects an out-of-range win probability', () => {
    expect(
      RunDeltaSchema.safeParse({
        ...VALID_C1,
        win_probabilities: [
          { option_id: 'opt_a', prior: 1.2, current: 0.4, noise_verdict: 'signal' },
        ],
      }).success,
    ).toBe(false);
  });

  it('is strict at every level: unknown keys reject on the root and on nested lines', () => {
    expect(RunDeltaSchema.safeParse({ ...VALID_C1, sentence: 'because you edited X' }).success).toBe(false);
    expect(
      RunDeltaSchema.safeParse({
        ...VALID_C1,
        leader: { ...VALID_C1.leader, because: 'edit' },
      }).success,
    ).toBe(false);
  });
});

describe('OlumiResponse.run_delta (0.39.0 car 3)', () => {
  const BASE_RESPONSE = {
    response_version: 2,
    assistant_text: 'ok',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'analyse',
  } as const;

  it('a 0.38.0-shape response (no run_delta) still parses byte-identically', () => {
    expect(OlumiResponseSchema.parse(BASE_RESPONSE)).toStrictEqual(BASE_RESPONSE);
  });

  it('parses with run_delta attached beside analysis_ready', () => {
    const resp = { ...BASE_RESPONSE, run_delta: VALID_C1 };
    expect(OlumiResponseSchema.parse(resp)).toStrictEqual(resp);
  });

  it('rejects a malformed run_delta on the envelope (the guard runs at the boundary, not just standalone)', () => {
    expect(
      OlumiResponseSchema.safeParse({
        ...BASE_RESPONSE,
        run_delta: { ...VALID_C1, pair_provenance: C2_PROVENANCE },
      }).success,
    ).toBe(false);
  });

  it('the maximal fixtures populate the field', () => {
    expect(maximalRunDelta).toBeDefined();
    expect(RunDeltaSchema.parse(maximalRunDelta)).toStrictEqual(maximalRunDelta);
    expect(maximalOlumiResponse).toHaveProperty('run_delta');
  });
});

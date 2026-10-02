// ============================================================================
// 0.75.0 — "What would change this?": the recommendation's tipping point per link (SCIENCE ROBUSTNESS step 2;
// SCIENCE/DSK, #85 lease 5948579361). EXPERIMENT: produced by ISL #220, not yet consumed on a served path.
//
// RED-first: on 0.74.0 neither schema exists. The block below is REAL ISL output (D1, K=4, ISL branch
// science/decision-flip-20261002 @3429033a), not an authored fixture.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { DecisionFlipBlockV1Schema, DecisionFlipLinkV1Schema } from '../../src/index.js';
import { DecisionFlipBlockV1Schema as FromBoundary } from '../../src/boundary/index.js';

const ISL_D1_BLOCK = {"method": "affine_crn_replicates_v1", "leader_option_id": "ai_reporting_module_sprint", "replicates": 4, "bound_abs": 0.02, "bound_rel": 0.15, "grid_step": 0.0025, "links": [{"from_id": "sprint_capacity_for_ai_reporting", "to_id": "ai_reporting_module_availability", "status": "quoted", "reason": null, "current_mean": 0.25, "threshold": 0.0625, "replicate_thresholds": [0.06125, 0.06375, 0.06125, 0.06625], "replicate_range": 0.0050000000000000044, "to_option_id": "integration_bug_fix_sprint"}, {"from_id": "ai_reporting_module_availability", "to_id": "enterprise_prospect_signing_likelihood", "status": "quoted", "reason": null, "current_mean": 0.6, "threshold": 0.15375, "replicate_thresholds": [0.14125000000000001, 0.15125, 0.15624999999999997, 0.15874999999999997], "replicate_range": 0.01749999999999996, "to_option_id": "integration_bug_fix_sprint"}, {"from_id": "enterprise_prospect_signing_likelihood", "to_id": "quarterly_revenue", "status": "quoted", "reason": null, "current_mean": 0.5, "threshold": 0.08875000000000002, "replicate_thresholds": [0.08625000000000002, 0.09125000000000003, 0.08875000000000002, 0.08875000000000002], "replicate_range": 0.0050000000000000044, "to_option_id": "integration_bug_fix_sprint"}]} as const;

type Rec = Record<string, unknown>;
const link = (over: Rec = {}) => ({ ...(ISL_D1_BLOCK.links[0] as Rec), ...over });

describe('0.75.0 · the decision-flip block', () => {
  it('RED: ISL\'s real D1 block parses unchanged, from the root and the boundary entry', () => {
    expect(DecisionFlipBlockV1Schema.parse(ISL_D1_BLOCK)).toStrictEqual(ISL_D1_BLOCK);
    expect(FromBoundary).toBe(DecisionFlipBlockV1Schema);
  });

  it('a quoted link without its threshold or new leader is refused', () => {
    expect(DecisionFlipLinkV1Schema.safeParse(link({ threshold: null })).success).toBe(false);
    expect(DecisionFlipLinkV1Schema.safeParse(link({ to_option_id: null })).success).toBe(false);
  });

  it('an absent or no_change link never carries a number, and an absent one names its reason', () => {
    const absent = { status: 'absent', reason: 'replicates_spread', threshold: null, to_option_id: null };
    expect(DecisionFlipLinkV1Schema.safeParse(link(absent)).success).toBe(true);
    expect(DecisionFlipLinkV1Schema.safeParse(link({ ...absent, reason: null })).success).toBe(false);
    expect(DecisionFlipLinkV1Schema.safeParse(link({ ...absent, threshold: 0.05 })).success).toBe(false);
    expect(DecisionFlipLinkV1Schema.safeParse(link({ status: 'no_change', reason: null, threshold: 0.05, to_option_id: null })).success).toBe(false);
  });

  it('an ISL field this contract does not know fails the parse (no silent drop)', () => {
    expect(DecisionFlipBlockV1Schema.safeParse({ ...ISL_D1_BLOCK, extra: 1 }).success).toBe(false);
    expect(DecisionFlipLinkV1Schema.safeParse(link({ flip_mean: 0.025 })).success).toBe(false);
  });
});

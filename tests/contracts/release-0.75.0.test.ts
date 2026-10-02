// ============================================================================
// 0.75.0 — "What would change this?": the recommendation's tipping point per link (SCIENCE ROBUSTNESS step 2;
// SCIENCE/DSK, #85 lease 5948579361). EXPERIMENT: produced by ISL #220, not yet consumed on a served path.
//
// RED-first: on 0.74.0 neither schema exists. The two blocks below are REAL ISL wire output (worker serialisation
// `run_decision_flip_v2`, ISL branch science/decision-flip-20261002 with replicate_thresholds null for a guard absence,
// D1 K=4 seed 42; the clamped one adds epsilon_std 0.05 on the signing node). They are the valid controls; every rule
// row mutates ONE field of them. The licence rules R1-R7 are named in src/boundary/decision-flip.ts.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  DECISION_FLIP_MAX_BOUND_ABS,
  DECISION_FLIP_MAX_BOUND_REL,
  DecisionFlipBlockV1Schema,
  DecisionFlipLinkV1Schema,
} from '../../src/index.js';
import { DecisionFlipBlockV1Schema as FromBoundary } from '../../src/boundary/index.js';

const ISL_D1_BLOCK = {"method":"affine_crn_replicates_v1","leader_option_id":"ai_reporting_module_sprint","replicates":4,"bound_abs":0.01,"bound_rel":0.15,"grid_step":0.0025,"links":[{"from_id":"sprint_capacity_for_ai_reporting","to_id":"ai_reporting_module_availability","status":"quoted","reason":null,"current_mean":0.25,"threshold":0.0625,"replicate_thresholds":[0.06125,0.06375,0.06125,0.06625],"replicate_range":0.0050000000000000044,"to_option_id":"integration_bug_fix_sprint"},{"from_id":"ai_reporting_module_availability","to_id":"enterprise_prospect_signing_likelihood","status":"absent","reason":"replicates_spread","current_mean":0.6,"threshold":null,"replicate_thresholds":[0.14125000000000001,0.15125,0.15624999999999997,0.15874999999999997],"replicate_range":0.01749999999999996,"to_option_id":null},{"from_id":"enterprise_prospect_signing_likelihood","to_id":"quarterly_revenue","status":"quoted","reason":null,"current_mean":0.5,"threshold":0.08875000000000002,"replicate_thresholds":[0.08625000000000002,0.09125000000000003,0.08875000000000002,0.08875000000000002],"replicate_range":0.0050000000000000044,"to_option_id":"integration_bug_fix_sprint"}]} as const;
const ISL_D1_CLAMPED_BLOCK = {"method":"affine_crn_replicates_v1","leader_option_id":"ai_reporting_module_sprint","replicates":4,"bound_abs":0.01,"bound_rel":0.15,"grid_step":0.0025,"links":[{"from_id":"sprint_capacity_for_ai_reporting","to_id":"ai_reporting_module_availability","status":"absent","reason":"nonlinear_downstream:clamp:enterprise_prospect_signing_likelihood","current_mean":0.25,"threshold":null,"replicate_thresholds":null,"replicate_range":null,"to_option_id":null},{"from_id":"ai_reporting_module_availability","to_id":"enterprise_prospect_signing_likelihood","status":"absent","reason":"nonlinear_downstream:clamp:enterprise_prospect_signing_likelihood","current_mean":0.6,"threshold":null,"replicate_thresholds":null,"replicate_range":null,"to_option_id":null},{"from_id":"enterprise_prospect_signing_likelihood","to_id":"quarterly_revenue","status":"quoted","reason":null,"current_mean":0.5,"threshold":0.09624999999999999,"replicate_thresholds":[0.09375,0.09874999999999998,0.10124999999999998,0.09125000000000003],"replicate_range":0.009999999999999953,"to_option_id":"integration_bug_fix_sprint"}]} as const;

type Rec = Record<string, unknown>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const link = (over: Rec = {}) => ({ ...(ISL_D1_BLOCK.links[0] as Rec), ...over });
/** The real D1 block with link i's fields (or the block's own) overridden. */
const block = (i: number | null, over: Rec, base: unknown = ISL_D1_BLOCK) => {
  const b = clone(base) as Rec & { links: Rec[] };
  if (i === null) return { ...b, ...over };
  b.links[i] = { ...b.links[i], ...over };
  return b;
};
const ok = (b: unknown) => DecisionFlipBlockV1Schema.safeParse(b).success;
const QUOTED = 0; // capacity -> availability: quoted, K=4 [0.06125, 0.06375, 0.06125, 0.06625], median 0.0625
const SPREAD = 1; // availability -> signing: absent replicates_spread, range 0.0175

describe('0.75.0 · the decision-flip block', () => {
  it('RED: ISL\'s real blocks parse unchanged (valid controls), from the root and the boundary entry', () => {
    expect(DecisionFlipBlockV1Schema.parse(ISL_D1_BLOCK)).toStrictEqual(ISL_D1_BLOCK);
    expect(DecisionFlipBlockV1Schema.parse(ISL_D1_CLAMPED_BLOCK)).toStrictEqual(ISL_D1_CLAMPED_BLOCK);
    expect(FromBoundary).toBe(DecisionFlipBlockV1Schema);
  });

  it('R1: quoted <=> a threshold and a new leader, no reason; an absent link names its reason', () => {
    expect(ok(block(QUOTED, { threshold: null }))).toBe(false);
    expect(ok(block(QUOTED, { to_option_id: null }))).toBe(false);
    expect(ok(block(QUOTED, { reason: 'replicates_spread' }))).toBe(false);
    expect(ok(block(SPREAD, { threshold: 0.15 }))).toBe(false);
    expect(ok(block(SPREAD, { reason: null }))).toBe(false);
  });

  it('R2 the median rule: even K = the mean of the two middle values; odd K = the middle value; every replicate found', () => {
    expect(ok(block(QUOTED, { threshold: 0.0628125 }))).toBe(false); // the MEAN of the four, not the median
    expect(ok(block(QUOTED, { threshold: 0.06375 }))).toBe(false); // the upper middle value alone
    expect(ok(block(QUOTED, { replicate_thresholds: [0.06125, null, 0.06125, 0.06625] }))).toBe(false);
    const odd = { replicate_thresholds: [0.06125, 0.06625, 0.06375], replicate_range: 0.0050000000000000044 };
    expect(ok(block(QUOTED, { ...odd, threshold: 0.06375 }, { ...clone(ISL_D1_BLOCK), replicates: 3, links: [ISL_D1_BLOCK.links[QUOTED]] }))).toBe(true);
    expect(ok(block(QUOTED, { ...odd, threshold: 0.0625 }, { ...clone(ISL_D1_BLOCK), replicates: 3, links: [ISL_D1_BLOCK.links[QUOTED]] }))).toBe(false);
  });

  it('R3: a quoted range is max - min and within BOTH bounds (abs, and rel to the threshold)', () => {
    expect(ok(block(QUOTED, { replicate_range: 0.004 }))).toBe(false);
    const wide = [0.0575, 0.0625, 0.0625, 0.07]; // range 0.0125 > bound_abs 0.01
    expect(ok(block(QUOTED, { replicate_thresholds: wide, threshold: 0.0625, replicate_range: 0.07 - 0.0575 }))).toBe(false);
    const small = [0.02, 0.024, 0.026, 0.028]; // range 0.008 <= 0.01 but > 0.15 x 0.025
    expect(ok(block(QUOTED, { replicate_thresholds: small, threshold: 0.025, replicate_range: 0.028 - 0.02 }))).toBe(false);
    // Control: the real clamped block's quoted link sits AT the abs bound (0.009999999999999953) and passes.
    expect(ISL_D1_CLAMPED_BLOCK.links[2].replicate_range).toBeLessThanOrEqual(0.01);
  });

  it('R4: a tipping point lies strictly between 0 and the current strength, same sign', () => {
    expect(ok(block(QUOTED, { current_mean: 0.06 }))).toBe(false); // threshold 0.0625 above the current 0.06
    expect(ok(block(QUOTED, { current_mean: 0.0625 }))).toBe(false); // equal is not weaker
    expect(ok(block(QUOTED, { current_mean: -0.25 }))).toBe(false); // the opposite sign
    const neg = { current_mean: -0.25, replicate_thresholds: [-0.06125, -0.06375, -0.06125, -0.06625], threshold: -0.0625 };
    expect(ok(block(QUOTED, neg))).toBe(true); // control: a negative link weakens towards 0 from below
  });

  it('R5: one entry per replicate; null only when none ran; no_change = every replicate ran and found nothing', () => {
    expect(ok(block(SPREAD, { replicate_thresholds: [0.14125, 0.15125, 0.15625] }))).toBe(false);
    const none = { status: 'no_change', reason: null, replicate_range: null, replicate_thresholds: [null, null, null, null] };
    expect(ok(block(SPREAD, none))).toBe(true); // control
    expect(ok(block(SPREAD, { ...none, replicate_thresholds: [null, null, 0.15, null] }))).toBe(false);
    expect(ok(block(SPREAD, { ...none, replicate_thresholds: null }))).toBe(false);
    expect(ok(block(QUOTED, { replicate_thresholds: null }))).toBe(false);
    expect(ISL_D1_CLAMPED_BLOCK.links[0].replicate_thresholds).toBeNull(); // the real guard absence
  });

  it('R6: a quoted link needs a named leader and a different option past its tipping point', () => {
    expect(ok(block(QUOTED, { to_option_id: 'ai_reporting_module_sprint' }))).toBe(false);
    expect(ok(block(null, { leader_option_id: null }))).toBe(false);
    const noRanking = { status: 'absent', reason: 'ranking_not_supported', threshold: null, to_option_id: null,
      replicate_thresholds: null, replicate_range: null };
    const allAbsent = { ...clone(ISL_D1_BLOCK), leader_option_id: null, links: ISL_D1_BLOCK.links.map((l) => ({ ...l, ...noRanking })) };
    expect(ok(allAbsent)).toBe(true); // control: no leader, nothing quoted
  });

  it('R7: the licence the DL accepted cannot loosen (bound_abs <= 0.01, bound_rel <= 0.15)', () => {
    expect(ok(block(null, { bound_abs: 0.02 }))).toBe(false); // the bound ISL shipped at 3429033a, before the DL's 0.01
    expect(ok(block(null, { bound_rel: 0.2 }))).toBe(false);
    expect(DECISION_FLIP_MAX_BOUND_ABS).toBe(0.01);
    expect(DECISION_FLIP_MAX_BOUND_REL).toBe(0.15);
  });

  it('an ISL field this contract does not know fails the parse (no silent drop)', () => {
    expect(DecisionFlipBlockV1Schema.safeParse({ ...ISL_D1_BLOCK, extra: 1 }).success).toBe(false);
    expect(DecisionFlipLinkV1Schema.safeParse(link({ flip_mean: 0.025 })).success).toBe(false);
  });
});

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
  DECISION_FLIP_POST_SEARCH_REASONS,
  DECISION_FLIP_PRE_SEARCH_REASONS,
  DecisionFlipBlockV1Schema,
  DecisionFlipLinkV1Schema,
} from '../../src/index.js';
import { DecisionFlipBlockV1Schema as FromBoundary } from '../../src/boundary/index.js';

const ISL_D1_BLOCK = {"method":"affine_crn_replicates_v1","leader_option_id":"ai_reporting_module_sprint","replicates":4,"bound_abs":0.01,"bound_rel":0.15,"grid_step":0.0025,"links":[{"from_id":"sprint_capacity_for_ai_reporting","to_id":"ai_reporting_module_availability","status":"quoted","reason":null,"current_mean":0.25,"threshold":0.0625,"replicate_thresholds":[0.06125,0.06375,0.06125,0.06625],"replicate_range":0.0050000000000000044,"to_option_id":"integration_bug_fix_sprint"},{"from_id":"ai_reporting_module_availability","to_id":"enterprise_prospect_signing_likelihood","status":"absent","reason":"replicates_spread","current_mean":0.6,"threshold":null,"replicate_thresholds":[0.14125000000000001,0.15125,0.15624999999999997,0.15874999999999997],"replicate_range":0.01749999999999996,"to_option_id":null},{"from_id":"enterprise_prospect_signing_likelihood","to_id":"quarterly_revenue","status":"quoted","reason":null,"current_mean":0.5,"threshold":0.08875000000000002,"replicate_thresholds":[0.08625000000000002,0.09125000000000003,0.08875000000000002,0.08875000000000002],"replicate_range":0.0050000000000000044,"to_option_id":"integration_bug_fix_sprint"}]} as const;
const ISL_D1_CLAMPED_BLOCK = {"method":"affine_crn_replicates_v1","leader_option_id":"ai_reporting_module_sprint","replicates":4,"bound_abs":0.01,"bound_rel":0.15,"grid_step":0.0025,"links":[{"from_id":"sprint_capacity_for_ai_reporting","to_id":"ai_reporting_module_availability","status":"absent","reason":"nonlinear_downstream:clamp:enterprise_prospect_signing_likelihood","current_mean":0.25,"threshold":null,"replicate_thresholds":null,"replicate_range":null,"to_option_id":null},{"from_id":"ai_reporting_module_availability","to_id":"enterprise_prospect_signing_likelihood","status":"absent","reason":"nonlinear_downstream:clamp:enterprise_prospect_signing_likelihood","current_mean":0.6,"threshold":null,"replicate_thresholds":null,"replicate_range":null,"to_option_id":null},{"from_id":"enterprise_prospect_signing_likelihood","to_id":"quarterly_revenue","status":"quoted","reason":null,"current_mean":0.5,"threshold":0.09624999999999999,"replicate_thresholds":[0.09375,0.09874999999999998,0.10124999999999998,0.09125000000000003],"replicate_range":0.009999999999999953,"to_option_id":"integration_bug_fix_sprint"}]} as const;

type Rec = Record<string, unknown>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const link = (over: Rec = {}) => ({ ...(ISL_D1_BLOCK.links[0] as Rec), ...over });
/** The real D1 block (or `base`) with link i's fields (or, for i = null, the block's own) overridden. */
const block = (i: number | null, over: Rec, base: unknown = ISL_D1_BLOCK) => {
  const b = clone(base) as Rec & { links: Rec[] };
  if (i === null) return { ...b, ...over };
  b.links[i] = { ...b.links[i], ...over };
  return b;
};
/** Every issue as `<rule>@<path>#<from->to>`: a rejection is bound to its rule, its path AND the link it names. */
const issuesOf = (b: unknown): string[] => {
  const r = DecisionFlipBlockV1Schema.safeParse(b);
  if (r.success) return [];
  const links = (b as { links: Rec[] }).links;
  return r.error.issues.map((x) => {
    const at = x.path[0] === 'links' && typeof x.path[1] === 'number' ? links[x.path[1]] : null;
    return `${x.message.split(':')[0]}@${x.path.join('.')}${at ? `#${String(at.from_id)}->${String(at.to_id)}` : ''}`;
  });
};
const L0 = 'sprint_capacity_for_ai_reporting->ai_reporting_module_availability'; // quoted, [0.06125,0.06375,0.06125,0.06625]
const L1 = 'ai_reporting_module_availability->enterprise_prospect_signing_likelihood'; // absent replicates_spread, 0.0175
const rejects = (b: unknown, rule: string, i: number | string, l?: string) => {
  const want = typeof i === 'number' ? `${rule}@links.${i}#${l}` : `${rule}@${i}`;
  expect(issuesOf(b), want).toContain(want);
};
const accepts = (b: unknown) => expect(issuesOf(b)).toEqual([]);
const QUOTED = 0;
const SPREAD = 1;

describe('0.75.0 · the decision-flip block', () => {
  it('RED: ISL\'s real blocks parse unchanged (valid controls), from the root and the boundary entry', () => {
    expect(DecisionFlipBlockV1Schema.parse(ISL_D1_BLOCK)).toStrictEqual(ISL_D1_BLOCK);
    expect(DecisionFlipBlockV1Schema.parse(ISL_D1_CLAMPED_BLOCK)).toStrictEqual(ISL_D1_CLAMPED_BLOCK);
    expect(FromBoundary).toBe(DecisionFlipBlockV1Schema);
  });

  it('R1: quoted <=> a threshold and a new leader, no reason; an absent link names its reason', () => {
    rejects(block(QUOTED, { threshold: null }), 'R1', QUOTED, L0);
    rejects(block(QUOTED, { to_option_id: null }), 'R1', QUOTED, L0);
    rejects(block(QUOTED, { reason: 'replicates_spread' }), 'R1', QUOTED, L0);
    rejects(block(SPREAD, { threshold: 0.15 }), 'R1', SPREAD, L1);
    rejects(block(SPREAD, { reason: null }), 'R1', SPREAD, L1);
  });

  it('R2 the median rule: even K = the mean of the two middle values; odd K = the middle value; every replicate found', () => {
    rejects(block(QUOTED, { threshold: 0.0628125 }), 'R2', QUOTED, L0); // the MEAN of the four, not the median
    rejects(block(QUOTED, { threshold: 0.06375 }), 'R2', QUOTED, L0); // the upper middle value alone
    rejects(block(QUOTED, { replicate_thresholds: [0.06125, null, 0.06125, 0.06625] }), 'R2', QUOTED, L0);
    rejects(block(QUOTED, { replicate_thresholds: null }), 'R2', QUOTED, L0);
    const k3 = { ...clone(ISL_D1_BLOCK), replicates: 3, links: [ISL_D1_BLOCK.links[QUOTED]] };
    const odd = { replicate_thresholds: [0.06125, 0.06625, 0.06375], replicate_range: 0.0050000000000000044 };
    accepts(block(QUOTED, { ...odd, threshold: 0.06375 }, k3)); // control
    rejects(block(QUOTED, { ...odd, threshold: 0.0625 }, k3), 'R2', QUOTED, L0);
  });

  it('R3: the licence binds the RECOMPUTED spread, each bound alone; the reported range must equal it', () => {
    const q = (reps: number[], threshold: number, range = Math.max(...reps) - Math.min(...reps)) =>
      block(QUOTED, { replicate_thresholds: reps, threshold, replicate_range: range });
    rejects(block(QUOTED, { replicate_range: 0.004 }), 'R3', QUOTED, L0); // reported range is not max - min
    accepts(q([0.196, 0.2, 0.2, 0.204], 0.2)); // control: spread 0.008 inside both bounds
    rejects(q([0.194, 0.2, 0.2, 0.206], 0.2), 'R3', QUOTED, L0); // ABSOLUTE only: 0.012 > 0.01, < 0.15 x 0.2
    rejects(q([0.02, 0.024, 0.026, 0.028], 0.025), 'R3', QUOTED, L0); // RELATIVE only: 0.008 <= 0.01, > 0.15 x 0.025
    // Codex P1 (@598c4cc2): a reported range of 0 hid a spread 326x the relative bound behind an absolute tolerance.
    rejects(q([1e-14, 1e-14, 1e-14, 5e-13], 1e-14, 0), 'R3', QUOTED, L0);
    // replicates_spread must break the licence; affine_check_failed must not.
    rejects(block(SPREAD, { replicate_thresholds: [0.15, 0.151, 0.152, 0.152], replicate_range: 0.152 - 0.15 }), 'R3', SPREAD, L1);
    rejects(block(SPREAD, { reason: 'affine_check_failed' }), 'R3', SPREAD, L1);
    accepts(block(SPREAD, { reason: 'affine_check_failed', replicate_thresholds: [0.15, 0.151, 0.152, 0.152], replicate_range: 0.152 - 0.15 }));
    // Control: the real clamped block's quoted link sits AT the absolute bound (0.009999999999999953) and passes.
    expect(ISL_D1_CLAMPED_BLOCK.links[2].replicate_range).toBeLessThanOrEqual(0.01);
  });

  it('R4: every tipping point lies strictly between 0 and the current strength, same sign', () => {
    rejects(block(QUOTED, { current_mean: 0.06 }), 'R4', QUOTED, L0); // above the current 0.06
    rejects(block(QUOTED, { current_mean: 0.0625 }), 'R4', QUOTED, L0); // equal is not weaker
    rejects(block(QUOTED, { current_mean: -0.25 }), 'R4', QUOTED, L0); // the opposite sign
    rejects(block(SPREAD, { current_mean: 0.15 }), 'R4', SPREAD, L1); // an absent link's replicates obey it too
    accepts(block(QUOTED, { current_mean: -0.25, replicate_thresholds: [-0.06125, -0.06375, -0.06125, -0.06625], threshold: -0.0625 }));
  });

  it('R5: one entry per replicate; null only when none ran; no_change = every replicate ran and found nothing', () => {
    rejects(block(SPREAD, { replicate_thresholds: [0.14125, 0.15125, 0.15625] }), 'R5', SPREAD, L1);
    const none = { status: 'no_change', reason: null, replicate_range: null, replicate_thresholds: [null, null, null, null] };
    accepts(block(SPREAD, none)); // control
    rejects(block(SPREAD, { ...none, replicate_thresholds: [null, null, 0.15, null] }), 'R5', SPREAD, L1);
    rejects(block(SPREAD, { ...none, replicate_thresholds: null }), 'R5', SPREAD, L1);
    // Codex P1 (@598c4cc2): a post-search absence with no replicate evidence at all.
    rejects(block(SPREAD, { replicate_thresholds: null, replicate_range: null }), 'R5', SPREAD, L1);
    expect(ISL_D1_CLAMPED_BLOCK.links[0].replicate_thresholds).toBeNull(); // the real pre-search absence
  });

  it('R6: a quoted link needs a named leader and a different option past its tipping point', () => {
    rejects(block(QUOTED, { to_option_id: 'ai_reporting_module_sprint' }), 'R6', QUOTED, L0);
    rejects(block(null, { leader_option_id: null }), 'R6', QUOTED, L0);
    const noRanking = { status: 'absent', reason: 'ranking_not_supported', threshold: null, to_option_id: null,
      replicate_thresholds: null, replicate_range: null };
    accepts({ ...clone(ISL_D1_BLOCK), leader_option_id: null, links: ISL_D1_BLOCK.links.map((l) => ({ ...l, ...noRanking })) });
  });

  it('R7: the licence the DL accepted cannot loosen (bound_abs <= 0.01, bound_rel <= 0.15)', () => {
    rejects(block(null, { bound_abs: 0.02 }), 'R7', 'bound_abs'); // the bound ISL shipped at 3429033a
    rejects(block(null, { bound_rel: 0.2 }), 'R7', 'bound_rel');
    expect(DECISION_FLIP_MAX_BOUND_ABS).toBe(0.01);
    expect(DECISION_FLIP_MAX_BOUND_REL).toBe(0.15);
  });

  it('R8: a link appears at most once (Codex P1: two quoted thresholds for one link parsed)', () => {
    const second = { ...ISL_D1_BLOCK.links[QUOTED], replicate_thresholds: [0.0295, 0.03, 0.03, 0.0305], threshold: 0.03,
      replicate_range: 0.0305 - 0.0295 };
    rejects({ ...clone(ISL_D1_BLOCK), links: [...clone(ISL_D1_BLOCK.links), second] }, 'R8', 3, L0);
    accepts({ ...clone(ISL_D1_BLOCK), links: [...clone(ISL_D1_BLOCK.links), { ...second, to_id: 'quarterly_revenue' }] }); // distinct
  });

  it('R9: an absence reason is a typed code with its evidence shape (pre-search: none; post-search: its own)', () => {
    const pre = ISL_D1_CLAMPED_BLOCK; // real: links 0 and 1 are nonlinear_downstream:clamp:<node>
    const L0c = `${pre.links[0].from_id}->${pre.links[0].to_id}`;
    rejects(block(0, { replicate_thresholds: [0.06, 0.061, 0.062, 0.06] }, pre), 'R9', 0, L0c);
    rejects(block(0, { replicate_range: 0.002 }, pre), 'R9', 0, L0c);
    for (const reason of ['ranking_not_supported', 'leader_unstable', 'link_at_zero', 'nonlinear_downstream:identity:x']) {
      accepts(block(0, { reason }, pre)); // controls: every pre-search code
    }
    expect(DecisionFlipBlockV1Schema.safeParse(block(SPREAD, { reason: 'because' })).success).toBe(false); // not a code
    expect(DecisionFlipBlockV1Schema.safeParse(block(0, { reason: 'nonlinear_downstream:bend:x' }, pre)).success).toBe(false);
    const disagree = { reason: 'replicates_disagree', replicate_thresholds: [0.15, null, 0.152, 0.151], replicate_range: null };
    accepts(block(SPREAD, disagree)); // control
    rejects(block(SPREAD, { ...disagree, replicate_thresholds: [0.15, 0.151, 0.152, 0.151] }), 'R9', SPREAD, L1);
    rejects(block(SPREAD, { ...disagree, replicate_range: 0.002 }), 'R9', SPREAD, L1);
    const onOption = { reason: 'replicates_disagree_on_option', replicate_range: null };
    accepts(block(SPREAD, onOption)); // control: all found, no range
    rejects(block(SPREAD, { ...onOption, replicate_range: 0.0175 }), 'R9', SPREAD, L1);
    rejects(block(SPREAD, { replicate_range: null }), 'R9', SPREAD, L1); // replicates_spread without its range
    expect(DECISION_FLIP_PRE_SEARCH_REASONS).toEqual(['ranking_not_supported', 'leader_unstable', 'link_at_zero']);
    expect(DECISION_FLIP_POST_SEARCH_REASONS).toEqual(['replicates_disagree', 'replicates_disagree_on_option', 'replicates_spread', 'affine_check_failed']);
  });

  it('an ISL field this contract does not know fails the parse (no silent drop)', () => {
    expect(DecisionFlipBlockV1Schema.safeParse({ ...ISL_D1_BLOCK, extra: 1 }).success).toBe(false);
    expect(DecisionFlipLinkV1Schema.safeParse(link({ flip_mean: 0.025 })).success).toBe(false);
  });
});

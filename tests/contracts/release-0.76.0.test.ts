// ============================================================================
// 0.76.0 — "Test without this link": a claim-by-claim structural challenge of the selected Run (SCI-DEEP v1; PTL ruling
// programme-docs #87/5972622586). EXPERIMENT: produced by CEE on an explicit request, not yet consumed on a served path.
//
// RED-first: on 0.75.0 none of these schemas exist. The valid controls are the registered maximal fixtures, whose
// numbers are REAL current-engine output (ISL f759de5, served budgets): bank-2 model B with monthly_churn ->
// paying_subscribers removed. Every rule row mutates ONE thing of a valid control and must be rejected by THAT rule id
// (rules S1–S5, C1–C7 are named in src/boundary/structural-challenge.ts).
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  STRUCTURAL_CHALLENGE_FRAME_DEPENDENT,
  STRUCTURAL_CHALLENGE_REASONS,
  StructuralChallengeQuantityClaimV1Schema,
  StructuralChallengeResultV1Schema,
} from '../../src/index.js';
import { StructuralChallengeResultV1Schema as FromBoundary } from '../../src/boundary/index.js';
import {
  maximalStructuralChallengeResultV1 as COMPLETED,
  maximalStructuralChallengeResultV1Unsupported as UNSUPPORTED,
} from '../../src/fixtures/index.js';

type Rec = Record<string, unknown>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const LEADER = 0;
const GOAL_59 = 1;
const GOAL_SQ = 2;
const OUTCOME_59 = 3;
const OUTCOME_SQ = 4;
const CHURN = 5;

/** The completed control with the result's own fields (or claim i's) overridden. */
const result = (over: Rec, i: number | null = null, base: unknown = COMPLETED) => {
  const r = clone(base) as Rec & { claims: Rec[] };
  if (i === null) return { ...r, ...over };
  r.claims[i] = { ...r.claims[i], ...over };
  return r;
};
const rules = (r: unknown): string[] => {
  const p = StructuralChallengeResultV1Schema.safeParse(r);
  return p.success ? [] : p.error.issues.map((x) => x.message.split(':')[0]);
};
const rejects = (r: unknown, rule: string) => expect(rules(r), rule).toContain(rule);
const accepts = (r: unknown) => expect(rules(r)).toEqual([]);

describe('0.76.0 · the structural challenge result', () => {
  it('valid controls: the real recompute and the ineligible control parse unchanged, from root and boundary', () => {
    expect(StructuralChallengeResultV1Schema.parse(COMPLETED)).toStrictEqual(COMPLETED);
    expect(StructuralChallengeResultV1Schema.parse(UNSUPPORTED)).toStrictEqual(UNSUPPORTED);
    expect(FromBoundary).toBe(StructuralChallengeResultV1Schema);
  });

  it('the method is literally unpaired: no paired attribution and no other method can be claimed', () => {
    expect(StructuralChallengeResultV1Schema.safeParse(result({ attribution_case: 'C1_attributable' })).success).toBe(false);
    expect(StructuralChallengeResultV1Schema.safeParse(result({ method: 'affine_crn_replicates_v1' })).success).toBe(false);
    expect(StructuralChallengeResultV1Schema.safeParse(result({ retention: 'retained' })).success).toBe(false);
    expect(StructuralChallengeResultV1Schema.safeParse(result({ recompute_key: 'not-a-sha' })).success).toBe(false);
  });

  it('S1: completed <=> no reason, claims and provenance; any other status: no claims and its own reason', () => {
    rejects(result({ reason: 'candidate_run_failed' }), 'S1');
    rejects(result({ claims: [] }), 'S1');
    rejects(result({ pair_provenance: null }), 'S1');
    rejects(result({ claims: clone(COMPLETED.claims) }, null, UNSUPPORTED), 'S1');
    rejects(result({ reason: null }, null, UNSUPPORTED), 'S1');
    rejects(result({ reason: 'candidate_run_timeout' }, null, UNSUPPORTED), 'S1'); // a timed_out reason on unsupported
    for (const [status, reasons] of Object.entries(STRUCTURAL_CHALLENGE_REASONS)) {
      for (const reason of reasons) accepts(result({ status, reason }, null, UNSUPPORTED));
    }
  });

  it('S2: a completed result declares every frame-dependent diagnostic as not compared', () => {
    for (const q of STRUCTURAL_CHALLENGE_FRAME_DEPENDENT) {
      rejects(result({ not_compared: COMPLETED.not_compared.filter((x) => x !== q) }), 'S2');
    }
  });

  it('S3: an equal graph hash means the edit never reached the recompute', () => {
    rejects(result({ pair_provenance: { ...COMPLETED.pair_provenance, hash_equal: true } }), 'S3');
  });

  it('S4: one claim per (kind, option, constraint); one leader claim', () => {
    const dup = clone(COMPLETED) as unknown as Rec & { claims: Rec[] };
    dup.claims.push(clone(COMPLETED.claims[GOAL_59]) as Rec);
    rejects(dup, 'S4');
    const twoLeaders = clone(COMPLETED) as unknown as Rec & { claims: Rec[] };
    twoLeaders.claims.push(clone(COMPLETED.claims[LEADER]) as Rec);
    rejects(twoLeaders, 'S4');
  });

  it('S5: the removed link joins two different nodes', () => {
    rejects(result({ alternative: { ...COMPLETED.alternative, to_id: COMPLETED.alternative.from_id } }), 'S5');
  });

  it('C1: CHANGES is earned only by a signal-qualified crossing of that claim\'s own boundary', () => {
    rejects(result({ noise_verdict: 'within_noise' }, GOAL_59), 'C1');
    rejects(result({ basis: 'target_crossed' }, GOAL_59), 'C1'); // the wrong boundary for a goal probability
    rejects(result({ verdict: 'changes', basis: 'leader_changed' }, LEADER), 'C1'); // same leader both sides
    rejects(result({ alternative_option_id: null, verdict: 'changes', basis: 'leader_changed' }, LEADER), 'C1');
    rejects(result({ alternative: null }, OUTCOME_59), 'C1');
    accepts(result({ alternative_option_id: 'status_quo', verdict: 'changes', basis: 'leader_changed' }, LEADER));
  });

  it('C2: HOLDS is earned only by a noise-qualified comparison that keeps the boundary', () => {
    rejects(result({ noise_verdict: 'within_noise' }, LEADER), 'C2'); // a near tie is not a held leader
    rejects(result({ alternative_option_id: 'status_quo' }, LEADER), 'C2');
    rejects(result({ verdict: 'holds', basis: 'no_licensed_boundary' }, OUTCOME_SQ), 'C2');
    rejects(result({ noise_verdict: 'not_noise_qualified' }, OUTCOME_SQ), 'C2');
  });

  it('C3: delta_only shows values without a verdict word, its basis matching the noise tag', () => {
    accepts(result({ verdict: 'delta_only', basis: 'no_licensed_boundary' }, OUTCOME_SQ));
    accepts(result({ verdict: 'delta_only', basis: 'within_noise' }, LEADER, result({ noise_verdict: 'within_noise' }, LEADER)));
    rejects(result({ verdict: 'delta_only', basis: 'within_noise' }, GOAL_59), 'C3'); // noise says signal
    rejects(result({ verdict: 'delta_only', basis: 'certainty_kept' }, GOAL_SQ), 'C3');
  });

  it('C4: NOT_COMPARABLE names why, and a withheld side is null (never 0)', () => {
    accepts(result({ verdict: 'not_comparable', basis: 'withheld_on_one_side', alternative: null }, GOAL_59));
    rejects(result({ verdict: 'not_comparable', basis: 'within_noise' }, GOAL_59), 'C4');
  });

  it('C5: boundary evidence is checked from the values themselves', () => {
    rejects(result({ baseline: 0.4, alternative: 0.7 }, GOAL_59), 'C5');
    rejects(result({ alternative: 0.5 }, GOAL_SQ), 'C5'); // a kept certainty must be the same 0 or 1
    rejects(result({ alternative: 84000 }, OUTCOME_59), 'C5'); // both below the £85k target: no crossing
    rejects(result({ target: null }, OUTCOME_59), 'C5');
    rejects(result({ alternative: 86000 }, OUTCOME_SQ), 'C5'); // crossed, yet claimed same side
  });

  it('C6: invariant_by_construction <=> unaffected basis; it holds and is never signal', () => {
    rejects(result({ invariant_by_construction: false }, CHURN), 'C6');
    rejects(result({ noise_verdict: 'signal' }, CHURN), 'C6');
    rejects(result({ invariant_by_construction: true }, GOAL_SQ), 'C6');
  });

  it('C7: probabilities in [0, 1]; target only on outcome levels; constraint_id exactly on constraints', () => {
    rejects(result({ alternative: 1.2, basis: 'certainty_boundary_crossed' }, GOAL_59), 'C7');
    rejects(result({ target: 0.8 }, GOAL_59), 'C7');
    rejects(result({ constraint_id: null }, CHURN), 'C7');
    rejects(result({ constraint_id: 'agent-lane:monthly_churn:<=' }, GOAL_59), 'C7');
    expect(StructuralChallengeQuantityClaimV1Schema.safeParse(COMPLETED.claims[CHURN]).success).toBe(true);
  });

  it('C5 control: 0.4 -> 1 IS a certainty crossing (1 is exact), so it is accepted', () => {
    accepts(result({ baseline: 0.4 }, GOAL_59));
  });
});

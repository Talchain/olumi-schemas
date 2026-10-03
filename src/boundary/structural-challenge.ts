import { z } from 'zod';

import { RunDeltaNoiseVerdict, RunDeltaPairProvenanceSchema, RunInputLinkSizing } from './run-delta.js';

// ============================================================================
// 0.76.0 — "TEST WITHOUT THIS LINK": a claim-by-claim structural challenge of the selected Run (SCI-DEEP v1; PTL ruling
// programme-docs #87/5972622586). EXPERIMENT: produced by CEE on an explicit request; not yet consumed on a served path.
//
// WHAT IT ANSWERS. The selected, current Run is the baseline representation A. The alternative B is A's EXACT analysis
// input with ONE link removed, recomputed in full through the ordinary Run path (CEE -> PLoT /v2/run -> ISL) with the
// baseline's seed pinned. Each conclusion of A is compared with B separately: does it HOLD, CHANGE, or can it not be
// compared? Nothing here is a probability over structures, a robustness score, or a claim that either structure is true.
//
// WHY UNPAIRED (and the method literal says so). Removing a link changes the engine's draw structure: one edge random
// stream consumed in edge order, tie-breaks on that stream, node-order epsilon draws (evidence: programme-docs
// output/sci-deep-20261003). Same-seed runs across a topology edit are therefore NOT common-random-number pairs, so
// every noise verdict below is the independent-run form `RunDelta` already uses, and the pair is always `C2_unpaired`.
//
// THE LICENCE IS STRUCTURAL. A result that breaks any rule fails the parse, so a consumer that parsed it may render the
// verdict without re-deriving it. Every issue message starts with its rule id
// (tests/contracts/release-0.76.0.test.ts binds a RED row to each):
//   S1 status `completed` <=> reason null, at least one claim and a pair provenance; any other status carries no claims
//      and a typed reason from that status's own set.
//   S2 a completed result lists, in `not_compared`, every frame-dependent diagnostic: structural influence, e-values,
//      driver rank, robustness labels and fragile edges move with the numerical frame even when headlines do not
//      (bank 2, F1), so they are never compared across structures.
//   S3 a completed result's graph hashes differ (`pair_provenance.hash_equal` false): an equal hash means the edit
//      never reached the recompute.
//   S4 claims are unique per (kind, option_id, constraint_id); at most one leader claim.
//   S5 the removed link is a real link: from_id != to_id.
//   C1 CHANGES is earned only by a signal-qualified difference that crosses a licensed boundary of THAT claim:
//      leader -> `leader_changed`; goal_probability -> `certainty_boundary_crossed`; outcome_level -> `target_crossed`;
//      constraint_probability -> `constraint_side_changed` (PTL materiality ruling §6).
//   C2 HOLDS is earned only by a noise-qualified comparison that keeps that boundary: `leader_same` (signal),
//      `certainty_kept`, `same_side_of_target`, `constraint_side_same`, or `unaffected_by_construction`.
//   C3 `delta_only` shows the values without a verdict word: `within_noise`, `no_licensed_boundary` or
//      `not_noise_qualified`, matching the noise tag where one is named.
//   C4 NOT_COMPARABLE names why (frame, unit, identity status, ranking status, a side withheld or missing).
//   C5 boundary evidence is checked from the values themselves: a certainty crossing has an exact 0 or 1 on one side
//      and different values; a kept certainty is the same exact 0 or 1 on both; a target crossing has the two values on
//      strictly opposite sides of `target`, a same-side hold on the same strict side.
//   C6 `invariant_by_construction` <=> basis `unaffected_by_construction`: the removed link cannot reach the quantity,
//      so its survival is NOT evidence of robustness; such a claim is `holds` and never `signal`.
//   C7 probabilities lie in [0, 1]; `target` only on outcome_level; `constraint_id` exactly on constraint_probability.
//
// ABSENCE. A leader id that is null means "no ENTITLED leader claim on that side" (licence withheld), never "no leader
// existed"; a consumer must not name one. Every member is serialised; an inapplicable one is null. `.strict()`.
//
// RETENTION. v1 is NOT_RETAINED by ruling: the result is not persisted and is never presented as saved. It is
// deterministically recomputable from `recompute_key` (sha256 over the baseline `sent_digest`, the alternative,
// `seed_used` and `n_samples`) while the same Run and graph stay current.
// ============================================================================

const Id = z.string().min(1).max(200);

export const StructuralChallengeStatus = z.enum(['completed', 'unsupported', 'failed', 'timed_out', 'stale', 'withheld']);

const UNSUPPORTED_REASONS = [
  'link_not_found',
  'option_wiring_link',
  'bidirected_link',
  'identity_participant_link',
  'target_becomes_root',
  'anchored_identity_target',
  'candidate_rejected',
] as const;
const FAILED_REASONS = ['probe_unavailable', 'baseline_payload_mismatch', 'candidate_run_failed', 'candidate_unparseable'] as const;
const TIMED_OUT_REASONS = ['candidate_run_timeout'] as const;
const STALE_REASONS = ['run_not_current', 'model_changed_during_challenge'] as const;
const WITHHELD_REASONS = ['exploratory_work_not_permitted'] as const;

/** S1: each non-completed status's own typed reasons. */
export const STRUCTURAL_CHALLENGE_REASONS = {
  unsupported: UNSUPPORTED_REASONS,
  failed: FAILED_REASONS,
  timed_out: TIMED_OUT_REASONS,
  stale: STALE_REASONS,
  withheld: WITHHELD_REASONS,
} as const;
export const StructuralChallengeReason = z.enum([
  ...UNSUPPORTED_REASONS,
  ...FAILED_REASONS,
  ...TIMED_OUT_REASONS,
  ...STALE_REASONS,
  ...WITHHELD_REASONS,
]);

/** S2: the frame-dependent diagnostics a completed result must declare it did not compare. */
export const STRUCTURAL_CHALLENGE_FRAME_DEPENDENT = [
  'structural_influence',
  'e_values',
  'driver_rank',
  'robustness_label',
  'fragile_edges',
] as const;
export const StructuralChallengeNotCompared = z.enum([
  ...STRUCTURAL_CHALLENGE_FRAME_DEPENDENT,
  'factor_sensitivity',
  'path_decomposition',
  'flip_thresholds',
  'evpi',
]);

export const StructuralChallengeVerdict = z.enum(['holds', 'changes', 'delta_only', 'not_comparable']);

export const STRUCTURAL_CHALLENGE_NOT_COMPARABLE_BASES = [
  'frame_changed',
  'unit_changed',
  'identity_status_changed',
  'ranking_status_changed',
  'withheld_on_one_side',
  'missing_on_one_side',
] as const;
export const StructuralChallengeBasis = z.enum([
  // C1 — what earns CHANGES
  'leader_changed',
  'certainty_boundary_crossed',
  'target_crossed',
  'constraint_side_changed',
  // C2 — what earns HOLDS
  'leader_same',
  'certainty_kept',
  'same_side_of_target',
  'constraint_side_same',
  'unaffected_by_construction',
  // C3 — values without a verdict word
  'within_noise',
  'no_licensed_boundary',
  'not_noise_qualified',
  // C4
  ...STRUCTURAL_CHALLENGE_NOT_COMPARABLE_BASES,
]);
type Basis = z.infer<typeof StructuralChallengeBasis>;
type Kind = 'leader' | 'goal_probability' | 'outcome_level' | 'constraint_probability';

const CHANGES_BASIS: Record<Kind, Basis> = {
  leader: 'leader_changed',
  goal_probability: 'certainty_boundary_crossed',
  outcome_level: 'target_crossed',
  constraint_probability: 'constraint_side_changed',
};
const HOLDS_BASES: Record<Kind, readonly Basis[]> = {
  leader: ['leader_same', 'unaffected_by_construction'],
  goal_probability: ['certainty_kept', 'unaffected_by_construction'],
  outcome_level: ['same_side_of_target', 'unaffected_by_construction'],
  constraint_probability: ['constraint_side_same', 'unaffected_by_construction'],
};
const DELTA_ONLY_BASES: readonly Basis[] = ['within_noise', 'no_licensed_boundary', 'not_noise_qualified'];

const isCertain = (p: number) => p === 0 || p === 1;

/** C1–C6, shared by both claim shapes. `values` is null for the leader claim. */
function refineVerdict(
  claim: {
    kind: Kind;
    verdict: z.infer<typeof StructuralChallengeVerdict>;
    basis: Basis;
    noise_verdict: z.infer<typeof RunDeltaNoiseVerdict>;
    invariant_by_construction: boolean;
  },
  values: { baseline: number | null; alternative: number | null; target: number | null } | null,
  leaderIds: { baseline: string | null; alternative: string | null } | null,
  fail: (message: string) => void,
) {
  const { kind, verdict, basis, noise_verdict: noise } = claim;
  if (claim.invariant_by_construction !== (basis === 'unaffected_by_construction')) {
    fail('C6: invariant_by_construction <=> basis unaffected_by_construction');
  }
  if (claim.invariant_by_construction && (verdict !== 'holds' || noise === 'signal')) {
    fail('C6: an unaffected-by-construction claim holds and is never signal');
  }
  const both = values !== null && values.baseline !== null && values.alternative !== null;
  if (verdict === 'changes') {
    if (basis !== CHANGES_BASIS[kind]) fail(`C1: ${kind} changes only by ${CHANGES_BASIS[kind]}`);
    if (noise !== 'signal') fail('C1: changes needs a signal-qualified difference');
    if (leaderIds !== null) {
      if (leaderIds.baseline === null || leaderIds.alternative === null || leaderIds.baseline === leaderIds.alternative) {
        fail('C1: leader_changed names two different entitled leaders');
      }
    } else if (!both) {
      fail('C1: changes compares two values');
    }
  } else if (verdict === 'holds') {
    if (!HOLDS_BASES[kind].includes(basis)) fail(`C2: ${kind} holds only by ${HOLDS_BASES[kind].join(' | ')}`);
    if (noise === 'not_noise_qualified') fail('C2: holds needs a noise-qualified comparison');
    if (basis === 'leader_same') {
      if (noise !== 'signal') fail('C2: leader_same needs a signal-qualified lead');
      if (leaderIds === null || leaderIds.baseline === null || leaderIds.baseline !== leaderIds.alternative) {
        fail('C2: leader_same names the same entitled leader on both sides');
      }
    } else if (leaderIds === null && !both) {
      fail('C2: holds compares two values');
    }
  } else if (verdict === 'delta_only') {
    if (!DELTA_ONLY_BASES.includes(basis)) fail(`C3: delta_only by ${DELTA_ONLY_BASES.join(' | ')}`);
    if (basis === 'within_noise' && noise !== 'within_noise') fail('C3: within_noise matches the noise tag');
    if (basis === 'not_noise_qualified' && noise !== 'not_noise_qualified') fail('C3: not_noise_qualified matches the noise tag');
  } else if (!(STRUCTURAL_CHALLENGE_NOT_COMPARABLE_BASES as readonly string[]).includes(basis)) {
    fail('C4: not_comparable names why');
  }
  if (values === null || !both) return;
  const b = values.baseline as number;
  const a = values.alternative as number;
  if (basis === 'certainty_boundary_crossed' && !((isCertain(b) || isCertain(a)) && a !== b)) {
    fail('C5: a certainty crossing has an exact 0 or 1 on one side and different values');
  }
  if (basis === 'certainty_kept' && !(isCertain(b) && a === b)) {
    fail('C5: a kept certainty is the same exact 0 or 1 on both sides');
  }
  if (basis === 'target_crossed' || basis === 'same_side_of_target') {
    const t = values.target;
    if (t === null) {
      fail('C5: a target boundary names its target');
      return;
    }
    const sb = Math.sign(b - t);
    const sa = Math.sign(a - t);
    if (basis === 'target_crossed' && !(sb !== 0 && sa !== 0 && sb !== sa)) {
      fail('C5: a target crossing has the two values on strictly opposite sides of the target');
    }
    if (basis === 'same_side_of_target' && !(sb !== 0 && sb === sa)) {
      fail('C5: a same-side hold has both values strictly on the same side of the target');
    }
  }
}

export const StructuralChallengeLeaderClaimV1Schema = z
  .object({
    kind: z.literal('leader'),
    /** The entitled leader under A; null = no entitled claim (withheld), never "no leader". */
    baseline_option_id: Id.nullable(),
    /** The entitled leader under B; null = no entitled claim (withheld), never "no leader". */
    alternative_option_id: Id.nullable(),
    noise_verdict: RunDeltaNoiseVerdict,
    verdict: StructuralChallengeVerdict,
    basis: StructuralChallengeBasis,
    invariant_by_construction: z.boolean(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    refineVerdict(c, null, { baseline: c.baseline_option_id, alternative: c.alternative_option_id }, fail);
  });

const Finite = z.number().finite();

export const StructuralChallengeQuantityClaimV1Schema = z
  .object({
    kind: z.enum(['goal_probability', 'outcome_level', 'constraint_probability']),
    option_id: Id,
    /** C7: exactly on constraint_probability. */
    constraint_id: Id.nullable(),
    /** Under A; null when withheld or missing on that side (C4), never 0. */
    baseline: Finite.nullable(),
    /** Under B; null when withheld or missing on that side (C4), never 0. */
    alternative: Finite.nullable(),
    /** C7: only on outcome_level — the goal's declared target in the outcome's own unit. */
    target: Finite.nullable(),
    noise_verdict: RunDeltaNoiseVerdict,
    verdict: StructuralChallengeVerdict,
    basis: StructuralChallengeBasis,
    invariant_by_construction: z.boolean(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const probability = c.kind !== 'outcome_level';
    if (probability && [c.baseline, c.alternative].some((v) => v !== null && (v < 0 || v > 1))) {
      fail('C7: a probability lies in [0, 1]');
    }
    if (c.kind !== 'outcome_level' && c.target !== null) fail('C7: target only on outcome_level');
    if ((c.kind === 'constraint_probability') !== (c.constraint_id !== null)) {
      fail('C7: constraint_id exactly on constraint_probability');
    }
    refineVerdict(c, { baseline: c.baseline, alternative: c.alternative, target: c.target }, null, fail);
  });

export const StructuralChallengeClaimV1Schema = z.union([
  StructuralChallengeLeaderClaimV1Schema,
  StructuralChallengeQuantityClaimV1Schema,
]);

export const StructuralChallengeBaselineV1Schema = z
  .object({
    scenario_id: Id,
    run_id: Id,
    graph_hash_at_run: Id,
    /** PLoT's `seed_used` echo of the baseline Run, pinned on the recompute. */
    seed_used: z.union([z.number().int(), z.string().min(1).max(64)]),
    n_samples: z.number().int().min(1).max(100000),
    /** The Run's recorded `input_snapshot.sent_digest`; the rebuilt payload matched it. */
    sent_digest: Id,
  })
  .strict();

export const StructuralChallengeAlternativeV1Schema = z
  .object({
    op: z.literal('remove_link'),
    from_id: Id,
    to_id: Id,
    /** Who chose this link: the user, or Olumi's suggestion (an Olumi-estimated link on the leader's route). */
    origin: z.enum(['user_selected', 'olumi_suggested']),
    /** The link's sizing provenance in the baseline (RunDelta's vocabulary). */
    sizing: RunInputLinkSizing,
  })
  .strict()
  .superRefine((alt, ctx) => {
    if (alt.from_id === alt.to_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'S5: the removed link joins two different nodes' });
    }
  });

export const StructuralChallengeResultV1Schema = z
  .object({
    method: z.literal('full_recompute_unpaired_v1'),
    perturbation_class: z.literal('topology'),
    status: StructuralChallengeStatus,
    /** S1: a typed reason for every status but `completed`. */
    reason: StructuralChallengeReason.nullable(),
    baseline: StructuralChallengeBaselineV1Schema,
    alternative: StructuralChallengeAlternativeV1Schema,
    /** Always unpaired: a topology edit changes the draw structure. */
    attribution_case: z.literal('C2_unpaired'),
    /** S1/S3: derived from the two producer echoes; null when no candidate ran. */
    pair_provenance: RunDeltaPairProvenanceSchema.nullable(),
    claims: z.array(StructuralChallengeClaimV1Schema).max(64),
    /** S2: what was deliberately NOT compared across the two structures. */
    not_compared: z.array(StructuralChallengeNotCompared).max(16),
    retention: z.literal('not_retained'),
    /** sha256 hex over (sent_digest, alternative, seed_used, n_samples). */
    recompute_key: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
  .superRefine((r, ctx) => {
    const fail = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    if (r.status === 'completed') {
      if (r.reason !== null) fail('S1: a completed challenge has no reason', ['reason']);
      if (r.claims.length === 0) fail('S1: a completed challenge carries its claims', ['claims']);
      if (r.pair_provenance === null) fail('S1: a completed challenge carries its pair provenance', ['pair_provenance']);
      else if (r.pair_provenance.hash_equal) fail('S3: the edit changes the graph hash', ['pair_provenance', 'hash_equal']);
      const listed = new Set<string>(r.not_compared);
      if (!STRUCTURAL_CHALLENGE_FRAME_DEPENDENT.every((q) => listed.has(q))) {
        fail('S2: a completed challenge declares every frame-dependent diagnostic not compared', ['not_compared']);
      }
    } else {
      if (r.claims.length > 0) fail(`S1: a ${r.status} challenge carries no claims`, ['claims']);
      const own = STRUCTURAL_CHALLENGE_REASONS[r.status] as readonly string[];
      if (r.reason === null || !own.includes(r.reason)) {
        fail(`S1: a ${r.status} challenge names one of its own reasons`, ['reason']);
      }
    }
    const seen = new Set<string>();
    let leaders = 0;
    r.claims.forEach((c, i) => {
      const key = c.kind === 'leader' ? 'leader' : JSON.stringify([c.kind, c.option_id, c.constraint_id]);
      if (seen.has(key)) fail('S4: a claim appears at most once', ['claims', i]);
      seen.add(key);
      if (c.kind === 'leader') leaders += 1;
    });
    if (leaders > 1) fail('S4: at most one leader claim', ['claims']);
  });

export type StructuralChallengeLeaderClaimV1 = z.infer<typeof StructuralChallengeLeaderClaimV1Schema>;
export type StructuralChallengeQuantityClaimV1 = z.infer<typeof StructuralChallengeQuantityClaimV1Schema>;
export type StructuralChallengeClaimV1 = z.infer<typeof StructuralChallengeClaimV1Schema>;
export type StructuralChallengeBaselineV1 = z.infer<typeof StructuralChallengeBaselineV1Schema>;
export type StructuralChallengeAlternativeV1 = z.infer<typeof StructuralChallengeAlternativeV1Schema>;
export type StructuralChallengeResultV1 = z.infer<typeof StructuralChallengeResultV1Schema>;

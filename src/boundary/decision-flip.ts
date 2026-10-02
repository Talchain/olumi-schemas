import { z } from 'zod';

// ============================================================================
// 0.75.0 — "WHAT WOULD CHANGE THIS?": the recommendation's tipping point per link (SCIENCE ROBUSTNESS step 2;
// SCIENCE/DSK, programme-docs #85 lease 5948579361; DL GO with conditions). EXPERIMENT: produced by ISL
// `POST /api/v1/robustness/decision-flip/v2` (ISL #220), not yet consumed on a served path.
//
// WHAT IT ANSWERS. For each requested link, the strength at which the analyser's RECOMMENDATION would change if the
// link were weaker, with every other link's stated uncertainty integrated over. That is not `edge_e_values.flip_mean`,
// which is the flip in ONE world (every other link at its mean) and overstated the safe range 1.8-2.6x on D1.
//
// THE LICENCE IS STRUCTURAL (DL condition 2; DL CR on #85 @6670076f). A block that fails any rule below fails the
// parse, so a consumer that parsed it can quote `threshold` without re-checking. Rules (each has a RED row in
// tests/contracts/release-0.75.0.test.ts):
//   R1 quoted <=> threshold + to_option_id, and no reason; an absent link names its reason.
//   R2 THE MEDIAN RULE: a quoted threshold is the median of replicate_thresholds (all non-null): the middle value for
//      odd K, the mean of the two middle values for even K (numpy.median, ISL's own rule), within MEDIAN_TOL.
//   R3 quoted => replicate_range = max - min of the replicates (within MEDIAN_TOL), <= bound_abs AND
//      <= bound_rel x |threshold|.
//   R4 quoted => the threshold and every replicate lie strictly between 0 and current_mean (same sign, smaller
//      magnitude): the search only weakens a link towards zero.
//   R5 replicate_thresholds is null ONLY for an absence decided before any search (no replicate ran); otherwise it has
//      exactly `replicates` entries. no_change => every entry null.
//   R6 any quoted link => leader_option_id non-null, and every to_option_id differs from it.
//   R7 bound_abs <= 0.01 and bound_rel <= 0.15: the licence the DL accepted (#85, 2 Oct). Loosening it is a contract
//      change, never a producer setting.
//
// NULL, NOT ABSENT. ISL serialises every member; an inapplicable one is `null`. `.strict()`: an ISL field this
// contract does not know fails the parse instead of being dropped (the schema-version-skew hazard).
// ============================================================================

const Id = z.string().min(1).max(200);

/** R7: the accepted licence. A producer that loosens either bound fails the parse. */
export const DECISION_FLIP_MAX_BOUND_ABS = 0.01;
export const DECISION_FLIP_MAX_BOUND_REL = 0.15;
/** R2/R3 float tolerance: ISL computes the median and range in IEEE doubles that survive JSON exactly. */
const MEDIAN_TOL = 1e-12;

export const DecisionFlipLinkStatus = z.enum(['quoted', 'absent', 'no_change']);

function median(sorted: number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

/** Strictly between 0 and `current`: same sign, smaller magnitude. */
function weakerThan(current: number, x: number): boolean {
  return x !== 0 && Math.sign(x) === Math.sign(current) && Math.abs(x) < Math.abs(current);
}

export const DecisionFlipLinkV1Schema = z
  .object({
    from_id: Id,
    to_id: Id,
    status: DecisionFlipLinkStatus,
    /** Machine code for an absence (e.g. `replicates_spread`, `nonlinear_downstream:clamp:<node>`); null otherwise. */
    reason: z.string().min(1).max(200).nullable(),
    current_mean: z.number().finite(),
    /** The median replicate tipping point (R2). Non-null ONLY when `status` is `quoted`. */
    threshold: z.number().finite().nullable(),
    /** One entry per replicate: its tipping point, or null when that replicate found no change. Null when no replicate
     *  ran (R5). */
    replicate_thresholds: z.array(z.number().finite().nullable()).min(2).max(8).nullable(),
    replicate_range: z.number().finite().nonnegative().nullable(),
    /** The option that would lead past the threshold. Non-null ONLY when `status` is `quoted`. */
    to_option_id: Id.nullable(),
  })
  .strict()
  .superRefine((link, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const reps = link.replicate_thresholds;
    if (link.status === 'quoted') {
      if (link.threshold === null || link.to_option_id === null || link.reason !== null) {
        fail('R1: a quoted link carries a threshold and a new leader, and no reason');
        return;
      }
      const vals = reps === null ? [] : reps.filter((v): v is number => v !== null);
      if (reps === null || vals.length !== reps.length) {
        fail('R2: a quoted link has a tipping point from every replicate');
        return;
      }
      vals.sort((a, b) => a - b);
      if (Math.abs(link.threshold - median(vals)) > MEDIAN_TOL) fail('R2: a quoted threshold is the median of its replicates');
      const range = vals[vals.length - 1] - vals[0];
      if (link.replicate_range === null || Math.abs(link.replicate_range - range) > MEDIAN_TOL) {
        fail('R3: replicate_range is the max - min of the replicates');
      }
      if (![link.threshold, ...vals].every((x) => weakerThan(link.current_mean, x))) {
        fail('R4: a tipping point lies strictly between 0 and the current strength');
      }
      return;
    }
    if (link.threshold !== null || link.to_option_id !== null) fail(`R1: a ${link.status} link never carries a threshold or a new leader`);
    if (link.status === 'absent' && link.reason === null) fail('R1: an absent link names its reason');
    if (link.status === 'no_change') {
      if (link.reason !== null || link.replicate_range !== null) fail('R5: a no_change link has no reason and no range');
      if (reps === null || reps.some((v) => v !== null)) fail('R5: no_change means every replicate ran and none found a change');
    }
  });

export const DecisionFlipBlockV1Schema = z
  .object({
    method: z.literal('affine_crn_replicates_v1'),
    /** The analyser's recommendation the tipping points are about; null when the ranking was not supported. */
    leader_option_id: Id.nullable(),
    replicates: z.number().int().min(2).max(8),
    bound_abs: z.number().finite().positive().max(DECISION_FLIP_MAX_BOUND_ABS),
    bound_rel: z.number().finite().positive().max(DECISION_FLIP_MAX_BOUND_REL),
    grid_step: z.number().finite().positive(),
    links: z.array(DecisionFlipLinkV1Schema).min(1).max(12),
  })
  .strict()
  .superRefine((block, ctx) => {
    const fail = (i: number, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['links', i], message });
    block.links.forEach((link, i) => {
      if (link.replicate_thresholds !== null && link.replicate_thresholds.length !== block.replicates) {
        fail(i, 'R5: one replicate_thresholds entry per replicate');
      }
      if (link.status !== 'quoted' || link.threshold === null || link.replicate_range === null) return;
      if (link.replicate_range > block.bound_abs || link.replicate_range > block.bound_rel * Math.abs(link.threshold)) {
        fail(i, 'R3: a quoted link\'s replicates agree within the licence');
      }
      if (block.leader_option_id === null || link.to_option_id === block.leader_option_id) {
        fail(i, 'R6: a quoted link names a leader and a different option past its tipping point');
      }
    });
  });

export type DecisionFlipLinkV1 = z.infer<typeof DecisionFlipLinkV1Schema>;
export type DecisionFlipBlockV1 = z.infer<typeof DecisionFlipBlockV1Schema>;

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
// THE LICENCE (DL condition 2). K replicate seeds; `quoted` only when they agree (range <= bound_abs AND
// <= bound_rel x |median|). Otherwise `absent` WITH a machine reason, never a number. `no_change` = no replicate found a
// change between the current strength and zero. A consumer MUST NOT render `threshold` for anything but `quoted`; the
// refinement below makes that structural.
//
// NULL, NOT ABSENT. ISL serialises every member; an inapplicable one is `null`. `.strict()`: an ISL field this
// contract does not know fails the parse instead of being dropped (the schema-version-skew hazard).
// ============================================================================

const Id = z.string().min(1).max(200);

export const DecisionFlipLinkStatus = z.enum(['quoted', 'absent', 'no_change']);

export const DecisionFlipLinkV1Schema = z
  .object({
    from_id: Id,
    to_id: Id,
    status: DecisionFlipLinkStatus,
    /** Machine code for an absence (e.g. `replicates_spread`, `nonlinear_downstream:clamp:<node>`); null otherwise. */
    reason: z.string().min(1).max(200).nullable(),
    current_mean: z.number().finite(),
    /** The median replicate tipping point. Non-null ONLY when `status` is `quoted`. */
    threshold: z.number().finite().nullable(),
    /** One entry per replicate: its tipping point, or null when that replicate found no change. */
    replicate_thresholds: z.array(z.number().finite().nullable()).max(16),
    replicate_range: z.number().finite().nonnegative().nullable(),
    /** The option that would lead past the threshold. Non-null ONLY when `status` is `quoted`. */
    to_option_id: Id.nullable(),
  })
  .strict()
  .superRefine((link, ctx) => {
    if (link.status === 'quoted') {
      if (link.threshold === null || link.to_option_id === null || link.reason !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a quoted link carries a threshold and a new leader, and no reason' });
      }
    } else if (link.threshold !== null || link.to_option_id !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `a ${link.status} link never carries a threshold or a new leader` });
    }
    if (link.status === 'absent' && link.reason === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'an absent link names its reason' });
    }
  });

export const DecisionFlipBlockV1Schema = z
  .object({
    method: z.literal('affine_crn_replicates_v1'),
    /** The analyser's recommendation the tipping points are about; null when the ranking was not supported. */
    leader_option_id: Id.nullable(),
    replicates: z.number().int().min(2).max(8),
    bound_abs: z.number().finite().positive(),
    bound_rel: z.number().finite().positive(),
    grid_step: z.number().finite().positive(),
    links: z.array(DecisionFlipLinkV1Schema).min(1).max(12),
  })
  .strict();

export type DecisionFlipLinkV1 = z.infer<typeof DecisionFlipLinkV1Schema>;
export type DecisionFlipBlockV1 = z.infer<typeof DecisionFlipBlockV1Schema>;

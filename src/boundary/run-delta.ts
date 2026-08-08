import { z } from 'zod';

// ============================================================================
// 0.39.0 car 3 (ROADMAP 2.698-S2) — the run-over-run delta block.
//
// Design of record: parallel-briefs/RUN-DELTA-DESIGN-2026-08-08.md (workspace
// root, verified at all five tips). CEE emits ONE `run_delta` per completed
// rerun, carried on the turn envelope beside `analysis_ready`
// (OlumiResponseSchema.run_delta). The UI renders it with ZERO client-side
// computation (S3): every number, tag and entitlement below is
// producer-computed.
//
// THE HONESTY PROBLEM THIS SHAPE EXISTS TO SOLVE (the row's own hazard flag):
// attributing a result delta to specific edits is a CAUSAL claim, and Monte
// Carlo noise makes naive attribution a fabrication engine. The design's §b
// decision table derives a case enum (C0–C4) from a pair-provenance record
// whose every member comes from PRODUCER ECHOES on the two persisted facts
// (PLoT's `seed_used` echo, `graph_hash_at_run`, `_meta.builds`,
// `n_samples`) — never from CEE's own "I sent the seed" record (a
// self-reported pin is a guard agreeing with itself).
//
// FABRICATION RULES LIFTED INTO THE TYPE SYSTEM (the analysis-fact doctrine:
// where a rule can live in the type system, it must not live in producer
// discipline) — enforced by `refineRunDelta` below:
//   1. `C1_attributable` REQUIRES seed_equal ∧ ¬hash_equal ∧
//      builds_equal='equal' ∧ n_equal. A delta claiming attributability
//      without those preconditions FAILS TO PARSE — causal connectives are
//      constructible only from C1, and C1 is constructible only from the
//      echoes.
//   2. `C0_identical` REQUIRES all four equalities (any nonzero diff under
//      C0 is a producer defect — telemetry, never a user sentence).
//   3. `edit_list` may only travel on a ¬hash_equal pair and is never empty:
//      the projection diff uses the SAME whitelist as
//      `computeAnalysisAffectingGraphHash`, so hash and list CANNOT disagree
//      (design §b rule 2) — an empty list under an unequal hash, or any list
//      under an equal hash, is a disagreement and is refused at the boundary.
//   C2/C3/C4 carry NO cross-rule here: their conditions can co-occur
//   (¬seed ∧ ¬n, …) and the design states no precedence — the classifier's
//   precedence is CEE's derivation obligation, deliberately not guessed into
//   the contract (trap 13c: expectations come from the producer's semantics).
//
// SHAPE PROVENANCE, stated honestly: the design specifies the SEMANTIC
// content (the §b quadruple + case table, §a first-tier quantities, §c card
// copy slots) but not Zod literals. The field names and literals below are
// this package's minimal derivation of what the S3 card consumes — flagged
// as such in the 0.39.0 CHANGELOG entry. What is deliberately NOT here:
//   - NO free-text attribution sentence (the sentence builder takes the case
//     enum BY IDENTITY; a producer-authored causal sentence field would be
//     un-checkable against the preconditions);
//   - NO per-edit attribution (the honest unit is the edit SET — per-edit
//     needs ablation runs, out of scope);
//   - NO goal-probability / outcome-stat / sensitivity rows yet (S2's first
//     tier is leader + win probabilities + flip band + structure; later
//     tiers land additively).
// ============================================================================

/**
 * §b decision table, the ONLY input the sentence builder may take. Literals
 * carry both the design's case id (C0–C4, identity-stable against the table)
 * and its name.
 */
export const RunDeltaAttributionCase = z.enum([
  'C0_identical',
  'C1_attributable',
  'C2_unpaired',
  'C3_engine_drift',
  'C4_budget_drift',
]);
export type RunDeltaAttributionCaseLiteral = z.infer<typeof RunDeltaAttributionCase>;

/**
 * Tri-state builds equality: `_meta.builds` rides only under
 * `isCanonicalMetaEnabled()`, so absence is a REACHABLE state and must never
 * be defaulted to 'equal' — the design's §e-8 mutant ("collapse unknown to
 * equal") is the exact fabrication this refuses. 'unknown' with any other
 * divergence classifies C3 per the table.
 */
export const RunDeltaBuildsEquality = z.enum(['equal', 'unequal', 'unknown']);
export type RunDeltaBuildsEqualityLiteral = z.infer<typeof RunDeltaBuildsEquality>;

/**
 * The §b pair-provenance record — every member DERIVED from producer echoes
 * on the two persisted facts, never self-reported. Carried on the wire so
 * the classification is auditable (13b: the discriminator pins its own
 * precondition — a reviewer of a capture can re-derive the case from the
 * record it rode with).
 */
export const RunDeltaPairProvenanceSchema = z.object({
  /** PLoT `seed_used` echoes present on BOTH facts and equal. */
  seed_equal: z.boolean(),
  /** `graph_hash_at_run` equal across the pair. */
  hash_equal: z.boolean(),
  /** Pipeline builds equality where derivable; 'unknown' when `_meta.builds` absent. */
  builds_equal: RunDeltaBuildsEquality,
  /** `n_samples` equal across the pair. */
  n_equal: z.boolean(),
}).strict();
export type RunDeltaPairProvenance = z.infer<typeof RunDeltaPairProvenanceSchema>;

/**
 * Per-quantity noise entitlement (§a): `signal` = the delta exceeds its
 * producer-derived noise band; `within_noise` = it does not;
 * `not_noise_qualified` = no honest band exists for this quantity on this
 * pair (reported as direction only, never dressed as signal). The three
 * states are deliberately never collapsible — a consumer renders the tag
 * verbatim.
 */
export const RunDeltaNoiseVerdict = z.enum([
  'signal',
  'within_noise',
  'not_noise_qualified',
]);
export type RunDeltaNoiseVerdictLiteral = z.infer<typeof RunDeltaNoiseVerdict>;

/**
 * One option's win-probability movement. Binomial-SE banded producer-side
 * (independent-run form — the CRN limit means same-seed pairing gives NO
 * variance reduction across edits; the band never assumes it does).
 */
export const RunDeltaWinProbabilityDeltaSchema = z.object({
  /** Option id — identity-bound (trap 19), never a label. */
  option_id: z.string().min(1),
  prior: z.number().min(0).max(1),
  current: z.number().min(0).max(1),
  noise_verdict: RunDeltaNoiseVerdict,
}).strict();
export type RunDeltaWinProbabilityDelta = z.infer<typeof RunDeltaWinProbabilityDeltaSchema>;

/**
 * The leader movement line. Ids are OPTIONAL because either side's leader
 * verdict may have been WITHHELD (the `may_name_leading_option` gate) or the
 * run may predate leader capture — ABSENCE of an id means "no entitled
 * leader claim on that side", never "no leader existed"; a consumer must not
 * name one. `changed` compares the entitled claims only. The §a rule ("both
 * sides entitled AND margins exceed their SE bands, else 'leader changed —
 * within noise'") is the producer's computation; the wire carries its
 * verdict.
 */
export const RunDeltaLeaderDeltaSchema = z.object({
  changed: z.boolean(),
  prior_leading_option_id: z.string().min(1).optional(),
  current_leading_option_id: z.string().min(1).optional(),
  noise_verdict: RunDeltaNoiseVerdict,
}).strict();
export type RunDeltaLeaderDelta = z.infer<typeof RunDeltaLeaderDeltaSchema>;

/**
 * Flip-threshold band verdict (§a): ISL's own 10-seed stability band IS the
 * noise model. `bands_disjoint` is the strict form (licenses the causal
 * clause under C1); `outside_prior_band` is the "worth a look" tier;
 * `within_band` = movement inside the stability band;
 * `band_unavailable` = a side lacks the band (older fact) — direction only.
 */
export const RunDeltaFlipBandVerdict = z.enum([
  'bands_disjoint',
  'outside_prior_band',
  'within_band',
  'band_unavailable',
]);
export type RunDeltaFlipBandVerdictLiteral = z.infer<typeof RunDeltaFlipBandVerdict>;

export const RunDeltaFlipThresholdDeltaSchema = z.object({
  /** Factor id — identity-bound, never a label. */
  factor_id: z.string().min(1),
  /** Medians optional: absent when that side's fact carries no flip row for this factor. */
  prior_median: z.number().finite().optional(),
  current_median: z.number().finite().optional(),
  band_verdict: RunDeltaFlipBandVerdict,
}).strict();
export type RunDeltaFlipThresholdDelta = z.infer<typeof RunDeltaFlipThresholdDeltaSchema>;

/**
 * The bare object — exported schema is the refined version below (the
 * EvidenceBlock/UiDirective pattern; the bare object stays internal).
 */
const RunDeltaObjectSchema = z.object({
  attribution_case: RunDeltaAttributionCase,
  pair_provenance: RunDeltaPairProvenanceSchema,
  leader: RunDeltaLeaderDeltaSchema,
  /** May be empty (no options with a computable pair). */
  win_probabilities: z.array(RunDeltaWinProbabilityDeltaSchema),
  /** May be empty (no flip rows on either side). */
  flip_thresholds: z.array(RunDeltaFlipThresholdDeltaSchema),
  /**
   * The edit SET between the two runs, DERIVED from the persisted
   * analysis-affecting projections (never an event log — logs about edits
   * lie; the graph bytes do not). Entries are projection field paths.
   * ABSENCE SEMANTICS (census: distinct): absent = the prior fact predates
   * edit tracking, so the list is underivable — C1's edit clause degrades
   * honestly to "you changed the model" (hash inequality is still proven).
   * Present ⇒ the pair's hashes differ and the list is the COMPLETE diff
   * under the hash whitelist — never empty, never on an equal-hash pair
   * (refined below).
   */
  edit_list: z.array(z.string().min(1)).min(1).optional(),
}).strict();
export type RunDelta = z.infer<typeof RunDeltaObjectSchema>;

/**
 * The fabrication rules (header §1–§3), exported so a consumer parsing a
 * bare object can apply them identically (the refineEdgeAdjudication
 * precedent in turn-payload.ts).
 */
export function refineRunDelta(
  data: RunDelta,
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = [],
): void {
  const p = data.pair_provenance;
  if (data.attribution_case === 'C1_attributable') {
    if (!(p.seed_equal && !p.hash_equal && p.builds_equal === 'equal' && p.n_equal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, 'attribution_case'],
        message:
          'C1_attributable requires seed_equal && !hash_equal && builds_equal="equal" && n_equal — causal entitlement is constructible only from the producer echoes (RUN-DELTA-DESIGN §b).',
      });
    }
  }
  if (data.attribution_case === 'C0_identical') {
    if (!(p.seed_equal && p.hash_equal && p.builds_equal === 'equal' && p.n_equal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, 'attribution_case'],
        message:
          'C0_identical requires all four pair equalities (RUN-DELTA-DESIGN §b).',
      });
    }
  }
  if (data.edit_list !== undefined && p.hash_equal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'edit_list'],
      message:
        'edit_list may only travel on a !hash_equal pair — hash and list derive from one whitelist and cannot disagree (RUN-DELTA-DESIGN §b rule 2).',
    });
  }
}

/**
 * Public schema — the bare shape plus the fabrication rules. This is what
 * `OlumiResponseSchema.run_delta` carries.
 */
export const RunDeltaSchema = RunDeltaObjectSchema.superRefine((data, ctx) =>
  refineRunDelta(data, ctx),
);

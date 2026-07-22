import { z } from 'zod';

// ============================================================================
// Analysis enrichment envelope (v0.14.0) — the typed replacement for the
// untyped `z.record(z.string(), z.unknown())` passthrough that carries
// PLoT → CEE → UI analysis science.
//
// PROVENANCE RULE: every field below is evidenced from a live staging capture
// or current staging producer code — never invented. Primary evidence:
//
//   [F1] CEE repo, tests/fixtures/cross-service/v5-turn.run-analysis.staging.json
//        — real staging-captured 40-key PLoT /v2/run envelope persisted
//        byte-for-byte as RunAnalysisHandlerFact.result.enrichment
//        (CEE staging e122f16, captured build preflight 2025-12-26).
//        Mirrored in this repo at
//        fixtures/enrichment/plot-to-cee.run-analysis.staging.json.
//   [F2] PLoT repo, src/types/engine-v3.ts @ staging 524c488 — RunResponseV3,
//        OptionComparisonResultV3, FactorSensitivityResultV3,
//        RobustnessAssessmentV3 (incl. display_verdict, PR #202-lane W5),
//        EnrichedEdgeEValue, InferenceWarning, goal_fit_basis (PR #204
//        doctrine B), constraints gating (PR #205).
//   [F3] PLoT repo, src/lib/flip-threshold-denormaliser.ts @ staging 524c488
//        — DenormalisedFlipThreshold.
//   [F4] PLoT repo, src/coaching/types.ts @ staging 524c488 — M1Coaching.
//   [F5] CEE repo, src/orchestrator-v5/coaching/types.ts @ staging e122f16 —
//        DecisionReviewOutput (CEE-attached, LLM-emitted open shape).
//   [F6] CEE repo, src/orchestrator-v5/compose.ts @ staging e122f16 —
//        P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP (the 11-key CEE→UI projection).
//
// DESIGN STANCE — transport-tolerant typing:
//   * The envelope and every nested object use `.passthrough()`: producers
//     may add fields without a schema bump, and consumers on this schema
//     never drop unknown keys. This is deliberately NOT `.strict()`.
//   * A field is `required` inside an entry only when every evidenced
//     producer emission carries it. Everything else is `.optional()`.
//   * Open string vocabularies stay `z.string()` where the wire has already
//     drifted across builds (e.g. `confidence_source` was 'isl' | 'graph' on
//     the 2025-12 capture and is 'plot_unified_from_*' on current staging).
//     Closed enums are used only where the producer's TS union is closed and
//     has been stable across the evidenced builds.
//   * ADDITIVE GUARANTEE: any value accepted by the previous untyped
//     `z.record(z.string(), z.unknown())` that carries well-formed known keys
//     still parses. Unknown keys always pass. The ONLY new rejections are
//     malformed *known* keys (e.g. `factor_sensitivity` as an object instead
//     of an array) — which is precisely the silent-drift class this envelope
//     exists to catch. Consumers who need never-fail behaviour keep using
//     the raw record and opt in via `safeParse`.
//
// SEAM PRESENCE (which keys appear where):
//   * PLoT → CEE (`/v2/run` response, persisted verbatim by run_analysis):
//     the full envelope below.
//   * CEE → UI (`analysis_result` block enrichment): reduced to the [F6]
//     keep-list — option_comparison, factor_sensitivity, results, robustness,
//     decision_review, option_comparison_status, conditional_probabilities,
//     edge_e_values, inference_warnings, confidence_tier, flip_thresholds —
//     with internal carriers (`_meta`, `meta`, `downstream_calls`, graph
//     hashes, ...) deep-stripped. `AnalysisEnrichmentSchema` parses both
//     projections (all fields optional).
// ============================================================================

// ----------------------------------------------------------------------------
// Fail-closed provenance markers (F6 — constraint scale/margin trust seam)
// ----------------------------------------------------------------------------

/**
 * The cross-lane, contract-FROZEN fail-closed sentence. Hoisted to ONE const
 * (rather than re-typed at each `.describe()` site the way this module usually
 * inlines them) so every marker below carries it BYTE-IDENTICALLY and a future
 * edit cannot let one site drift from the others — derive-don't-mirror applied
 * to prose. DO NOT reword: cross-repo consumers key trust decisions off this
 * exact wording.
 */
const ABSENCE_FAIL_CLOSED_RULE =
  'Absence of this marker means NOT decision-grade (fail-closed). Consumers ' +
  'MUST NOT treat a missing marker as trustworthy.';

// ----------------------------------------------------------------------------
// Shared vocabularies
// ----------------------------------------------------------------------------

/**
 * Top-level analysis status. [F2] TopLevelAnalysisStatus — closed, stable
 * across evidenced builds.
 */
export const EnrichmentAnalysisStatus = z.enum([
  'computed',
  'partial',
  'failed',
  'blocked',
]);
export type EnrichmentAnalysisStatusType = z.infer<typeof EnrichmentAnalysisStatus>;

/**
 * Per-feature status vocabulary. [F2] PerFeatureStatus — used for
 * option_comparison_status / robustness_status / drivers_status, and
 * (same literal set) ConstraintFeatureStatus for constraints_status
 * (PR #205: 'unavailable' now also covers suppressed-unreliable targets).
 */
export const EnrichmentFeatureStatus = z.enum([
  'computed',
  'unavailable',
  'skipped',
  'error',
]);
export type EnrichmentFeatureStatusType = z.infer<typeof EnrichmentFeatureStatus>;

/**
 * UI-facing confidence tier derived from m1_coaching readiness and
 * reconciled against robustness. [F2] RunResponseV3.confidence_tier.
 * Observed live value: 'needs_work' [F1].
 */
export const EnrichmentConfidenceTier = z.enum(['strong', 'fair', 'needs_work']);
export type EnrichmentConfidenceTierType = z.infer<typeof EnrichmentConfidenceTier>;

// ----------------------------------------------------------------------------
// option_comparison — [F1] entries, [F2] OptionComparisonResultV3
// ----------------------------------------------------------------------------

/** Outcome statistics from ISL Monte Carlo. [F1][F2] OutcomeStatsV3. */
export const EnrichmentOutcomeStatsSchema = z.object({
  mean: z.number(),
  std: z.number().optional(),
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
  n_samples: z.number().optional(),
  n_valid_samples: z.number().optional(),
  validity_ratio: z.number().optional(),
}).passthrough();
export type EnrichmentOutcomeStats = z.infer<typeof EnrichmentOutcomeStatsSchema>;

/**
 * Goal-fit provenance annotation (doctrine B, PLoT PR #204, ratified
 * 2026-07-07). Present ONLY when probability_of_joint_goal /
 * constraint_probabilities were scored from the constraint-target node's
 * forward-propagated Monte Carlo outcome distribution (ISL defaulted the
 * node's base to 0.0). Pairs with the info-severity
 * CONSTRAINT_GOALFIT_MODELLED_BASIS inference warning. [F2]
 *
 * `scored_from` is typed open (string) with the single currently-emitted
 * value 'modelled_outcome_distribution' — producer-owned vocabulary.
 */
export const EnrichmentGoalFitBasisSchema = z.object({
  /** Currently always 'modelled_outcome_distribution'. */
  scored_from: z.string(),
  /** Constraint-target node ids scored this way (sorted, deduplicated). */
  node_ids: z.array(z.string()),
}).passthrough();
export type EnrichmentGoalFitBasis = z.infer<typeof EnrichmentGoalFitBasisSchema>;

/**
 * Per-option, per-constraint graded breach margin (F6 — additive PoC plumbing).
 * Mirrors PLoT's `ConstraintMargin` interface (src/types/engine-v3.ts @ staging
 * ea10656, emitted at src/routes/v2/run.ts): breaching options become ORDERABLE
 * by how far over the constraint they are. Rides
 * `option_comparison[].constraint_margins`.
 *
 * EVIDENCED shape — every field verified against the PLoT source at ea10656.
 * `failure_margin_median` is denormalised to USER UNITS by PLoT before egress
 * and is a breach DISTANCE: finite and non-negative (a negative distance is
 * upstream garbage; a non-finite value would serialise to a fabricated `null`).
 * `near_miss_fraction` is a rate in [0,1]. Absent margin fields are OMITTED,
 * never zeroed — missing ≠ zero (a fabricated 0 read by a live consumer was the
 * exact defect PLoT's producer-honesty gate closed).
 */
export const EnrichmentConstraintMarginSchema = z.object({
  constraint_id: z.string().min(1),
  failure_margin_median: z.number().finite().nonnegative().optional(),
  near_miss_fraction: z.number().min(0).max(1).optional(),
  margin_precision: z.enum(['exact', 'lower_bound']).optional().describe(
    'Absent means precision is unknown; consumers MUST NOT assume exactness.',
  ),
}).passthrough();
export type EnrichmentConstraintMargin =
  z.infer<typeof EnrichmentConstraintMarginSchema>;

/**
 * Per-option comparison entry. [F1][F2].
 *
 * `option_id` is the only field every evidenced emission carries. `id` /
 * `label` are CIL-0.1 duplicates of option_id/option_label for UI consumers.
 * `probability_of_joint_goal` and `constraint_probabilities` are SUPPRESSED
 * (absent) when any constraint target is unreliable, and delivered with
 * `goal_fit_basis` under doctrine B (PR #204).
 */
export const EnrichmentOptionComparisonEntrySchema = z.object({
  option_id: z.string().min(1),
  option_label: z.string().optional(),
  id: z.string().optional(),
  label: z.string().optional(),
  /** @deprecated V1 legacy — kept for inbound tolerance of old payloads. */
  expected_outcome: z.number().optional(),
  /** @deprecated V1 legacy — kept for inbound tolerance of old payloads. */
  confidence_interval: z.tuple([z.number(), z.number()]).optional(),
  outcome: EnrichmentOutcomeStatsSchema.optional(),
  status: z.string().optional(), // 'computed' | 'skipped' | 'error' [F2]; open for tolerance
  status_reason: z.string().optional(),
  probability_of_goal: z.number().optional(),
  win_probability: z.number().optional(),
  probability_of_joint_goal: z.number().optional(),
  constraint_probabilities: z.record(z.string(), z.number()).optional(),
  goal_fit_basis: EnrichmentGoalFitBasisSchema.optional(),
  /**
   * F6 — per-constraint graded breach margins for THIS option (additive).
   * Delivered under the SAME honesty gate as the probabilities: never attached
   * on a suppressed / direction-suspect constraint target [PLoT run.ts].
   */
  constraint_margins: z.array(EnrichmentConstraintMarginSchema).optional(),
  /**
   * F6 — fail-closed decision-grade marker for this option's constraint block.
   */
  constraints_decision_grade: z.boolean().optional().describe(ABSENCE_FAIL_CLOSED_RULE),
}).passthrough();
export type EnrichmentOptionComparisonEntry =
  z.infer<typeof EnrichmentOptionComparisonEntrySchema>;

// ----------------------------------------------------------------------------
// factor_sensitivity — [F1] entries, [F2] FactorSensitivityResultV3
// ----------------------------------------------------------------------------

/**
 * Confidence provenance disclosure object. [F2] ConfidenceProvenance.
 * Absent on pre-A1 payloads ([F1] has no confidence_provenance); when
 * present, current staging always writes all five fields.
 */
export const EnrichmentConfidenceProvenanceSchema = z.object({
  computation_source: z.string(),
  formula_version: z.string(),
  is_provisional: z.boolean(),
  calibration_status: z.string(),
  input_quality: z.string(),
}).passthrough();
export type EnrichmentConfidenceProvenance =
  z.infer<typeof EnrichmentConfidenceProvenanceSchema>;

/**
 * Per-factor sensitivity entry. [F1][F2].
 *
 * `factor_id` is required (every evidenced emission). Numeric fields are
 * optional because ISL may not provide them — absent means "unavailable",
 * NOT zero ([F2] doc). `zero_reason` is present when sensitivity_score = 0;
 * known value 'intervention_override' (option-pinned lever), vocabulary open.
 * `confidence_source` is typed OPEN: the 2025-12 capture emits 'isl'/'graph'
 * [F1]; current staging emits 'plot_unified_from_isl_bootstrap' /
 * 'plot_unified_from_graph' [F2] — a closed enum would reject real
 * persisted facts.
 * `evpi_status: 'below_resolution'` means "too small to measure at this
 * sampling depth" with evpi_percentage_points deliberately ABSENT — never a
 * clamped 0 (PLoT lane H item C / P-5).
 */
export const EnrichmentFactorSensitivityEntrySchema = z.object({
  factor_id: z.string().min(1),
  factor_label: z.string().nullable().optional(),
  influence_score: z.number().optional(),
  influence_rank: z.number().optional(),
  sensitivity_score: z.number().optional(),
  elasticity: z.number().optional(),
  direction: z.string().nullable().optional(), // 'positive'|'negative'|'mixed'|'unknown' [F2]
  importance_rank: z.number().optional(),
  interpretation: z.string().nullable().optional(),
  value_of_information: z.number().nullable().optional(),
  evpi_percentage_points: z.number().optional(),
  evpi_method: z.string().optional(), // 'heuristic' | 'counterfactual' [F2]
  evpi_status: z.string().optional(), // 'below_resolution' [F2]
  confidence: z.number().nullable().optional(),
  zero_reason: z.string().nullable().optional(),
  source: z.string().optional(), // 'graph' | 'isl' [F2]
  confidence_source: z.string().optional(),
  confidence_provenance: EnrichmentConfidenceProvenanceSchema.optional(),
  flip_risk_category: z.string().optional(), // 'isolated'|'correlated'|'negligible' [F2]
  elasticity_std: z.number().optional(),
  attribution_stability: z.string().optional(), // 'high'|'moderate'|'low'|'negligible' [F2]
  rank_flip_rate: z.number().optional(),
  stability_method: z.string().optional(),
  value_source: z.string().optional(),
  value_extraction_type: z.string().optional(),
  value_defaulted: z.boolean().optional(),
  confidence_components: z.object({
    structural_certainty: z.number(),
    sampling_stability: z.number().nullable(),
  }).passthrough().optional(),
  range_derivation_source: z.string().optional(),
  _normalised: z.boolean().optional(),
}).passthrough();
export type EnrichmentFactorSensitivityEntry =
  z.infer<typeof EnrichmentFactorSensitivityEntrySchema>;

// ----------------------------------------------------------------------------
// robustness — [F1], [F2] RobustnessAssessmentV3 (+ display_verdict, lane W5)
// ----------------------------------------------------------------------------

/**
 * Normalised edge info for robustness (fragile_edges / robust_edges
 * entries). [F1][F2] NormalizedEdgeInfoV3.
 */
export const EnrichmentRobustnessEdgeSchema = z.object({
  edge_id: z.string().min(1),
  from_id: z.string(),
  to_id: z.string(),
  from_label: z.string().optional(),
  to_label: z.string().optional(),
  switch_probability: z.number(),
  /** Present on fragile_edges (>0.7 critical, >0.5 error, else warning) [F2]. */
  severity: z.string().optional(),
  marginal_switch_probability: z.number().optional(),
  alternative_winner_id: z.string().nullable().optional(),
  alternative_winner_label: z.string().nullable().optional(),
}).passthrough();
export type EnrichmentRobustnessEdge = z.infer<typeof EnrichmentRobustnessEdgeSchema>;

/** Near-tie detection. [F2] NearTieInfoV3. */
export const EnrichmentNearTieSchema = z.object({
  is_tie: z.boolean(),
  top_option_id: z.string(),
  second_option_id: z.string().nullable(),
  tied_option_ids: z.array(z.string()),
  gap: z.number(),
  threshold: z.number(),
}).passthrough();
export type EnrichmentNearTie = z.infer<typeof EnrichmentNearTieSchema>;

/**
 * Overall robustness assessment. [F1][F2].
 *
 * `display_verdict` / `display_verdict_reason` are ADDITIVE (PLoT lane W5,
 * PR #202): display-safe verdict derived ONLY from is_robust/level
 * (confidence can never upgrade it); 'not_assessed' whenever robustness was
 * not computed. `display_verdict_reason` is a producer-owned claim-safe
 * phrase the UI renders verbatim.
 *
 * `recommendation_stability` is DEPRECATED and no longer emitted (PLoT lane
 * H item B, 2026-07-07): it was byte-identical to the leader's
 * win_probability. Kept optional for inbound tolerance of old payloads only
 * — consumers must use the absence path.
 */
export const EnrichmentRobustnessSchema = z.object({
  score: z.number().optional(),
  label: z.string().optional(), // 'robust' | 'moderate' | 'fragile' [F2]
  fragile_edges: z.array(EnrichmentRobustnessEdgeSchema).optional(),
  robust_edges: z.array(EnrichmentRobustnessEdgeSchema).optional(),
  explanation: z.string().optional(),
  /** @deprecated no longer emitted — inbound tolerance only. See above. */
  recommendation_stability: z.number().optional(),
  is_robust: z.boolean().optional(),
  /** ISL vocabulary: 'high'|'medium'|'low'|'very_low' (UI maps medium→moderate) [F2]. */
  level: z.string().optional(),
  confidence: z.number().optional(),
  normalization_errors: z.array(z.object({
    edge_type: z.string(),
    error: z.string(),
    raw_value: z.unknown().optional(),
  }).passthrough()).optional(),
  recommended_option_id: z.string().optional(),
  recommended_option_label: z.string().optional(),
  near_tie: EnrichmentNearTieSchema.optional(),
  display_verdict: z.string().optional(), // 'robust'|'moderate'|'fragile'|'not_assessed' [F2]
  display_verdict_reason: z.string().optional(),
}).passthrough();
export type EnrichmentRobustness = z.infer<typeof EnrichmentRobustnessSchema>;

// ----------------------------------------------------------------------------
// flip_thresholds — [F1] entries, [F3] DenormalisedFlipThreshold
// ----------------------------------------------------------------------------

/**
 * Denormalised flip threshold (tipping point) in user units. [F1][F3].
 * `flip_value: null` is an honest "no flip found" and is preserved as-is
 * (see `flip_reason`, e.g. 'no_effect_within_bounds').
 */
export const EnrichmentFlipThresholdSchema = z.object({
  factor_id: z.string().min(1),
  factor_label: z.string(),
  current_value: z.number(),
  flip_value: z.number().nullable(),
  direction: z.string(), // 'increase' | 'decrease' [F3]
  unit: z.string().optional(),
  alternative_winner_id: z.string().nullable().optional(),
  alternative_winner_label: z.string().nullable().optional(),
  flip_reason: z.string(),
  iterations_used: z.number().optional(),
  probes_used: z.number().optional(),
  /** Additive lead-margin diagnostic (PR #167 follow-up); open shape [F3]. */
  margin_sensitivity: z.object({}).passthrough().optional(),
}).passthrough();
export type EnrichmentFlipThreshold = z.infer<typeof EnrichmentFlipThresholdSchema>;

// ----------------------------------------------------------------------------
// edge_e_values — [F2] EnrichedEdgeEValue
// ----------------------------------------------------------------------------

/**
 * Edge E-value (evidence strength for an edge's causal direction). [F2].
 * NOTE the live top-level array is frequently [] — ISL nests the populated
 * copy at robustness.edge_e_values on its own wire and PLoT re-emits the
 * transformed entries top-level; on the evidenced capture [F1] the top-level
 * array is empty. `flip_direction` is ISL-owned open vocabulary: live V2
 * emits 'increase'|'decrease' (verified 2026-07-06 build f3f5d92); legacy
 * documented values were 'positive_to_negative'|'negative_to_positive'|
 * 'removal' — typed open to match the wire [F2].
 */
/**
 * Per-edge flip-stability band (0.19.0 — wave-2 ask 8; A3 compute wave).
 * This is the canonical SHARED type for the `edge_e_values[].stability`
 * object PLoT's seed-sweep emits (previously untyped — it rode the
 * `.passthrough()` parent, so a malformed band survived every schema parse;
 * PLoT's egress guard `assessStabilityBands` carries a local interim parse
 * whose invariants this schema restates as the cross-repo source of truth).
 *
 * Shape + invariants (verified against PLoT staging
 * `src/routes/v2/enrichment-egress-guard.ts` + the F12 test fixtures):
 *   - `n_seeds` / `n_seeds_flipped`: non-negative integers,
 *     `n_seeds_flipped` ≤ `n_seeds` (REQUIRED — a band without counts is
 *     not a band);
 *   - `band_min` ≤ `band_median` ≤ `band_max` where present (each finite;
 *     all three MAY be omitted, e.g. when `n_seeds_flipped` is 0 there is
 *     nothing to band);
 *   - `band_width`: finite, ≥ 0, optional;
 *   - `seed_flip_means`: one cell per seed (length === `n_seeds`), each a
 *     finite number or null (null = that seed did not flip), optional.
 * `.passthrough()` for forward tolerance: ISL/PLoT may add diagnostics
 * before this package types them.
 */
export const EnrichmentEdgeEValueStabilitySchema = z.object({
  n_seeds: z.number().int().nonnegative(),
  n_seeds_flipped: z.number().int().nonnegative(),
  band_min: z.number().finite().optional(),
  band_median: z.number().finite().optional(),
  band_max: z.number().finite().optional(),
  band_width: z.number().finite().nonnegative().optional(),
  seed_flip_means: z.array(z.number().finite().nullable()).optional(),
}).passthrough().superRefine((s, ctx) => {
  if (s.n_seeds_flipped > s.n_seeds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['n_seeds_flipped'],
      message: 'n_seeds_flipped must be ≤ n_seeds',
    });
  }
  if (s.seed_flip_means !== undefined && s.seed_flip_means.length !== s.n_seeds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['seed_flip_means'],
      message: 'seed_flip_means must carry exactly one cell per seed (length === n_seeds)',
    });
  }
  if (s.band_min !== undefined && s.band_median !== undefined && s.band_min > s.band_median) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['band_median'],
      message: 'band_median must be ≥ band_min',
    });
  }
  if (s.band_median !== undefined && s.band_max !== undefined && s.band_median > s.band_max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['band_max'],
      message: 'band_max must be ≥ band_median',
    });
  }
  if (s.band_min !== undefined && s.band_max !== undefined && s.band_min > s.band_max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['band_max'],
      message: 'band_max must be ≥ band_min (reversed band)',
    });
  }
});
export type EnrichmentEdgeEValueStability =
  z.infer<typeof EnrichmentEdgeEValueStabilitySchema>;

export const EnrichmentEdgeEValueSchema = z.object({
  edge_id: z.string().min(1),
  from_id: z.string(),
  to_id: z.string(),
  from_label: z.string().optional(),
  to_label: z.string().optional(),
  e_value: z.number(),
  flip_direction: z.string(),
  current_mean: z.number(),
  flip_mean: z.number(),
  /** 0.19.0 — per-edge flip-stability band (see the schema above). */
  stability: EnrichmentEdgeEValueStabilitySchema.optional(),
  _normalised: z.boolean().optional(),
}).passthrough();
export type EnrichmentEdgeEValue = z.infer<typeof EnrichmentEdgeEValueSchema>;

// ----------------------------------------------------------------------------
// inference_warnings — [F2] InferenceWarning
// ----------------------------------------------------------------------------

/**
 * Diagnostic inference warning. [F2]. Sentinel contract on the PLoT wire:
 * ALWAYS present as [] on current builds (never absent), so consumers can
 * distinguish "not assessed" (absent, old build) from "assessed, none found".
 *
 * `code` is open: PLoT-originated codes (STABILITY_THRESHOLDS_MISSING,
 * EDGE_SENSITIVITY_UNAVAILABLE_V2_WIRE, CONSTRAINT_TARGET_UNRELIABLE,
 * CONSTRAINT_GOALFIT_MODELLED_BASIS [PR #204]) plus ISL-forwarded codes
 * (e.g. ROOT_NODE_DEFAULT_VALUE).
 *
 * `severity` is 'info' | 'warning' on the V2 wire — PLoT's merge coerces
 * anything else to 'info' [PLoT run.ts]. NOTE: `semantic_severity`
 * ('ERROR'|'WARNING'|'INFO') is a *V1-route critique* field
 * (PLoT /v1/run + cee-integration helpers) and does NOT appear on V2
 * enrichment inference_warnings — deliberately not typed here; see the
 * envelope docs for the disposition.
 */
export const EnrichmentInferenceWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  severity: z.enum(['info', 'warning']),
}).passthrough();
export type EnrichmentInferenceWarning =
  z.infer<typeof EnrichmentInferenceWarningSchema>;

// ----------------------------------------------------------------------------
// critiques — [F1] entries, [F2] CritiqueV3
// ----------------------------------------------------------------------------

/**
 * Analysis critique. [F1][F2]. PLoT→CEE only today: NOT in the CEE→UI
 * keep-list [F6]. `message` is internal/debug wording; `user_message` is the
 * display-safe copy.
 */
export const EnrichmentCritiqueSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  severity: z.string(), // 'info'|'warning'|'error'|'blocker' [F2]
  message: z.string(),
  user_message: z.string().optional(),
  source: z.string().optional(), // 'validation'|'engine'|'cee'|'isl' [F2]
  affected_option_ids: z.array(z.string()).optional(),
  affected_node_ids: z.array(z.string()).optional(),
  blocks_analysis: z.boolean().optional(),
  suggestion: z.string().optional(),
}).passthrough();
export type EnrichmentCritique = z.infer<typeof EnrichmentCritiqueSchema>;

// ----------------------------------------------------------------------------
// m1_coaching — [F1], [F4] M1Coaching
// ----------------------------------------------------------------------------

/**
 * M1 deterministic coaching layer. [F1][F4]. PLoT→CEE only today: the CEE→UI
 * keep-list DEFERS it (it carries the internal `isl_engine` provenance token
 * inside assumptions_ledger[].source_service; the cleaned narrative ships via
 * decision_review instead) [F6].
 *
 * Only the stable spine is typed; Phase-3/4 sub-objects (assumptions_ledger,
 * thresholds_used, readiness_signals, key_drivers, executive_summary,
 * readiness_tone, readiness_reasons) flow through the passthrough — they are
 * coaching-internal and version-gated by `coaching_version`.
 */
export const EnrichmentM1CoachingSchema = z.object({
  story_headlines: z.record(z.string(), z.string()).optional(),
  evidence_gaps: z.array(z.object({
    factor_id: z.string(),
    factor_label: z.string(),
    voi_score: z.number(),
    confidence: z.number(),
    influence: z.number().optional(),
    suggestion: z.string().optional(),
    evpi_percentage_points: z.number().optional(),
    evpi_method: z.string().optional(),
  }).passthrough()).optional(),
  model_critiques: z.array(z.object({
    type: z.string(),
    severity: z.string(), // 'info' | 'warn' | 'blocker' [F4]
    challenge_question: z.string().optional(),
    suggested_action: z.string().optional(),
    targets: z.array(z.string()).optional(),
  }).passthrough()).optional(),
  next_actions: z.array(z.object({
    priority: z.number(),
    action: z.string(),
    rationale: z.string().optional(),
    target_type: z.string().optional(),
    target_id: z.string().optional(),
    target_label: z.string().optional(),
  }).passthrough()).optional(),
  readiness: z.string().optional(), // 'ready'|'close_call'|'needs_evidence'|'needs_framing' [F4]
  headline_type: z.string().optional(),
  top_fragile_edge: z.object({
    edge_id: z.string(),
    label: z.string().optional(),
    alternative_winner: z.string().optional(),
    switch_probability: z.number().optional(),
  }).passthrough().optional(),
  coaching_version: z.string().optional(),
  computed_at: z.string().optional(),
}).passthrough();
export type EnrichmentM1Coaching = z.infer<typeof EnrichmentM1CoachingSchema>;

// ----------------------------------------------------------------------------
// decision_review — [F5] DecisionReviewOutput (CEE-attached)
// ----------------------------------------------------------------------------

/**
 * decision_review LLM output, attached by CEE's post-run_analysis enricher
 * (NOT a PLoT field — it joins the enrichment record inside CEE and ships
 * on the CEE→UI keep-list). [F5]. `produced_at` is the only CEE-added field
 * (ISO timestamp at attach time); every other key the LLM emitted
 * (narrative_summary, story_headlines, robustness_explanation, ...) passes
 * through verbatim, so the shape is deliberately open. Consumers read
 * required fields defensively.
 */
export const EnrichmentDecisionReviewSchema = z.object({
  produced_at: z.string(),
}).passthrough();
export type EnrichmentDecisionReview = z.infer<typeof EnrichmentDecisionReviewSchema>;

// ----------------------------------------------------------------------------
// constraints — [F2] ConstraintResult / ConditionalProbability (PR #203/#205)
// ----------------------------------------------------------------------------

/**
 * F6 — constraint-threshold normalisation-scale provenance. Discloses whether
 * the constraint's threshold was normalised on the SAME range the constraint
 * node's interventions used (so the emitted breach margin is comparable) or on
 * a diverged range (so it is not), plus a fail-closed decision-grade marker.
 *
 * CONTRACT-AHEAD: unlike `EnrichmentConstraintMarginSchema`, this object is NOT
 * yet emitted by PLoT at staging tip ea10656 (verified: absent from run.ts /
 * engine-v3.ts and every constraint/provenance module fetched at that ref). It
 * is typed ahead of the producer per Codex F6, and the fail-closed ABSENCE RULE
 * is exactly what makes that safe — a producer not yet emitting the marker
 * reads as NOT decision-grade, which is the correct default. Typed now so that
 * the moment PLoT ships it, no `.passthrough()` garbage rides the seam.
 *
 * `source` is a producer-owned open string (normaliser identity). Closed enums
 * are used only where the vocabulary is closed and stable.
 */
export const EnrichmentScaleProvenanceSchema = z.object({
  source: z.string(),
  range_unified: z.boolean().describe(
    "True iff the constraint threshold's normalisation range is identical by " +
    "construction to the range the node's interventions used or would use; " +
    'false precisely when resolution diverged (e.g. a producer-declared cap ' +
    'overridden by a measured intervention spread).',
  ),
  threshold_clamped: z.enum(['low', 'high']).optional(),
  decision_grade: z.boolean().describe(ABSENCE_FAIL_CLOSED_RULE),
}).passthrough();
export type EnrichmentScaleProvenance =
  z.infer<typeof EnrichmentScaleProvenanceSchema>;

/** Per-constraint evaluation result. [F2] ConstraintResult. */
export const EnrichmentConstraintResultSchema = z.object({
  constraint_id: z.string().min(1),
  node_id: z.string(),
  operator: z.string(), // '>=' | '<=' [F2]
  value: z.number(),
  /** Absent = ISL echoed the constraint without prob_satisfied (honest absence). */
  probability: z.number().optional(),
  /**
   * F6 — normalisation-scale provenance for this constraint's threshold
   * (contract-ahead; see EnrichmentScaleProvenanceSchema).
   */
  scale_provenance: EnrichmentScaleProvenanceSchema.optional().describe(ABSENCE_FAIL_CLOSED_RULE),
}).passthrough();
export type EnrichmentConstraintResult =
  z.infer<typeof EnrichmentConstraintResultSchema>;

/**
 * Conditional probability between constraints. [F2] ConditionalProbability.
 * DISPOSITION NOTE: emitted only on constraint-bearing runs with ≥2 evaluated
 * constraints and constraints_status 'computed' (always [] otherwise on that
 * branch); commonly absent/empty on live traffic. It is keep-listed on the
 * CEE→UI wire because DGAI reads it with no fallback [F6] — typed as-is
 * rather than deprecated.
 */
export const EnrichmentConditionalProbabilitySchema = z.object({
  given_constraint_id: z.string(),
  target_constraint_id: z.string(),
  probability: z.number(),
  effective_sample_size: z.number().optional(),
}).passthrough();
export type EnrichmentConditionalProbability =
  z.infer<typeof EnrichmentConditionalProbabilitySchema>;

// ----------------------------------------------------------------------------
// The envelope
// ----------------------------------------------------------------------------

/**
 * Typed analysis-enrichment envelope.
 *
 * Parses BOTH seam projections:
 *   * the full PLoT /v2/run envelope persisted by CEE run_analysis
 *     (PLoT→CEE seam, ~40 keys — unlisted keys flow via passthrough), and
 *   * the reduced CEE→UI keep-list projection [F6].
 *
 * All fields optional: absence is legitimate on both seams (older builds,
 * blocked/failed analyses, keep-list projection). This schema does NOT
 * replace the `z.record(z.string(), z.unknown())` transport fields on
 * AnalysisResultBlock etc. — those stay untouched for wire compatibility.
 * It is the opt-in validation/typing layer consumers use via
 * `AnalysisEnrichmentSchema.safeParse(block.enrichment)` (or
 * `parseAnalysisEnrichment`).
 *
 * DISPOSITION NOTES (fields deliberately typed loose or documented dead):
 *   * `results` — legacy/alternate per-option records array. Current PLoT
 *     /v2/run does NOT emit it ([F2] RunResponseV3 has no `results` key;
 *     absent from [F1]); CEE's readResultRecords still PREFERS it over
 *     option_comparison when present, and the CEE→UI keep-list transports
 *     it. Typed as an open array for inbound tolerance. Producers MUST NOT
 *     start emitting it — treat as deprecated-inbound-only pending a CEE
 *     read-order cleanup lane.
 *   * `conditional_probabilities` — see EnrichmentConditionalProbabilitySchema
 *     disposition note.
 *   * `semantic_severity` — NOT an enrichment field. It exists on V1-route
 *     critiques only (PLoT /v1/run); the V2 wire carries
 *     inference_warnings[].severity ('info'|'warning') and
 *     critiques[].severity instead. Documented here so it is not "silently
 *     missing": typing it into the V2 envelope would invent a field no V2
 *     producer emits.
 */
export const AnalysisEnrichmentSchema = z.object({
  // --- status spine -------------------------------------------------------
  analysis_status: EnrichmentAnalysisStatus.optional(),
  status_reason: z.string().optional(),
  option_comparison_status: EnrichmentFeatureStatus.optional(),
  robustness_status: EnrichmentFeatureStatus.optional(),
  drivers_status: EnrichmentFeatureStatus.optional(),
  /** PR #205: 'unavailable' now also covers suppressed-unreliable targets. */
  constraints_status: EnrichmentFeatureStatus.optional(),

  // --- science payloads ---------------------------------------------------
  option_comparison: z.array(EnrichmentOptionComparisonEntrySchema).optional(),
  factor_sensitivity: z.array(EnrichmentFactorSensitivityEntrySchema).optional(),
  robustness: EnrichmentRobustnessSchema.nullable().optional(),
  flip_thresholds: z.array(EnrichmentFlipThresholdSchema).optional(),
  edge_e_values: z.array(EnrichmentEdgeEValueSchema).optional(),
  inference_warnings: z.array(EnrichmentInferenceWarningSchema).optional(),
  critiques: z.array(EnrichmentCritiqueSchema).optional(),
  confidence_tier: EnrichmentConfidenceTier.optional(),

  // --- constraints (PR #203/#204/#205 vocabulary) --------------------------
  constraint_results: z.array(EnrichmentConstraintResultSchema).optional(),
  conditional_probabilities: z.array(EnrichmentConditionalProbabilitySchema).optional(),

  // --- coaching / review ---------------------------------------------------
  m1_coaching: EnrichmentM1CoachingSchema.nullable().optional(),
  decision_review: EnrichmentDecisionReviewSchema.nullable().optional(),
  /**
   * PLoT's per-run decision brief (#200 leader band) — 0.19.0. Typed OPEN
   * (shape owned by PLoT; observed on the staging capture: brief_id,
   * version, headline, options[], top_drivers[], key_assumptions[],
   * what_would_change[], robustness, warnings[] — plus `seed` and
   * `graph_hash` lineage keys that CEE's transport projection strips at any
   * depth before the CEE→UI hop). Newly on the CEE→UI keep-list below:
   * the UI's leader-band consumer (DGAI #291/#292) shipped contract-pinned
   * and had never fired because this one key was missing from the list.
   */
  decision_brief: z.object({}).passthrough().nullable().optional(),

  // --- legacy / inbound-tolerance ------------------------------------------
  /** See disposition note above — deprecated-inbound-only. */
  results: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough();
export type AnalysisEnrichment = z.infer<typeof AnalysisEnrichmentSchema>;

/**
 * The CEE→UI safe-transport keep-list (P0-B), mirrored from CEE
 * src/orchestrator-v5/compose.ts [F6]. Exported so contract tests in every
 * repo assert against ONE source of truth instead of three drifting copies.
 * CEE remains the semantic owner; changing this list here does not change
 * CEE behaviour — the contract test in CEE is what binds them.
 */
export const CEE_UI_ENRICHMENT_KEEP_LIST = [
  'option_comparison',
  'factor_sensitivity',
  'results',
  'robustness',
  'decision_review',
  'option_comparison_status',
  'conditional_probabilities',
  'edge_e_values',
  'inference_warnings',
  'confidence_tier',
  'flip_thresholds',
  // 0.19.0 (wave-2 ask 3, UI-verified 19 Jul): the PLoT #200 leader band.
  // The UI-side consumer (DGAI #291/#292) is built, contract-pinned, and
  // has been dark since it shipped because a conforming CEE projection
  // strips this key. CEE's deep internal-key strip removes the `seed` /
  // `graph_hash` lineage nested inside it before transport, so keeping the
  // key does not reopen the lineage leak the original omission was
  // guarding against.
  'decision_brief',
] as const;
export type CeeUiEnrichmentKeepKey = (typeof CEE_UI_ENRICHMENT_KEEP_LIST)[number];

/**
 * Convenience safe-parse with a stable result shape. Never throws.
 * `null`/`undefined`/non-object input returns `{ success: false }` with a
 * synthetic issue rather than throwing — matches how consumers currently
 * guard the untyped record.
 */
export function parseAnalysisEnrichment(value: unknown):
  | { success: true; data: AnalysisEnrichment }
  | { success: false; error: z.ZodError } {
  const result = AnalysisEnrichmentSchema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

/** Type guard over the envelope. */
export function isAnalysisEnrichment(value: unknown): value is AnalysisEnrichment {
  return AnalysisEnrichmentSchema.safeParse(value).success;
}

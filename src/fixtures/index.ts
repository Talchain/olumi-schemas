import { z } from 'zod';

// ============================================================================
// @talchain/schemas/fixtures — maximal-fixture contract library (W2E-1).
//
// THE HAZARD THIS ATTACKS: consumers pinned to an older schema version
// SILENTLY DROP fields they don't know (coaching, evidence, enrichment have
// all been lost this way). A maximal fixture makes the drop DETECTABLE: a
// consumer parses the fixture through its own pinned schema and deep-compares
// the parse output against the input — any vanished field is a test failure
// instead of a silent production loss.
//
// RULES OF THIS MODULE:
//   * Every fixture is MAXIMAL: every optional field populated with realistic,
//     clearly-synthetic values. Labels use a `FIXTURE_` prefix; ids use a
//     `fixture_` prefix; no real PII, no real decision content.
//   * Passthrough objects additionally carry a `FIXTURE_passthrough_probe`
//     key — proof that unknown keys survive the parse (the exact mechanism a
//     silent-drop consumer strips). Plain (non-passthrough, non-strict)
//     objects carry known keys ONLY — an unknown key there would be silently
//     stripped and fail the round-trip test by design.
//   * Every fixture must round-trip its own schema with ZERO field loss:
//     `schema.parse(fixture)` deep-equals `fixture`. The single documented
//     exception class is Zod `.default()` mutation — such entries carry an
//     explicit `expectedParseOutput` (see `root/EdgeV3Schema#default-edge_type`,
//     the ONLY `.default()` in the package as of 0.16.0).
//   * The registry below is guarded by a COMPLETENESS RATCHET
//     (tests/fixtures/completeness.test.ts): every non-enum Zod schema
//     exported from the package's root / boundary / orchestrator entry points
//     must either have a registry entry (matched by schema object identity,
//     so re-exports are covered automatically) or an explicit, reasoned
//     exclusion. Adding a new exported schema without a fixture FAILS CI in
//     this repo before any consumer can silently drop the new fields.
//
// CONSUMER USAGE (contract test in a consumer repo):
//   import { MAXIMAL_FIXTURES } from '@talchain/schemas/fixtures';
//   for (const entry of MAXIMAL_FIXTURES) {
//     const parsed = entry.schema.parse(entry.fixture);
//     expect(parsed).toStrictEqual(entry.expectedParseOutput ?? entry.fixture);
//   }
// A consumer on an OLDER pin imports the fixtures package at the NEWER
// version (devDependency) and parses through its own pinned schemas — any
// field its pin strips fails the deep-equal.
// ============================================================================

import {
  // graph
  ObservedStateSchema,
  PriorSchema,
  StateSpaceSchema,
  NodeV3Schema,
  StrengthSchema,
  EdgeV3Schema,
  GraphV3Schema,
  TopologyPlanSchema,
  // coaching
  BiasSignalSchema,
  WideningLogSchema,
  StrengthenItemSchema,
  CoachingSchema,
  // causal claims
  DirectEffectClaimSchema,
  MediationOnlyClaimSchema,
  NoDirectEffectClaimSchema,
  UnmeasuredConfounderClaimSchema,
  CausalClaimSchema,
  CausalClaimsArraySchema,
  // analysis
  OptionForAnalysisSchema,
  AnalysisReadyV3Schema,
  AnalysisRequestIdChainSchema,
  DraftGraphTraceSchema,
  ResponseMetaSchema,
  // warnings
  StrengthDefaultAppliedDetailsSchema,
  StrengthMeanDefaultDominantDetailsSchema,
  EdgeStrengthDetailsSchema,
  ValidationWarningSchema,
  // cee errors
  CeeTypedErrorSchema,
  CeeTimeoutErrorSchema,
  CeeBudgetErrorSchema,
  CeeUpstreamLlmErrorSchema,
  CeeErrorRecoverySchema,
  // plot errors
  PlotProxyTimeoutErrorSchema,
  PlotCeeUpstreamEnvelopeSchema,
  // repairs
  RepairEntrySchema,
  // responses
  FactorSensitivitySchema,
  FragileEdgeSchema,
} from '../index.js';

import {
  BoundaryErrorSchema,
  // blocks
  TextBlockSchema,
  ErrorBlockSchema,
  AnalysisResultBlockSchema,
  GraphPatchBlockSchema,
  ExplanationBlockSchema,
  ComparisonBlockSchema,
  FlipAnalysisBlockSchema,
  DraftGraphBlockSchema,
  DraftGoalConstraintSchema,
  ReviewCardBlockSchema,
  CoachingBlockSchema,
  EvidenceBlockSchema,
  ExerciseBlockSchema,
  HeldProposalBlockSchema,
  UiDirectiveBlockSchema,
  TargetRefSchema,
  BlockSchema,
  ChipSchema,
  // enrichment
  AnalysisEnrichmentSchema,
  EnrichmentOutcomeStatsSchema,
  EnrichmentGoalFitBasisSchema,
  EnrichmentOptionComparisonEntrySchema,
  EnrichmentConfidenceProvenanceSchema,
  EnrichmentFactorSensitivityEntrySchema,
  EnrichmentRobustnessEdgeSchema,
  EnrichmentNearTieSchema,
  EnrichmentRobustnessSchema,
  EnrichmentFlipThresholdSchema,
  EnrichmentEdgeEValueSchema,
  EnrichmentEdgeEValueStabilitySchema,
  EnrichmentInferenceWarningSchema,
  EnrichmentCritiqueSchema,
  EnrichmentM1CoachingSchema,
  EnrichmentDecisionReviewSchema,
  EnrichmentConstraintResultSchema,
  EnrichmentConditionalProbabilitySchema,
  // turn payload
  OrchestratorTurnPayloadSchema,
  MessageTurnPayloadSchema,
  SystemEventTurnPayloadSchema,
  SystemEventSchema,
  SelectedElementRefSchema,
  // olumi response
  ActionSchema,
  InsightSchema,
  OlumiResponseSchema,
  DecisionClassificationSchema,
  // run
  GoalConstraintSchema,
  V2OptionSchema,
  V2RunRequestSchema,
  V2RunErrorSchema,
  V2RunResponseSchema,
  // patch
  ValidatePatchRequestSchema,
  ValidatePatchResponseSchema,
  // decision record
  DecisionRecordSchema,
  DecisionRecordDecisionSchema,
  DecisionRecordAnalysisSummarySchema,
  DecisionRecordPredictionSchema,
  DecisionRecordOutcomeSchema,
} from '../boundary/index.js';

// ----------------------------------------------------------------------------
// Registry types
// ----------------------------------------------------------------------------

export interface MaximalFixtureEntry {
  /**
   * Stable family key: `<namespace>/<ExportName>` with an optional `#variant`
   * suffix when one schema needs multiple fixtures (e.g. mutually-exclusive
   * cross-field refinements, or a documented-default variant).
   */
  family: string;
  /** The exported schema object itself (identity-matched by the ratchet). */
  schema: z.ZodTypeAny;
  /** The maximal fixture value. Deep-frozen. */
  fixture: unknown;
  /**
   * Present ONLY when a Zod `.default()` legitimately mutates the parse
   * output. The round-trip test then asserts `parse(fixture)` deep-equals
   * THIS value instead of the input, so every default-mutation case in the
   * package is explicitly asserted and documented, never silently tolerated.
   */
  expectedParseOutput?: unknown;
  notes?: string;
}

/**
 * Exclusions from the maximal-fixture requirement, keyed
 * `<namespace>/<ExportName>`, value = the documented reason. The ratchet
 * fails on any exported non-enum schema that has neither a registry entry
 * nor an exclusion — AND on any exclusion key that no longer matches a real
 * export (no stale entries).
 */
export type FixtureCoverageExclusions = Readonly<Record<string, string>>;

// ----------------------------------------------------------------------------
// Helpers + shared synthetic identifiers
// ----------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Probe key planted in every passthrough object: proves unknown-key survival. */
const PROBE = 'FIXTURE_passthrough_probe';

const UUID_TURN = '11111111-1111-4111-8111-111111111111';
const UUID_SCENARIO = '22222222-2222-4222-8222-222222222222';
const UUID_RETRY_OF = '33333333-3333-4333-8333-333333333333';
const UUID_BLOCK = '44444444-4444-4444-8444-444444444444';
const TS_Z = '2026-01-01T00:00:00.000Z';
const TS_OFFSET = '2026-01-01T09:30:00.000+01:00';

const ID_GOAL = 'fixture_goal_revenue';
const ID_FACTOR = 'fixture_factor_market_demand';
const ID_OPTION_A = 'fixture_option_alpha';
const ID_OPTION_B = 'fixture_option_beta';
const ID_CONSTRAINT = 'fixture_constraint_budget';
const ID_EDGE = 'fixture_edge_demand_revenue';
const LABEL_FACTOR = 'FIXTURE_market_demand';
const LABEL_OPTION_A = 'FIXTURE_option_alpha';
const LABEL_OPTION_B = 'FIXTURE_option_beta';

// ----------------------------------------------------------------------------
// Graph family (root)
// ----------------------------------------------------------------------------

export const maximalObservedState = deepFreeze({
  value: 42.5,
  std: 3.2,
  baseline: 40,
  unit: 'FIXTURE_units_per_month',
  source: 'FIXTURE_user_estimate',
  [PROBE]: true,
});

export const maximalPrior = deepFreeze({
  distribution: 'normal',
  range_min: 10,
  range_max: 90,
  [PROBE]: true,
});

export const maximalStateSpace = deepFreeze({
  // inner `range` is a plain z.object — known keys only.
  range: { min: 0, max: 100 },
  [PROBE]: true,
});

export const maximalNodeV3 = deepFreeze({
  id: ID_FACTOR,
  kind: 'factor',
  label: LABEL_FACTOR,
  body: 'FIXTURE synthetic factor description — no real decision content.',
  type: 'numeric',
  categories: ['FIXTURE_low', 'FIXTURE_high'],
  category: 'observable',
  observed_state: maximalObservedState,
  state_space: maximalStateSpace,
  goal_threshold: 75,
  [PROBE]: true,
});

export const maximalStrength = deepFreeze({
  // plain z.object — known keys only.
  mean: 0.6,
  std: 0.15,
});

export const maximalEdgeV3 = deepFreeze({
  from: ID_FACTOR,
  to: ID_GOAL,
  strength: maximalStrength,
  exists_probability: 0.9,
  effect_direction: 'positive',
  edge_type: 'directed',
  label: 'FIXTURE_demand_drives_revenue',
  [PROBE]: true,
});

/**
 * Documents the ONLY `.default()` in the package (EdgeV3Schema.edge_type →
 * 'directed'): omitting the field is legal on the wire, and the parse output
 * legitimately GAINS the key.
 */
const edgeV3WithoutEdgeType = deepFreeze({
  from: ID_FACTOR,
  to: ID_GOAL,
  strength: maximalStrength,
  exists_probability: 0.9,
  effect_direction: 'positive',
  label: 'FIXTURE_demand_drives_revenue',
  [PROBE]: true,
});
const edgeV3DefaultApplied = deepFreeze({
  ...edgeV3WithoutEdgeType,
  edge_type: 'directed',
});

export const maximalGraphV3 = deepFreeze({
  nodes: [
    maximalNodeV3,
    {
      id: ID_GOAL,
      kind: 'goal',
      label: 'FIXTURE_monthly_revenue',
      goal_threshold: 100,
      [PROBE]: true,
    },
    { id: ID_OPTION_A, kind: 'option', label: LABEL_OPTION_A },
    { id: ID_OPTION_B, kind: 'option', label: LABEL_OPTION_B },
  ],
  edges: [
    maximalEdgeV3,
    {
      from: ID_OPTION_A,
      to: ID_FACTOR,
      strength: { mean: 0.4, std: 0.2 },
      exists_probability: 0.8,
      effect_direction: 'positive',
      edge_type: 'directed',
      label: 'FIXTURE_option_lifts_demand',
    },
  ],
  [PROBE]: true,
});

export const maximalTopologyPlan = deepFreeze([ID_OPTION_A, ID_FACTOR, ID_GOAL]);

// ----------------------------------------------------------------------------
// Coaching family (root, re-exported from /boundary)
// ----------------------------------------------------------------------------

export const maximalBiasSignal = deepFreeze({
  type: 'overconfidence',
  detail: 'FIXTURE synthetic bias-signal detail.',
});

export const maximalWideningLog = deepFreeze({
  elements_added: ['FIXTURE_added_option'],
  elements_considered_but_excluded: ['FIXTURE_excluded_risk'],
  brief_completeness: 'partial',
});

export const maximalStrengthenItem = deepFreeze({
  id: 'fixture_strengthen_1',
  label: 'FIXTURE_add_a_second_option',
  detail: 'FIXTURE synthetic strengthen detail.',
  action_type: 'add_option',
  bias_category: 'narrow_framing',
});

export const maximalCoaching = deepFreeze({
  summary: 'FIXTURE synthetic coaching summary.',
  strengthen_items: [maximalStrengthenItem],
  widening_log: maximalWideningLog,
  bias_signals: [maximalBiasSignal],
});

// ----------------------------------------------------------------------------
// Causal claims (root, re-exported from /boundary)
// ----------------------------------------------------------------------------

const claimDirectEffect = deepFreeze({
  type: 'direct_effect',
  from: ID_FACTOR,
  to: ID_GOAL,
  stated_strength: 'strong',
});
const claimMediationOnly = deepFreeze({
  type: 'mediation_only',
  from: ID_OPTION_A,
  via: ID_FACTOR,
  to: ID_GOAL,
});
const claimNoDirectEffect = deepFreeze({
  type: 'no_direct_effect',
  from: ID_OPTION_B,
  to: ID_GOAL,
});
const claimUnmeasuredConfounder = deepFreeze({
  type: 'unmeasured_confounder',
  between: [ID_FACTOR, ID_GOAL],
});

export const maximalCausalClaimsArray = deepFreeze([
  claimDirectEffect,
  claimMediationOnly,
  claimNoDirectEffect,
  claimUnmeasuredConfounder,
]);

// ----------------------------------------------------------------------------
// Analysis family (root)
// ----------------------------------------------------------------------------

export const maximalOptionForAnalysis = deepFreeze({
  id: ID_OPTION_A,
  label: LABEL_OPTION_A,
  description: 'FIXTURE synthetic option description.',
  status: 'ready',
  interventions: { [ID_FACTOR]: 55 },
  raw_interventions: {
    [ID_FACTOR]: 55,
    fixture_factor_flag: true,
    fixture_factor_level: 'FIXTURE_high',
  },
  [PROBE]: true,
});

export const maximalAnalysisReadyV3 = deepFreeze({
  status: 'ready',
  options: [maximalOptionForAnalysis],
  goal_node_id: ID_GOAL,
  [PROBE]: true,
});

export const maximalAnalysisRequestIdChain = deepFreeze({
  // plain z.object — known keys only.
  ui_sent: 'fixture_req_1',
  plot_received: 'fixture_req_1',
  forwarded_to_isl: 'fixture_req_1',
  isl_echoed: 'fixture_req_1',
  all_match: true,
});

export const maximalDraftGraphTrace = deepFreeze({
  // plain z.object — known keys only.
  cee_trace: 'fixture_trace_1',
});

export const maximalResponseMeta = deepFreeze({
  seed_used: '42',
  seed_source: 'client_generated',
  request_id: 'fixture_req_1',
  request_id_chain: {
    analysis_chain: maximalAnalysisRequestIdChain,
    draft_trace: maximalDraftGraphTrace,
    [PROBE]: true,
  },
  response_hash: 'fixture_hash_0123456789abcdef',
  computed_at: TS_Z,
  processing_time_ms: 812,
  build: 'FIXTURE_build_0000000',
  [PROBE]: true,
});

// ----------------------------------------------------------------------------
// CIL warnings (root)
// ----------------------------------------------------------------------------

export const maximalStrengthDefaultAppliedDetails = deepFreeze({
  total_edges: 5,
  structural_edges_excluded: 1,
  defaulted_count: 4,
  defaulted_percentage: 80,
  defaulted_edge_ids: [ID_EDGE],
});

export const maximalStrengthMeanDefaultDominantDetails = deepFreeze({
  total_edges: 5,
  structural_edges_excluded: 1,
  mean_default_count: 3,
  mean_default_percentage: 75,
  mean_defaulted_edge_ids: [ID_EDGE],
});

export const maximalEdgeStrengthDetails = deepFreeze({
  edge_id: ID_EDGE,
  mean: 0.04,
});

export const maximalValidationWarning = deepFreeze({
  code: 'STRENGTH_DEFAULT_APPLIED',
  message: 'FIXTURE synthetic warning message.',
  severity: 'warn',
  details: { total_edges: 5, defaulted_count: 4 },
  [PROBE]: true,
});

// ----------------------------------------------------------------------------
// CEE / PLoT error envelopes (root)
// ----------------------------------------------------------------------------

// 0.19.0 (wave-2 ask 7) — typed recovery guidance on CEE error envelopes.
export const maximalCeeErrorRecovery = deepFreeze({
  hints: ['FIXTURE synthetic recovery hint.'],
  suggestion: 'FIXTURE synthetic recovery suggestion.',
  example: 'FIXTURE synthetic recovery example.',
  [PROBE]: true,
});

export const maximalCeeTypedError = deepFreeze({
  error: 'CEE_INTERNAL_ERROR',
  message: 'FIXTURE synthetic error message.',
  retryable: false,
  elapsed_ms: 1234,
  request_id: 'fixture_req_1',
  recovery_suggestion: 'FIXTURE synthetic recovery suggestion.',
  recovery: maximalCeeErrorRecovery,
  [PROBE]: true,
});

export const maximalCeeTimeoutError = deepFreeze({
  error: 'CEE_LLM_TIMEOUT',
  message: 'FIXTURE synthetic timeout message.',
  retryable: true,
  elapsed_ms: 30000,
  request_id: 'fixture_req_1',
  model: 'FIXTURE_model_id',
  recovery_suggestion: 'FIXTURE synthetic recovery suggestion.',
  recovery: maximalCeeErrorRecovery,
  [PROBE]: true,
});

export const maximalCeeBudgetError = deepFreeze({
  error: 'CEE_REQUEST_BUDGET_EXCEEDED',
  message: 'FIXTURE synthetic budget message.',
  retryable: true,
  elapsed_ms: 45000,
  request_id: 'fixture_req_1',
  stage: 'FIXTURE_compose',
  recovery_suggestion: 'FIXTURE synthetic recovery suggestion.',
  recovery: maximalCeeErrorRecovery,
  [PROBE]: true,
});

export const maximalCeeUpstreamLlmError = deepFreeze({
  error: 'CEE_LLM_UPSTREAM_ERROR',
  message: 'FIXTURE synthetic upstream message.',
  retryable: true,
  elapsed_ms: 900,
  request_id: 'fixture_req_1',
  upstream_content_type: 'text/html',
  upstream_body_preview: 'FIXTURE upstream body preview.',
  upstream_status: 502,
  provider: 'FIXTURE_provider',
  recovery_suggestion: 'FIXTURE synthetic recovery suggestion.',
  recovery: maximalCeeErrorRecovery,
  [PROBE]: true,
});

export const maximalPlotProxyTimeoutError = deepFreeze({
  // plain z.object — known keys only.
  error: 'CEE_PROXY_TIMEOUT',
  message: 'FIXTURE synthetic proxy timeout.',
  retryable: true,
  elapsed_ms: 60000,
  request_id: 'fixture_req_1',
});

export const maximalPlotCeeUpstreamEnvelope = deepFreeze({
  // plain z.object — known keys only.
  error: 'CEE_UPSTREAM_ERROR',
  message: 'FIXTURE synthetic upstream envelope.',
  retryable: false,
  upstream_content_type: 'text/plain',
  upstream_body_preview: 'FIXTURE upstream body preview.',
  elapsed_ms: 750,
  request_id: 'fixture_req_1',
});

// ----------------------------------------------------------------------------
// Repairs + response shapes (root)
// ----------------------------------------------------------------------------

export const maximalRepairEntry = deepFreeze({
  // plain z.object — known keys only.
  code: 'CLAMP_STD_MINIMUM',
  layer: 'plot',
  field_path: 'edges[0].strength.std',
  before: 0.001,
  after: 0.05,
  reason: 'FIXTURE synthetic repair reason.',
  severity: 'warn',
});

export const maximalFactorSensitivity = deepFreeze({
  node_id: ID_FACTOR,
  label: LABEL_FACTOR,
  importance_score: 0.74,
  sensitivity_score: 0.68,
  elasticity: 1.2,
  direction: 'positive',
  importance_rank: 1,
  confidence: 0.8,
  // inner confidence_components is a plain z.object — known keys only.
  confidence_components: { structural_certainty: 0.9, sampling_stability: 0.7 },
  [PROBE]: true,
});

export const maximalFragileEdge = deepFreeze({
  edge_id: ID_EDGE,
  from_id: ID_FACTOR,
  to_id: ID_GOAL,
  current_strength: 0.6,
  threshold: 0.35,
  impact_on_outcome: 0.22,
  [PROBE]: true,
});

// ----------------------------------------------------------------------------
// Boundary error (boundary)
// ----------------------------------------------------------------------------

export const maximalBoundaryError = deepFreeze({
  error: 'UPSTREAM_TIMEOUT',
  boundary: 'B2',
  direction: 'egress',
  validator: 'FIXTURE_egress_validator',
  details: {
    issues: [{ path: 'blocks[0].type', message: 'FIXTURE synthetic issue' }],
    [PROBE]: true,
  },
  request_id: 'fixture_req_1',
  retryable: true,
});

// ----------------------------------------------------------------------------
// Enrichment envelope (boundary) — every key of every sub-shape populated
// ----------------------------------------------------------------------------

export const maximalEnrichmentOutcomeStats = deepFreeze({
  mean: 62.4,
  std: 8.1,
  p10: 51,
  p50: 62,
  p90: 74,
  n_samples: 10000,
  n_valid_samples: 9800,
  validity_ratio: 0.98,
  [PROBE]: true,
});

export const maximalEnrichmentGoalFitBasis = deepFreeze({
  scored_from: 'modelled_outcome_distribution',
  node_ids: [ID_CONSTRAINT],
  [PROBE]: true,
});

export const maximalEnrichmentOptionComparisonEntry = deepFreeze({
  option_id: ID_OPTION_A,
  option_label: LABEL_OPTION_A,
  id: ID_OPTION_A,
  label: LABEL_OPTION_A,
  // deprecated V1-legacy fields — inbound tolerance only; populated here so a
  // consumer that still reads them notices if its pin drops them.
  expected_outcome: 61.9,
  confidence_interval: [51, 74],
  outcome: maximalEnrichmentOutcomeStats,
  status: 'computed',
  status_reason: 'FIXTURE_computed_normally',
  probability_of_goal: 0.71,
  win_probability: 0.62,
  probability_of_joint_goal: 0.58,
  constraint_probabilities: { [ID_CONSTRAINT]: 0.83 },
  goal_fit_basis: maximalEnrichmentGoalFitBasis,
  [PROBE]: true,
});

export const maximalEnrichmentConfidenceProvenance = deepFreeze({
  computation_source: 'FIXTURE_plot_unified',
  formula_version: 'FIXTURE_v1',
  is_provisional: true,
  calibration_status: 'FIXTURE_uncalibrated',
  input_quality: 'FIXTURE_mixed',
  [PROBE]: true,
});

/**
 * NOTE: `evpi_percentage_points` + `evpi_status: 'below_resolution'` never
 * co-occur on the real wire (below_resolution means the pp field is
 * deliberately absent) — both are populated here because this library's job
 * is field-loss detection, not wire semantics.
 */
export const maximalEnrichmentFactorSensitivityEntry = deepFreeze({
  factor_id: ID_FACTOR,
  factor_label: LABEL_FACTOR,
  influence_score: 0.74,
  influence_rank: 1,
  sensitivity_score: 0.68,
  elasticity: 1.2,
  direction: 'positive',
  importance_rank: 1,
  interpretation: 'FIXTURE synthetic interpretation.',
  value_of_information: 0.12,
  evpi_percentage_points: 4.2,
  evpi_method: 'heuristic',
  evpi_status: 'below_resolution',
  confidence: 0.7,
  zero_reason: 'intervention_override',
  source: 'isl',
  confidence_source: 'plot_unified_from_isl_bootstrap',
  confidence_provenance: maximalEnrichmentConfidenceProvenance,
  flip_risk_category: 'isolated',
  elasticity_std: 0.3,
  attribution_stability: 'high',
  rank_flip_rate: 0.05,
  stability_method: 'FIXTURE_bootstrap',
  value_source: 'FIXTURE_observed_state',
  value_extraction_type: 'FIXTURE_numeric',
  value_defaulted: false,
  confidence_components: {
    structural_certainty: 0.9,
    sampling_stability: 0.7,
    [PROBE]: true,
  },
  range_derivation_source: 'FIXTURE_state_space',
  _normalised: true,
  [PROBE]: true,
});

export const maximalEnrichmentRobustnessEdge = deepFreeze({
  edge_id: ID_EDGE,
  from_id: ID_FACTOR,
  to_id: ID_GOAL,
  from_label: LABEL_FACTOR,
  to_label: 'FIXTURE_monthly_revenue',
  switch_probability: 0.42,
  severity: 'warning',
  marginal_switch_probability: 0.18,
  alternative_winner_id: ID_OPTION_B,
  alternative_winner_label: LABEL_OPTION_B,
  [PROBE]: true,
});

export const maximalEnrichmentNearTie = deepFreeze({
  is_tie: false,
  top_option_id: ID_OPTION_A,
  second_option_id: ID_OPTION_B,
  tied_option_ids: [ID_OPTION_A, ID_OPTION_B],
  gap: 0.11,
  threshold: 0.05,
  [PROBE]: true,
});

export const maximalEnrichmentRobustness = deepFreeze({
  score: 0.66,
  label: 'moderate',
  fragile_edges: [maximalEnrichmentRobustnessEdge],
  robust_edges: [
    {
      edge_id: 'fixture_edge_option_demand',
      from_id: ID_OPTION_A,
      to_id: ID_FACTOR,
      from_label: LABEL_OPTION_A,
      to_label: LABEL_FACTOR,
      switch_probability: 0.03,
      severity: 'warning',
      marginal_switch_probability: 0.01,
      alternative_winner_id: null,
      alternative_winner_label: null,
      [PROBE]: true,
    },
  ],
  explanation: 'FIXTURE synthetic robustness explanation.',
  // deprecated — no longer emitted; inbound tolerance only.
  recommendation_stability: 0.62,
  is_robust: true,
  level: 'medium',
  confidence: 0.75,
  normalization_errors: [
    {
      edge_type: 'bidirected',
      error: 'FIXTURE synthetic normalisation note.',
      raw_value: { FIXTURE_raw: true },
      [PROBE]: true,
    },
  ],
  recommended_option_id: ID_OPTION_A,
  recommended_option_label: LABEL_OPTION_A,
  near_tie: maximalEnrichmentNearTie,
  display_verdict: 'moderate',
  display_verdict_reason: 'FIXTURE synthetic display-safe verdict reason.',
  [PROBE]: true,
});

export const maximalEnrichmentFlipThreshold = deepFreeze({
  factor_id: ID_FACTOR,
  factor_label: LABEL_FACTOR,
  current_value: 55,
  flip_value: 48.2,
  direction: 'decrease',
  unit: 'FIXTURE_units_per_month',
  alternative_winner_id: ID_OPTION_B,
  alternative_winner_label: LABEL_OPTION_B,
  flip_reason: 'FIXTURE_flip_found',
  iterations_used: 12,
  probes_used: 24,
  margin_sensitivity: { [PROBE]: true },
  [PROBE]: true,
});

// 0.19.0 (wave-2 ask 8) — per-edge flip-stability band. Values honour the
// schema's cross-field invariants: counts are non-negative integers with
// n_seeds_flipped ≤ n_seeds, endpoints are ordered min ≤ median ≤ max, and
// seed_flip_means carries exactly one cell per seed.
export const maximalEnrichmentEdgeEValueStability = deepFreeze({
  n_seeds: 10,
  n_seeds_flipped: 3,
  band_min: 0.2,
  band_median: 0.5,
  band_max: 0.8,
  band_width: 0.6,
  seed_flip_means: [0.2, null, 0.5, null, 0.8, null, null, null, null, null],
  [PROBE]: true,
});

export const maximalEnrichmentEdgeEValue = deepFreeze({
  edge_id: ID_EDGE,
  from_id: ID_FACTOR,
  to_id: ID_GOAL,
  from_label: LABEL_FACTOR,
  to_label: 'FIXTURE_monthly_revenue',
  e_value: 1.8,
  flip_direction: 'increase',
  current_mean: 0.6,
  flip_mean: 0.33,
  stability: maximalEnrichmentEdgeEValueStability,
  _normalised: true,
  [PROBE]: true,
});

export const maximalEnrichmentInferenceWarning = deepFreeze({
  code: 'FIXTURE_WARNING_CODE',
  message: 'FIXTURE synthetic inference warning.',
  severity: 'info',
  [PROBE]: true,
});

export const maximalEnrichmentCritique = deepFreeze({
  id: 'fixture_critique_1',
  code: 'FIXTURE_CRITIQUE_CODE',
  severity: 'warning',
  message: 'FIXTURE synthetic internal critique wording.',
  user_message: 'FIXTURE synthetic display-safe critique wording.',
  source: 'validation',
  affected_option_ids: [ID_OPTION_A],
  affected_node_ids: [ID_FACTOR],
  blocks_analysis: false,
  suggestion: 'FIXTURE synthetic critique suggestion.',
  [PROBE]: true,
});

export const maximalEnrichmentM1Coaching = deepFreeze({
  story_headlines: { primary: 'FIXTURE_synthetic_headline' },
  evidence_gaps: [
    {
      factor_id: ID_FACTOR,
      factor_label: LABEL_FACTOR,
      voi_score: 0.12,
      confidence: 0.7,
      influence: 0.74,
      suggestion: 'FIXTURE synthetic evidence suggestion.',
      evpi_percentage_points: 4.2,
      evpi_method: 'heuristic',
      [PROBE]: true,
    },
  ],
  model_critiques: [
    {
      type: 'FIXTURE_narrow_frame',
      severity: 'info',
      challenge_question: 'FIXTURE synthetic challenge question?',
      suggested_action: 'FIXTURE synthetic suggested action.',
      targets: [ID_FACTOR],
      [PROBE]: true,
    },
  ],
  next_actions: [
    {
      priority: 1,
      action: 'FIXTURE synthetic next action.',
      rationale: 'FIXTURE synthetic rationale.',
      target_type: 'factor',
      target_id: ID_FACTOR,
      target_label: LABEL_FACTOR,
      [PROBE]: true,
    },
  ],
  readiness: 'close_call',
  headline_type: 'FIXTURE_headline_type',
  top_fragile_edge: {
    edge_id: ID_EDGE,
    label: 'FIXTURE_demand_drives_revenue',
    alternative_winner: LABEL_OPTION_B,
    switch_probability: 0.42,
    [PROBE]: true,
  },
  coaching_version: 'FIXTURE_m1_v9',
  computed_at: TS_Z,
  [PROBE]: true,
});

export const maximalEnrichmentDecisionReview = deepFreeze({
  produced_at: TS_Z,
  // open LLM-emitted shape — representative passthrough keys.
  narrative_summary: 'FIXTURE synthetic narrative summary.',
  robustness_explanation: 'FIXTURE synthetic robustness explanation.',
  [PROBE]: true,
});

export const maximalEnrichmentConstraintResult = deepFreeze({
  constraint_id: ID_CONSTRAINT,
  node_id: ID_GOAL,
  operator: '>=',
  value: 100,
  probability: 0.83,
  [PROBE]: true,
});

export const maximalEnrichmentConditionalProbability = deepFreeze({
  given_constraint_id: ID_CONSTRAINT,
  target_constraint_id: 'fixture_constraint_timeline',
  probability: 0.7,
  effective_sample_size: 4200,
  [PROBE]: true,
});

export const maximalAnalysisEnrichment = deepFreeze({
  analysis_status: 'computed',
  status_reason: 'FIXTURE_computed_normally',
  option_comparison_status: 'computed',
  robustness_status: 'computed',
  drivers_status: 'computed',
  constraints_status: 'computed',
  option_comparison: [maximalEnrichmentOptionComparisonEntry],
  factor_sensitivity: [maximalEnrichmentFactorSensitivityEntry],
  robustness: maximalEnrichmentRobustness,
  flip_thresholds: [maximalEnrichmentFlipThreshold],
  edge_e_values: [maximalEnrichmentEdgeEValue],
  inference_warnings: [maximalEnrichmentInferenceWarning],
  critiques: [maximalEnrichmentCritique],
  confidence_tier: 'fair',
  constraint_results: [maximalEnrichmentConstraintResult],
  conditional_probabilities: [maximalEnrichmentConditionalProbability],
  m1_coaching: maximalEnrichmentM1Coaching,
  decision_review: maximalEnrichmentDecisionReview,
  // 0.19.0 (wave-2 ask 3) — PLoT #200 leader band, typed open. The
  // TRANSPORTED shape: lineage keys (`seed` / `graph_hash`) are already
  // stripped by CEE's projection before the CEE→UI hop, so the maximal
  // fixture models the post-strip wire, not the persisted fact.
  decision_brief: {
    brief_id: 'fixture-brief-0001',
    version: '1',
    headline: 'FIXTURE synthetic leader-band headline.',
    options: [{ option_id: ID_OPTION_A, label: LABEL_OPTION_A, win_probability: 0.7, rank: 1 }],
    [PROBE]: true,
  },
  // deprecated-inbound-only legacy array — see envelope disposition notes.
  results: [{ FIXTURE_legacy_key: 'FIXTURE_legacy_value' }],
  [PROBE]: true,
});

// ----------------------------------------------------------------------------
// Blocks (boundary) — one maximal fixture per union member
// ----------------------------------------------------------------------------

export const maximalTargetRef = deepFreeze({
  id: ID_FACTOR,
  label: LABEL_FACTOR,
  kind: 'factor',
});

export const maximalTextBlock = deepFreeze({
  type: 'text',
  content: 'FIXTURE synthetic assistant text.',
});

export const maximalErrorBlock = deepFreeze({
  type: 'error',
  error_code: 'INTERNAL_ERROR',
  severity: 'warn',
  details: { blocker_code: 'FIXTURE_BLOCKER', [PROBE]: true },
});

export const maximalAnalysisResultBlock = deepFreeze({
  type: 'analysis_result',
  summary: 'FIXTURE synthetic analysis summary.',
  leading_option_id: ID_OPTION_A,
  win_probabilities: { [ID_OPTION_A]: 0.62, [ID_OPTION_B]: 0.38 },
  // the transport field is z.record(z.unknown()) — carry the full maximal
  // typed envelope so one fixture exercises both layers.
  enrichment: maximalAnalysisEnrichment,
});

export const maximalGraphPatchBlock = deepFreeze({
  type: 'graph_patch',
  status: 'applied',
  operation: 'set_factor_value',
  target_id: ID_FACTOR,
  before: { value: 40, [PROBE]: true },
  after: { value: 55, [PROBE]: true },
});

export const maximalExplanationBlock = deepFreeze({
  type: 'explanation',
  narrative: 'FIXTURE synthetic explanation narrative.',
  referenced_option_ids: [ID_OPTION_A, ID_OPTION_B],
  enrichment: { [PROBE]: true },
});

export const maximalComparisonBlock = deepFreeze({
  type: 'comparison',
  options: [
    {
      option_id: ID_OPTION_A,
      label: LABEL_OPTION_A,
      win_probability: 0.62,
      attributes: { FIXTURE_attribute: 'FIXTURE_value' },
    },
    {
      option_id: ID_OPTION_B,
      label: LABEL_OPTION_B,
      win_probability: 0.38,
      attributes: { FIXTURE_attribute: 'FIXTURE_value' },
    },
  ],
  narrative: 'FIXTURE synthetic comparison narrative.',
});

export const maximalFlipAnalysisBlock = deepFreeze({
  type: 'flip_analysis',
  narrative: 'FIXTURE synthetic flip narrative.',
  flip_scenarios: [
    {
      factor_id: ID_FACTOR,
      current_value: 55,
      flip_threshold: 48.2,
      from_option_id: ID_OPTION_A,
      to_option_id: ID_OPTION_B,
      fragile: true,
    },
    {
      // nullable branch exercised: an honest "no flip found" row.
      factor_id: 'fixture_factor_secondary',
      current_value: null,
      flip_threshold: null,
      from_option_id: null,
      to_option_id: null,
      fragile: false,
    },
  ],
  enrichment: { [PROBE]: true },
});

// Draft-time goal constraint (0.18.0). Distinct from `maximalGoalConstraint`
// below, which is the V2 RUN-REQUEST constraint (`boundary/run.ts`) — two
// different shapes at two different seams; see DraftGoalConstraintSchema.
export const maximalDraftGoalConstraint = deepFreeze({
  constraint_id: 'FIXTURE_constraint_first_year_cost_max',
  node_id: 'FIXTURE_fac_first_year_cost',
  operator: '<=',
  value: 50000,
  label: 'FIXTURE synthetic first-year budget cap',
  unit: '£',
  source_quote: 'FIXTURE synthetic source quote from the brief.',
  confidence: 0.85,
  provenance: 'explicit',
  deadline_metadata: {
    deadline_date: '2027-01-01',
    reference_date: '2026-01-01',
    assumed_reference_date: true,
    [PROBE]: true,
  },
  provenance_unit_normalised: {
    rule: 'percent_to_fraction',
    original_value: 15,
    original_unit: '%',
    [PROBE]: true,
  },
  [PROBE]: true,
});

export const maximalDraftGraphBlock = deepFreeze({
  type: 'draft_graph',
  nodes: maximalGraphV3.nodes,
  edges: maximalGraphV3.edges,
  node_count: 4,
  edge_count: 2,
  goal_constraints: [maximalDraftGoalConstraint],
});

export const maximalReviewCardBlock = deepFreeze({
  block_id: UUID_BLOCK,
  signal_id: 'fixture_signal_review_1',
  created_at: TS_OFFSET,
  source_handler: 'FIXTURE_decision_review',
  graph_hash_at_generation: 'fixture_graph_hash_1',
  freshness: 'fresh',
  type: 'review_card',
  card_kind: 'flip_threshold',
  title: 'FIXTURE synthetic review card title',
  body: 'FIXTURE synthetic review card body.',
  severity: 'warning',
  target_refs: [maximalTargetRef],
  priority_rank: 1,
  category: 'should_fix',
  priority: 70,
  action_intent: 'what_would_flip',
  action_label: 'FIXTURE test the tipping point',
});

export const maximalCoachingBlock = deepFreeze({
  block_id: '55555555-5555-4555-8555-555555555555',
  signal_id: 'fixture_signal_coaching_1',
  created_at: TS_Z,
  source_handler: 'FIXTURE_coaching_pass',
  graph_hash_at_generation: 'fixture_graph_hash_1',
  freshness: 'fresh',
  type: 'coaching',
  coaching_kind: 'bias_signal',
  title: 'FIXTURE synthetic coaching title',
  body: 'FIXTURE synthetic coaching body.',
  source: 'decision_review',
  target_refs: [maximalTargetRef],
  priority_rank: 2,
  category: 'could_fix',
  priority: 50,
  action_intent: 'gather_evidence',
  action_label: 'FIXTURE gather evidence',
});

/**
 * §1.3 consistency rule honoured: `factor_ref` matches the FIRST
 * `kind: 'factor'` entry in `target_refs`.
 */
export const maximalEvidenceBlock = deepFreeze({
  block_id: '66666666-6666-4666-8666-666666666666',
  signal_id: 'fixture_signal_evidence_1',
  created_at: TS_Z,
  source_handler: 'FIXTURE_evidence_ranker',
  graph_hash_at_generation: 'fixture_graph_hash_1',
  freshness: 'fresh',
  type: 'evidence',
  factor_label: LABEL_FACTOR,
  factor_ref: { id: ID_FACTOR, label: LABEL_FACTOR, kind: 'factor' },
  target_refs: [
    maximalTargetRef,
    { id: ID_OPTION_A, label: LABEL_OPTION_A, kind: 'option' },
  ],
  current_confidence: 'medium',
  evidence_gap: 'FIXTURE synthetic evidence gap.',
  suggested_technique: 'FIXTURE synthetic technique.',
  impact_if_gathered: 'FIXTURE synthetic impact.',
  priority_rank: 3,
  severity: 'info',
  category: 'must_fix',
  priority: 90,
  action_intent: 'gather_evidence',
  action_label: 'FIXTURE gather this evidence',
});

export const maximalExerciseBlock = deepFreeze({
  block_id: '77777777-7777-4777-8777-777777777777',
  signal_id: 'fixture_signal_exercise_1',
  created_at: TS_Z,
  source_handler: 'FIXTURE_pre_mortem',
  graph_hash_at_generation: 'fixture_graph_hash_1',
  freshness: 'fresh',
  type: 'exercise',
  exercise_kind: 'pre_mortem',
  failure_scenario: 'FIXTURE synthetic failure scenario.',
  warning_signs: ['FIXTURE synthetic warning sign.'],
  mitigation: 'FIXTURE synthetic mitigation.',
  reference_class: 'FIXTURE synthetic reference class.',
  target_element_ref: { id: ID_OPTION_A, label: LABEL_OPTION_A, kind: 'option' },
  counter_case: 'FIXTURE synthetic counter case.',
  review_trigger: 'FIXTURE synthetic review trigger.',
  target_refs: [maximalTargetRef],
  category: 'technique',
  priority: 30,
});

export const maximalHeldProposalBlock = deepFreeze({
  type: 'held_proposal',
  proposal_id: 'gmh_fixture0001',
  summary: 'FIXTURE synthetic held-change summary.',
  mutation_class: 'structural',
  reason_code: 'STRUCTURAL_APPLY_HELD',
  confirm_action_id: 'fixture_action_confirm_apply',
  decline_action_id: 'fixture_action_decline_apply',
});

export const maximalUiDirectiveBlock = deepFreeze({
  type: 'ui_directive',
  verb: 'highlight',
  targets: [maximalTargetRef],
  duration_ms: 1500,
  note: 'FIXTURE synthetic directive caption.',
});

export const maximalChip = deepFreeze({
  id: 'fixture_chip_1',
  label: 'FIXTURE_chip_label',
  action: 'run_analysis',
});

// ----------------------------------------------------------------------------
// OlumiResponse (boundary) — carries EVERY block type in `blocks`
// ----------------------------------------------------------------------------

export const maximalAction = deepFreeze({
  id: 'fixture_action_confirm_apply',
  label: 'FIXTURE_confirm_label',
  message: 'FIXTURE synthetic action message.',
  action_type: 'run_analysis',
  // 0.19.0 (wave-2 ask 20) — full producer text behind a short label.
  detail: 'FIXTURE synthetic full action detail sentence.',
});

export const maximalInsight = deepFreeze({
  id: 'fixture_insight_1',
  text: 'FIXTURE synthetic insight text.',
});

// 0.19.0 (wave-2 ask 5, UI-SEM-077) — every dimension populated.
export const maximalDecisionClassification = deepFreeze({
  stakes: 'high',
  reversibility: 'partially_reversible',
  horizon: 'FIXTURE next quarter',
  risk: 'balanced',
});

export const maximalOlumiResponse = deepFreeze({
  response_version: 2,
  assistant_text: 'FIXTURE synthetic assistant text.',
  blocks: [
    maximalTextBlock,
    maximalErrorBlock,
    maximalAnalysisResultBlock,
    maximalGraphPatchBlock,
    maximalExplanationBlock,
    maximalComparisonBlock,
    maximalFlipAnalysisBlock,
    maximalDraftGraphBlock,
    maximalReviewCardBlock,
    maximalCoachingBlock,
    maximalEvidenceBlock,
    maximalExerciseBlock,
    maximalHeldProposalBlock,
    maximalUiDirectiveBlock,
  ],
  suggested_actions: [
    maximalAction,
    {
      id: 'fixture_action_decline_apply',
      label: 'FIXTURE_decline_label',
      message: 'FIXTURE synthetic decline message.',
      action_type: 'what_would_flip',
    },
  ],
  insights: [maximalInsight],
  stage_indicator: 'analyse',
  draft_graph: {
    nodes: maximalGraphV3.nodes,
    edges: maximalGraphV3.edges,
    node_count: 4,
    edge_count: 2,
    // `OlumiResponseSchema.draft_graph` is DraftGraphBlockSchema.omit({type}),
    // a distinct schema identity from the block itself — the walker tracks it
    // separately, so this is the site that proves goal_constraints survives on
    // the actual CEE->UI egress projection, not just on the bare block.
    goal_constraints: [maximalDraftGoalConstraint],
  },
  analysis_ready: {
    status: 'ready',
    options: [maximalOptionForAnalysis],
    goal_node_id: ID_GOAL,
    [PROBE]: true,
  },
  reasoning: 'FIXTURE synthetic verbatim model reasoning.',
  // 0.19.0 — wave-2 producer fields (asks 4 + 5).
  framing_question: 'FIXTURE what would it take to reach the synthetic goal?',
  decision_classification: maximalDecisionClassification,
});

// ----------------------------------------------------------------------------
// Turn payloads (boundary)
// ----------------------------------------------------------------------------

export const maximalSelectedElementRef = deepFreeze({
  id: ID_FACTOR,
  kind: 'factor',
  label: LABEL_FACTOR,
});

/**
 * The union-level refinement makes `chip` (source 'chip'/'chip_click') and
 * `retry_of` (source 'retry') MUTUALLY EXCLUSIVE, so no single message
 * fixture can be maximal — two variants cover every optional field between
 * them.
 */
export const maximalMessageTurnPayloadChip = deepFreeze({
  turn_id: UUID_TURN,
  scenario_id: UUID_SCENARIO,
  stage: 'analyse',
  kind: 'message',
  message: 'FIXTURE synthetic user message.',
  turn_class: 'propose',
  source: 'chip',
  chip: {
    action_type: 'run_analysis',
    parameters: { FIXTURE_parameter: 'FIXTURE_value' },
  },
  generate_model: true,
  explicit_generate: true,
  selected_elements: [maximalSelectedElementRef],
});

export const maximalMessageTurnPayloadRetry = deepFreeze({
  turn_id: UUID_TURN,
  scenario_id: UUID_SCENARIO,
  stage: 'analyse',
  kind: 'message',
  message: 'FIXTURE synthetic retried message.',
  turn_class: 'propose',
  source: 'retry',
  retry_of: UUID_RETRY_OF,
  generate_model: true,
  explicit_generate: true,
  selected_elements: [maximalSelectedElementRef],
});

const eventPatchAccepted = deepFreeze({ kind: 'patch_accepted', patch_id: 'fixture_patch_1' });
const eventPatchDismissed = deepFreeze({ kind: 'patch_dismissed', patch_id: 'fixture_patch_1' });
const eventDirectGraphEdit = deepFreeze({
  kind: 'direct_graph_edit',
  target_id: ID_FACTOR,
  operation: 'set_factor_value',
});
const eventChipClick = deepFreeze({ kind: 'chip_click', chip_id: 'fixture_chip_1' });
const eventUndo = deepFreeze({ kind: 'undo' });
const eventRedo = deepFreeze({ kind: 'redo' });
export const maximalSelectionChangeEvent = deepFreeze({
  kind: 'selection_change',
  selected: [maximalSelectedElementRef],
  cleared: false,
});

export const maximalSystemEventTurnPayload = deepFreeze({
  turn_id: UUID_TURN,
  scenario_id: UUID_SCENARIO,
  stage: 'analyse',
  kind: 'system_event',
  event: maximalSelectionChangeEvent,
});

// ----------------------------------------------------------------------------
// V2 run + patch validation (boundary)
// ----------------------------------------------------------------------------

export const maximalGoalConstraint = deepFreeze({
  id: ID_CONSTRAINT,
  label: 'FIXTURE_budget_cap',
  bound: 'lte',
  value: 100000,
});

export const maximalV2Option = deepFreeze({
  id: ID_OPTION_A,
  label: LABEL_OPTION_A,
  description: 'FIXTURE synthetic option description.',
});

export const maximalV2RunRequest = deepFreeze({
  request_id: 'fixture_req_1',
  scenario_id: UUID_SCENARIO,
  graph: maximalGraphV3,
  options: [maximalV2Option],
  constraints: [maximalGoalConstraint],
  seed: 42,
});

export const maximalV2RunError = deepFreeze({
  code: 'FIXTURE_RUN_ERROR_CODE',
  message: 'FIXTURE synthetic run error message.',
  details: { [PROBE]: true },
});

export const maximalV2RunResponseSuccess = deepFreeze({
  request_id: 'fixture_req_1',
  result: 'success',
  error: null,
});

export const maximalV2RunResponseFailed = deepFreeze({
  request_id: 'fixture_req_1',
  result: 'failed',
  error: maximalV2RunError,
});

export const maximalValidatePatchRequest = deepFreeze({
  request_id: 'fixture_req_1',
  scenario_id: UUID_SCENARIO,
  graph: maximalGraphV3,
  patch: [
    {
      op: 'FIXTURE_set',
      path: '/nodes/0/label',
      value: 'FIXTURE_new_label',
      [PROBE]: true,
    },
  ],
});

export const maximalValidatePatchResponse = deepFreeze({
  request_id: 'fixture_req_1',
  valid: false,
  issues: [
    // items are plain z.object — known keys only.
    { path: '/nodes/0/label', message: 'FIXTURE synthetic issue message.' },
  ],
});

// ----------------------------------------------------------------------------
// Decision record family (boundary)
// ----------------------------------------------------------------------------

export const maximalDecisionRecordAnalysisSummary = deepFreeze({
  leading_option: LABEL_OPTION_A,
  win_probability: 0.62,
  goal_fit: 0.71,
  robustness_band: 'FIXTURE_moderate',
});

export const maximalDecisionRecordDecision = deepFreeze({
  chosen_option_id: ID_OPTION_A,
  chosen_option_label: LABEL_OPTION_A,
  graph_hash: 'fixture_graph_hash_1',
  analysis_summary: maximalDecisionRecordAnalysisSummary,
  committed_by_user: true,
});

export const maximalDecisionRecordPrediction = deepFreeze({
  statement: 'FIXTURE synthetic prediction statement.',
  confidence: 0.7,
  confidence_source: 'user_stated',
  probability_of_goal: 0.71,
  probability_of_joint_goal: 0.58,
});

export const maximalDecisionRecordOutcome = deepFreeze({
  recorded_at: TS_OFFSET,
  result: 'as_expected',
  notes: 'FIXTURE synthetic outcome notes.',
  brier_component: 0.09,
});

export const maximalDecisionRecord = deepFreeze({
  record_id: 'fixture_record_1',
  scenario_id: UUID_SCENARIO,
  created_at: TS_Z,
  decision: maximalDecisionRecordDecision,
  prediction: maximalDecisionRecordPrediction,
  review_date: '2026-02-01T00:00:00.000Z',
  outcome: maximalDecisionRecordOutcome,
});

// ----------------------------------------------------------------------------
// The registry
// ----------------------------------------------------------------------------

// NOTE: shallow-frozen only — deep-freezing here would freeze the Zod schema
// objects themselves (breaking Zod's internal `_cached`). Every fixture value
// is already deep-frozen at its definition site above.
export const MAXIMAL_FIXTURES: readonly MaximalFixtureEntry[] = Object.freeze([
  // --- graph -----------------------------------------------------------------
  { family: 'root/ObservedStateSchema', schema: ObservedStateSchema, fixture: maximalObservedState },
  { family: 'root/PriorSchema', schema: PriorSchema, fixture: maximalPrior },
  { family: 'root/StateSpaceSchema', schema: StateSpaceSchema, fixture: maximalStateSpace },
  { family: 'root/NodeV3Schema', schema: NodeV3Schema, fixture: maximalNodeV3 },
  { family: 'root/StrengthSchema', schema: StrengthSchema, fixture: maximalStrength },
  { family: 'root/EdgeV3Schema', schema: EdgeV3Schema, fixture: maximalEdgeV3 },
  {
    family: 'root/EdgeV3Schema#default-edge_type',
    schema: EdgeV3Schema,
    fixture: edgeV3WithoutEdgeType,
    expectedParseOutput: edgeV3DefaultApplied,
    notes:
      "Documents the ONLY Zod .default() in the package (as of 0.16.0): parsing an edge without edge_type GAINS edge_type:'directed'. A consumer diffing parse output against input must expect exactly this mutation and no other.",
  },
  { family: 'root/GraphV3Schema', schema: GraphV3Schema, fixture: maximalGraphV3 },
  { family: 'root/TopologyPlanSchema', schema: TopologyPlanSchema, fixture: maximalTopologyPlan },
  // --- coaching ---------------------------------------------------------------
  { family: 'root/BiasSignalSchema', schema: BiasSignalSchema, fixture: maximalBiasSignal },
  { family: 'root/WideningLogSchema', schema: WideningLogSchema, fixture: maximalWideningLog },
  { family: 'root/StrengthenItemSchema', schema: StrengthenItemSchema, fixture: maximalStrengthenItem },
  { family: 'root/CoachingSchema', schema: CoachingSchema, fixture: maximalCoaching },
  // --- causal claims ----------------------------------------------------------
  { family: 'root/DirectEffectClaimSchema', schema: DirectEffectClaimSchema, fixture: claimDirectEffect },
  { family: 'root/MediationOnlyClaimSchema', schema: MediationOnlyClaimSchema, fixture: claimMediationOnly },
  { family: 'root/NoDirectEffectClaimSchema', schema: NoDirectEffectClaimSchema, fixture: claimNoDirectEffect },
  {
    family: 'root/UnmeasuredConfounderClaimSchema',
    schema: UnmeasuredConfounderClaimSchema,
    fixture: claimUnmeasuredConfounder,
  },
  { family: 'root/CausalClaimSchema#direct_effect', schema: CausalClaimSchema, fixture: claimDirectEffect },
  {
    family: 'root/CausalClaimsArraySchema',
    schema: CausalClaimsArraySchema,
    fixture: maximalCausalClaimsArray,
    notes: 'Carries all four claim variants so every union member round-trips.',
  },
  // --- analysis ---------------------------------------------------------------
  { family: 'root/OptionForAnalysisSchema', schema: OptionForAnalysisSchema, fixture: maximalOptionForAnalysis },
  { family: 'root/AnalysisReadyV3Schema', schema: AnalysisReadyV3Schema, fixture: maximalAnalysisReadyV3 },
  {
    family: 'root/AnalysisRequestIdChainSchema',
    schema: AnalysisRequestIdChainSchema,
    fixture: maximalAnalysisRequestIdChain,
  },
  { family: 'root/DraftGraphTraceSchema', schema: DraftGraphTraceSchema, fixture: maximalDraftGraphTrace },
  { family: 'root/ResponseMetaSchema', schema: ResponseMetaSchema, fixture: maximalResponseMeta },
  // --- warnings ---------------------------------------------------------------
  {
    family: 'root/StrengthDefaultAppliedDetailsSchema',
    schema: StrengthDefaultAppliedDetailsSchema,
    fixture: maximalStrengthDefaultAppliedDetails,
  },
  {
    family: 'root/StrengthMeanDefaultDominantDetailsSchema',
    schema: StrengthMeanDefaultDominantDetailsSchema,
    fixture: maximalStrengthMeanDefaultDominantDetails,
  },
  { family: 'root/EdgeStrengthDetailsSchema', schema: EdgeStrengthDetailsSchema, fixture: maximalEdgeStrengthDetails },
  { family: 'root/ValidationWarningSchema', schema: ValidationWarningSchema, fixture: maximalValidationWarning },
  // --- cee / plot errors -------------------------------------------------------
  { family: 'root/CeeErrorRecoverySchema', schema: CeeErrorRecoverySchema, fixture: maximalCeeErrorRecovery },
  { family: 'root/CeeTypedErrorSchema', schema: CeeTypedErrorSchema, fixture: maximalCeeTypedError },
  { family: 'root/CeeTimeoutErrorSchema', schema: CeeTimeoutErrorSchema, fixture: maximalCeeTimeoutError },
  { family: 'root/CeeBudgetErrorSchema', schema: CeeBudgetErrorSchema, fixture: maximalCeeBudgetError },
  { family: 'root/CeeUpstreamLlmErrorSchema', schema: CeeUpstreamLlmErrorSchema, fixture: maximalCeeUpstreamLlmError },
  {
    family: 'root/PlotProxyTimeoutErrorSchema',
    schema: PlotProxyTimeoutErrorSchema,
    fixture: maximalPlotProxyTimeoutError,
  },
  {
    family: 'root/PlotCeeUpstreamEnvelopeSchema',
    schema: PlotCeeUpstreamEnvelopeSchema,
    fixture: maximalPlotCeeUpstreamEnvelope,
  },
  // --- repairs / responses ------------------------------------------------------
  { family: 'root/RepairEntrySchema', schema: RepairEntrySchema, fixture: maximalRepairEntry },
  { family: 'root/FactorSensitivitySchema', schema: FactorSensitivitySchema, fixture: maximalFactorSensitivity },
  { family: 'root/FragileEdgeSchema', schema: FragileEdgeSchema, fixture: maximalFragileEdge },
  // --- boundary error ------------------------------------------------------------
  { family: 'boundary/BoundaryErrorSchema', schema: BoundaryErrorSchema, fixture: maximalBoundaryError },
  // --- blocks ---------------------------------------------------------------------
  { family: 'boundary/TargetRefSchema', schema: TargetRefSchema, fixture: maximalTargetRef },
  { family: 'boundary/TextBlockSchema', schema: TextBlockSchema, fixture: maximalTextBlock },
  { family: 'boundary/ErrorBlockSchema', schema: ErrorBlockSchema, fixture: maximalErrorBlock },
  {
    family: 'boundary/AnalysisResultBlockSchema',
    schema: AnalysisResultBlockSchema,
    fixture: maximalAnalysisResultBlock,
  },
  { family: 'boundary/GraphPatchBlockSchema', schema: GraphPatchBlockSchema, fixture: maximalGraphPatchBlock },
  { family: 'boundary/ExplanationBlockSchema', schema: ExplanationBlockSchema, fixture: maximalExplanationBlock },
  { family: 'boundary/ComparisonBlockSchema', schema: ComparisonBlockSchema, fixture: maximalComparisonBlock },
  { family: 'boundary/FlipAnalysisBlockSchema', schema: FlipAnalysisBlockSchema, fixture: maximalFlipAnalysisBlock },
  { family: 'boundary/DraftGraphBlockSchema', schema: DraftGraphBlockSchema, fixture: maximalDraftGraphBlock },
  {
    family: 'boundary/DraftGoalConstraintSchema',
    schema: DraftGoalConstraintSchema,
    fixture: maximalDraftGoalConstraint,
  },
  { family: 'boundary/ReviewCardBlockSchema', schema: ReviewCardBlockSchema, fixture: maximalReviewCardBlock },
  { family: 'boundary/CoachingBlockSchema', schema: CoachingBlockSchema, fixture: maximalCoachingBlock },
  { family: 'boundary/EvidenceBlockSchema', schema: EvidenceBlockSchema, fixture: maximalEvidenceBlock },
  { family: 'boundary/ExerciseBlockSchema', schema: ExerciseBlockSchema, fixture: maximalExerciseBlock },
  { family: 'boundary/HeldProposalBlockSchema', schema: HeldProposalBlockSchema, fixture: maximalHeldProposalBlock },
  { family: 'boundary/UiDirectiveBlockSchema', schema: UiDirectiveBlockSchema, fixture: maximalUiDirectiveBlock },
  {
    family: 'boundary/BlockSchema#analysis_result',
    schema: BlockSchema,
    fixture: maximalAnalysisResultBlock,
    notes:
      'Union-level entry. Full member coverage is asserted separately: maximalOlumiResponse.blocks carries one block of EVERY union member (roundtrip test enforces this against the union introspected from BlockSchema).',
  },
  { family: 'boundary/ChipSchema', schema: ChipSchema, fixture: maximalChip },
  // --- enrichment -------------------------------------------------------------------
  {
    family: 'boundary/EnrichmentOutcomeStatsSchema',
    schema: EnrichmentOutcomeStatsSchema,
    fixture: maximalEnrichmentOutcomeStats,
  },
  {
    family: 'boundary/EnrichmentGoalFitBasisSchema',
    schema: EnrichmentGoalFitBasisSchema,
    fixture: maximalEnrichmentGoalFitBasis,
  },
  {
    family: 'boundary/EnrichmentOptionComparisonEntrySchema',
    schema: EnrichmentOptionComparisonEntrySchema,
    fixture: maximalEnrichmentOptionComparisonEntry,
  },
  {
    family: 'boundary/EnrichmentConfidenceProvenanceSchema',
    schema: EnrichmentConfidenceProvenanceSchema,
    fixture: maximalEnrichmentConfidenceProvenance,
  },
  {
    family: 'boundary/EnrichmentFactorSensitivityEntrySchema',
    schema: EnrichmentFactorSensitivityEntrySchema,
    fixture: maximalEnrichmentFactorSensitivityEntry,
  },
  {
    family: 'boundary/EnrichmentRobustnessEdgeSchema',
    schema: EnrichmentRobustnessEdgeSchema,
    fixture: maximalEnrichmentRobustnessEdge,
  },
  { family: 'boundary/EnrichmentNearTieSchema', schema: EnrichmentNearTieSchema, fixture: maximalEnrichmentNearTie },
  {
    family: 'boundary/EnrichmentRobustnessSchema',
    schema: EnrichmentRobustnessSchema,
    fixture: maximalEnrichmentRobustness,
  },
  {
    family: 'boundary/EnrichmentFlipThresholdSchema',
    schema: EnrichmentFlipThresholdSchema,
    fixture: maximalEnrichmentFlipThreshold,
  },
  {
    family: 'boundary/EnrichmentEdgeEValueSchema',
    schema: EnrichmentEdgeEValueSchema,
    fixture: maximalEnrichmentEdgeEValue,
  },
  {
    family: 'boundary/EnrichmentEdgeEValueStabilitySchema',
    schema: EnrichmentEdgeEValueStabilitySchema,
    fixture: maximalEnrichmentEdgeEValueStability,
  },
  {
    family: 'boundary/EnrichmentInferenceWarningSchema',
    schema: EnrichmentInferenceWarningSchema,
    fixture: maximalEnrichmentInferenceWarning,
  },
  { family: 'boundary/EnrichmentCritiqueSchema', schema: EnrichmentCritiqueSchema, fixture: maximalEnrichmentCritique },
  {
    family: 'boundary/EnrichmentM1CoachingSchema',
    schema: EnrichmentM1CoachingSchema,
    fixture: maximalEnrichmentM1Coaching,
  },
  {
    family: 'boundary/EnrichmentDecisionReviewSchema',
    schema: EnrichmentDecisionReviewSchema,
    fixture: maximalEnrichmentDecisionReview,
  },
  {
    family: 'boundary/EnrichmentConstraintResultSchema',
    schema: EnrichmentConstraintResultSchema,
    fixture: maximalEnrichmentConstraintResult,
  },
  {
    family: 'boundary/EnrichmentConditionalProbabilitySchema',
    schema: EnrichmentConditionalProbabilitySchema,
    fixture: maximalEnrichmentConditionalProbability,
  },
  {
    family: 'boundary/AnalysisEnrichmentSchema',
    schema: AnalysisEnrichmentSchema,
    fixture: maximalAnalysisEnrichment,
    notes:
      'THE known-open seam: the PLoT→CEE enrichment transport is an untyped passthrough. This fixture populates every typed key of the opt-in envelope PLUS passthrough probes, so any consumer projection that drops keys (keep-list drift, older pin) fails deep-equal.',
  },
  // --- turn payloads --------------------------------------------------------------
  {
    family: 'boundary/SelectedElementRefSchema',
    schema: SelectedElementRefSchema,
    fixture: maximalSelectedElementRef,
  },
  {
    family: 'boundary/MessageTurnPayloadSchema#chip',
    schema: MessageTurnPayloadSchema,
    fixture: maximalMessageTurnPayloadChip,
    notes:
      "Union-level refinement makes chip/retry_of mutually exclusive — this variant carries `chip` (source 'chip'); #retry carries `retry_of`. Together they cover every optional field.",
  },
  {
    family: 'boundary/MessageTurnPayloadSchema#retry',
    schema: MessageTurnPayloadSchema,
    fixture: maximalMessageTurnPayloadRetry,
  },
  { family: 'boundary/SystemEventSchema#patch_accepted', schema: SystemEventSchema, fixture: eventPatchAccepted },
  { family: 'boundary/SystemEventSchema#patch_dismissed', schema: SystemEventSchema, fixture: eventPatchDismissed },
  { family: 'boundary/SystemEventSchema#direct_graph_edit', schema: SystemEventSchema, fixture: eventDirectGraphEdit },
  { family: 'boundary/SystemEventSchema#chip_click', schema: SystemEventSchema, fixture: eventChipClick },
  { family: 'boundary/SystemEventSchema#undo', schema: SystemEventSchema, fixture: eventUndo },
  { family: 'boundary/SystemEventSchema#redo', schema: SystemEventSchema, fixture: eventRedo },
  {
    family: 'boundary/SystemEventSchema#selection_change',
    schema: SystemEventSchema,
    fixture: maximalSelectionChangeEvent,
  },
  {
    family: 'boundary/SystemEventTurnPayloadSchema',
    schema: SystemEventTurnPayloadSchema,
    fixture: maximalSystemEventTurnPayload,
  },
  {
    family: 'boundary/OrchestratorTurnPayloadSchema#message-chip',
    schema: OrchestratorTurnPayloadSchema,
    fixture: maximalMessageTurnPayloadChip,
  },
  {
    family: 'boundary/OrchestratorTurnPayloadSchema#message-retry',
    schema: OrchestratorTurnPayloadSchema,
    fixture: maximalMessageTurnPayloadRetry,
  },
  {
    family: 'boundary/OrchestratorTurnPayloadSchema#system_event',
    schema: OrchestratorTurnPayloadSchema,
    fixture: maximalSystemEventTurnPayload,
  },
  // --- olumi response --------------------------------------------------------------
  { family: 'boundary/ActionSchema', schema: ActionSchema, fixture: maximalAction },
  { family: 'boundary/InsightSchema', schema: InsightSchema, fixture: maximalInsight },
  {
    family: 'boundary/DecisionClassificationSchema',
    schema: DecisionClassificationSchema,
    fixture: maximalDecisionClassification,
  },
  {
    family: 'boundary/OlumiResponseSchema',
    schema: OlumiResponseSchema,
    fixture: maximalOlumiResponse,
    notes:
      'The /orchestrate/v2/turn egress. Carries every top-level optional (draft_graph, analysis_ready, reasoning) AND one block of every union member — the fields consumers have historically lost (coaching, evidence, enrichment, held_proposal, ui_directive) are all present.',
  },
  // --- v2 run + patch ---------------------------------------------------------------
  { family: 'boundary/GoalConstraintSchema', schema: GoalConstraintSchema, fixture: maximalGoalConstraint },
  { family: 'boundary/V2OptionSchema', schema: V2OptionSchema, fixture: maximalV2Option },
  { family: 'boundary/V2RunRequestSchema', schema: V2RunRequestSchema, fixture: maximalV2RunRequest },
  { family: 'boundary/V2RunErrorSchema', schema: V2RunErrorSchema, fixture: maximalV2RunError },
  {
    family: 'boundary/V2RunResponseSchema#success',
    schema: V2RunResponseSchema,
    fixture: maximalV2RunResponseSuccess,
  },
  {
    family: 'boundary/V2RunResponseSchema#failed',
    schema: V2RunResponseSchema,
    fixture: maximalV2RunResponseFailed,
  },
  {
    family: 'boundary/ValidatePatchRequestSchema',
    schema: ValidatePatchRequestSchema,
    fixture: maximalValidatePatchRequest,
  },
  {
    family: 'boundary/ValidatePatchResponseSchema',
    schema: ValidatePatchResponseSchema,
    fixture: maximalValidatePatchResponse,
  },
  // --- decision record ---------------------------------------------------------------
  {
    family: 'boundary/DecisionRecordAnalysisSummarySchema',
    schema: DecisionRecordAnalysisSummarySchema,
    fixture: maximalDecisionRecordAnalysisSummary,
  },
  {
    family: 'boundary/DecisionRecordDecisionSchema',
    schema: DecisionRecordDecisionSchema,
    fixture: maximalDecisionRecordDecision,
  },
  {
    family: 'boundary/DecisionRecordPredictionSchema',
    schema: DecisionRecordPredictionSchema,
    fixture: maximalDecisionRecordPrediction,
  },
  {
    family: 'boundary/DecisionRecordOutcomeSchema',
    schema: DecisionRecordOutcomeSchema,
    fixture: maximalDecisionRecordOutcome,
  },
  { family: 'boundary/DecisionRecordSchema', schema: DecisionRecordSchema, fixture: maximalDecisionRecord },
]);

// ----------------------------------------------------------------------------
// Exclusions — every key is a conscious, documented decision; the ratchet
// rejects stale keys and keys that shadow a registered fixture.
// ----------------------------------------------------------------------------

const ORCHESTRATOR_INTERNAL =
  'CEE-internal runtime contract (orchestrator namespace) — not a cross-service ' +
  'wire format; no cross-pin consumer parses it, so the silent-drop hazard this ' +
  'library attacks does not apply. W2E-1 scope decision: add a maximal fixture ' +
  'if it ever crosses a service boundary.';

export const FIXTURE_COVERAGE_EXCLUSIONS: FixtureCoverageExclusions = Object.freeze({
  'orchestrator/ConversationMessageSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/CapabilityFlagsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/EntityRegistrySchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/BudgetsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/TurnContextSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/LLMAdapterRequestSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/LLMAdapterResponseSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/SessionTurnSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/SessionCacheEntrySchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/GraphInvalidationSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/DecisionContextSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/RunAnalysisArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainResultArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainResultsArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainFromStructureArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/CompareOptionsArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/WhatWouldFlipArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/SetFactorValueArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/AddConstraintArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/AdjustEdgeStrengthArgsSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/RunAnalysisResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainResultResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainResultsResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainFromStructureResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/CompareOptionsResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/WhatWouldFlipResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/SetFactorValueResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/AddConstraintResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/AdjustEdgeStrengthResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/EditGraphResultSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/EditGraphAffectedEntitySchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainFallbackReasonSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/RunAnalysisHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainResultHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainResultsHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/ExplainFromStructureHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/CompareOptionsHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/WhatWouldFlipHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/SetFactorValueHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/AddConstraintHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/AdjustEdgeStrengthHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/EditGraphHandlerFactSchema': ORCHESTRATOR_INTERNAL,
  'orchestrator/HandlerFactSchema': ORCHESTRATOR_INTERNAL,
});

// ----------------------------------------------------------------------------
// Maximality exclusions — per-FIELD counterpart to FIXTURE_COVERAGE_EXCLUSIONS
// above. The completeness ratchet asks "does this schema have a fixture?";
// the maximality walker (./maximality.ts, enforced by
// tests/fixtures/maximality.test.ts) asks the question that actually protects
// the guarantee: "is every optional field, collection, and union branch
// actually EXERCISED by that fixture?".
//
// A field belongs here ONLY when it genuinely cannot be populated — never as a
// way to silence a fixture that merely has not been updated yet. Each key is
// the exact gap key printed by the walker's failure message; the walker also
// rejects STALE keys (an exclusion that no longer describes a real gap is a
// lie in the docs and must be deleted).
//
// Currently EMPTY: every optional field, collection, and union branch in the
// package is exercised by a fixture. Keep it that way — an addition here is a
// deliberate, reviewed narrowing of the silent-drop guarantee.
// ----------------------------------------------------------------------------

export type MaximalityExclusions = Readonly<Record<string, string>>;

export const MAXIMALITY_EXCLUSIONS: MaximalityExclusions = Object.freeze({});

export {
  auditMaximality,
  auditMaximalityRaw,
  maximalityStats,
  type MaximalityGap,
  type MaximalityStats,
  type AuditMaximalityOptions,
} from './maximality.js';

// ----------------------------------------------------------------------------
// Lookup helper
// ----------------------------------------------------------------------------

/** Find a registered fixture entry by its family key. */
export function getMaximalFixture(family: string): MaximalFixtureEntry | undefined {
  return MAXIMAL_FIXTURES.find((entry) => entry.family === family);
}

import { z } from 'zod';
import { NodeKind } from '../graph.js';
import { AnalysisFactSchema } from '../contracts/analysis-fact.js';
import { EdgeAdjudicationVerdict } from '../boundary/enums.js';
import { FeedbackRating, FeedbackTargetKind } from '../boundary/turn-payload.js';

// Per-handler result schemas. These validate the in-memory body a handler
// returns; they also describe the JSONB payload persisted in the
// `handler_facts.payload` column (plan rev 2 §Tranche 2 decision 4).
//
// Shapes are permissive where enrichment threading (PLoT fields for analysis
// handlers) is still being nailed down, and strict where we already know the
// field is required for downstream consumers — notably the D1 NOOP flag and
// the D2 content-assertion surfaces (narrative, leading option, flip list).

// ---- D2 / C2: analysis-family results ----

// 0.25.0 — T1 claim safety. The constraint verdict is a FACT ABOUT THE
// ANALYSIS: "given the hard constraints the user ratified, and what the
// producer was able to score, may a leading option be NAMED as the answer?".
//
// Owned and derived in exactly one place — CEE's `deriveConstraintVerdict`
// (src/orchestrator/context/constraint-feasibility.ts). Every other CEE
// surface READS the persisted value rather than re-deriving it, because two
// derivations can see different inputs and produce a response that withholds
// the recommendation in words while asserting it in prose. That is not
// hypothetical: it is the G-CEE-1 defect observed live on staging `1c078f0`,
// where "no option can be put forward yet" printed directly above "The MacBook
// Pro leads by a margin of about 52 percentage points".

/**
 * The five answers the producer's evidence can select. Transcribed from CEE's
 * `ConstraintVerdictState` union; the doc comments below are compressed from
 * the same source.
 *
 * Note there is no correct BOOLEAN here — "we could not tell" is a third
 * answer, and collapsing it either way states something false.
 */
export const ConstraintVerdictStateSchema = z.enum([
  /** No ratified hard constraints and no producer reason to hold the leader back. */
  'not_applicable',
  /** Every ratified constraint was scored under a recognised id and the leader clears it. */
  'evaluated_feasible',
  /** Constraints were scored and the leading option breaks one. */
  'evaluated_infeasible',
  /** At least one ratified constraint was not evaluated to decision grade, on
   *  evidence that cannot be confused with a keying failure. */
  'unevaluated',
  /** Constraints were plainly evaluated, but not one returned id reconciles
   *  with anything ratified — so "your condition went unchecked" and "a
   *  different condition was checked" are indistinguishable, and neither is
   *  assertable. */
  'identity_unresolved',
]);
export type ConstraintVerdictState = z.infer<typeof ConstraintVerdictStateSchema>;

/**
 * The persisted projection of the verdict — the two members any consumer needs,
 * mirroring CEE's `PersistedClaimSafety` interface verbatim (member names,
 * types and order).
 *
 * DELIBERATELY NOT DECLARED: the producer's in-memory `ConstraintVerdict` also
 * carries `codes`, `constraints` and `leaderInfeasibility`. It does not persist
 * them — those hold user labels and producer detail, and "a second copy of a
 * label is a second thing to drift". Declaring them here would be contract for
 * a producer that writes nothing into it.
 *
 * ALSO DELIBERATELY NOT ENFORCED: `may_name_leading_option` always equals the
 * producer's frozen `MAY_NAME_LEADING_OPTION[state]` lookup, so this schema
 * COULD cross-validate the two members. It does not. That table is CEE
 * doctrine; copying it here would create a rule that must be changed in two
 * repos simultaneously, and a skewed pin would reject verdicts a newer CEE
 * legitimately emits (CLAUDE.md trap 12 — the hand-maintained mirror). The
 * contract owns the SHAPE; the meaning stays with `deriveConstraintVerdict`.
 */
export const ConstraintVerdictSchema = z.object({
  /** May a leading option be NAMED as the answer on this turn? */
  may_name_leading_option: z.boolean(),
  /** Which of the five answers the producer evidence selected. Carried
   *  alongside the boolean for telemetry and triage. */
  constraint_verdict_state: ConstraintVerdictStateSchema,
}).strict();
export type ConstraintVerdict = z.infer<typeof ConstraintVerdictSchema>;

export const RunAnalysisResultSchema = z.object({
  scenario_id: z.string().uuid(),
  leading_option_id: z.string().nullable(),
  win_probabilities: z.record(z.string(), z.number()).optional(),
  summary: z.string(),
  // PLoT enrichment — factor_sensitivity, flip_thresholds, edge_e_values,
  // m1_coaching, conditional_probabilities. Tranche 3b's enrichment-threading
  // test asserts specific values from this record.
  enrichment: z.record(z.string(), z.unknown()).optional(),
  // 0.10.0 — V5 state-trust freshness derivation. Recorded on the fact at
  // the time analysis was executed so future turns can compare the current
  // graph hash against this value to decide if the analysis is still fresh.
  // Both fields are CEE-owned (NOT pass-through from PLoT) and are written
  // here — alongside `enrichment` — so the handler-ownership invariant
  // ("enrichment is byte-for-byte PLoT") stays intact.
  /** Hash of the analysis-affecting graph fields at the moment run_analysis
   *  executed. CEE computes via computeAnalysisAffectingGraphHash. */
  graph_hash_at_run: z.string().optional(),
  /** ISO timestamp of the run_analysis execution (NOT the response-emit
   *  time). Read by the freshness derivation so analysis_ready.computed_at
   *  reflects when the analysis ran, not when this turn finalised. */
  computed_at: z.string().optional(),
  // 0.25.0 — T1 claim safety. CEE-owned (NOT pass-through from PLoT) and
  // written here alongside `graph_hash_at_run` / `computed_at`, so the
  // handler-ownership invariant ("enrichment is byte-for-byte PLoT") stays
  // intact — which is the whole reason the interim had to hide in `enrichment`
  // behind a `__cee_` namespace in the first place.
  //
  // OPTIONAL, and it stays optional: every fact persisted before this release
  // is unstamped, and "unknown" is a different claim from "verified feasible".
  // The producer's reader fails CLOSED on absence for exactly that reason, so
  // requiring the field here would reject history to no benefit.
  /** Whether a leading option may be named as the answer, and on what
   *  evidence. See {@link ConstraintVerdictSchema}. */
  constraint_verdict: ConstraintVerdictSchema.optional(),
  // 0.27.0 — arch step 2 slice 4, Codex F3. The subject-scoped, status-
  // discriminated replacement for `win_probabilities` and every other
  // option-keyed value map on this shape.
  //
  // WHY IT IS A UNION AND NOT A `status` FIELD: a flat status beside a separate
  // value map lets `status:'suppressed'` and a still-present plausible number
  // BOTH parse — nothing relates the two. Here a suppressed or unavailable fact
  // does not DECLARE `value` and the branch is `.strict()`, so carrying a number
  // is a parse error. See ../contracts/analysis-fact.ts.
  //
  // NOTHING IS REMOVED BY THIS SLICE. `win_probabilities` above is RETAINED for
  // the compatibility window; the maps and the facts coexist until a consumer
  // is verified on the facts. Removal is a later change train with its own
  // evidence, per the adoption manifest row.
  //
  // OPTIONAL, and optional is the whole reason this is safe to ship alone:
  // every fact persisted before this release has none, nothing produces them
  // today, and this schema never crosses the UI wire (it is the CEE-internal
  // persisted handler-fact payload, an ORCHESTRATOR_INTERNAL fixture-coverage
  // exclusion). An empty array is a legitimate, DIFFERENT claim from absence —
  // "this producer emitted no facts" vs "this row predates the field" — so no
  // `.min(1)`.
  /** Subject-scoped analysis facts. See {@link AnalysisFactSchema}. */
  analysis_facts: z.array(AnalysisFactSchema).optional(),
}).strict();
export type RunAnalysisResult = z.infer<typeof RunAnalysisResultSchema>;

/** @deprecated use `ExplainResultsResultSchema` (plural). Retained for historic fact rows. */
export const ExplainResultResultSchema = z.object({
  narrative: z.string(),
  referenced_option_ids: z.array(z.string()),
  enrichment: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type ExplainResultResult = z.infer<typeof ExplainResultResultSchema>;

// 0.9.0 — V5 no-op explanation handler (post-analysis). The handler does
// not call PLoT or compute anything; the result body is structural metadata
// only. Sonnet's pre-action orientation text carries the user-facing
// narrative (D3 finding: orientation surfaces via the existing compose
// pipeline; the handler does not duplicate it here).
//
// Diagnostic fields (additive, optional) — populated by V5 explain-stabilisation.
// Historic v1 rows without these fields parse cleanly. Source-of-truth for
// answer-source attribution from the DB without Render log access.
export const ExplainAnswerSourceSchema = z.enum([
  'sonnet',
  'deterministic_fallback',
  'precondition_template',
]);
export type ExplainAnswerSource = z.infer<typeof ExplainAnswerSourceSchema>;

// Brief contract: missing | too_short | forbidden_internal_term |
// mutation_language | null. The validator's
// `analysis_language_without_analysis_fact` error code is mapped to
// `'missing'` by the handler-side `mapFallbackReason` translator (the
// canonical fallback signal is "the deterministic fallback ran"; the
// specific reason narrows that for diagnostics).
export const ExplainFallbackReasonSchema = z
  .enum([
    'missing',
    'too_short',
    'forbidden_internal_term',
    'mutation_language',
  ])
  .nullable();
export type ExplainFallbackReason = z.infer<typeof ExplainFallbackReasonSchema>;

export const ExplainResultsResultSchema = z.object({
  /** True when the precondition (analysis fact present) failed and the
   *  handler returned the deterministic template instead of orientation. */
  precondition_unmet: z.boolean(),
  /** Number of option nodes the graph carried at decision time, used in
   *  the precondition-unmet template. Zero on the happy path. */
  option_count: z.number().int().nonnegative(),
  answer_source: ExplainAnswerSourceSchema.optional(),
  fallback_reason: ExplainFallbackReasonSchema.optional(),
  answer_text_length: z.number().int().nonnegative().optional(),
  staleness_prefixed: z.boolean().optional(),
}).strict();
export type ExplainResultsResult = z.infer<typeof ExplainResultsResultSchema>;

// 0.9.0 — V5 no-op pre-analysis explanation handler. Same shape as
// ExplainResultsResult minus the precondition flag (this handler has no
// analysis precondition, so the flag would always be false).
//
// staleness_prefixed is intentionally omitted — explain_from_structure cites
// graph link strengths, not analysis figures, and is exempt from the
// staleness prefix.
export const ExplainFromStructureResultSchema = z.object({
  /** Number of option nodes the graph carried at decision time. Zero is
   *  legitimate (frame stage, no options yet). */
  option_count: z.number().int().nonnegative(),
  answer_source: ExplainAnswerSourceSchema.optional(),
  fallback_reason: ExplainFallbackReasonSchema.optional(),
  answer_text_length: z.number().int().nonnegative().optional(),
}).strict();
export type ExplainFromStructureResult = z.infer<typeof ExplainFromStructureResultSchema>;

export const CompareOptionsResultSchema = z.object({
  options: z.array(z.object({
    option_id: z.string().min(1),
    label: z.string().min(1),
    win_probability: z.number().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  }).strict()).min(1),
  narrative: z.string().optional(),
}).strict();
export type CompareOptionsResult = z.infer<typeof CompareOptionsResultSchema>;

// 0.9.0 — what_would_flip is now a V5 no-op handler. The schema retains
// the legacy result body fields (narrative, flip_scenarios, enrichment)
// optionally for backwards compatibility with any consumer that read the
// pre-0.9 shape, but adds the no-op metadata fields the V5 handler
// populates: precondition_unmet + option_count. All legacy fields are now
// optional; new code populates only the no-op fields.
export const WhatWouldFlipResultSchema = z.object({
  precondition_unmet: z.boolean(),
  option_count: z.number().int().nonnegative(),
  narrative: z.string().optional(),
  flip_scenarios: z.array(z.object({
    factor_id: z.string().min(1),
    current_value: z.number().nullable(),
    flip_threshold: z.number().nullable(),
    from_option_id: z.string().nullable(),
    to_option_id: z.string().nullable(),
    fragile: z.boolean(),
  }).strict()).optional(),
  enrichment: z.record(z.string(), z.unknown()).optional(),
  answer_source: ExplainAnswerSourceSchema.optional(),
  fallback_reason: ExplainFallbackReasonSchema.optional(),
  answer_text_length: z.number().int().nonnegative().optional(),
  staleness_prefixed: z.boolean().optional(),
}).strict();
export type WhatWouldFlipResult = z.infer<typeof WhatWouldFlipResultSchema>;

// ---- D1: graph-edit results ----
//
// All three share a common shape — before/after snapshots plus the NOOP flag
// (plan rev 2 revision 5). The PLoT adapter is the canonical state source;
// handlers read before, apply, read after.

const GraphEditResultBaseSchema = z.object({
  target_id: z.string().min(1),
  status: z.enum(['applied', 'noop']),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
}).strict();

export const SetFactorValueResultSchema = GraphEditResultBaseSchema;
export type SetFactorValueResult = z.infer<typeof SetFactorValueResultSchema>;

export const AddConstraintResultSchema = GraphEditResultBaseSchema;
export type AddConstraintResult = z.infer<typeof AddConstraintResultSchema>;

export const AdjustEdgeStrengthResultSchema = GraphEditResultBaseSchema;
export type AdjustEdgeStrengthResult = z.infer<typeof AdjustEdgeStrengthResultSchema>;

// 0.12.0 — V5 LLM-driven graph-edit handler (DL-7 War Room contract).
//
// Companion to the deterministic D1 mutations above (set_factor_value,
// add_constraint, adjust_edge_strength). The `edit_graph` dispatcher
// handles LLM-proposed edits that compile into one or more PatchOperations
// applied via PLoT. This result body is its turn-linked, structured
// receipt — the canonical record of "what changed" per War Room
// Decision 1: graph hash / graph diff may support staleness and
// verification, but must NOT be the only source of truth for user-
// facing "what changed?" behaviour.
//
// Cross-field invariants (e.g. status='applied' implies
// operations_count>=1; noop=true is incompatible with status='applied')
// are NOT enforced by Zod. This matches the existing GraphEditResultBase
// pattern (set_factor_value etc. similarly leave status/noop coupling
// to the emitter). The edit_graph dispatcher (PR B) is the single
// authoritative emit site and owns those invariants via tests at the
// emitter and consumer boundaries.
//
// Why no scenario_id or turn_id on result: turn linkage flows from the
// canonical persistence wrapper `HandlerFactWithTurn`
// (see CEE: src/orchestrator-v5/types/handler-fact.ts). scenario_id is
// derived from the parent turn row. Both fields would be redundant
// here. RunAnalysisResult carries scenario_id only because the
// analysis fact is consumed cross-scenario in coaching cache lookups;
// edit_graph mutation receipts have no equivalent need.
//
// A future fact_version may introduce a separate `analysis_stale`
// boolean if it diverges from `rerun_recommended`. At v1 they are
// co-equivalent — an edit that invalidates prior analysis is precisely
// an edit for which re-running is recommended.

/**
 * Categorisation of the edit, driving downstream rendering choices in
 * the recent_changes projection. Snake_case literals match the
 * discriminator-style convention used elsewhere in the package.
 */
export const EditGraphEditKindSchema = z.enum([
  'parameter_update',
  'option_configuration',
  'structural',
]);
export type EditGraphEditKind = z.infer<typeof EditGraphEditKindSchema>;

/**
 * Operation-impact vocabulary. Promoted from the V4 edit-graph
 * `EditGraphOperationMeta.impact` field (CEE
 * src/orchestrator/tools/edit-graph.ts) — not a new invention, an
 * existing CEE-side string-set being lifted into the canonical schema.
 */
export const EditGraphImpactSchema = z.enum(['low', 'moderate', 'high']);
export type EditGraphImpact = z.infer<typeof EditGraphImpactSchema>;

/**
 * Display-safe identifier of a single touched entity. Sanitised at
 * emission, NEVER carrying raw entity IDs in `label`.
 *
 * Labels are display text supplied by the emitting service. Zod
 * validates shape only — non-empty (matches the existing
 * `CompareOptionsResultSchema.options[].label.min(1)` convention) but
 * with no max-length cap and no content-form check. Sanitisation,
 * truncation and raw-ID removal are emitter responsibilities;
 * consumers must not render unsanitised labels.
 *
 * `kind` reuses the canonical `NodeKind` enum from `src/graph.ts`
 * (`'goal' | 'factor' | 'outcome' | 'risk' | 'action' | 'decision'
 * | 'option' | 'constraint'`) PLUS the literal `'edge'` for edge
 * mutations. Reusing the canonical vocabulary means a future
 * NodeKind extension flows through automatically; pinning the
 * union via the test suite ensures the +1 ('edge') stays
 * deliberate.
 */
export const EditGraphAffectedEntitySchema = z.object({
  kind: z.union([NodeKind, z.literal('edge')]),
  label: z.string().min(1),
}).strict();
export type EditGraphAffectedEntity = z.infer<typeof EditGraphAffectedEntitySchema>;

export const EditGraphResultSchema = z.object({
  edit_kind: EditGraphEditKindSchema,
  /**
   * Lifecycle. 'applied' on a successful PLoT-accepted edit; 'noop'
   * when the LLM-proposed operations compiled to no actual change
   * (rare). Mirrors the D1 mutation lifecycle vocabulary.
   */
  status: z.enum(['applied', 'noop']),
  /**
   * Number of patch operations actually applied. Cross-field
   * invariants (e.g. status='applied' ⇒ operations_count >= 1) are
   * emitter-enforced.
   */
  operations_count: z.number().int().min(0),
  /**
   * Display-safe identifiers of touched entities. Capped at 8;
   * larger edits collapse to a generic summary at emission. The
   * recent_changes projector reads `[0].label` as `target_label`.
   */
  affected_entities: z.array(EditGraphAffectedEntitySchema).max(8),
  /**
   * Hash of the analysis-affecting graph fields BEFORE the edit
   * applied. Diagnostic only — NOT the user-facing source of truth
   * for "what changed?". Nullable when hashing failed at emission.
   */
  graph_hash_before: z.string().nullable(),
  /**
   * Hash of the analysis-affecting graph fields AFTER the edit
   * applied. Diagnostic only. Nullable when hashing failed at
   * emission.
   */
  graph_hash_after: z.string().nullable(),
  /**
   * Decision-language summary, sanitised at emission against the
   * post-edit graph. THIS is the user-facing source of truth for
   * "what changed?". 80-char cap matches the consumer-side
   * RECENT_CHANGES_SUMMARY_MAX_CHARS so dashboards / state-query
   * guards can quote it verbatim.
   */
  safe_summary: z.string().min(1).max(80),
  /**
   * Operation-impact classification. See EditGraphImpactSchema for
   * provenance.
   */
  impact: EditGraphImpactSchema,
  /**
   * True when the edit invalidates prior analysis AND a re-run is
   * recommended. At v1 these two concepts (analysis_stale and
   * rerun_recommended) are co-equivalent. A future fact_version may
   * introduce a separate `analysis_stale` if the concepts diverge.
   */
  rerun_recommended: z.boolean(),
}).strict();
export type EditGraphResult = z.infer<typeof EditGraphResultSchema>;

// ---- 0.34.0: P4 transport — human-judgement receipts ------------------------
//
// Three results that make human judgement PERSIST server-side (lane evidence:
// PHASE0-EVIDENCE-2026-07-28/lane-p4-transport-2026-08-05.md). Each is the
// JSONB payload body of a fact committed on the system-event turn that carried
// the judgement (`turn_class: 'direct_answer'`, handler_id null — the
// edit_graph/DL-7 PR B precedent). WIRING ONLY: none of these results feeds
// compute; whether/how confirmed human numbers affect the maths is a separate,
// explicit design decision.

/**
 * The persisted thumbs rating. Before 0.34.0 CEE committed an EMPTY ack
 * (`handler_facts: []`) for the `feedback` system event — the rating was
 * hashed into `request_hash` and then discarded.
 *
 * ⚠ R-004: the user's free-text comment is NEVER persisted here — only its
 * presence. The comment may contain PII (names, emails, whatever the user
 * typed); a fact row is long-lived and widely read. `.strict()` makes a future
 * `comment` field a deliberate, reviewed widening rather than a quiet leak.
 */
export const FeedbackResultSchema = z.object({
  /** The rated artifact's id (a turn UUID for whole-turn ratings). */
  target_id: z.string().min(1),
  target_kind: FeedbackTargetKind,
  rating: FeedbackRating,
  /** True when the user typed a comment alongside the thumb (text NOT stored). */
  comment_present: z.boolean(),
}).strict();
export type FeedbackResult = z.infer<typeof FeedbackResultSchema>;

/**
 * The persisted contested-edge adjudication. Identity is from+to node ids —
 * the canonical edge key — never the client's edge id (which rides along,
 * nullable, as an informative echo).
 */
export const EdgeAdjudicationResultSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** The client's own edge id as sent, or null when it sent none. */
  edge_id: z.string().min(1).nullable(),
  verdict: EdgeAdjudicationVerdict,
  /**
   * The SIGNED strength mean the adjudication committed (present on
   * `overridden`, optionally on `accepted_pass1`/`accepted_pass2`; always
   * null on `dismissed`).
   */
  resolved_strength_mean: z.number().finite().nullable(),
  /**
   * The provenance CLASS of this record, stamped by the SERVER (never taken
   * from the wire): only a user acts on the adjudication surface.
   */
  provenance: z.literal('user_set'),
}).strict();
export type EdgeAdjudicationResult = z.infer<typeof EdgeAdjudicationResultSchema>;

/** The persisted user-set prior range. Same server-stamped provenance rule. */
export const PriorRangeEditResultSchema = z.object({
  target_id: z.string().min(1),
  range_min: z.number().finite(),
  range_max: z.number().finite(),
  /** Distribution family the user chose, or null when they stated none. */
  distribution: z.string().min(1).nullable(),
  provenance: z.literal('user_set'),
}).strict();
export type PriorRangeEditResult = z.infer<typeof PriorRangeEditResultSchema>;

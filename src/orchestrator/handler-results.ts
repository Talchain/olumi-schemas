import { z } from 'zod';

// Per-handler result schemas. These validate the in-memory body a handler
// returns; they also describe the JSONB payload persisted in the
// `handler_facts.payload` column (plan rev 2 §Tranche 2 decision 4).
//
// Shapes are permissive where enrichment threading (PLoT fields for analysis
// handlers) is still being nailed down, and strict where we already know the
// field is required for downstream consumers — notably the D1 NOOP flag and
// the D2 content-assertion surfaces (narrative, leading option, flip list).

// ---- D2 / C2: analysis-family results ----

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

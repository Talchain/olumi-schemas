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
}).strict();
export type RunAnalysisResult = z.infer<typeof RunAnalysisResultSchema>;

export const ExplainResultResultSchema = z.object({
  narrative: z.string(),
  referenced_option_ids: z.array(z.string()),
  enrichment: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type ExplainResultResult = z.infer<typeof ExplainResultResultSchema>;

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

export const WhatWouldFlipResultSchema = z.object({
  narrative: z.string(),
  flip_scenarios: z.array(z.object({
    factor_id: z.string().min(1),
    current_value: z.number().nullable(),
    flip_threshold: z.number().nullable(),
    from_option_id: z.string().nullable(),
    to_option_id: z.string().nullable(),
    fragile: z.boolean(),
  }).strict()),
  enrichment: z.record(z.string(), z.unknown()).optional(),
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

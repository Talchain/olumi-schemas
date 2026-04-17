import { z } from 'zod';

// Per-handler argument schemas validated at the dispatch seam before the
// handler body runs. Shapes are intentionally minimal in 0.5.0 — Tranche 3b
// (run_analysis) and Tranche 4 (D1 + D2) tighten field-level constraints
// additively as each handler lands.
//
// Numeric bounds for the graph-edit handlers match the existing PLoT-side
// STRENGTH_BOUNDS and DEFAULT_EXISTS_PROBABILITY limits — those are the
// canonical source. See /boundary -> ../limits.ts.

// ---- D2 / C2: analysis-family arguments ----

export const RunAnalysisArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  seed: z.number().int().optional(),
}).strict();
export type RunAnalysisArgs = z.infer<typeof RunAnalysisArgsSchema>;

export const ExplainResultArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  focus_option_id: z.string().min(1).optional(),
}).strict();
export type ExplainResultArgs = z.infer<typeof ExplainResultArgsSchema>;

export const CompareOptionsArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  option_ids: z.array(z.string().min(1)).optional(),
}).strict();
export type CompareOptionsArgs = z.infer<typeof CompareOptionsArgsSchema>;

export const WhatWouldFlipArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  focus_factor_id: z.string().min(1).optional(),
}).strict();
export type WhatWouldFlipArgs = z.infer<typeof WhatWouldFlipArgsSchema>;

// ---- D1: graph-edit arguments ----

export const SetFactorValueArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  factor_id: z.string().min(1),
  value: z.number(),
}).strict();
export type SetFactorValueArgs = z.infer<typeof SetFactorValueArgsSchema>;

export const AddConstraintArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  factor_id: z.string().min(1),
  constraint_kind: z.enum(['lower_bound', 'upper_bound', 'range']),
  lower: z.number().nullable(),
  upper: z.number().nullable(),
}).strict();
export type AddConstraintArgs = z.infer<typeof AddConstraintArgsSchema>;

export const AdjustEdgeStrengthArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  edge_id: z.string().min(1),
  strength: z.number().min(-1).max(1),
}).strict();
export type AdjustEdgeStrengthArgs = z.infer<typeof AdjustEdgeStrengthArgsSchema>;

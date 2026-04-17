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

// 0.5.1 cross-field validation: the `constraint_kind` discriminates which
// bounds are required. `range` needs both; `lower_bound` needs only lower
// and forbids upper; `upper_bound` is the mirror. Impossible combinations
// (e.g. `range` with a null bound, `lower_bound` with a non-null upper) are
// rejected at dispatch before a handler ever runs.
export const AddConstraintArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  factor_id: z.string().min(1),
  constraint_kind: z.enum(['lower_bound', 'upper_bound', 'range']),
  lower: z.number().nullable(),
  upper: z.number().nullable(),
}).strict().superRefine((args, ctx) => {
  switch (args.constraint_kind) {
    case 'range':
      if (args.lower === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lower'],
          message: "constraint_kind='range' requires lower to be non-null",
        });
      }
      if (args.upper === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['upper'],
          message: "constraint_kind='range' requires upper to be non-null",
        });
      }
      break;
    case 'lower_bound':
      if (args.lower === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lower'],
          message: "constraint_kind='lower_bound' requires lower to be non-null",
        });
      }
      if (args.upper !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['upper'],
          message: "constraint_kind='lower_bound' forbids upper (must be null)",
        });
      }
      break;
    case 'upper_bound':
      if (args.upper === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['upper'],
          message: "constraint_kind='upper_bound' requires upper to be non-null",
        });
      }
      if (args.lower !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lower'],
          message: "constraint_kind='upper_bound' forbids lower (must be null)",
        });
      }
      break;
  }
});
export type AddConstraintArgs = z.infer<typeof AddConstraintArgsSchema>;

export const AdjustEdgeStrengthArgsSchema = z.object({
  scenario_id: z.string().uuid(),
  edge_id: z.string().min(1),
  strength: z.number().min(-1).max(1),
}).strict();
export type AdjustEdgeStrengthArgs = z.infer<typeof AdjustEdgeStrengthArgsSchema>;

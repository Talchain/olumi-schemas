import { z } from 'zod';
import {
  RunAnalysisResultSchema,
  ExplainResultResultSchema,
  CompareOptionsResultSchema,
  WhatWouldFlipResultSchema,
  SetFactorValueResultSchema,
  AddConstraintResultSchema,
  AdjustEdgeStrengthResultSchema,
} from './handler-results.js';

// HandlerFact — typed evidence of what a handler did on a turn, persisted in
// the `handler_facts.payload` column (plan rev 2 §Tranche 2 decision 4) and
// also used as the in-memory currency between handler body and compose stage.
//
// 0.4.0 stub was `z.never()` (A1 ships zero handlers). 0.5.0 widens to a
// discriminated union of seven fact types — one per B/C2/D1/D2 handler. The
// discriminator is `fact_type`; it equals the canonical V4 action_type literal
// so the mapping table in the phase-0 audit is the single source of truth for
// both dispatch and persistence.
//
// Common fields on every fact:
//   - fact_type: discriminator
//   - fact_version: 1 for 0.5.0; bumped when a per-handler result shape evolves
//   - noop: true on D1 NOOP suppression (rev-2 revision 5); false elsewhere
//   - result: the per-handler result body

const BaseHandlerFactFields = {
  fact_version: z.literal(1),
  noop: z.boolean(),
};

export const RunAnalysisHandlerFactSchema = z.object({
  fact_type: z.literal('run_analysis'),
  ...BaseHandlerFactFields,
  result: RunAnalysisResultSchema,
}).strict();
export type RunAnalysisHandlerFact = z.infer<typeof RunAnalysisHandlerFactSchema>;

export const ExplainResultHandlerFactSchema = z.object({
  fact_type: z.literal('explain_result'),
  ...BaseHandlerFactFields,
  result: ExplainResultResultSchema,
}).strict();
export type ExplainResultHandlerFact = z.infer<typeof ExplainResultHandlerFactSchema>;

export const CompareOptionsHandlerFactSchema = z.object({
  fact_type: z.literal('compare_options'),
  ...BaseHandlerFactFields,
  result: CompareOptionsResultSchema,
}).strict();
export type CompareOptionsHandlerFact = z.infer<typeof CompareOptionsHandlerFactSchema>;

export const WhatWouldFlipHandlerFactSchema = z.object({
  fact_type: z.literal('what_would_flip'),
  ...BaseHandlerFactFields,
  result: WhatWouldFlipResultSchema,
}).strict();
export type WhatWouldFlipHandlerFact = z.infer<typeof WhatWouldFlipHandlerFactSchema>;

export const SetFactorValueHandlerFactSchema = z.object({
  fact_type: z.literal('set_factor_value'),
  ...BaseHandlerFactFields,
  result: SetFactorValueResultSchema,
}).strict();
export type SetFactorValueHandlerFact = z.infer<typeof SetFactorValueHandlerFactSchema>;

export const AddConstraintHandlerFactSchema = z.object({
  fact_type: z.literal('add_constraint'),
  ...BaseHandlerFactFields,
  result: AddConstraintResultSchema,
}).strict();
export type AddConstraintHandlerFact = z.infer<typeof AddConstraintHandlerFactSchema>;

export const AdjustEdgeStrengthHandlerFactSchema = z.object({
  fact_type: z.literal('adjust_edge_strength'),
  ...BaseHandlerFactFields,
  result: AdjustEdgeStrengthResultSchema,
}).strict();
export type AdjustEdgeStrengthHandlerFact = z.infer<typeof AdjustEdgeStrengthHandlerFactSchema>;

export const HandlerFactSchema = z.discriminatedUnion('fact_type', [
  RunAnalysisHandlerFactSchema,
  ExplainResultHandlerFactSchema,
  CompareOptionsHandlerFactSchema,
  WhatWouldFlipHandlerFactSchema,
  SetFactorValueHandlerFactSchema,
  AddConstraintHandlerFactSchema,
  AdjustEdgeStrengthHandlerFactSchema,
]);
export type HandlerFact = z.infer<typeof HandlerFactSchema>;

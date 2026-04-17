import { z } from 'zod';
import { BoundaryErrorCode } from './error-codes.js';
import { Severity } from './enums.js';

// Narrowed subset of ActionType for graph-edit operations. Used by the
// GraphPatchBlock `operation` field so semantic-garbage constructions like
// `GraphPatchBlock{ operation: 'run_analysis' }` fail at parse time.
// Kept inline here because GraphPatchBlock is the only consumer; if a future
// slice needs the same subset elsewhere, lift to /boundary/enums.ts.
// Subset-ness relative to ActionType is verified by a runtime test in the
// schemas test suite (drift guard).
const GraphEditOperationSchema = z.enum([
  'set_factor_value',
  'add_constraint',
  'adjust_edge_strength',
]);

// Text block — carries free-form assistant content.
export const TextBlockSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
}).strict();
export type TextBlock = z.infer<typeof TextBlockSchema>;

// Error block — user-visible failure, keyed by stable BoundaryErrorCode.
export const ErrorBlockSchema = z.object({
  type: z.literal('error'),
  error_code: BoundaryErrorCode,
  severity: Severity,
  details: z.object({}).passthrough().optional(),
}).strict();
export type ErrorBlock = z.infer<typeof ErrorBlockSchema>;

// ----------------------------------------------------------------------------
// V5 handler-result blocks (0.5.0)
//
// Discriminated by `type`. Additive — new block types join the BlockSchema
// union without breaking A0/A1/A2 consumers.
//
// Content-shape is intentionally permissive: each block declares its common
// rendering fields and leaves handler-specific enrichment under an `enrichment`
// record so that D1/D2 tranches can extend without another schema bump. The
// content assertions (rev-2 revision 6) live in CEE tests, not in schemas.
// ----------------------------------------------------------------------------

// AnalysisResultBlock — emitted by run_analysis. Threads PLoT enrichment
// (factor_sensitivity, flip_thresholds, conditional_probabilities, edge_e_values,
// m1_coaching) through the `enrichment` record.
export const AnalysisResultBlockSchema = z.object({
  type: z.literal('analysis_result'),
  summary: z.string(),
  leading_option_id: z.string().nullable(),
  win_probabilities: z.record(z.string(), z.number()).optional(),
  enrichment: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type AnalysisResultBlock = z.infer<typeof AnalysisResultBlockSchema>;

// GraphPatchBlock — emitted by D1 handlers (set_factor_value, add_constraint,
// adjust_edge_strength). `status: 'noop'` signals the D1 NOOP suppression path
// (rev-2 revision 5).
export const GraphPatchBlockSchema = z.object({
  type: z.literal('graph_patch'),
  status: z.enum(['applied', 'noop']),
  operation: GraphEditOperationSchema,
  target_id: z.string().min(1),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
}).strict();
export type GraphPatchBlock = z.infer<typeof GraphPatchBlockSchema>;

// ExplanationBlock — emitted by explain_result.
export const ExplanationBlockSchema = z.object({
  type: z.literal('explanation'),
  narrative: z.string(),
  referenced_option_ids: z.array(z.string()),
  enrichment: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type ExplanationBlock = z.infer<typeof ExplanationBlockSchema>;

// ComparisonBlock — emitted by compare_options. Tests assert ≥2 distinct
// options when analysis has them; schema permits ≥1 so edge cases (degenerate
// single-option analyses) do not blow up at validation time.
export const ComparisonBlockSchema = z.object({
  type: z.literal('comparison'),
  options: z.array(z.object({
    option_id: z.string().min(1),
    label: z.string().min(1),
    win_probability: z.number().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  }).strict()).min(1),
  narrative: z.string().optional(),
}).strict();
export type ComparisonBlock = z.infer<typeof ComparisonBlockSchema>;

// FlipAnalysisBlock — emitted by what_would_flip. `flip_scenarios` may be
// empty when no fragile edges or thresholds exist.
export const FlipAnalysisBlockSchema = z.object({
  type: z.literal('flip_analysis'),
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
export type FlipAnalysisBlock = z.infer<typeof FlipAnalysisBlockSchema>;

// Discriminated union. Additive — new block types land in A1+ without breaking.
// 0.5.0: handler-result blocks joined the union.
export const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ErrorBlockSchema,
  AnalysisResultBlockSchema,
  GraphPatchBlockSchema,
  ExplanationBlockSchema,
  ComparisonBlockSchema,
  FlipAnalysisBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

// Chip — UI action affordance. Not rendered in A0 scaffold; schema pinned now.
export const ChipSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  action: z.string().optional(),
}).strict();
export type Chip = z.infer<typeof ChipSchema>;

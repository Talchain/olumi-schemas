import { z } from 'zod';

export const BiasType = z.enum([
  'anchoring',
  'narrow_framing',
  'status_quo_bias',
  'overconfidence',
]);
export type BiasTypeT = z.infer<typeof BiasType>;

export const BiasSignalSchema = z.object({
  type: BiasType,
  detail: z.string(),
}).strict();
export type BiasSignal = z.infer<typeof BiasSignalSchema>;

export const BriefCompleteness = z.enum(['complete', 'partial', 'thin']);
export type BriefCompletenessT = z.infer<typeof BriefCompleteness>;

export const WideningLogSchema = z.object({
  elements_added: z.array(z.string()),
  elements_considered_but_excluded: z.array(z.string()),
  brief_completeness: BriefCompleteness,
}).strict();
export type WideningLog = z.infer<typeof WideningLogSchema>;

export const StrengthenItemActionType = z.enum([
  'add_option',
  'add_constraint',
  'add_risk',
  'reframe_goal',
]);
export type StrengthenItemActionTypeT = z.infer<typeof StrengthenItemActionType>;

export const StrengthenItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  action_type: StrengthenItemActionType,
  bias_category: BiasType.optional(),
}).strict();
export type StrengthenItem = z.infer<typeof StrengthenItemSchema>;

export const CoachingSchema = z.object({
  summary: z.string(),
  strengthen_items: z.array(StrengthenItemSchema),
  widening_log: WideningLogSchema.optional(),
  bias_signals: z.array(BiasSignalSchema).optional(),
}).strict();
export type Coaching = z.infer<typeof CoachingSchema>;

import { z } from 'zod';

export const NODE_ID_PATTERN = /^[a-z0-9_:-]+$/;

export const NodeKind = z.enum([
  'goal', 'factor', 'outcome', 'risk', 'action',
  'decision', 'option', 'constraint',
]);

export const FactorCategory = z.enum(['controllable', 'observable', 'external']);

export const ObservedStateSchema = z.object({
  value: z.number(),
  std: z.number().positive().optional(),
  baseline: z.number().optional(),
  unit: z.string().optional(),
  source: z.string().optional(),
}).passthrough();

export type ObservedStateType = z.infer<typeof ObservedStateSchema>;

export const PriorSchema = z.object({
  distribution: z.string(),
  range_min: z.number(),
  range_max: z.number(),
}).passthrough();

export type PriorType = z.infer<typeof PriorSchema>;

export const StateSpaceSchema = z.object({
  range: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
}).passthrough();

export const NodeV3Schema = z.object({
  id: z.string().min(1).max(100).regex(NODE_ID_PATTERN),
  kind: NodeKind,
  label: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  type: z.enum(['numeric', 'ordinal', 'nominal', 'boolean']).optional(),
  categories: z.array(z.string()).optional(),
  category: FactorCategory.optional(),
  observed_state: ObservedStateSchema.optional(),
  state_space: StateSpaceSchema.optional(),
  goal_threshold: z.number().optional(),
}).passthrough();

export const StrengthSchema = z.object({
  mean: z.number().min(-1).max(1),
  std: z.number().positive(),
});

export const EffectDirection = z.enum(['positive', 'negative', 'unknown']);
export type EffectDirectionType = z.infer<typeof EffectDirection>;

export const EdgeType = z.enum(['directed', 'bidirected']);
export type EdgeTypeType = z.infer<typeof EdgeType>;

export const EdgeV3Schema = z.object({
  from: z.string().min(1).max(100),
  to: z.string().min(1).max(100),
  strength: StrengthSchema,
  exists_probability: z.number().min(0).max(1),
  effect_direction: EffectDirection.optional(),
  edge_type: EdgeType.optional().default('directed'),
  label: z.string().optional(),
}).passthrough();

export const GraphV3Schema = z.object({
  nodes: z.array(NodeV3Schema),
  edges: z.array(EdgeV3Schema),
}).passthrough();

// Inferred types
export type NodeV3 = z.infer<typeof NodeV3Schema>;
export type EdgeV3 = z.infer<typeof EdgeV3Schema>;
export type GraphV3 = z.infer<typeof GraphV3Schema>;
export type NodeKindType = z.infer<typeof NodeKind>;
export type FactorCategoryType = z.infer<typeof FactorCategory>;

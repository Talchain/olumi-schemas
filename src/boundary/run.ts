import { z } from 'zod';
import { GraphV3Schema } from '../graph.js';
import { RunResult } from './enums.js';

// Goal constraint for V2 runs. Minimal A0 stub — tightened in later slices.
export const GoalConstraintSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  bound: z.enum(['lt', 'lte', 'gt', 'gte', 'eq']),
  value: z.number(),
}).strict();
export type GoalConstraint = z.infer<typeof GoalConstraintSchema>;

// V2 option envelope carried in run requests/responses.
export const V2OptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
}).strict();
export type V2Option = z.infer<typeof V2OptionSchema>;

// Minimal V2RunRequest. Not exercised in A0; pinned now so downstream slices
// inherit a stable shape.
export const V2RunRequestSchema = z.object({
  request_id: z.string().min(1),
  scenario_id: z.string().min(1),
  graph: GraphV3Schema,
  options: z.array(V2OptionSchema),
  constraints: z.array(GoalConstraintSchema),
  seed: z.number().int().optional(),
}).strict();
export type V2RunRequest = z.infer<typeof V2RunRequestSchema>;

// V2 error shape — intentionally stricter than BoundaryError since it lives
// inside a successful V2 envelope, not an HTTP error body.
export const V2RunErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.object({}).passthrough().optional(),
}).strict();
export type V2RunError = z.infer<typeof V2RunErrorSchema>;

// Minimal V2RunResponse. Full result surface lands in slices that actually
// invoke PLoT; A0 only pins the envelope.
export const V2RunResponseSchema = z.object({
  request_id: z.string().min(1),
  result: RunResult,
  error: V2RunErrorSchema.nullable().optional(),
}).strict();
export type V2RunResponse = z.infer<typeof V2RunResponseSchema>;

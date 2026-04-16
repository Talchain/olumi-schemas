import { z } from 'zod';
import { BoundaryErrorCode } from './error-codes.js';
import { Severity } from './enums.js';

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

// Discriminated union. Additive — new block types land in A1+ without breaking.
export const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ErrorBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

// Chip — UI action affordance. Not rendered in A0 scaffold; schema pinned now.
export const ChipSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  action: z.string().optional(),
}).strict();
export type Chip = z.infer<typeof ChipSchema>;

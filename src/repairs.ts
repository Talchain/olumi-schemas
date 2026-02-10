import { z } from 'zod';

export const RepairLayer = z.enum(['cee', 'plot', 'isl']);

export const REPAIR_CODES = {
  CLAMP_STD_MINIMUM: 'CLAMP_STD_MINIMUM',
  DEFAULT_EXISTS_PROBABILITY: 'DEFAULT_EXISTS_PROBABILITY',
  APPLY_SIGN_FROM_DIRECTION: 'APPLY_SIGN_FROM_DIRECTION',
  RESOLVE_BELIEF_PRECEDENCE: 'RESOLVE_BELIEF_PRECEDENCE',
  NORMALISE_STRENGTH_RANGE: 'NORMALISE_STRENGTH_RANGE',
  INFER_EFFECT_DIRECTION: 'INFER_EFFECT_DIRECTION',
} as const;

export type RepairCode = typeof REPAIR_CODES[keyof typeof REPAIR_CODES];

const RepairCodeEnum = z.enum(
  Object.values(REPAIR_CODES) as [RepairCode, ...RepairCode[]]
);

export const RepairEntrySchema = z.object({
  code: RepairCodeEnum,
  layer: RepairLayer,
  field_path: z.string(),       // JSONPath-style: e.g. "edges[0].strength.std"
  before: z.unknown().nullable(),
  after: z.unknown(),
  reason: z.string(),
  severity: z.enum(['info', 'warn']),
});

export type RepairEntry = z.infer<typeof RepairEntrySchema>;

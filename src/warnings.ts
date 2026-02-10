import { z } from 'zod';

// Default strength signature — when LLM doesn't provide real magnitudes
export const STRENGTH_DEFAULT_SIGNATURE = {
  mean: 0.5,
  std: 0.125,
} as const;

// Warning codes enum
export const CIL_WARNING_CODES = {
  STRENGTH_DEFAULT_APPLIED: 'STRENGTH_DEFAULT_APPLIED',
  STRENGTH_MEAN_DEFAULT_DOMINANT: 'STRENGTH_MEAN_DEFAULT_DOMINANT',
  EDGE_STRENGTH_LOW: 'EDGE_STRENGTH_LOW',
  EDGE_STRENGTH_NEGLIGIBLE: 'EDGE_STRENGTH_NEGLIGIBLE',
} as const;

export type CILWarningCode = typeof CIL_WARNING_CODES[keyof typeof CIL_WARNING_CODES];

// Warning severity mapping
export const CIL_WARNING_SEVERITY: Record<CILWarningCode, 'info' | 'warn'> = {
  STRENGTH_DEFAULT_APPLIED: 'warn',
  STRENGTH_MEAN_DEFAULT_DOMINANT: 'warn',
  EDGE_STRENGTH_LOW: 'info',
  EDGE_STRENGTH_NEGLIGIBLE: 'info',
};

// Detection thresholds
export const STRENGTH_DEFAULT_THRESHOLD = 0.8;         // ≥80% triggers STRENGTH_DEFAULT_APPLIED
export const STRENGTH_MEAN_DEFAULT_THRESHOLD = 0.7;    // ≥70% triggers STRENGTH_MEAN_DEFAULT_DOMINANT
export const STRENGTH_DEFAULT_MIN_EDGES = 3;           // Minimum causal edges for detection
export const EDGE_STRENGTH_LOW_THRESHOLD = 0.05;       // |mean| < 0.05
export const EDGE_STRENGTH_NEGLIGIBLE_THRESHOLD = 0.1; // 0.05 ≤ |mean| < 0.1

// Typed detail schemas for core warnings — prevents "details is a bag of unknown"
export const StrengthDefaultAppliedDetailsSchema = z.object({
  total_edges: z.number(),
  structural_edges_excluded: z.number(),
  defaulted_count: z.number(),
  defaulted_percentage: z.number(),
  defaulted_edge_ids: z.array(z.string()),
});

export const StrengthMeanDefaultDominantDetailsSchema = z.object({
  total_edges: z.number(),
  structural_edges_excluded: z.number(),
  mean_default_count: z.number(),
  mean_default_percentage: z.number(),
  mean_defaulted_edge_ids: z.array(z.string()),
});

export const EdgeStrengthDetailsSchema = z.object({
  edge_id: z.string(),
  mean: z.number(),
});

// General validation warning schema — code accepts known CIL codes + any string for forward compat
export const ValidationWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warn', 'error']),
  details: z.record(z.unknown()).optional(),
}).passthrough();

// Inferred types
export type ValidationWarning = z.infer<typeof ValidationWarningSchema>;
export type StrengthDefaultAppliedDetails = z.infer<typeof StrengthDefaultAppliedDetailsSchema>;
export type StrengthMeanDefaultDominantDetails = z.infer<typeof StrengthMeanDefaultDominantDetailsSchema>;
export type EdgeStrengthDetails = z.infer<typeof EdgeStrengthDetailsSchema>;

import { z } from 'zod';

export const CeeErrorCode = z.enum([
  'CEE_LLM_TIMEOUT',
  'CEE_REQUEST_BUDGET_EXCEEDED',
  'CEE_LLM_UPSTREAM_ERROR',
  'CEE_LLM_VALIDATION_FAILED',
  'CEE_CLIENT_DISCONNECT',
  'CEE_INTERNAL_ERROR',
]);

export const CeeTypedErrorSchema = z.object({
  error: CeeErrorCode,
  message: z.string(),
  retryable: z.boolean(),
  elapsed_ms: z.number().optional(),
  request_id: z.string().optional(),
}).passthrough();

export const CeeTimeoutErrorSchema = CeeTypedErrorSchema.extend({
  error: z.literal('CEE_LLM_TIMEOUT'),
  retryable: z.literal(true),
  model: z.string().optional(),
});

export const CeeBudgetErrorSchema = CeeTypedErrorSchema.extend({
  error: z.literal('CEE_REQUEST_BUDGET_EXCEEDED'),
  retryable: z.literal(true),
  stage: z.string().optional(),
});

export const CeeUpstreamLlmErrorSchema = CeeTypedErrorSchema.extend({
  error: z.literal('CEE_LLM_UPSTREAM_ERROR'),
  retryable: z.literal(true),
  upstream_content_type: z.string().optional(),
  upstream_body_preview: z.string().max(500).optional(),
  upstream_status: z.number().optional(),
  provider: z.string().optional(),
});

export type CeeErrorCodeType = z.infer<typeof CeeErrorCode>;
export type CeeTypedError = z.infer<typeof CeeTypedErrorSchema>;

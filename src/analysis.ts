import { z } from 'zod';

export const ProductReadiness = z.enum(['ready', 'needs_encoding', 'needs_user_mapping']);
export const SeedSource = z.enum(['client_generated', 'server_generated']);
export const DetailLevel = z.enum(['quick', 'standard', 'deep']);

export const OptionForAnalysisSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  status: ProductReadiness,
  interventions: z.record(z.string(), z.number()),
  raw_interventions: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
}).passthrough();

export const AnalysisReadyV3Schema = z.object({
  status: ProductReadiness,
  options: z.array(OptionForAnalysisSchema),
  goal_node_id: z.string().optional(),
}).passthrough();

// Request ID chain — analysis runs (scored by CIL)
export const AnalysisRequestIdChainSchema = z.object({
  ui_sent: z.string().nullable(),
  plot_received: z.string().nullable(),
  forwarded_to_isl: z.string().nullable(),
  isl_echoed: z.string().nullable(),
  all_match: z.boolean(),
});

// Request ID chain — draft-graph trace (informational, not scored)
export const DraftGraphTraceSchema = z.object({
  cee_trace: z.string().nullable(),
});

export const ResponseMetaSchema = z.object({
  seed_used: z.string(),
  seed_source: SeedSource,
  request_id: z.string(),
  request_id_chain: z.object({
    analysis_chain: AnalysisRequestIdChainSchema.optional(),
    draft_trace: DraftGraphTraceSchema.optional(),
  }).passthrough().optional(),
  response_hash: z.string().optional(),
  computed_at: z.string().optional(),
  processing_time_ms: z.number().optional(),
  build: z.string().optional(),
}).passthrough();

// Inferred types
export type ProductReadinessType = z.infer<typeof ProductReadiness>;
export type SeedSourceType = z.infer<typeof SeedSource>;
export type OptionForAnalysis = z.infer<typeof OptionForAnalysisSchema>;
export type AnalysisReadyV3 = z.infer<typeof AnalysisReadyV3Schema>;
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;
export type AnalysisRequestIdChain = z.infer<typeof AnalysisRequestIdChainSchema>;
export type DraftGraphTrace = z.infer<typeof DraftGraphTraceSchema>;

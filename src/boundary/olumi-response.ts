import { z } from 'zod';
import { BlockSchema, DraftGraphBlockSchema } from './blocks.js';
import { ActionType, Stage } from './enums.js';

// Wire-level suggested action. The richer ActionRecommendation lives in the
// orchestrator namespace (A1+). Keep this minimal and additive.
//
// 0.5.0: optional `action_type` links the action to a V5 handler. Omitted in
// A0/A1/A2 responses and on non-handler suggestions; old consumers ignore it
// because .strict() only rejects UNKNOWN fields, not optional-missing ones.
export const ActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  message: z.string().min(1),
  action_type: ActionType.optional(),
}).strict();
export type Action = z.infer<typeof ActionSchema>;

// Wire-level insight — compact, renderable. Full Insight shape lives in the
// orchestrator namespace (A1+).
export const InsightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
}).strict();
export type Insight = z.infer<typeof InsightSchema>;

// OlumiResponse — the only response shape produced by /orchestrate/v2/turn.
// Egress validator must pass this schema; failure falls back to a typed error
// envelope, never a 500 (per Boundary Contract v1.1 §3.2.3).
// 0.8.0: draft_graph optional top-level field for inline graph delivery on
// draft_graph turns. Absent on all other turn types. The UI uses this for
// immediate canvas render without a Supabase re-fetch.
// 0.8.1: analysis_ready optional top-level field for pre-analysis panel on
// draft_graph turns. Contains option intervention mappings, goal_node_id, and
// readiness status computed by the pipeline boundary stage.
// 0.15.0: optional `reasoning` top-level field. Formalises the `_reasoning`
// wire sidecar shipped behind CEE_REASONING_CAPTURE_ENABLED (ROADMAP 1.42,
// live on staging 9 Jul 2026). Verbatim model reasoning (Sonnet-5 extended-
// thinking `thinking` text, captured byte-for-byte — Paul's explicit ruling:
// never summarised or redacted). Display-only, intended for a collapsed-by-
// default progressive-disclosure surface ("show your working") — it is NOT
// rendered as product narrative. By explicit product ruling this field is
// NOT claim-safety-caged: the egress forbidden-phrase / mutation-language
// guards that scrub `assistant_text` and block content do not run against
// it, because caging verbatim model reasoning would defeat the point of
// showing it. Containment instead relies on the field being opt-in
// (default off) and the UI surface being collapsed-by-default. May be
// absent even when the capture flag is on (model-adaptive — Sonnet-5 does
// not always emit a `thinking` block, and `redacted_thinking` content is
// never captured regardless of the flag) — a consumer MUST NOT assume
// presence. NOTE: on the wire today this rides as the underscore-prefixed
// `_reasoning` sidecar (re-attached post-egress-validation, same mechanic
// as `_context_summary` / `_diagnostic_trace`); it is declared here without
// the underscore as the named field this package formalises. Consumers
// keep reading the `_reasoning` sidecar until CEE's producer migrates to
// emitting `reasoning` under both pins — a coordinated follow-up, not part
// of this change (see PR body).
export const OlumiResponseSchema = z.object({
  response_version: z.literal(2),
  assistant_text: z.string(),
  blocks: z.array(BlockSchema),
  suggested_actions: z.array(ActionSchema),
  insights: z.array(InsightSchema),
  stage_indicator: Stage,
  // Inline graph for immediate canvas render on draft_graph turns.
  draft_graph: DraftGraphBlockSchema.omit({ type: true }).optional(),
  // TODO: Extract to named AnalysisReadySchema when schema governance is formalised.
  analysis_ready: z.object({
    status: z.string(),
    options: z.array(z.unknown()),
    goal_node_id: z.string(),
  }).passthrough().optional(),
  reasoning: z.string().optional(),
}).strict();

export type OlumiResponse = z.infer<typeof OlumiResponseSchema>;

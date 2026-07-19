import { z } from 'zod';
import { BlockSchema, DraftGraphBlockSchema } from './blocks.js';
import { ActionType, Stage } from './enums.js';

// Wire-level suggested action. The richer ActionRecommendation lives in the
// orchestrator namespace (A1+). Keep this minimal and additive.
//
// 0.5.0: optional `action_type` links the action to a V5 handler. Omitted in
// A0/A1/A2 responses and on non-handler suggestions; old consumers ignore it
// because .strict() only rejects UNKNOWN fields, not optional-missing ones.
// 0.19.0: optional `detail` (wave-2 ask #20, the held-proposal confirm chip).
// The chip `label` is the SHORT display string a UI renders on the button;
// `detail` carries the FULL producer text behind it verbatim (e.g. the
// complete held-changeset description a confirm applies) so a consumer can
// show the whole sentence — tooltip, card body, accessible name — without
// the label having to be it. The UI renders producer strings verbatim and
// authors no copy, so BOTH halves are producer-owned: never derive `detail`
// from `label` or vice versa consumer-side. Absent on actions whose label
// already says everything.
export const ActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  message: z.string().min(1),
  action_type: ActionType.optional(),
  detail: z.string().min(1).optional(),
}).strict();
export type Action = z.infer<typeof ActionSchema>;

// Wire-level insight — compact, renderable. Full Insight shape lives in the
// orchestrator namespace (A1+).
export const InsightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
}).strict();
export type Insight = z.infer<typeof InsightSchema>;

// ----------------------------------------------------------------------------
// Decision classification (0.19.0) — wave-2 producer field, UI-SEM-077.
//
// The Decision Overview card renders four classification pills (stakes /
// reversibility / horizon / risk appetite). Before 0.19.0 there was NO
// producer contract for any of them: the UI fails closed to explicit
// "not set" pills (never fabricates), with `horizon` as the only populated
// dimension (read client-side from the decision node's brief timeframe).
// This schema is that contract.
//
// Code-keyed by design (same doctrine as HeldProposalReasonCode): the three
// enum dimensions carry CODES a consumer maps to its OWN display copy —
// never prose — so producer wording can't leak internal doctrine and copy
// stays consumer-owned. `horizon` is the exception: it is the user's OWN
// timeframe wording (display-safe by provenance), carried verbatim.
//
// Every dimension is optional: a producer states only what it actually
// assessed, and a consumer renders "not set" for absent dimensions —
// partial classification is honest, absence is never defaulted.
export const DecisionClassificationStakes = z.enum(['low', 'medium', 'high']);
export type DecisionClassificationStakesLiteral =
  z.infer<typeof DecisionClassificationStakes>;

export const DecisionClassificationReversibility = z.enum([
  'reversible',
  'partially_reversible',
  'irreversible',
]);
export type DecisionClassificationReversibilityLiteral =
  z.infer<typeof DecisionClassificationReversibility>;

export const DecisionClassificationRisk = z.enum([
  'averse',
  'balanced',
  'seeking',
]);
export type DecisionClassificationRiskLiteral =
  z.infer<typeof DecisionClassificationRisk>;

const DECISION_CLASSIFICATION_HORIZON_MAX = 60;

export const DecisionClassificationSchema = z.object({
  stakes: DecisionClassificationStakes.optional(),
  reversibility: DecisionClassificationReversibility.optional(),
  // The decision's timeframe in the user's own words (e.g. "next quarter").
  // Bounded short: this is a pill, not a narrative field.
  horizon: z.string().min(1).max(DECISION_CLASSIFICATION_HORIZON_MAX).optional(),
  // Risk APPETITE (the user's stance), not outcome risk.
  risk: DecisionClassificationRisk.optional(),
}).strict();
export type DecisionClassification = z.infer<typeof DecisionClassificationSchema>;

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
  // 0.19.0 additive (wave-2 producer fields) ---------------------------------
  // Explicit producer-authored framing question (UI-SEM-078). The "Olumi's
  // framing question" slot previously promoted a guidance item and derived a
  // question client-side — a verified leak rendered a CEE rerun nudge under
  // the framing label. This field is the honest channel: when present, the
  // UI renders it VERBATIM in the framing slot and derives nothing; when
  // absent, the slot stays empty (fail closed — the UI's heuristic
  // derivation retires rather than remaining as a fallback). Interrogative
  // producer copy, bounded short (a question, not a narrative).
  framing_question: z.string().min(1).max(240).optional(),
  // Producer decision classification (UI-SEM-077) — see
  // DecisionClassificationSchema above for vocabulary + doctrine. Absent
  // until the producing turn has actually assessed the decision; consumers
  // MUST NOT default absent dimensions.
  decision_classification: DecisionClassificationSchema.optional(),
}).strict();

export type OlumiResponse = z.infer<typeof OlumiResponseSchema>;

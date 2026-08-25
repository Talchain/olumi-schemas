import { z } from 'zod';
import { AnalysisStateV1Schema } from './analysis-state.js';
import { BlockSchema, DraftGraphBlockSchema } from './blocks.js';
import { ActionType, Stage } from './enums.js';
import { ModelVersionMutationReceiptV1Schema } from './model-versions.js';
import { RunDeltaSchema } from './run-delta.js';

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

// ----------------------------------------------------------------------------
// Framing quality (0.20.0) — ROADMAP 1.120 residual, UI-SEM-079.
//
// The producer's verdict on the quality of the user's decision FRAMING. The
// Decision Overview card renders a framing-quality bar that is today derived
// entirely client-side (blocker-severity critique + a null goal-threshold
// check) — a quality verdict on the user's own framing, authored by the UI.
// This enum is the honest producer channel; when it ships on the wire the
// UI's heuristic retires (fail closed: absent field → no quality verdict
// rendered, never a client-side derivation).
//
// Code-keyed by design (same doctrine as GuidanceCategory /
// HeldProposalReasonCode): a consumer maps each value to its OWN display
// copy. Vocabulary per ROADMAP 1.120:
//   * `ready`    — the framing is sound enough to analyse.
//   * `thin`     — the brief/framing lacks substance (options, success
//                  measure, or context missing).
//   * `conflict` — elements of the framing contradict each other (e.g.
//                  options that cannot serve the stated goal).
// Vocabulary SIGNED OFF by the UI workstream (20 Jul 2026): `conflict`
// displaces the UI's former `blocked` heuristic state — the UI retires its
// client-side derivation (blocked/thin/ready) on consumption of this field.
export const FramingQuality = z.enum(['ready', 'thin', 'conflict']);
export type FramingQualityLiteral = z.infer<typeof FramingQuality>;

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

// ----------------------------------------------------------------------------
// Model-building notices (0.45.0) — response-only, redacted construction facts.
//
// These codes describe conservative choices made while building THIS response's
// model. They are notices about the modelling process, not conclusions about the
// user's situation and not quotations or claims of human authorship. A consumer
// owns the neutral display copy and MUST NOT render them as “you said”.
//
// The carrier is deliberately aggregate-only. Labels, values, node ids, source
// text and raw refusal reasons are not on this wire: guest-scenario permission
// does not establish that those details are safe to disclose. `details_redacted`
// is required and can only be true, so a present carrier explicitly attests that
// the detail-bearing records stayed internal.
//
// Counts are positive safe integers, kinds are unique, and the group sum must
// equal `total_count`. Therefore every present notice is accounted for exactly
// once without manufacturing a zero/empty attestation.
export const ModelBuildingNoticeKindSchema = z.enum([
  'detail_not_connected',
  'relationship_not_used',
  'alternative_consolidated',
  'conflict_resolved_conservatively',
  'target_not_modelled_as_threshold',
  'other',
]);
export type ModelBuildingNoticeKind = z.infer<typeof ModelBuildingNoticeKindSchema>;

const PositiveModelBuildingNoticeCountSchema = z.number()
  .int()
  .positive()
  .finite()
  .safe();

const ModelBuildingNoticeGroupSchema = z.object({
  kind: ModelBuildingNoticeKindSchema,
  count: PositiveModelBuildingNoticeCountSchema,
}).strict();

export const ModelBuildingNoticesSchema = z.object({
  total_count: PositiveModelBuildingNoticeCountSchema,
  groups: z.array(ModelBuildingNoticeGroupSchema)
    .min(1)
    .max(ModelBuildingNoticeKindSchema.options.length),
  details_redacted: z.literal(true),
}).strict().superRefine((value, ctx) => {
  const seenKinds = new Set<ModelBuildingNoticeKind>();
  for (const [index, group] of value.groups.entries()) {
    if (seenKinds.has(group.kind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['groups', index, 'kind'],
        message: 'model-building notice kinds must be unique',
      });
    }
    seenKinds.add(group.kind);
  }

  const groupedCount = value.groups.reduce((sum, group) => sum + group.count, 0);
  if (groupedCount !== value.total_count) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['total_count'],
      message: 'must equal the sum of model-building notice group counts',
    });
  }
});
export type ModelBuildingNotices = z.infer<typeof ModelBuildingNoticesSchema>;

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
  // 0.46.0 additive — analysis-state authority migration, step 2 -------------
  // The ONE composed analysis-state verdict for this turn, carried at the top
  // level BESIDE `analysis_ready` (not inside it): `analysis_ready` is the
  // pre-analysis readiness panel's own passthrough shape, whereas this is the
  // composed authority spanning run state, readiness, leader entitlement,
  // robustness and usability. Nesting it would have made a strict composed
  // verdict a member of a passthrough object, and would have coupled its
  // lifetime to a surface it is meant to outlive. See ./analysis-state.ts for
  // the full doctrine, the licence each field carries, and the three DISCLOSED
  // LIMITS the parser does not enforce.
  //
  // ABSENCE IS DISTINCT: absent means NO composed verdict was supplied by this
  // turn — the state of every producer until CEE ships the emitter — and NEVER
  // `never_run`, never a neutral default, and never permission to fall back to
  // a client-side derivation of the same question. A consumer that cannot find
  // this field keeps its existing behaviour unchanged; that is what makes this
  // step safe to ship before any consumer migrates.
  analysis_state: AnalysisStateV1Schema.optional(),
  // C8-A additive -----------------------------------------------------------
  // Atomic receipt for the authoritative model version committed by THIS
  // turn. ABSENCE IS DISTINCT: absent means this response does not attest a
  // committed model mutation. It is never synthesised from draft_graph or a
  // persistence sidecar. The receipt carries the exact committed GraphV3 and
  // identity envelope, but deliberately carries no freshness: the sibling
  // `analysis_state` above remains the sole authority for analysis currency.
  // It also omits replay/dedupe flags so an idempotent replay returns the same
  // receipt bytes as the original mutation.
  model_version_receipt: ModelVersionMutationReceiptV1Schema.optional(),
  reasoning: z.string().optional(),
  // 0.45.0 additive ----------------------------------------------------------
  // Aggregate, redacted notices about conservative model-building choices for
  // this response. Response-only by contract: this field is deliberately NOT
  // declared on DraftGraphBlockSchema or CanonicalCommittedGraphReceiptSchema,
  // so it cannot enter graph persistence, graph hashing or compute/context
  // inputs through those governed shapes.
  //
  // ABSENCE IS DISTINCT: absent means no notice attestation was supplied (the
  // legacy producer state), never zero notices. Present carriers cannot encode
  // zero and must account for every notice exactly once. Consumers fail closed:
  // render no notice when absent or when validation fails, and never infer one.
  model_building_notices: ModelBuildingNoticesSchema.optional(),
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
  // 0.20.0 additive (ROADMAP 1.120 residual) --------------------------------
  // Producer framing-quality verdict (UI-SEM-079) — see the FramingQuality
  // block comment above for vocabulary + doctrine. Absent until the
  // producing turn has actually assessed the framing; consumers MUST NOT
  // derive a verdict client-side when it is absent.
  framing_quality: FramingQuality.optional(),
  // 0.39.0 additive (ROADMAP 2.698-S2) --------------------------------------
  // The run-over-run delta block, one per completed rerun, beside
  // `analysis_ready` — see ./run-delta.ts for the full doctrine (the C0–C4
  // attribution table, the pair-provenance record, and the fabrication
  // rules the schema itself enforces). ABSENCE SEMANTICS (census —
  // distinct): absent on every non-rerun turn AND on reruns produced before
  // the producer shipped / where no prior fact exists; never defaulted, and
  // a consumer renders NO delta card on absence.
  run_delta: RunDeltaSchema.optional(),
  // 0.22.0 additive (S1 — graph-identity handshake) -------------------------
  // The canonical hash of the graph state THIS turn / receipt was produced
  // against (the `CANONICAL_GRAPH_HASH_KEEP_LIST` floor — see
  // ./graph-hash-contract.ts; the runtime hash is CEE's
  // `computeAnalysisAffectingGraphHash`). The client verifies its OWN current
  // canonical hash == this value and, on mismatch, enters a fail-loud
  // `GRAPH_DIVERGED` divergence state instead of silently dropping the receipt
  // (replaces the `zero_overlap_drop` class). Optional so pinned consumers are
  // unaffected until they re-vendor 0.22.0; absent = no handshake asserted.
  graph_hash: z.string().min(1).optional(),
}).strict();

export type OlumiResponse = z.infer<typeof OlumiResponseSchema>;

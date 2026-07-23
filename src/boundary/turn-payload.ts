import { z } from 'zod';
import { TurnClass, Stage, ActionType, Intent, TurnSource } from './enums.js';
import { GraphV3Schema } from '../graph.js';

// UUIDv4 pattern — keep loose; CEE also re-checks.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Uuid = z.string().regex(UUID_V4);

// v0.7.0 — discriminated turn payload for /orchestrate/v2/turn.
// Breaking change from v0.6.0: all payloads MUST carry a `kind` field.
// Clean cutover — no backwards-compat legacy branch. Both UI and CEE move
// together. See Docs/v5/v5-turn-shape-matrix.md for the handler coverage map.

const BaseFields = {
  turn_id: Uuid,
  scenario_id: Uuid,
  stage: Stage,
} as const;

// Selected-element reference shared by `selected_elements` (on
// `MessageTurnPayloadSchema`, below) and `selection_change` (a
// `SystemEventSchema` member, further down this file). Deliberately
// minimal (id + kind + an optional display label) — NOT the Phase 3
// `TargetRefSchema` (§0.1 in blocks.ts), which requires a non-empty
// `label`: a live canvas selection can legitimately reference an element
// the UI has no ready-made label for (e.g. mid-drag, or a just-added
// unlabelled node), and this is an UI→CEE inbound field, not a
// wire-rendered UI target. Declared here (ahead of both members that use
// it) to avoid a temporal-dead-zone reference.
export const SelectedElementRefSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1).optional(),
}).strict();
export type SelectedElementRef = z.infer<typeof SelectedElementRefSchema>;

const MAX_SELECTED_ELEMENTS = 20;

// kind: 'message' — user-originated turn with free text.
// `source` tells CEE how the text got here (composer / chip / chip_click / retry).
// `chip` carries action_type and parameters only when source is 'chip' | 'chip_click'.
// `retry_of` references the prior turn_id only when source is 'retry'.
//
// `generate_model` / `explicit_generate` — optional booleans (v0.13.1). When
// either is `true` AND the scenario has no graph (or zero nodes), CEE may
// deterministically dispatch the V5 draft_graph handler without first
// consulting the LLM tool-use router. The two names are aliases of the
// same semantic ("the user explicitly asked CEE to generate the model
// now"): clients may send either; CEE treats them as equivalent. Both
// default to `undefined` so existing clients (and any consumer of an
// older schema version that omits the field) are unaffected. The flags
// are advisory; CEE may still ignore them if the trigger preconditions
// are not satisfied (e.g., a graph already exists).
//
// `selected_elements` — optional (v0.15.0). Piggyback selection context for
// THIS turn only: what the user had selected on the canvas at send time.
// Verified gap this closes: the live V5 outbound builder
// (`src/v5/buildPayload.ts` in DecisionGuideAI) sends NO selection context
// today — a `selected_elements` field already exists on the wire, but only
// on the dead V4-era builder path (`src/services/turn-request-builder.ts`,
// shape `{node_ids?, edge_ids?}`), which the live V5 conversation flow does
// not call. This field is the V5-shaped replacement (array of typed refs,
// bounded ≤20) — the V4 field is not touched by this change; the two simply
// coexist under the same name on different schema versions/turn shapes.
// Between-turn selection awareness (the user changes their selection
// without sending a turn) is NOT this field's job — that is
// `selection_change` (below).
//
// `graph_state` — optional (0.23.0). The FULL inbound GraphV3 the client holds
// on its canvas at send time (nodes + edges — the same shape draft_graph emits,
// NOT a hash ref: on a guest first-touch there is no server model to fetch, so
// the whole graph must ride inbound). Additive + `.strict()`-safe: a turn
// WITHOUT it still parses (fail-safe — every pre-0.23.0 payload is unaffected).
//
// PURPOSE (A2 guest-template train — ROADMAP 1.188 / A1-DECISIONS D-24): on a
// FIRST-TOUCH turn a guest scenario has NO server-authored model, so CEE is
// model-blind. This carries the graph inbound so CEE can adopt-on-first-touch
// and coach/analyse against it. Ingress hazard (0.22-class landing sequence):
// an older strict CEE 422s a turn carrying an unknown field, so the UI MUST NOT
// populate `graph_state` until CEE has re-vendored ≥ 0.23.0 and accepts it.
// Order: this package publishes → CEE re-vendors (accepts + adopts) → UI sends.
//
// Cross-field refinements are applied on the discriminated-union wrapper
// below (z.discriminatedUnion requires plain ZodObject members).
export const MessageTurnPayloadSchema = z.object({
  ...BaseFields,
  kind: z.literal('message'),
  message: z.string().min(1).max(10_000),
  turn_class: TurnClass,
  source: TurnSource,
  chip: z.object({
    // 0.22.0 (S2) — FIRST-CLASS chip identity. Was smuggled untyped inside
    // `parameters` (chip_id / spark_id) with ZERO CEE readers. This promotes
    // the same discipline the `chip_click` system-event member already has
    // (typed `chip_id`, below) to the message-turn chip.
    id: z.string().min(1).optional(),
    action_type: ActionType.optional(),
    // 0.22.0 (S2, decision ①) — typed coaching / elicitation / mutation
    // INTENT, PARALLEL to `action_type` (which names a handler id). CEE routes
    // a typed chip on its `intent` instead of re-inferring intent from the
    // rendered chip copy. See `Intent` in ./enums.ts.
    intent: Intent.optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }).strict().optional(),
  retry_of: Uuid.optional(),
  generate_model: z.boolean().optional(),
  explicit_generate: z.boolean().optional(),
  selected_elements: z.array(SelectedElementRefSchema).max(MAX_SELECTED_ELEMENTS).optional(),
  graph_state: GraphV3Schema.optional(),
}).strict();

// kind: 'system_event' — UI-initiated event with no free text.
// Never renders a user bubble; CEE dispatches to a deterministic handler.
const PatchAcceptedEvent = z.object({
  kind: z.literal('patch_accepted'),
  patch_id: z.string().min(1),
}).strict();

const PatchDismissedEvent = z.object({
  kind: z.literal('patch_dismissed'),
  patch_id: z.string().min(1),
}).strict();

// `direct_graph_edit` — a manual canvas edit reported to CEE.
//
// 0.22.0 (S2, decision ②): `target_id` + `operation` are REQUIRED singulars; the
// optional `changed_*` / `operations` / `fields_changed` / `summary` fields are
// additive batch CONTEXT. Chosen over a new `graph_edited` event (decision ② rec)
// to keep one event, one owner. Before this the singular-only `.strict()` shape
// REFUSED a multi-edit payload (build → null → the turn was never sent), so CEE
// was blind to manual edits.
//
// ⚠ HONEST WIRE CONVENTION (F6, ROADMAP 1.188a — corrected 0.23.0). This schema
// does NOT itself decompose a batch: `target_id`/`operation` carry a
// REPRESENTATIVE SINGULAR, and the raw multi-edit → representative reduction is
// performed UPSTREAM by the UI's `graphEditBatchAdapter` (DecisionGuideAI,
// merged #436; pinned by `graphEditBatchAdapter.spec.ts`), NOT by anything in
// this package. The adapter's convention — stated so a consumer knows what the
// singulars MEAN: `target_id` = explicit target → else the first changed node id
// (ascending) → else the first changed edge id (ascending); `operation` =
// explicit → else `operations[0]` (ascending); `fields_changed` = the batch's
// per-field map flattened to a sorted, de-duped `string[]` UNION. The
// `changed_*`/`operations` arrays ride alongside as full context; an edit whose
// id set is empty is rejected client-side as a retryable `unencodable_graph_edit`
// rather than sent. (The prior 0.22.0 comment claimed the schema "accommodated"
// the UI's debounced batch emitter directly — it does not; that accommodation is
// the adapter's, and the wire carries the representative singular described here.
// trap-14: describe the convention the wire actually uses, not one that only
// holds via the adapter.)
const DirectGraphEditEvent = z.object({
  kind: z.literal('direct_graph_edit'),
  target_id: z.string().min(1),
  operation: z.string().min(1),
  // Batch payload (all optional — additive). `operations` is the plural of the
  // singular `operation` verb; `fields_changed` names the touched fields;
  // `summary` is a short human description of the batch.
  changed_node_ids: z.array(z.string().min(1)).optional(),
  changed_edge_ids: z.array(z.string().min(1)).optional(),
  operations: z.array(z.string().min(1)).optional(),
  fields_changed: z.array(z.string().min(1)).optional(),
  summary: z.string().min(1).max(2000).optional(),
}).strict();

const ChipClickEvent = z.object({
  kind: z.literal('chip_click'),
  chip_id: z.string().min(1),
}).strict();

const UndoEvent = z.object({
  kind: z.literal('undo'),
}).strict();

const RedoEvent = z.object({
  kind: z.literal('redo'),
}).strict();

// `selection_change` (v0.15.0) — between-turn canvas selection awareness.
// Debounced client-side (the UI should coalesce rapid selection churn
// before emitting, not fire one event per click/drag-frame) and sent as a
// system event because it is UI-initiated with no free text and never
// renders a user bubble, same as every other member of this union.
//
// Advisory context, never a command: CEE MAY use this to inform the NEXT
// response (e.g. "the user is looking at Factor X"), but a `selection_change`
// event never itself triggers a mutation, an analysis run, or any handler
// side effect — it carries no operation, only "here is what is selected
// now". Distinct from `selected_elements` on `MessageTurnPayloadSchema`,
// which piggybacks selection onto an already-outbound message turn; this
// event exists so selection changes ALONE (no accompanying message) still
// reach CEE.
//
// `cleared` distinguishes "selection became empty" from "no selection
// information sent" — `selected: []` with `cleared: true` says the user
// explicitly deselected everything; `selected: []` alone is ambiguous with
// a client that just omits detail. Optional because most emissions are a
// non-empty selection where the distinction does not apply.
const SelectionChangeEvent = z.object({
  kind: z.literal('selection_change'),
  selected: z.array(SelectedElementRefSchema).max(MAX_SELECTED_ELEMENTS),
  cleared: z.boolean().optional(),
}).strict();

// `feedback` (0.22.0) — the typed thumbs-rating event. Paul ruled WIRE
// (design decision ⑥, ROADMAP 1.181): the V5 feedback builder silently
// REFUSED `feedback_submitted` (the dead-thumbs class — a control that did
// nothing). This member is the honest channel: CEE consumes + persists it, the
// UI emitter switches from the dead builder to this event. UI-initiated, no
// free-text bubble → a system event like every sibling of this union.
export const FeedbackRating = z.enum(['up', 'down']);
export type FeedbackRatingLiteral = z.infer<typeof FeedbackRating>;

// The class of artifact a rating is ABOUT. A small CLOSED vocabulary (not an
// open string) so a consumer keys display / telemetry off the target class.
export const FeedbackTargetKind = z.enum([
  'turn',
  'message',
  'block',
  'suggestion',
  'analysis',
]);
export type FeedbackTargetKindLiteral = z.infer<typeof FeedbackTargetKind>;

const FeedbackEvent = z.object({
  kind: z.literal('feedback'),
  // The thumbs verdict.
  rating: FeedbackRating,
  // Optional free-text the user typed alongside the thumb.
  comment: z.string().min(1).max(2000).describe(
    'User free-text feedback. MAY contain PII (names, emails, whatever the ' +
      'user typed) — consumers MUST handle per R-004: treat as sensitive, ' +
      'never log verbatim, redact before persistence/telemetry.',
  ).optional(),
  // The artifact being rated (id + its class). Required: a rating with no
  // referent is not actionable. `id` is any stable id (a turn UUID for a
  // whole-turn rating, else a block / suggestion id).
  target: z.object({
    id: z.string().min(1),
    kind: FeedbackTargetKind,
  }).strict(),
}).strict();

export const SystemEventSchema = z.discriminatedUnion('kind', [
  PatchAcceptedEvent,
  PatchDismissedEvent,
  DirectGraphEditEvent,
  ChipClickEvent,
  UndoEvent,
  RedoEvent,
  SelectionChangeEvent,
  FeedbackEvent,
]);
export type SystemEvent = z.infer<typeof SystemEventSchema>;

export const SystemEventTurnPayloadSchema = z.object({
  ...BaseFields,
  kind: z.literal('system_event'),
  event: SystemEventSchema,
}).strict();

// Discriminated union at the payload root. Consumers switch on `kind`.
// Cross-field message refinements (chip-only-with-chip-source,
// retry_of-only-with-retry-source) apply via .superRefine at the union level.
export const OrchestratorTurnPayloadSchema = z
  .discriminatedUnion('kind', [MessageTurnPayloadSchema, SystemEventTurnPayloadSchema])
  .superRefine((payload, ctx) => {
    if (payload.kind !== 'message') return;
    const isChipSource = payload.source === 'chip' || payload.source === 'chip_click';
    if (payload.chip && !isChipSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chip'],
        message: "`chip` is only allowed when source is 'chip' or 'chip_click'",
      });
    }
    if (payload.retry_of && payload.source !== 'retry') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retry_of'],
        message: "`retry_of` is only allowed when source is 'retry'",
      });
    }
  });

export type MessageTurnPayload = z.infer<typeof MessageTurnPayloadSchema>;
export type SystemEventTurnPayload = z.infer<typeof SystemEventTurnPayloadSchema>;
export type OrchestratorTurnPayload = z.infer<typeof OrchestratorTurnPayloadSchema>;

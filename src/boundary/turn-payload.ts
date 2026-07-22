import { z } from 'zod';
import { TurnClass, Stage, ActionType, TurnSource, CoachingIntent } from './enums.js';

// UUIDv4 pattern — keep loose; CEE also re-checks.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Uuid = z.string().regex(UUID_V4);

// v0.7.0 — discriminated turn payload for /orchestrate/v2/turn.
// Breaking change from v0.6.0: all payloads MUST carry a `kind` field.
// Clean cutover — no backwards-compat legacy branch. Both UI and CEE move
// together. See Docs/v5/v5-turn-shape-matrix.md for the handler coverage map.

// `graph_hash` (0.21.0) — the graph-identity handshake field, on EVERY turn
// (message and system-event), per SINGLE-GRAPH-DESIGN v2 §1 and
// schemas-0.21.0-manifest a2. The client stamps it with `computeGraphHash` of
// the canvas it rendered at send time; CEE compares it against the
// authoritative graph and blocks compute / edit-confirm on divergence.
//
// TRI-STATE, load-bearing — `.nullable().optional()`, NOT merely optional:
//   * a hex string  → a graph was rendered; this is its identity hash.
//   * null          → NO graph rendered (empty canvas). Explicit, distinct from
//                     "old client".
//   * ABSENT        → an old client that predates 0.21.0 and cannot compute the
//                     hash. Divergence enforcement engages only when the field
//                     is PRESENT (string|null); an absent hash preserves
//                     today's behaviour (safe roll — producer/consumer skew).
// Collapsing null and absent would either enforce divergence against clients
// that cannot participate, or blind CEE to "the user is looking at an empty
// canvas" — hence the tri-state is declared, not simplified.
const GraphHashField = {
  graph_hash: z.string().min(1).nullable().optional(),
} as const;

const BaseFields = {
  turn_id: Uuid,
  scenario_id: Uuid,
  stage: Stage,
  ...GraphHashField,
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
// Cross-field refinements are applied on the discriminated-union wrapper
// below (z.discriminatedUnion requires plain ZodObject members).
export const MessageTurnPayloadSchema = z.object({
  ...BaseFields,
  kind: z.literal('message'),
  message: z.string().min(1).max(10_000),
  turn_class: TurnClass,
  source: TurnSource,
  chip: z.object({
    // First-class chip identity (0.21.0, manifest b2). Today message-turn chip
    // identity is untyped ballast inside `parameters` (a `z.record`) with ZERO
    // typed readers — only the `chip_click` SYSTEM EVENT carries a typed
    // `chip_id`. Promote it to a typed field so the S2 readiness/coaching arm
    // and the provenance reader key off a typed slot, not a bag lookup.
    id: z.string().min(1).optional(),
    // Handler-imperative channel (unchanged) — the registered V5 handler id.
    action_type: ActionType.optional(),
    // Coaching-intent channel (0.21.0, manifest b3). The typed intent the chip
    // declares — the wire slot the 12 identity-only node chips, the unmapped
    // sparks, and the insight/drawer/coaching families speak through. Parallel
    // to `action_type`, never a substitute: a chip may carry either, both, or
    // neither. Unknown/absent intent = "no intent signal" (fail closed).
    intent: CoachingIntent.optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }).strict().optional(),
  retry_of: Uuid.optional(),
  generate_model: z.boolean().optional(),
  explicit_generate: z.boolean().optional(),
  selected_elements: z.array(SelectedElementRefSchema).max(MAX_SELECTED_ELEMENTS).optional(),
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

// `direct_graph_edit` (batched shape added 0.21.0, manifest b4). The singular
// `{target_id, operation}` shape has NO live producer: the UI's manual-canvas
// edits are BATCHED, so its batch event failed the old singular `.strict()`
// member and was silently dropped client-side — leaving CEE BLIND to manual
// canvas edits (S2 §1b / S3 §4), which is also an S1/S3 divergence-blindness
// input. The batch fields are the shape the UI actually emits.
//
// ADDITIVE, not a swap: `target_id` / `operation` are demoted to OPTIONAL (a
// stray singular producer, if any survives, still validates) and the batch
// fields are added alongside. A discriminated union cannot carry two members
// with the same `kind`, so both shapes live on ONE member with everything
// optional. The UI emitter fix + the eventual retirement of the singular pair
// are UI-lane (A2) work; the wire simply admits both here.
const DirectGraphEditEvent = z.object({
  kind: z.literal('direct_graph_edit'),
  // Singular (legacy) shape — now optional.
  target_id: z.string().min(1).optional(),
  operation: z.string().min(1).optional(),
  // Batched shape — the ids/ops of everything the user changed in one canvas
  // interaction, so CEE sees the whole manual edit, not one element of it.
  changed_node_ids: z.array(z.string().min(1)).optional(),
  changed_edge_ids: z.array(z.string().min(1)).optional(),
  operations: z.array(z.string().min(1)).optional(),
  fields_changed: z.array(z.string().min(1)).optional(),
  summary: z.string().min(1).optional(),
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

export const SystemEventSchema = z.discriminatedUnion('kind', [
  PatchAcceptedEvent,
  PatchDismissedEvent,
  DirectGraphEditEvent,
  ChipClickEvent,
  UndoEvent,
  RedoEvent,
  SelectionChangeEvent,
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

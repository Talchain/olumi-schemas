import { z } from 'zod';
import { TurnClass, Stage, ActionType, TurnSource } from './enums.js';

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
// Cross-field refinements are applied on the discriminated-union wrapper
// below (z.discriminatedUnion requires plain ZodObject members).
export const MessageTurnPayloadSchema = z.object({
  ...BaseFields,
  kind: z.literal('message'),
  message: z.string().min(1).max(10_000),
  turn_class: TurnClass,
  source: TurnSource,
  chip: z.object({
    action_type: ActionType.optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }).strict().optional(),
  retry_of: Uuid.optional(),
  generate_model: z.boolean().optional(),
  explicit_generate: z.boolean().optional(),
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

const DirectGraphEditEvent = z.object({
  kind: z.literal('direct_graph_edit'),
  target_id: z.string().min(1),
  operation: z.string().min(1),
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

// Selected-element reference shared by `selected_elements` (on
// `MessageTurnPayloadSchema`, added separately) and `selection_change`
// below. Deliberately minimal (id + kind + an optional display label) —
// NOT the Phase 3 `TargetRefSchema` (§0.1 in blocks.ts), which requires a
// non-empty `label`: a live canvas selection can legitimately reference an
// element the UI has no ready-made label for (e.g. mid-drag, or a
// just-added unlabelled node), and this is an UI→CEE inbound field, not a
// wire-rendered UI target.
export const SelectedElementRefSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1).optional(),
}).strict();
export type SelectedElementRef = z.infer<typeof SelectedElementRefSchema>;

const MAX_SELECTED_ELEMENTS = 20;

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

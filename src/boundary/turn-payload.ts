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

export const SystemEventSchema = z.discriminatedUnion('kind', [
  PatchAcceptedEvent,
  PatchDismissedEvent,
  DirectGraphEditEvent,
  ChipClickEvent,
  UndoEvent,
  RedoEvent,
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

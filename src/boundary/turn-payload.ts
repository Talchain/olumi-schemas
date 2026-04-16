import { z } from 'zod';
import { TurnClass, Stage } from './enums.js';

// UUIDv4 pattern — keep loose; CEE also re-checks.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Uuid = z.string().regex(UUID_V4);

// Minimal inbound turn payload for /orchestrate/v2/turn.
// Fully .strict() per A0 B1 policy — unknown fields are rejected with 422.
// A1+ will extend fields additively; consumers must re-pin the contract version.
export const OrchestratorTurnPayloadSchema = z.object({
  turn_id: Uuid,
  scenario_id: Uuid,
  message: z.string().min(1).max(10_000),
  turn_class: TurnClass,
  stage: Stage,
}).strict();

export type OrchestratorTurnPayload = z.infer<typeof OrchestratorTurnPayloadSchema>;

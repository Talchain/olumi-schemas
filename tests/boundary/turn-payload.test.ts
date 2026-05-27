import { describe, it, expect } from 'vitest';
import {
  OrchestratorTurnPayloadSchema,
  MessageTurnPayloadSchema,
  SystemEventTurnPayloadSchema,
  SystemEventSchema,
} from '../../src/boundary/index.js';

const TURN_ID = '11111111-1111-4111-8111-111111111111';
const SCENARIO_ID = '22222222-2222-4222-8222-222222222222';
const PRIOR_TURN_ID = '33333333-3333-4333-8333-333333333333';

const baseMessage = {
  kind: 'message' as const,
  turn_id: TURN_ID,
  scenario_id: SCENARIO_ID,
  stage: 'frame' as const,
  message: 'Help me decide.',
  turn_class: 'frame' as const,
  source: 'composer' as const,
};

const baseSystemEvent = {
  kind: 'system_event' as const,
  turn_id: TURN_ID,
  scenario_id: SCENARIO_ID,
  stage: 'frame' as const,
  event: { kind: 'patch_accepted' as const, patch_id: 'patch-abc' },
};

describe('OrchestratorTurnPayload v0.7.0 — discriminated union', () => {
  it('accepts a well-formed message payload (composer source)', () => {
    const r = OrchestratorTurnPayloadSchema.parse(baseMessage);
    expect(r).toEqual(baseMessage);
  });

  it('accepts a message payload with chip metadata (chip_click source)', () => {
    const payload = {
      ...baseMessage,
      source: 'chip_click' as const,
      chip: { action_type: 'run_analysis' as const, parameters: { option_id: 'opt-1' } },
    };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('accepts a message payload with retry_of (retry source)', () => {
    const payload = {
      ...baseMessage,
      source: 'retry' as const,
      retry_of: PRIOR_TURN_ID,
    };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('rejects a message payload with chip when source is composer', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      ...baseMessage,
      chip: { action_type: 'run_analysis' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a message payload with retry_of when source is not retry', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      ...baseMessage,
      retry_of: PRIOR_TURN_ID,
    });
    expect(r.success).toBe(false);
  });

  it('accepts a system_event payload for each SystemEventKind', () => {
    const events = [
      { kind: 'patch_accepted' as const, patch_id: 'p1' },
      { kind: 'patch_dismissed' as const, patch_id: 'p2' },
      { kind: 'direct_graph_edit' as const, target_id: 'node-1', operation: 'set_value' },
      { kind: 'chip_click' as const, chip_id: 'chip-1' },
      { kind: 'undo' as const },
      { kind: 'redo' as const },
    ];
    for (const event of events) {
      const payload = { ...baseSystemEvent, event };
      const r = OrchestratorTurnPayloadSchema.parse(payload);
      expect(r).toEqual(payload);
    }
  });

  it('rejects a system_event payload with unknown event.kind', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      ...baseSystemEvent,
      event: { kind: 'unknown_event', patch_id: 'p1' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a payload with no kind discriminator (v0.6.0 legacy shape)', () => {
    const legacy = {
      turn_id: TURN_ID,
      scenario_id: SCENARIO_ID,
      message: 'legacy',
      turn_class: 'frame',
      stage: 'frame',
    };
    const r = OrchestratorTurnPayloadSchema.safeParse(legacy);
    expect(r.success).toBe(false);
  });

  it('rejects unknown fields on message payload (strict)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...baseMessage, extra: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown fields on system_event payload (strict)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...baseSystemEvent, extra: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects non-UUID turn_id on message payload', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...baseMessage, turn_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('rejects empty message on message payload', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...baseMessage, message: '' });
    expect(r.success).toBe(false);
  });

  it('rejects message payload missing source', () => {
    const { source, ...rest } = baseMessage;
    const r = OrchestratorTurnPayloadSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('rejects system_event with empty patch_id', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      ...baseSystemEvent,
      event: { kind: 'patch_accepted', patch_id: '' },
    });
    expect(r.success).toBe(false);
  });

  it('MessageTurnPayloadSchema can be imported and used standalone', () => {
    expect(MessageTurnPayloadSchema.parse(baseMessage)).toEqual(baseMessage);
  });

  it('SystemEventTurnPayloadSchema can be imported and used standalone', () => {
    expect(SystemEventTurnPayloadSchema.parse(baseSystemEvent)).toEqual(baseSystemEvent);
  });

  it('SystemEventSchema can be imported and used standalone', () => {
    expect(SystemEventSchema.parse(baseSystemEvent.event)).toEqual(baseSystemEvent.event);
  });

  // v0.13.1 — explicit draft_graph generate flags
  it('accepts a message payload with generate_model: true', () => {
    const payload = { ...baseMessage, generate_model: true };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('accepts a message payload with explicit_generate: true', () => {
    const payload = { ...baseMessage, explicit_generate: true };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('accepts a message payload with both generate_model and explicit_generate (alias semantics)', () => {
    const payload = { ...baseMessage, generate_model: true, explicit_generate: true };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('accepts generate_model: false (negative-explicit signal)', () => {
    const payload = { ...baseMessage, generate_model: false };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('rejects non-boolean generate_model (e.g. truthy string)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...baseMessage, generate_model: 'true' });
    expect(r.success).toBe(false);
  });

  it('rejects non-boolean explicit_generate (e.g. number)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...baseMessage, explicit_generate: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects generate_model on system_event payload (strict — field is message-only)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...baseSystemEvent, generate_model: true });
    expect(r.success).toBe(false);
  });
});

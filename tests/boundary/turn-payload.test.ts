import { describe, it, expect } from 'vitest';
import { OrchestratorTurnPayloadSchema } from '../../src/boundary/index.js';

const valid = {
  turn_id: '11111111-1111-4111-8111-111111111111',
  scenario_id: '22222222-2222-4222-8222-222222222222',
  message: 'Help me decide.',
  turn_class: 'frame',
  stage: 'frame',
};

describe('OrchestratorTurnPayload (B1 ingress, strict)', () => {
  it('accepts a well-formed payload', () => {
    expect(OrchestratorTurnPayloadSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing scenario_id', () => {
    const { scenario_id, ...rest } = valid;
    const r = OrchestratorTurnPayloadSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('rejects wrong types (message as number)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...valid, message: 42 });
    expect(r.success).toBe(false);
  });

  it('rejects extra/unknown fields (strict mode)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...valid, extra: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects non-UUID turn_id', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...valid, turn_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('rejects empty message', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({ ...valid, message: '' });
    expect(r.success).toBe(false);
  });
});

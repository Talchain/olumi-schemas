import { describe, it, expect } from 'vitest';
import { BoundaryErrorSchema, BoundaryErrorCode } from '../../src/boundary/index.js';

describe('BoundaryError (Contract v1.1 §6.4)', () => {
  const valid = {
    error: 'INGRESS_CONTRACT_VIOLATION',
    boundary: 'B1',
    direction: 'ingress',
    validator: 'OrchestratorTurnPayload',
    details: { issues: [{ path: 'scenario_id', message: 'required' }] },
    request_id: 'req_123',
    retryable: false,
  };

  it('accepts a well-formed error', () => {
    expect(BoundaryErrorSchema.parse(valid)).toEqual(valid);
  });

  it('rejects top-level code field (legacy shape)', () => {
    const r = BoundaryErrorSchema.safeParse({ ...valid, code: 'X' });
    expect(r.success).toBe(false);
  });

  it('rejects top-level fields array (legacy shape)', () => {
    const r = BoundaryErrorSchema.safeParse({ ...valid, fields: [] });
    expect(r.success).toBe(false);
  });

  it('rejects unknown error codes', () => {
    const r = BoundaryErrorSchema.safeParse({ ...valid, error: 'NOT_A_CODE' });
    expect(r.success).toBe(false);
  });

  it('rejects non-B1..B5 boundary values', () => {
    const r = BoundaryErrorSchema.safeParse({ ...valid, boundary: 'B9' });
    expect(r.success).toBe(false);
  });

  it('requires all fields present', () => {
    const { request_id, ...rest } = valid;
    const r = BoundaryErrorSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('exposes the expected code members', () => {
    const members = BoundaryErrorCode.options;
    expect(members).toContain('INGRESS_CONTRACT_VIOLATION');
    expect(members).toContain('FEATURE_NOT_ENABLED');
  });
});

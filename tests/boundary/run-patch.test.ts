import { describe, it, expect } from 'vitest';
import {
  V2OptionSchema,
  LegacyGoalConstraintStubSchema,
  V2RunResponseSchema,
  ValidatePatchResponseSchema,
  RunResult,
} from '../../src/boundary/index.js';

describe('V2 run surface (pinned, not exercised in A0)', () => {
  it('V2Option accepts minimal shape', () => {
    expect(V2OptionSchema.parse({ id: 'opt_1', label: 'Option 1' })).toBeDefined();
  });

  it('LegacyGoalConstraintStub rejects unknown bound operator', () => {
    const r = LegacyGoalConstraintStubSchema.safeParse({ id: 'c1', label: 'x', bound: 'neq', value: 1 });
    expect(r.success).toBe(false);
  });

  it('V2RunResponse accepts each RunResult member', () => {
    for (const result of RunResult.options) {
      const r = V2RunResponseSchema.safeParse({ request_id: 'r1', result });
      expect(r.success).toBe(true);
    }
  });
});

describe('Patch validation surface', () => {
  it('ValidatePatchResponse requires boolean valid field', () => {
    const r = ValidatePatchResponseSchema.safeParse({ request_id: 'r1', valid: 'yes' });
    expect(r.success).toBe(false);
  });
});

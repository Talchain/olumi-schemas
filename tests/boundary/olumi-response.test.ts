import { describe, it, expect } from 'vitest';
import {
  OlumiResponseSchema,
  BlockSchema,
  TextBlockSchema,
  ErrorBlockSchema,
  FAILURE_USER_TEXT,
  FailureType,
} from '../../src/boundary/index.js';

const validResponse = {
  response_version: 2 as const,
  assistant_text: 'V5 orchestrator is not enabled.',
  blocks: [
    { type: 'error' as const, error_code: 'FEATURE_NOT_ENABLED' as const, severity: 'info' as const },
  ],
  suggested_actions: [],
  insights: [],
  stage_indicator: 'frame' as const,
};

describe('OlumiResponse', () => {
  it('accepts the A0 feature-unavailable envelope', () => {
    expect(OlumiResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('rejects response_version !== 2', () => {
    const r = OlumiResponseSchema.safeParse({ ...validResponse, response_version: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects unknown top-level fields (strict)', () => {
    const r = OlumiResponseSchema.safeParse({ ...validResponse, extra: true });
    expect(r.success).toBe(false);
  });

  it('rejects unknown stage_indicator', () => {
    const r = OlumiResponseSchema.safeParse({ ...validResponse, stage_indicator: 'not-a-stage' });
    expect(r.success).toBe(false);
  });
});

describe('Block discriminated union', () => {
  it('accepts a text block', () => {
    const b = { type: 'text' as const, content: 'hello' };
    expect(BlockSchema.parse(b)).toEqual(b);
    expect(TextBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts an error block', () => {
    const b = {
      type: 'error' as const,
      error_code: 'INGRESS_CONTRACT_VIOLATION' as const,
      severity: 'error' as const,
    };
    expect(BlockSchema.parse(b)).toEqual(b);
    expect(ErrorBlockSchema.parse(b)).toEqual(b);
  });

  it('rejects an unknown block type', () => {
    const r = BlockSchema.safeParse({ type: 'chart', points: [] });
    expect(r.success).toBe(false);
  });

  it('rejects an error block with unknown error_code', () => {
    const r = ErrorBlockSchema.safeParse({
      type: 'error',
      error_code: 'NOT_A_CODE',
      severity: 'info',
    });
    expect(r.success).toBe(false);
  });
});

describe('FailureType and user-visible text (addendum §2.1.5)', () => {
  it('declares user-visible text for every FailureType member', () => {
    for (const code of FailureType.options) {
      expect(FAILURE_USER_TEXT[code]).toBeTruthy();
      expect(typeof FAILURE_USER_TEXT[code]).toBe('string');
    }
  });
});

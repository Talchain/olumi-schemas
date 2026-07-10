import { describe, it, expect } from 'vitest';
import {
  OlumiResponseSchema,
  BlockSchema,
  TextBlockSchema,
  ErrorBlockSchema,
  DraftGraphBlockSchema,
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

describe('OlumiResponse v0.8.0 — draft_graph field', () => {
  const base = {
    response_version: 2 as const,
    assistant_text: 'Drafted a graph.',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'analyse' as const,
  };

  it('accepts a response without draft_graph (field is optional)', () => {
    expect(OlumiResponseSchema.parse(base)).toEqual(base);
  });

  it('accepts a response with a valid draft_graph block', () => {
    const r = {
      ...base,
      draft_graph: { nodes: [{ id: 'n1' }], edges: [], node_count: 1, edge_count: 0 },
    };
    const parsed = OlumiResponseSchema.parse(r);
    expect(parsed.draft_graph?.node_count).toBe(1);
    expect(parsed.draft_graph?.edge_count).toBe(0);
  });

  it('rejects draft_graph with negative node_count', () => {
    const r = {
      ...base,
      draft_graph: { nodes: [], edges: [], node_count: -1, edge_count: 0 },
    };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });

  it('rejects draft_graph with non-integer node_count', () => {
    const r = {
      ...base,
      draft_graph: { nodes: [], edges: [], node_count: 1.5, edge_count: 0 },
    };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });
});

describe('OlumiResponse v0.8.1 — analysis_ready field', () => {
  const base = {
    response_version: 2 as const,
    assistant_text: 'Drafted a graph.',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'analyse' as const,
  };

  const validAnalysisReady = {
    status: 'ready',
    options: [
      { option_id: 'opt_a', label: 'Option A', status: 'ready', interventions: { fac_revenue: 0.8 } },
    ],
    goal_node_id: 'goal_revenue',
  };

  it('accepts a response without analysis_ready (field is optional)', () => {
    expect(OlumiResponseSchema.parse(base)).toEqual(base);
  });

  it('accepts a response with valid analysis_ready', () => {
    const r = { ...base, analysis_ready: validAnalysisReady };
    const parsed = OlumiResponseSchema.parse(r);
    expect(parsed.analysis_ready?.status).toBe('ready');
    expect(parsed.analysis_ready?.goal_node_id).toBe('goal_revenue');
    expect(Array.isArray(parsed.analysis_ready?.options)).toBe(true);
  });

  it('preserves extra fields via passthrough (forward-compat)', () => {
    const r = { ...base, analysis_ready: { ...validAnalysisReady, bias_findings: [] } };
    const parsed = OlumiResponseSchema.parse(r);
    expect((parsed.analysis_ready as Record<string, unknown>)?.bias_findings).toEqual([]);
  });

  it('rejects analysis_ready missing status', () => {
    const { status: _s, ...noStatus } = validAnalysisReady;
    expect(OlumiResponseSchema.safeParse({ ...base, analysis_ready: noStatus }).success).toBe(false);
  });

  it('rejects analysis_ready missing goal_node_id', () => {
    const { goal_node_id: _g, ...noGoal } = validAnalysisReady;
    expect(OlumiResponseSchema.safeParse({ ...base, analysis_ready: noGoal }).success).toBe(false);
  });

  it('rejects analysis_ready missing options', () => {
    const { options: _o, ...noOptions } = validAnalysisReady;
    expect(OlumiResponseSchema.safeParse({ ...base, analysis_ready: noOptions }).success).toBe(false);
  });
});

describe('OlumiResponse v0.15.0 — reasoning field (ROADMAP 1.42)', () => {
  const base = {
    response_version: 2 as const,
    assistant_text: 'Here is my recommendation.',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'decide' as const,
  };

  it('accepts a response without reasoning (field is optional — model-adaptive)', () => {
    expect(OlumiResponseSchema.parse(base)).toEqual(base);
  });

  it('accepts a response with reasoning as a verbatim string', () => {
    const r = { ...base, reasoning: 'Weighing option A against option B, given the cost constraint...' };
    const parsed = OlumiResponseSchema.parse(r);
    expect(parsed.reasoning).toBe(r.reasoning);
  });

  it('accepts an empty-string reasoning (schema does not impose a minimum length)', () => {
    const r = { ...base, reasoning: '' };
    expect(OlumiResponseSchema.parse(r).reasoning).toBe('');
  });

  it('rejects a non-string reasoning', () => {
    const r = { ...base, reasoning: 12345 };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });

  it('still rejects unknown top-level fields alongside reasoning (strict)', () => {
    const r = { ...base, reasoning: 'text', extra_field: true };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });
});

describe('DraftGraphBlockSchema', () => {
  it('accepts a valid draft_graph block', () => {
    const b = { type: 'draft_graph' as const, nodes: [], edges: [], node_count: 0, edge_count: 0 };
    expect(DraftGraphBlockSchema.parse(b)).toEqual(b);
  });

  it('is accepted by the BlockSchema discriminated union', () => {
    const b = { type: 'draft_graph' as const, nodes: [{ id: 'n1' }], edges: [], node_count: 1, edge_count: 0 };
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it('rejects unknown fields (strict)', () => {
    const r = DraftGraphBlockSchema.safeParse({
      type: 'draft_graph', nodes: [], edges: [], node_count: 0, edge_count: 0, extra: true,
    });
    expect(r.success).toBe(false);
  });
});

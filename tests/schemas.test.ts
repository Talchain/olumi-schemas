import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  // Graph
  NODE_ID_PATTERN,
  NodeKind,
  FactorCategory,
  ObservedStateSchema,
  StateSpaceSchema,
  NodeV3Schema,
  StrengthSchema,
  EdgeV3Schema,
  GraphV3Schema,
  // Analysis
  ProductReadiness,
  SeedSource,
  DetailLevel,
  OptionForAnalysisSchema,
  AnalysisReadyV3Schema,
  AnalysisRequestIdChainSchema,
  DraftGraphTraceSchema,
  ResponseMetaSchema,
  // Warnings
  STRENGTH_DEFAULT_SIGNATURE,
  CIL_WARNING_CODES,
  CIL_WARNING_SEVERITY,
  STRENGTH_DEFAULT_THRESHOLD,
  STRENGTH_MEAN_DEFAULT_THRESHOLD,
  STRENGTH_DEFAULT_MIN_EDGES,
  EDGE_STRENGTH_LOW_THRESHOLD,
  EDGE_STRENGTH_NEGLIGIBLE_THRESHOLD,
  StrengthDefaultAppliedDetailsSchema,
  StrengthMeanDefaultDominantDetailsSchema,
  EdgeStrengthDetailsSchema,
  ValidationWarningSchema,
  // CEE errors
  CeeErrorCode,
  CeeTypedErrorSchema,
  CeeTimeoutErrorSchema,
  CeeBudgetErrorSchema,
  CeeUpstreamLlmErrorSchema,
  // PLoT errors
  PlotProxyTimeoutErrorSchema,
  PlotCeeUpstreamEnvelopeSchema,
  // Repairs
  RepairLayer,
  REPAIR_CODES,
  RepairEntrySchema,
  // Limits
  LIMITS,
  MAX_NODES,
  MAX_EDGES,
  MAX_OPTIONS,
  MAX_CONSTRAINTS,
  STD_FLOOR,
  STD_CEILING_RATIO,
  STD_CEILING_ABS,
  DEFAULT_STD,
  DEFAULT_EXISTS_PROBABILITY,
  STRENGTH_BOUNDS,
  DEFAULT_SEED,
  validateGraphLimits,
  // New v0.2.0 exports
  ConfidenceLevel,
  EffectDirection,
  CIL_THRESHOLDS,
  SensitivityDirection,
  FactorSensitivitySchema,
  FragileEdgeSchema,
  isFactorSensitivity,
  isFragileEdge,
  isFullyReady,
} from '../src';
import type {
  ValidationBlocker,
  ValidationResult,
  PlotRequestIdChain,
  ObservedStateType,
  PriorType,
  EffectDirectionType,
  ConfidenceLevelType,
  SensitivityDirectionType,
  FactorSensitivity,
  FragileEdge,
} from '../src';

// Fixtures
import happyPath from '../fixtures/happy-path.json';
import blocked from '../fixtures/blocked.json';
import partial from '../fixtures/partial.json';

// ──────────────────────────────────────────────────
// Graph Schemas
// ──────────────────────────────────────────────────

describe('NodeV3Schema', () => {
  it('parses a valid goal node', () => {
    const node = {
      id: 'goal:revenue',
      kind: 'goal',
      label: 'Revenue',
      type: 'numeric',
      goal_threshold: 100,
    };
    expect(NodeV3Schema.parse(node)).toMatchObject(node);
  });

  it('parses a valid factor node with category', () => {
    const node = {
      id: 'factor:budget',
      kind: 'factor',
      label: 'Marketing Budget',
      category: 'controllable',
      observed_state: { value: 25, unit: '£k' },
    };
    expect(NodeV3Schema.parse(node)).toMatchObject(node);
  });

  it('parses a valid node with all optional fields', () => {
    const node = {
      id: 'factor:price',
      kind: 'factor',
      label: 'Price',
      body: 'Unit price of the product',
      type: 'numeric',
      categories: ['low', 'medium', 'high'],
      category: 'controllable',
      observed_state: {
        value: 100,
        std: 10,
        baseline: 90,
        unit: '£',
        source: 'Q3 Report',
      },
      state_space: { range: { min: 0, max: 500 } },
      goal_threshold: 200,
    };
    expect(() => NodeV3Schema.parse(node)).not.toThrow();
  });

  it('rejects invalid node ID (spaces)', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'bad id', kind: 'factor', label: 'Test' }),
    ).toThrow(ZodError);
  });

  it('rejects invalid node ID (uppercase)', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'BadId', kind: 'factor', label: 'Test' }),
    ).toThrow(ZodError);
  });

  it('rejects empty label', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'f:1', kind: 'factor', label: '' }),
    ).toThrow(ZodError);
  });

  it('rejects label exceeding 200 chars', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'f:1', kind: 'factor', label: 'x'.repeat(201) }),
    ).toThrow(ZodError);
  });

  it('rejects body exceeding 2000 chars', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'f:1', kind: 'factor', label: 'Test', body: 'x'.repeat(2001) }),
    ).toThrow(ZodError);
  });

  it('rejects invalid kind', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'f:1', kind: 'invalid_kind', label: 'Test' }),
    ).toThrow(ZodError);
  });

  it('rejects invalid type', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'f:1', kind: 'factor', label: 'Test', type: 'string' }),
    ).toThrow(ZodError);
  });

  it('rejects invalid category', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'f:1', kind: 'factor', label: 'Test', category: 'unknown' }),
    ).toThrow(ZodError);
  });

  it('preserves extra fields via .passthrough()', () => {
    const node = {
      id: 'f:1',
      kind: 'factor',
      label: 'Test',
      custom_field: 'custom_value',
      nested: { a: 1 },
    };
    const parsed = NodeV3Schema.parse(node);
    expect((parsed as Record<string, unknown>).custom_field).toBe('custom_value');
    expect((parsed as Record<string, unknown>).nested).toEqual({ a: 1 });
  });

  it('rejects node ID exceeding 100 chars', () => {
    expect(() =>
      NodeV3Schema.parse({ id: 'a'.repeat(101), kind: 'factor', label: 'Test' }),
    ).toThrow(ZodError);
  });
});

describe('EdgeV3Schema', () => {
  const validEdge = {
    from: 'factor:price',
    to: 'goal:revenue',
    strength: { mean: 0.7, std: 0.1 },
    exists_probability: 0.95,
  };

  it('parses a valid edge', () => {
    expect(EdgeV3Schema.parse(validEdge)).toMatchObject(validEdge);
  });

  it('parses edge with optional fields', () => {
    const edge = {
      ...validEdge,
      effect_direction: 'positive' as const,
      label: 'Price drives revenue',
    };
    expect(() => EdgeV3Schema.parse(edge)).not.toThrow();
  });

  it('rejects strength.mean > 1', () => {
    expect(() =>
      EdgeV3Schema.parse({ ...validEdge, strength: { mean: 1.5, std: 0.1 } }),
    ).toThrow(ZodError);
  });

  it('rejects strength.mean < -1', () => {
    expect(() =>
      EdgeV3Schema.parse({ ...validEdge, strength: { mean: -1.5, std: 0.1 } }),
    ).toThrow(ZodError);
  });

  it('rejects strength.std = 0', () => {
    expect(() =>
      EdgeV3Schema.parse({ ...validEdge, strength: { mean: 0.5, std: 0 } }),
    ).toThrow(ZodError);
  });

  it('rejects negative strength.std', () => {
    expect(() =>
      EdgeV3Schema.parse({ ...validEdge, strength: { mean: 0.5, std: -0.1 } }),
    ).toThrow(ZodError);
  });

  it('rejects exists_probability > 1', () => {
    expect(() =>
      EdgeV3Schema.parse({ ...validEdge, exists_probability: 1.5 }),
    ).toThrow(ZodError);
  });

  it('rejects exists_probability < 0', () => {
    expect(() =>
      EdgeV3Schema.parse({ ...validEdge, exists_probability: -0.1 }),
    ).toThrow(ZodError);
  });

  it('rejects missing strength field', () => {
    expect(() =>
      EdgeV3Schema.parse({ from: 'a', to: 'b', exists_probability: 0.9 }),
    ).toThrow(ZodError);
  });

  it('accepts boundary values: mean=-1, std=0.001, exists_probability=0', () => {
    const edge = {
      from: 'a',
      to: 'b',
      strength: { mean: -1, std: 0.001 },
      exists_probability: 0,
    };
    expect(() => EdgeV3Schema.parse(edge)).not.toThrow();
  });

  it('accepts boundary values: mean=1, std=0.001, exists_probability=1', () => {
    const edge = {
      from: 'a',
      to: 'b',
      strength: { mean: 1, std: 0.001 },
      exists_probability: 1,
    };
    expect(() => EdgeV3Schema.parse(edge)).not.toThrow();
  });

  it('accepts very small positive std (0.000001)', () => {
    const edge = {
      from: 'a',
      to: 'b',
      strength: { mean: 0.5, std: 0.000001 },
      exists_probability: 0.9,
    };
    expect(() => EdgeV3Schema.parse(edge)).not.toThrow();
  });

  it('preserves extra fields via .passthrough()', () => {
    const edge = {
      ...validEdge,
      provenance: { source: 'llm', confidence: 0.8 },
    };
    const parsed = EdgeV3Schema.parse(edge);
    expect((parsed as Record<string, unknown>).provenance).toEqual({ source: 'llm', confidence: 0.8 });
  });
});

describe('GraphV3Schema', () => {
  it('parses a valid graph', () => {
    const graph = {
      nodes: [{ id: 'goal:a', kind: 'goal', label: 'Goal A' }],
      edges: [],
    };
    expect(() => GraphV3Schema.parse(graph)).not.toThrow();
  });

  it('parses an empty graph', () => {
    expect(() => GraphV3Schema.parse({ nodes: [], edges: [] })).not.toThrow();
  });

  it('preserves extra fields via .passthrough()', () => {
    const graph = { nodes: [], edges: [], metadata: { version: '2.7' } };
    const parsed = GraphV3Schema.parse(graph);
    expect((parsed as Record<string, unknown>).metadata).toEqual({ version: '2.7' });
  });
});

// ──────────────────────────────────────────────────
// Analysis Schemas
// ──────────────────────────────────────────────────

describe('OptionForAnalysisSchema', () => {
  it('parses a valid option', () => {
    const option = {
      id: 'opt:high-price',
      label: 'High Price',
      status: 'ready',
      interventions: { 'factor:price': 150 },
    };
    expect(() => OptionForAnalysisSchema.parse(option)).not.toThrow();
  });

  it('parses option with raw_interventions', () => {
    const option = {
      id: 'opt:1',
      label: 'Opt 1',
      status: 'needs_encoding',
      interventions: {},
      raw_interventions: { 'factor:region': 'UK', 'factor:active': true, 'factor:score': 5 },
    };
    expect(() => OptionForAnalysisSchema.parse(option)).not.toThrow();
  });

  it('rejects invalid status', () => {
    expect(() =>
      OptionForAnalysisSchema.parse({
        id: 'opt:1', label: 'X', status: 'invalid', interventions: {},
      }),
    ).toThrow(ZodError);
  });

  it('preserves extra fields via .passthrough()', () => {
    const option = {
      id: 'opt:1', label: 'X', status: 'ready', interventions: {},
      custom: 'data',
    };
    const parsed = OptionForAnalysisSchema.parse(option);
    expect((parsed as Record<string, unknown>).custom).toBe('data');
  });
});

describe('AnalysisReadyV3Schema', () => {
  it('parses valid analysis-ready payload', () => {
    const payload = {
      status: 'ready',
      options: [
        { id: 'a', label: 'A', status: 'ready', interventions: { f: 1 } },
        { id: 'b', label: 'B', status: 'ready', interventions: { f: 2 } },
      ],
      goal_node_id: 'goal:revenue',
    };
    expect(() => AnalysisReadyV3Schema.parse(payload)).not.toThrow();
  });

  it('rejects invalid status', () => {
    expect(() =>
      AnalysisReadyV3Schema.parse({ status: 'unknown', options: [] }),
    ).toThrow(ZodError);
  });
});

describe('ResponseMetaSchema', () => {
  it('parses valid response meta', () => {
    const meta = {
      seed_used: '42',
      seed_source: 'client_generated',
      request_id: 'req-123',
    };
    expect(() => ResponseMetaSchema.parse(meta)).not.toThrow();
  });

  it('parses response meta with full chain', () => {
    const meta = {
      seed_used: '42',
      seed_source: 'server_generated',
      request_id: 'req-456',
      request_id_chain: {
        analysis_chain: {
          ui_sent: 'req-456',
          plot_received: 'req-456',
          forwarded_to_isl: 'req-456',
          isl_echoed: 'req-456',
          all_match: true,
        },
      },
      response_hash: 'sha256:abc',
      computed_at: '2026-02-10T10:00:00Z',
      processing_time_ms: 500,
      build: 'v0.1.0',
    };
    expect(() => ResponseMetaSchema.parse(meta)).not.toThrow();
  });

  it('rejects invalid seed_source', () => {
    expect(() =>
      ResponseMetaSchema.parse({ seed_used: '42', seed_source: 'unknown', request_id: 'r' }),
    ).toThrow(ZodError);
  });

  it('preserves extra fields via .passthrough()', () => {
    const meta = {
      seed_used: '42',
      seed_source: 'client_generated',
      request_id: 'r',
      extra: true,
    };
    const parsed = ResponseMetaSchema.parse(meta);
    expect((parsed as Record<string, unknown>).extra).toBe(true);
  });
});

describe('AnalysisRequestIdChainSchema', () => {
  it('parses valid chain with all matching', () => {
    const chain = {
      ui_sent: 'req-1',
      plot_received: 'req-1',
      forwarded_to_isl: 'req-1',
      isl_echoed: 'req-1',
      all_match: true,
    };
    expect(() => AnalysisRequestIdChainSchema.parse(chain)).not.toThrow();
  });

  it('allows null values for optional stages', () => {
    const chain = {
      ui_sent: 'req-1',
      plot_received: 'req-1',
      forwarded_to_isl: null,
      isl_echoed: null,
      all_match: false,
    };
    expect(() => AnalysisRequestIdChainSchema.parse(chain)).not.toThrow();
  });
});

describe('DraftGraphTraceSchema', () => {
  it('parses valid trace', () => {
    expect(() => DraftGraphTraceSchema.parse({ cee_trace: 'trace-abc' })).not.toThrow();
  });

  it('allows null cee_trace', () => {
    expect(() => DraftGraphTraceSchema.parse({ cee_trace: null })).not.toThrow();
  });
});

// ──────────────────────────────────────────────────
// CIL Warnings
// ──────────────────────────────────────────────────

describe('ValidationWarningSchema', () => {
  it('parses a valid warning', () => {
    const warning = {
      code: 'STRENGTH_DEFAULT_APPLIED',
      message: 'Default strengths detected',
      severity: 'warn',
      details: { total_edges: 10, defaulted_count: 8 },
    };
    expect(() => ValidationWarningSchema.parse(warning)).not.toThrow();
  });

  it('parses warning without details', () => {
    const warning = {
      code: 'CUSTOM_WARNING',
      message: 'Something happened',
      severity: 'info',
    };
    expect(() => ValidationWarningSchema.parse(warning)).not.toThrow();
  });

  it('rejects invalid severity', () => {
    expect(() =>
      ValidationWarningSchema.parse({
        code: 'X', message: 'Y', severity: 'critical',
      }),
    ).toThrow(ZodError);
  });
});

describe('StrengthDefaultAppliedDetailsSchema', () => {
  it('parses valid details', () => {
    const details = {
      total_edges: 10,
      structural_edges_excluded: 2,
      defaulted_count: 6,
      defaulted_percentage: 75,
      defaulted_edge_ids: ['edge:1', 'edge:2', 'edge:3', 'edge:4', 'edge:5', 'edge:6'],
    };
    expect(() => StrengthDefaultAppliedDetailsSchema.parse(details)).not.toThrow();
  });

  it('rejects missing structural_edges_excluded', () => {
    const details = {
      total_edges: 10,
      defaulted_count: 6,
      defaulted_percentage: 75,
      defaulted_edge_ids: [],
    };
    expect(() => StrengthDefaultAppliedDetailsSchema.parse(details)).toThrow(ZodError);
  });

  it('rejects missing defaulted_edge_ids', () => {
    const details = {
      total_edges: 10,
      structural_edges_excluded: 2,
      defaulted_count: 6,
      defaulted_percentage: 75,
    };
    expect(() => StrengthDefaultAppliedDetailsSchema.parse(details)).toThrow(ZodError);
  });
});

describe('StrengthMeanDefaultDominantDetailsSchema', () => {
  it('parses valid details with structural_edges_excluded', () => {
    const details = {
      total_edges: 8,
      structural_edges_excluded: 1,
      mean_default_count: 5,
      mean_default_percentage: 71.4,
      mean_defaulted_edge_ids: ['e:1', 'e:2', 'e:3', 'e:4', 'e:5'],
    };
    expect(() => StrengthMeanDefaultDominantDetailsSchema.parse(details)).not.toThrow();
  });

  it('rejects missing mean_default_count', () => {
    const details = {
      total_edges: 8,
      structural_edges_excluded: 1,
      mean_default_percentage: 71.4,
      mean_defaulted_edge_ids: [],
    };
    expect(() => StrengthMeanDefaultDominantDetailsSchema.parse(details)).toThrow(ZodError);
  });

  it('uses different keys than StrengthDefaultAppliedDetailsSchema', () => {
    // Verify the schemas have distinct field names
    const appliedShape = StrengthDefaultAppliedDetailsSchema.shape;
    const dominantShape = StrengthMeanDefaultDominantDetailsSchema.shape;
    expect('defaulted_count' in appliedShape).toBe(true);
    expect('mean_default_count' in dominantShape).toBe(true);
    expect('defaulted_edge_ids' in appliedShape).toBe(true);
    expect('mean_defaulted_edge_ids' in dominantShape).toBe(true);
  });
});

describe('EdgeStrengthDetailsSchema', () => {
  it('parses valid edge strength details', () => {
    expect(() =>
      EdgeStrengthDetailsSchema.parse({ edge_id: 'e:1', mean: 0.03 }),
    ).not.toThrow();
  });

  it('rejects missing edge_id', () => {
    expect(() => EdgeStrengthDetailsSchema.parse({ mean: 0.03 })).toThrow(ZodError);
  });
});

// ──────────────────────────────────────────────────
// CEE Error Contracts
// ──────────────────────────────────────────────────

describe('CeeTypedErrorSchema', () => {
  it('parses a CEE timeout error', () => {
    const error = {
      error: 'CEE_LLM_TIMEOUT',
      message: 'LLM timed out after 80s',
      retryable: true,
      elapsed_ms: 80000,
      request_id: 'req-abc',
    };
    expect(() => CeeTypedErrorSchema.parse(error)).not.toThrow();
  });

  it('parses a CEE budget error', () => {
    const error = {
      error: 'CEE_REQUEST_BUDGET_EXCEEDED',
      message: 'Request budget exceeded',
      retryable: true,
      elapsed_ms: 90000,
    };
    expect(() => CeeTypedErrorSchema.parse(error)).not.toThrow();
  });

  it('rejects PLoT-owned error codes', () => {
    expect(() =>
      CeeTypedErrorSchema.parse({
        error: 'CEE_PROXY_TIMEOUT',
        message: 'X',
        retryable: true,
      }),
    ).toThrow(ZodError);

    expect(() =>
      CeeTypedErrorSchema.parse({
        error: 'CEE_UPSTREAM_ERROR',
        message: 'X',
        retryable: true,
      }),
    ).toThrow(ZodError);
  });
});

describe('CeeTimeoutErrorSchema', () => {
  it('parses with model field', () => {
    const error = {
      error: 'CEE_LLM_TIMEOUT',
      message: 'Timeout',
      retryable: true,
      model: 'claude-sonnet-4-5-20250929',
    };
    expect(() => CeeTimeoutErrorSchema.parse(error)).not.toThrow();
  });

  it('rejects non-timeout error code', () => {
    expect(() =>
      CeeTimeoutErrorSchema.parse({
        error: 'CEE_INTERNAL_ERROR',
        message: 'X',
        retryable: true,
      }),
    ).toThrow(ZodError);
  });
});

describe('CeeBudgetErrorSchema', () => {
  it('parses with stage field', () => {
    const error = {
      error: 'CEE_REQUEST_BUDGET_EXCEEDED',
      message: 'Budget exceeded',
      retryable: true,
      stage: 'graph_generation',
    };
    expect(() => CeeBudgetErrorSchema.parse(error)).not.toThrow();
  });
});

describe('CeeUpstreamLlmErrorSchema', () => {
  it('parses with upstream details', () => {
    const error = {
      error: 'CEE_LLM_UPSTREAM_ERROR',
      message: 'LLM returned HTML',
      retryable: true,
      upstream_content_type: 'text/html',
      upstream_body_preview: '<html>...',
      upstream_status: 502,
      provider: 'anthropic',
    };
    expect(() => CeeUpstreamLlmErrorSchema.parse(error)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────
// Error code ownership
// ──────────────────────────────────────────────────

describe('Error code ownership', () => {
  it('CeeErrorCode contains CEE_LLM_UPSTREAM_ERROR (CEE-owned)', () => {
    expect(CeeErrorCode.options).toContain('CEE_LLM_UPSTREAM_ERROR');
  });

  it('CeeErrorCode does NOT contain CEE_UPSTREAM_ERROR (PLoT-owned)', () => {
    expect(CeeErrorCode.options).not.toContain('CEE_UPSTREAM_ERROR');
  });

  it('CeeErrorCode does NOT contain CEE_PROXY_TIMEOUT (PLoT-owned)', () => {
    expect(CeeErrorCode.options).not.toContain('CEE_PROXY_TIMEOUT');
  });

  it('PlotProxyTimeoutErrorSchema uses CEE_PROXY_TIMEOUT literal', () => {
    expect(() =>
      PlotProxyTimeoutErrorSchema.parse({
        error: 'CEE_PROXY_TIMEOUT',
        message: 'Timeout',
        retryable: true,
        elapsed_ms: 105000,
        request_id: 'req-1',
      }),
    ).not.toThrow();
  });

  it('PlotCeeUpstreamEnvelopeSchema uses CEE_UPSTREAM_ERROR literal', () => {
    expect(() =>
      PlotCeeUpstreamEnvelopeSchema.parse({
        error: 'CEE_UPSTREAM_ERROR',
        message: 'CEE returned non-JSON',
        retryable: false,
        upstream_content_type: 'text/html',
      }),
    ).not.toThrow();
  });
});

// ──────────────────────────────────────────────────
// PLoT Error Envelopes
// ──────────────────────────────────────────────────

describe('PlotProxyTimeoutErrorSchema', () => {
  it('parses valid proxy timeout', () => {
    const error = {
      error: 'CEE_PROXY_TIMEOUT',
      message: 'PLoT proxy timed out after 105s',
      retryable: true,
      elapsed_ms: 105000,
      request_id: 'req-789',
    };
    expect(() => PlotProxyTimeoutErrorSchema.parse(error)).not.toThrow();
  });

  it('rejects wrong error literal', () => {
    expect(() =>
      PlotProxyTimeoutErrorSchema.parse({
        error: 'CEE_LLM_TIMEOUT',
        message: 'X',
        retryable: true,
        elapsed_ms: 1000,
        request_id: 'r',
      }),
    ).toThrow(ZodError);
  });
});

describe('PlotCeeUpstreamEnvelopeSchema', () => {
  it('parses valid upstream envelope', () => {
    const error = {
      error: 'CEE_UPSTREAM_ERROR',
      message: 'CEE returned non-JSON response',
      retryable: false,
      upstream_content_type: 'text/html',
      upstream_body_preview: '<html>Error</html>',
      elapsed_ms: 5000,
      request_id: 'req-000',
    };
    expect(() => PlotCeeUpstreamEnvelopeSchema.parse(error)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────
// Repairs
// ──────────────────────────────────────────────────

describe('RepairEntrySchema', () => {
  it('parses a valid repair entry', () => {
    const repair = {
      code: 'CLAMP_STD_MINIMUM',
      layer: 'plot',
      field_path: 'edges[0].strength.std',
      before: 0,
      after: 0.001,
      reason: 'strength.std must be > 0',
      severity: 'warn',
    };
    expect(() => RepairEntrySchema.parse(repair)).not.toThrow();
  });

  it('parses repair with null before', () => {
    const repair = {
      code: 'DEFAULT_EXISTS_PROBABILITY',
      layer: 'plot',
      field_path: 'edges[2].exists_probability',
      before: null,
      after: 0.8,
      reason: 'Missing value defaulted to 0.8',
      severity: 'info',
    };
    expect(() => RepairEntrySchema.parse(repair)).not.toThrow();
  });

  it('rejects unknown repair code', () => {
    expect(() =>
      RepairEntrySchema.parse({
        code: 'UNKNOWN_CODE',
        layer: 'plot',
        field_path: 'x',
        before: null,
        after: 1,
        reason: 'test',
        severity: 'info',
      }),
    ).toThrow(ZodError);
  });

  it('rejects invalid layer', () => {
    expect(() =>
      RepairEntrySchema.parse({
        code: 'CLAMP_STD_MINIMUM',
        layer: 'ui',
        field_path: 'x',
        before: null,
        after: 1,
        reason: 'test',
        severity: 'info',
      }),
    ).toThrow(ZodError);
  });

  it('accepts all valid repair codes', () => {
    const codes = Object.values(REPAIR_CODES);
    for (const code of codes) {
      expect(() =>
        RepairEntrySchema.parse({
          code,
          layer: 'plot',
          field_path: 'edges[0].x',
          before: null,
          after: 1,
          reason: 'test',
          severity: 'info',
        }),
      ).not.toThrow();
    }
  });

  it('accepts all valid layers', () => {
    for (const layer of ['cee', 'plot', 'isl'] as const) {
      expect(() =>
        RepairEntrySchema.parse({
          code: 'CLAMP_STD_MINIMUM',
          layer,
          field_path: 'x',
          before: null,
          after: 1,
          reason: 'test',
          severity: 'info',
        }),
      ).not.toThrow();
    }
  });
});

// ──────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────

describe('Constants', () => {
  describe('LIMITS', () => {
    it('MAX_NODES is 50', () => expect(LIMITS.MAX_NODES).toBe(50));
    it('MAX_EDGES is 100', () => expect(LIMITS.MAX_EDGES).toBe(100));
    it('MAX_OPTIONS is 10', () => expect(LIMITS.MAX_OPTIONS).toBe(10));
  });

  describe('STRENGTH_DEFAULT_SIGNATURE', () => {
    it('mean is 0.5', () => expect(STRENGTH_DEFAULT_SIGNATURE.mean).toBe(0.5));
    it('std is 0.125', () => expect(STRENGTH_DEFAULT_SIGNATURE.std).toBe(0.125));
  });

  describe('CIL_WARNING_CODES', () => {
    it('STRENGTH_DEFAULT_APPLIED exists', () => {
      expect(CIL_WARNING_CODES.STRENGTH_DEFAULT_APPLIED).toBe('STRENGTH_DEFAULT_APPLIED');
    });
    it('STRENGTH_MEAN_DEFAULT_DOMINANT exists', () => {
      expect(CIL_WARNING_CODES.STRENGTH_MEAN_DEFAULT_DOMINANT).toBe('STRENGTH_MEAN_DEFAULT_DOMINANT');
    });
    it('EDGE_STRENGTH_LOW exists', () => {
      expect(CIL_WARNING_CODES.EDGE_STRENGTH_LOW).toBe('EDGE_STRENGTH_LOW');
    });
    it('EDGE_STRENGTH_NEGLIGIBLE exists', () => {
      expect(CIL_WARNING_CODES.EDGE_STRENGTH_NEGLIGIBLE).toBe('EDGE_STRENGTH_NEGLIGIBLE');
    });
  });

  describe('CIL_WARNING_SEVERITY', () => {
    it('STRENGTH_DEFAULT_APPLIED is warn', () => {
      expect(CIL_WARNING_SEVERITY.STRENGTH_DEFAULT_APPLIED).toBe('warn');
    });
    it('EDGE_STRENGTH_LOW is info', () => {
      expect(CIL_WARNING_SEVERITY.EDGE_STRENGTH_LOW).toBe('info');
    });
  });

  describe('Detection thresholds', () => {
    it('STRENGTH_DEFAULT_THRESHOLD is 0.8', () => {
      expect(STRENGTH_DEFAULT_THRESHOLD).toBe(0.8);
    });
    it('STRENGTH_MEAN_DEFAULT_THRESHOLD is 0.7', () => {
      expect(STRENGTH_MEAN_DEFAULT_THRESHOLD).toBe(0.7);
    });
    it('STRENGTH_DEFAULT_MIN_EDGES is 3', () => {
      expect(STRENGTH_DEFAULT_MIN_EDGES).toBe(3);
    });
    it('EDGE_STRENGTH_LOW_THRESHOLD is 0.05', () => {
      expect(EDGE_STRENGTH_LOW_THRESHOLD).toBe(0.05);
    });
    it('EDGE_STRENGTH_NEGLIGIBLE_THRESHOLD is 0.1', () => {
      expect(EDGE_STRENGTH_NEGLIGIBLE_THRESHOLD).toBe(0.1);
    });
  });

  describe('REPAIR_CODES', () => {
    it('contains all expected codes', () => {
      expect(REPAIR_CODES.CLAMP_STD_MINIMUM).toBe('CLAMP_STD_MINIMUM');
      expect(REPAIR_CODES.DEFAULT_EXISTS_PROBABILITY).toBe('DEFAULT_EXISTS_PROBABILITY');
      expect(REPAIR_CODES.APPLY_SIGN_FROM_DIRECTION).toBe('APPLY_SIGN_FROM_DIRECTION');
      expect(REPAIR_CODES.RESOLVE_BELIEF_PRECEDENCE).toBe('RESOLVE_BELIEF_PRECEDENCE');
      expect(REPAIR_CODES.NORMALISE_STRENGTH_RANGE).toBe('NORMALISE_STRENGTH_RANGE');
      expect(REPAIR_CODES.INFER_EFFECT_DIRECTION).toBe('INFER_EFFECT_DIRECTION');
    });
  });
});

// ──────────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────────

describe('Enums', () => {
  describe('NodeKind', () => {
    it('contains all expected values', () => {
      const expected = ['goal', 'factor', 'outcome', 'risk', 'action', 'decision', 'option', 'constraint'];
      expect(NodeKind.options).toEqual(expected);
    });
  });

  describe('FactorCategory', () => {
    it('contains all expected values', () => {
      expect(FactorCategory.options).toEqual(['controllable', 'observable', 'external']);
    });
  });

  describe('ProductReadiness', () => {
    it('contains all expected values', () => {
      expect(ProductReadiness.options).toEqual(['ready', 'needs_encoding', 'needs_user_mapping']);
    });
  });

  describe('SeedSource', () => {
    it('contains all expected values', () => {
      expect(SeedSource.options).toEqual(['client_generated', 'server_generated']);
    });
  });

  describe('DetailLevel', () => {
    it('contains all expected values', () => {
      expect(DetailLevel.options).toEqual(['quick', 'standard', 'deep']);
    });
  });

  describe('RepairLayer', () => {
    it('contains all expected values', () => {
      expect(RepairLayer.options).toEqual(['cee', 'plot', 'isl']);
    });
  });
});

// ──────────────────────────────────────────────────
// Limits + validateGraphLimits
// ──────────────────────────────────────────────────

describe('validateGraphLimits', () => {
  it('returns empty array for graph within limits', () => {
    const graph = { nodes: new Array(50), edges: new Array(100) };
    expect(validateGraphLimits(graph)).toEqual([]);
  });

  it('detects nodes exceeding limit', () => {
    const graph = { nodes: new Array(51), edges: [] };
    const violations = validateGraphLimits(graph);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({ field: 'nodes', actual: 51, limit: 50 });
  });

  it('detects edges exceeding limit', () => {
    const graph = { nodes: [], edges: new Array(101) };
    const violations = validateGraphLimits(graph);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({ field: 'edges', actual: 101, limit: 100 });
  });

  it('detects options exceeding limit', () => {
    const graph = { nodes: [], edges: [] };
    const violations = validateGraphLimits(graph, new Array(11));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({ field: 'options', actual: 11, limit: 10 });
  });

  it('detects multiple violations', () => {
    const graph = { nodes: new Array(51), edges: new Array(101) };
    const violations = validateGraphLimits(graph, new Array(11));
    expect(violations).toHaveLength(3);
  });

  it('does not check options when not provided', () => {
    const graph = { nodes: [], edges: [] };
    expect(validateGraphLimits(graph)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────
// Fixture Validation
// ──────────────────────────────────────────────────

describe('Fixture: happy-path.json', () => {
  it('graph parses against GraphV3Schema', () => {
    const graph = GraphV3Schema.parse(happyPath.graph);
    expect(graph.nodes).toHaveLength(11);
    expect(graph.edges).toHaveLength(5);
  });

  it('analysis_ready parses against AnalysisReadyV3Schema', () => {
    const ready = AnalysisReadyV3Schema.parse(happyPath.analysis_ready);
    expect(ready.status).toBe('ready');
    expect(ready.options).toHaveLength(2);
    expect(ready.goal_node_id).toBe('goal:revenue');
  });

  it('response_meta parses against ResponseMetaSchema', () => {
    const meta = ResponseMetaSchema.parse(happyPath.response_meta);
    expect(meta.seed_used).toBe('42');
    expect(meta.seed_source).toBe('client_generated');
  });
});

describe('Fixture: blocked.json', () => {
  it('graph still parses (schema has no count refinement)', () => {
    expect(() => GraphV3Schema.parse(blocked.graph)).not.toThrow();
  });

  it('exceeds LIMITS.MAX_NODES when checked with validateGraphLimits', () => {
    const graph = GraphV3Schema.parse(blocked.graph);
    const violations = validateGraphLimits(graph);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].field).toBe('nodes');
    expect(violations[0].actual).toBe(51);
    expect(violations[0].limit).toBe(50);
  });
});

describe('Fixture: partial.json', () => {
  it('valid edges parse successfully', () => {
    for (const edge of (partial.graph.edges as Record<string, unknown[]>).valid) {
      expect(() => EdgeV3Schema.parse(edge)).not.toThrow();
    }
  });

  it('invalid edges are rejected', () => {
    const invalidEdges = (partial.graph.edges as Record<string, unknown[]>).invalid;

    // strength.mean out of range (1.5)
    expect(() => EdgeV3Schema.parse(invalidEdges[0])).toThrow(ZodError);

    // strength.std is zero
    expect(() => EdgeV3Schema.parse(invalidEdges[1])).toThrow(ZodError);

    // exists_probability out of range (1.5)
    expect(() => EdgeV3Schema.parse(invalidEdges[2])).toThrow(ZodError);

    // missing strength field entirely
    expect(() => EdgeV3Schema.parse(invalidEdges[3])).toThrow(ZodError);

    // boundary values (valid): mean=-1, std=0.001, exists_probability=0
    expect(() => EdgeV3Schema.parse(invalidEdges[4])).not.toThrow();

    // boundary values (valid): mean=1, std=0.001, exists_probability=1
    expect(() => EdgeV3Schema.parse(invalidEdges[5])).not.toThrow();
  });

  it('nodes parse successfully', () => {
    for (const node of partial.graph.nodes) {
      expect(() => NodeV3Schema.parse(node)).not.toThrow();
    }
  });
});

// ──────────────────────────────────────────────────
// v0.2.0 — New Exports
// ──────────────────────────────────────────────────

describe('New constants (v0.2.0)', () => {
  it('individual limit constants match LIMITS object', () => {
    expect(MAX_NODES).toBe(LIMITS.MAX_NODES);
    expect(MAX_EDGES).toBe(LIMITS.MAX_EDGES);
    expect(MAX_OPTIONS).toBe(LIMITS.MAX_OPTIONS);
    expect(MAX_CONSTRAINTS).toBe(LIMITS.MAX_CONSTRAINTS);
    expect(STD_FLOOR).toBe(LIMITS.STD_FLOOR);
    expect(STD_CEILING_RATIO).toBe(LIMITS.STD_CEILING_RATIO);
    expect(STD_CEILING_ABS).toBe(LIMITS.STD_CEILING_ABS);
    expect(DEFAULT_STD).toBe(LIMITS.DEFAULT_STD);
    expect(DEFAULT_EXISTS_PROBABILITY).toBe(LIMITS.DEFAULT_EXISTS_PROBABILITY);
    expect(STRENGTH_BOUNDS).toBe(LIMITS.STRENGTH_BOUNDS);
    expect(DEFAULT_SEED).toBe(LIMITS.DEFAULT_SEED);
  });

  it('MAX_CONSTRAINTS is 20', () => {
    expect(MAX_CONSTRAINTS).toBe(20);
  });

  it('STD_FLOOR is 0.001', () => {
    expect(STD_FLOOR).toBe(0.001);
  });

  it('DEFAULT_EXISTS_PROBABILITY is 0.8', () => {
    expect(DEFAULT_EXISTS_PROBABILITY).toBe(0.8);
  });

  it('DEFAULT_SEED is "42"', () => {
    expect(DEFAULT_SEED).toBe('42');
  });

  it('STRENGTH_BOUNDS has min=-1 max=1', () => {
    expect(STRENGTH_BOUNDS.min).toBe(-1.0);
    expect(STRENGTH_BOUNDS.max).toBe(1.0);
  });

  it('CIL_THRESHOLDS has correct values', () => {
    expect(CIL_THRESHOLDS.STRENGTH_DEFAULT_MEAN).toBe(0.5);
    expect(CIL_THRESHOLDS.STRENGTH_DEFAULT_STD).toBe(0.125);
    expect(CIL_THRESHOLDS.STRENGTH_DEFAULT_TOLERANCE).toBe(0.001);
    expect(CIL_THRESHOLDS.DEFAULTED_PERCENTAGE_WARN).toBe(50);
    expect(CIL_THRESHOLDS.REPAIR_WARN_THRESHOLD).toBe(5);
  });
});

describe('EffectDirection', () => {
  it('accepts positive, negative, unknown', () => {
    expect(EffectDirection.parse('positive')).toBe('positive');
    expect(EffectDirection.parse('negative')).toBe('negative');
    expect(EffectDirection.parse('unknown')).toBe('unknown');
  });

  it('rejects invalid values', () => {
    expect(() => EffectDirection.parse('up')).toThrow();
  });
});

describe('ConfidenceLevel', () => {
  it('accepts high, medium, low', () => {
    expect(ConfidenceLevel.parse('high')).toBe('high');
    expect(ConfidenceLevel.parse('medium')).toBe('medium');
    expect(ConfidenceLevel.parse('low')).toBe('low');
  });

  it('rejects invalid values', () => {
    expect(() => ConfidenceLevel.parse('very_high')).toThrow();
  });
});

describe('FactorSensitivitySchema', () => {
  const valid: FactorSensitivity = {
    node_id: 'factor:price',
    label: 'Price',
    importance_score: 0.85,
    sensitivity_score: 0.7,
    elasticity: 1.2,
    direction: 'positive',
    importance_rank: 1,
    confidence: 0.9,
  };

  it('parses a valid factor sensitivity', () => {
    expect(FactorSensitivitySchema.parse(valid)).toMatchObject(valid);
  });

  it('isFactorSensitivity returns true for valid', () => {
    expect(isFactorSensitivity(valid)).toBe(true);
  });

  it('isFactorSensitivity returns false for invalid', () => {
    expect(isFactorSensitivity({ node_id: 'x' })).toBe(false);
  });
});

describe('FragileEdgeSchema', () => {
  const valid: FragileEdge = {
    edge_id: 'price->revenue',
    from_id: 'factor:price',
    to_id: 'goal:revenue',
    current_strength: 0.3,
    threshold: 0.5,
    impact_on_outcome: 0.15,
  };

  it('parses a valid fragile edge', () => {
    expect(FragileEdgeSchema.parse(valid)).toMatchObject(valid);
  });

  it('isFragileEdge returns true for valid', () => {
    expect(isFragileEdge(valid)).toBe(true);
  });

  it('isFragileEdge returns false for invalid', () => {
    expect(isFragileEdge({ edge_id: 'x' })).toBe(false);
  });
});

describe('isFullyReady', () => {
  it('returns true when status is ready and options exist', () => {
    const ar = AnalysisReadyV3Schema.parse({
      status: 'ready',
      options: [{ id: 'opt1', label: 'A', status: 'ready', interventions: { x: 1 } }],
    });
    expect(isFullyReady(ar)).toBe(true);
  });

  it('returns false when status is needs_encoding', () => {
    const ar = AnalysisReadyV3Schema.parse({
      status: 'needs_encoding',
      options: [{ id: 'opt1', label: 'A', status: 'ready', interventions: { x: 1 } }],
    });
    expect(isFullyReady(ar)).toBe(false);
  });

  it('returns false when options are empty', () => {
    const ar = AnalysisReadyV3Schema.parse({
      status: 'ready',
      options: [],
    });
    expect(isFullyReady(ar)).toBe(false);
  });
});

describe('Type exports compile correctly', () => {
  it('ValidationBlocker type is usable', () => {
    const blocker: ValidationBlocker = {
      code: 'MISSING_GOAL',
      message: 'No goal node',
    };
    expect(blocker.code).toBe('MISSING_GOAL');
  });

  it('ValidationResult type is usable', () => {
    const result: ValidationResult = {
      canRun: false,
      blockers: [{ code: 'X', message: 'Y' }],
      warnings: [],
    };
    expect(result.canRun).toBe(false);
  });

  it('PlotRequestIdChain type is usable', () => {
    const chain: PlotRequestIdChain = {
      ui: 'abc',
      plot: 'def',
      isl: 'ghi',
      isl_echoed: 'ghi',
      all_match: true,
      chain_complete: true,
    };
    expect(chain.all_match).toBe(true);
  });

  it('ObservedStateType is inferrable from schema', () => {
    const os: ObservedStateType = ObservedStateSchema.parse({ value: 42 });
    expect(os.value).toBe(42);
  });

  it('PriorType is inferrable from schema', () => {
    const p: PriorType = { distribution: 'normal', range_min: 0, range_max: 100 };
    expect(p.distribution).toBe('normal');
  });

  it('EffectDirectionType works', () => {
    const d: EffectDirectionType = 'positive';
    expect(d).toBe('positive');
  });

  it('ConfidenceLevelType works', () => {
    const c: ConfidenceLevelType = 'high';
    expect(c).toBe('high');
  });

  it('SensitivityDirectionType works', () => {
    const s: SensitivityDirectionType = 'positive';
    expect(s).toBe('positive');
  });
});

import { describe, it, expect } from 'vitest';
import {
  OlumiResponseSchema,
  BoundaryErrorSchema,
  BlockSchema,
} from '../../src/boundary/index.js';

// v0.7.0 — realistic wire-shape fixtures the UI parser will encounter.
// Covers all seven block kinds plus BoundaryError with retryable boolean.

describe('OlumiResponse fixtures — v0.7.0', () => {
  it('accepts an analysis_result block with enrichment.decision_review', () => {
    const response = {
      response_version: 2 as const,
      assistant_text: 'Here is your analysis.',
      blocks: [
        {
          type: 'analysis_result' as const,
          summary: 'Option A leads by 12 points.',
          leading_option_id: 'opt-a',
          win_probabilities: { 'opt-a': 0.62, 'opt-b': 0.38 },
          enrichment: {
            decision_review: {
              readiness: 'ready',
              top_factors: [{ id: 'factor-1', impact: 0.4 }],
            },
            coaching_signal_id: 'FIRST_ANALYSIS_COMPLETE',
          },
        },
      ],
      suggested_actions: [],
      insights: [],
      stage_indicator: 'analyse' as const,
    };
    const r = OlumiResponseSchema.parse(response);
    expect(r).toEqual(response);
  });

  it('accepts a graph_patch block (applied status)', () => {
    const response = {
      response_version: 2 as const,
      assistant_text: 'Patch applied.',
      blocks: [
        {
          type: 'graph_patch' as const,
          status: 'applied' as const,
          operation: 'set_factor_value' as const,
          target_id: 'node-xyz',
          before: { value: 10 },
          after: { value: 42 },
        },
      ],
      suggested_actions: [],
      insights: [],
      stage_indicator: 'frame' as const,
    };
    expect(OlumiResponseSchema.parse(response)).toEqual(response);
  });

  it('accepts a graph_patch block with null before/after (noop)', () => {
    const response = {
      response_version: 2 as const,
      assistant_text: 'No change required.',
      blocks: [
        {
          type: 'graph_patch' as const,
          status: 'noop' as const,
          operation: 'adjust_edge_strength' as const,
          target_id: 'edge-1',
          before: null,
          after: null,
        },
      ],
      suggested_actions: [],
      insights: [],
      stage_indicator: 'frame' as const,
    };
    expect(OlumiResponseSchema.parse(response)).toEqual(response);
  });

  it('accepts an explanation block with referenced_option_ids', () => {
    const block = {
      type: 'explanation' as const,
      narrative: 'Option A wins because of factor X.',
      referenced_option_ids: ['opt-a', 'opt-b'],
    };
    expect(BlockSchema.parse(block)).toEqual(block);
  });

  it('accepts a comparison block', () => {
    const block = {
      type: 'comparison' as const,
      options: [
        { option_id: 'opt-a', label: 'A', win_probability: 0.6 },
        { option_id: 'opt-b', label: 'B', win_probability: 0.4 },
      ],
      narrative: 'A > B',
    };
    expect(BlockSchema.parse(block)).toEqual(block);
  });

  it('accepts a flip_analysis block', () => {
    const block = {
      type: 'flip_analysis' as const,
      narrative: 'Three factors could flip the outcome.',
      flip_scenarios: [
        {
          factor_id: 'f1',
          current_value: 0.5,
          flip_threshold: 0.7,
          from_option_id: 'opt-a',
          to_option_id: 'opt-b',
          fragile: false,
        },
      ],
    };
    expect(BlockSchema.parse(block)).toEqual(block);
  });

  it('accepts a response with suggested_actions carrying action_type', () => {
    const response = {
      response_version: 2 as const,
      assistant_text: 'Consider these next steps.',
      blocks: [],
      suggested_actions: [
        {
          id: 'chip-run',
          label: 'Run analysis',
          message: 'Run analysis',
          action_type: 'run_analysis' as const,
        },
      ],
      insights: [],
      stage_indicator: 'frame' as const,
    };
    expect(OlumiResponseSchema.parse(response)).toEqual(response);
  });
});

describe('BoundaryError fixtures — v0.7.0', () => {
  it('accepts a retryable error (UPSTREAM_TIMEOUT)', () => {
    const err = {
      error: 'UPSTREAM_TIMEOUT' as const,
      boundary: 'B4' as const,
      direction: 'egress' as const,
      validator: 'plot_run_v2',
      details: { timeout_ms: 120000 },
      request_id: 'req_abc',
      retryable: true,
    };
    expect(BoundaryErrorSchema.parse(err)).toEqual(err);
  });

  it('accepts a non-retryable error (TURN_BUDGET_EXCEEDED)', () => {
    const err = {
      error: 'TURN_BUDGET_EXCEEDED' as const,
      boundary: 'B1' as const,
      direction: 'ingress' as const,
      validator: 'turn_budget',
      details: { limit: 100, used: 101 },
      request_id: 'req_def',
      retryable: false,
    };
    expect(BoundaryErrorSchema.parse(err)).toEqual(err);
  });

  it('requires retryable as a top-level boolean (not in details)', () => {
    const err = {
      error: 'INTERNAL_ERROR' as const,
      boundary: 'B3' as const,
      direction: 'egress' as const,
      validator: 'x',
      details: { retryable: true },
      request_id: 'req_1',
    };
    const r = BoundaryErrorSchema.safeParse(err);
    expect(r.success).toBe(false);
  });
});

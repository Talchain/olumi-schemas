/**
 * @talchain/schemas — canonical regression fixtures for the
 * `HandlerFact` discriminated union.
 *
 * **Intentionally introduced as the canonical regression set for
 * HandlerFact union compatibility. Future HandlerFact variants
 * MUST add a fixture here.** This file is the single place reviewers
 * look to confirm a new variant did not break existing variants'
 * parse contract.
 *
 * Usage: `handler-fact-edit-graph.test.ts` loops over `HANDLER_FACT_FIXTURES`
 * and asserts every entry round-trips through `HandlerFactSchema.parse`
 * with its original `fact_type` literal preserved. Any subsequent
 * additive change to the union (new variant) must extend this map; any
 * breaking change to an existing variant will surface here as a parse
 * failure before reaching downstream consumers.
 *
 * Keep fixtures realistic — values that match production-like
 * shapes (real UUIDs for scenario_id, plausible labels, etc.) so a
 * future debugging session can copy a fixture into a repro.
 */

import type { HandlerFact } from '../../../src/orchestrator/handler-fact.js';

const SCENARIO_UUID = '11111111-1111-4111-8111-111111111111';

export const HANDLER_FACT_FIXTURES: Record<string, HandlerFact> = {
  run_analysis: {
    fact_type: 'run_analysis',
    fact_version: 1,
    noop: false,
    result: {
      scenario_id: SCENARIO_UUID,
      leading_option_id: 'opt_a',
      summary: 'Option A leads with 64% win probability.',
      win_probabilities: { opt_a: 0.64, opt_b: 0.36 },
      graph_hash_at_run: 'abcdef0123456789',
      computed_at: '2026-05-09T10:00:00.000Z',
    },
  },
  explain_result: {
    fact_type: 'explain_result',
    fact_version: 1,
    noop: false,
    result: {
      narrative: 'Option A leads because its expected value dominates B.',
      referenced_option_ids: ['opt_a', 'opt_b'],
    },
  },
  explain_results: {
    fact_type: 'explain_results',
    fact_version: 1,
    noop: false,
    result: {
      precondition_unmet: false,
      option_count: 2,
      answer_source: 'sonnet',
      fallback_reason: null,
      answer_text_length: 142,
      staleness_prefixed: false,
    },
  },
  explain_from_structure: {
    fact_type: 'explain_from_structure',
    fact_version: 1,
    noop: false,
    result: {
      option_count: 2,
      answer_source: 'sonnet',
      fallback_reason: null,
      answer_text_length: 98,
    },
  },
  compare_options: {
    fact_type: 'compare_options',
    fact_version: 1,
    noop: false,
    result: {
      options: [
        { option_id: 'opt_a', label: 'Option A', win_probability: 0.64 },
        { option_id: 'opt_b', label: 'Option B', win_probability: 0.36 },
      ],
      narrative: 'Option A leads on win probability.',
    },
  },
  what_would_flip: {
    fact_type: 'what_would_flip',
    fact_version: 1,
    noop: false,
    result: {
      precondition_unmet: false,
      option_count: 2,
      narrative: 'Increasing customer churn by 8% would flip the leader.',
      flip_scenarios: [{
        factor_id: 'fac_churn',
        current_value: 0.05,
        flip_threshold: 0.13,
        from_option_id: 'opt_a',
        to_option_id: 'opt_b',
        fragile: false,
      }],
      answer_source: 'sonnet',
      fallback_reason: null,
      answer_text_length: 76,
      staleness_prefixed: false,
    },
  },
  set_factor_value: {
    fact_type: 'set_factor_value',
    fact_version: 1,
    noop: false,
    result: {
      target_id: 'fac_churn',
      status: 'applied',
      before: { value: 0.04, raw_value: 4, unit: 'percent' },
      after: { value: 0.05, raw_value: 5, unit: 'percent' },
    },
  },
  add_constraint: {
    fact_type: 'add_constraint',
    fact_version: 1,
    noop: false,
    result: {
      target_id: 'con_cost_max',
      status: 'applied',
      before: null,
      after: {
        label: 'Total cost',
        operator: '<=',
        value: 100000,
        unit: 'GBP',
      },
    },
  },
  adjust_edge_strength: {
    fact_type: 'adjust_edge_strength',
    fact_version: 1,
    noop: false,
    result: {
      target_id: 'fac_price→goal_revenue',
      status: 'applied',
      before: {
        from: 'fac_price',
        to: 'goal_revenue',
        strength: { mean: 0.5, std: 0.1 },
        effect_direction: 'positive',
      },
      after: {
        from: 'fac_price',
        to: 'goal_revenue',
        strength: { mean: 0.7, std: 0.1 },
        effect_direction: 'positive',
      },
    },
  },
  edit_graph: {
    fact_type: 'edit_graph',
    fact_version: 1,
    noop: false,
    result: {
      edit_kind: 'parameter_update',
      status: 'applied',
      operations_count: 1,
      affected_entities: [
        { kind: 'factor', label: 'Price' },
      ],
      graph_hash_before: '0123456789abcdef',
      graph_hash_after: 'fedcba9876543210',
      safe_summary: 'Renamed price factor.',
      impact: 'low',
      rerun_recommended: false,
    },
  },
};

/**
 * Sentinel list mirroring the discriminated-union members. A new
 * variant MUST be added here AND a fixture MUST be added above.
 * The contract test asserts these two stay in sync.
 */
export const KNOWN_FACT_TYPES = [
  'run_analysis',
  'explain_result',
  'explain_results',
  'explain_from_structure',
  'compare_options',
  'what_would_flip',
  'set_factor_value',
  'add_constraint',
  'adjust_edge_strength',
  'edit_graph',
] as const;
export type KnownFactType = (typeof KNOWN_FACT_TYPES)[number];

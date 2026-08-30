import { describe, expect, it } from 'vitest';

import {
  CANONICAL_COMMITTED_RECEIPT_FIELD_CLASSIFICATION,
  CANONICAL_GRAPH_HASH_KEEP_LIST,
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
  CanonicalCommittedGraphBlockSchema,
  CanonicalCommittedGraphReceiptSchema,
  DraftGraphBlockSchema,
  OlumiResponseSchema,
  canonicalCommittedReceiptTopLevelFields,
} from '../../src/boundary/index.js';

const fullIntervention = {
  value: 0.62,
  value_type: 'continuous',
  encoding_map: { low: 0, high: 1 },
  target_match: { node_id: 'fac_cost', match_type: 'exact', confidence: 1 },
};

const canonical = {
  nodes: [
    {
      id: 'fac_cost',
      kind: 'factor',
      label: 'Cost',
      factor_type: 'continuous',
      intercept: 0.15,
      encoding_map: { low: 0, high: 1 },
      observed_state: { value: 0.4, baseline: 0.3, cap: 1 },
    },
  ],
  edges: [
    {
      from: 'fac_cost',
      to: 'goal_value',
      edge_type: 'directed',
      strength: { mean: -0.4, std: 0.1 },
      effect_direction: 'negative',
      exists_probability: 0.8,
    },
  ],
  options: [
    {
      id: 'opt_a',
      label: 'A',
      status: 'ready',
      is_baseline: false,
      interventions: { fac_cost: fullIntervention },
      raw_interventions: { fac_cost: 'high' },
    },
  ],
  goal_node_id: 'goal_value',
  goal_constraints: [],
  node_count: 1,
  edge_count: 1,
};

describe('0.43.0 canonical committed-graph receipt contract', () => {
  it('preserves legacy partial DraftGraphBlock reads unchanged', () => {
    const legacy = {
      type: 'draft_graph' as const,
      nodes: [{ id: 'n1' }],
      edges: [],
      node_count: 1,
      edge_count: 0,
    };
    expect(DraftGraphBlockSchema.parse(legacy)).toEqual(legacy);
  });

  it('requires own keys for every canonical hash carrier', () => {
    for (const key of ['options', 'goal_node_id', 'goal_constraints'] as const) {
      const { [key]: _missing, ...partial } = canonical;
      expect(
        CanonicalCommittedGraphReceiptSchema.safeParse(partial).success,
        `canonical receipt must require ${key}`,
      ).toBe(false);
    }
  });

  it('uses null/[] as explicit canonical absence and rejects an empty goal id', () => {
    const empty = {
      nodes: [],
      edges: [],
      options: [],
      goal_node_id: null,
      goal_constraints: [],
      node_count: 0,
      edge_count: 0,
    };
    const parsed = CanonicalCommittedGraphReceiptSchema.parse(empty);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'options')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'goal_node_id')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'goal_constraints')).toBe(true);
    expect(parsed).toEqual(empty);
    expect(
      CanonicalCommittedGraphReceiptSchema.safeParse({ ...empty, goal_node_id: '' }).success,
    ).toBe(false);
  });

  it('preserves every nested analysis-affecting option/node/edge field', () => {
    expect(CanonicalCommittedGraphReceiptSchema.parse(canonical)).toEqual(canonical);
  });

  it('requires derived counts to equal their canonical carrier arrays', () => {
    expect(
      CanonicalCommittedGraphReceiptSchema.safeParse({
        ...canonical,
        node_count: canonical.nodes.length + 1,
      }).success,
    ).toBe(false);
    expect(
      CanonicalCommittedGraphBlockSchema.safeParse({
        type: 'draft_graph',
        ...canonical,
        edge_count: canonical.edges.length + 1,
      }).success,
    ).toBe(false);

    // The old reader remains additive-compatible; only canonical producers
    // gain the cross-field invariant in 0.43.0.
    expect(
      DraftGraphBlockSchema.safeParse({
        type: 'draft_graph',
        nodes: canonical.nodes,
        edges: canonical.edges,
        node_count: 99,
        edge_count: 99,
      }).success,
    ).toBe(true);
  });

  it('has a strict block twin and reaches the response draft_graph projection', () => {
    const block = { type: 'draft_graph' as const, ...canonical };
    expect(CanonicalCommittedGraphBlockSchema.parse(block)).toEqual(block);
    expect(
      CanonicalCommittedGraphReceiptSchema.safeParse({ ...canonical, extra: true }).success,
    ).toBe(false);

    const response = OlumiResponseSchema.parse({
      response_version: 2,
      assistant_text: 'Committed.',
      blocks: [],
      suggested_actions: [],
      insights: [],
      stage_indicator: 'analyse',
      draft_graph: canonical,
    });
    expect(response.draft_graph).toEqual(canonical);
  });

  it('classifies every strict receipt field exactly once', () => {
    const classification = CANONICAL_COMMITTED_RECEIPT_FIELD_CLASSIFICATION;
    const classified = [
      ...classification.hash_carrier,
      ...classification.derived_metadata,
    ];
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(
      [...canonicalCommittedReceiptTopLevelFields()].sort(),
    );
    expect(classification.hash_carrier).toEqual(CANONICAL_GRAPH_HASH_KEEP_LIST);
    expect(classification.derived_metadata).toEqual(['node_count', 'edge_count']);
  });

  it('publishes the exact versioned nested hash projection vocabulary', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(3);
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION).toEqual({
      node: {
        fields: [
          'id',
          'kind',
          'category',
          'factor_type',
          'is_baseline',
          'goal_threshold',
          'goal_direction',
          'goal_threshold_frame',
          'goal_threshold_raw',
          'goal_threshold_cap',
          'intercept',
          'encoding_map',
        ],
        observed_state_fields: ['value', 'baseline', 'cap', 'std', 'source', 'value_tier'],
        prior_fields: ['distribution', 'range_min', 'range_max', 'source', 'value_tier', 'prior_is_unquantified', 'unit', 'cap', 'declared_scale'],
        interventions_field: 'interventions',
      },
      edge: {
        fields: ['from', 'to', 'edge_type', 'exists_probability', 'effect_direction'],
        strength_fields: ['mean', 'std'],
      },
      option: {
        fields: ['id', 'status', 'is_baseline'],
        interventions_field: 'interventions',
        conditional_field: {
          field: 'raw_interventions',
          include_when: { field: 'status', not_equals: 'ready' },
        },
      },
      intervention: {
        fields: ['value', 'value_type', 'encoding_map'],
        target_match_field: 'target_match',
        target_match_fields: ['node_id'],
      },
    });
  });
});

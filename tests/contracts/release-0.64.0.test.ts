// ============================================================================
// 0.64.0 — proposed-option participation enters the analysis revision.
//   Finding: Canonical #72 5887528088 — MEASURED with CEE's computeAnalysisAffectingGraphHash at staging 0497e52e: an
//   authorship-only change to an option (provenance + origin, on the node and the option) left the hash unchanged, so an
//   approved "add to comparison" would leave the Run that excluded the option reading CURRENT. Contract DL 5887534233
//   (one predicate for the Run filter and the hash; only the proposed bit; graphs with no proposal keep their hash).
//   Marker: MG 5887738387 — construction writes `proposed_by: 'olumi'` on the option node, never `'user'`.
//
//   · CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields gains `proposed_by` (appended; projection version 3 → 4).
//
// RED-first: before 0.64.0 `proposed_by` is absent from the vocabulary (version 3).
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
} from '../../src/boundary/graph-hash-contract.js';

describe('0.64.0 · which options are compared enters the analysis revision', () => {
  const fields: readonly string[] = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields;

  it('RED: node proposed_by is a hash input, appended LAST', () => {
    expect(fields[fields.length - 1]).toBe('proposed_by');
  });

  it('RED: the projection version moves 3 → 4 (the module\'s own bump rule)', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(4);
  });

  it('APPEND-ONLY: every pre-0.64.0 node field keeps its exact order as the prefix', () => {
    expect(fields.slice(0, -1)).toEqual([
      'id', 'kind', 'category', 'factor_type', 'is_baseline', 'goal_threshold', 'goal_threshold_raw', 'goal_threshold_cap',
      'intercept', 'encoding_map', 'goal_threshold_frame', 'goal_direction', 'quantity_frame',
      'scale_frame', 'nonlinear_identity', 'analysis_participation',
    ]);
  });

  it('CONTROL: authorship DISPLAY fields stay out — only the typed participation marker is hashed', () => {
    for (const display of ['provenance', 'origin', 'label', 'source_quote', 'brief_words']) {
      expect(fields, display).not.toContain(display);
    }
  });

  it('CONTROL: the other vocabularies are unchanged by this release', () => {
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields)
      .toEqual(['value', 'baseline', 'cap', 'source', 'unit', 'raw_value', 'std']);
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.edge.provenance_fields).toEqual(['source', 'magnitude']);
  });
});

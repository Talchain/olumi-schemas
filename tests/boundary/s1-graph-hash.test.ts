// ============================================================================
// 0.22.0 (S1) — graph-identity handshake:
//   * `graph_hash` on OlumiResponse (turn response / receipt)
//   * `computed_against_hash` on AnalysisResultBlock (analysis result)
//   * `GRAPH_DIVERGED` boundary error code + user-visible text
//   * the ONE canonical keep-list CONTRACT + a classification-completeness
//     guard that DERIVES the GraphV3 field set from the schema (a new graph
//     field fails the build until classified — trap-12, derive-don't-mirror)
//
// The keep-list floor is the CORRECTED one: it MUST cover goal_constraints
// (the design's own list omitted it → a hard-constraint edit would not move the
// hash → analysis reads FRESH after the user changed a constraint, S1 §D). That
// omission is pinned as a permanent regression guard below.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { OlumiResponseSchema } from '../../src/boundary/olumi-response.js';
import { AnalysisResultBlockSchema } from '../../src/boundary/blocks.js';
import {
  BoundaryErrorCode,
  FAILURE_USER_TEXT,
} from '../../src/boundary/error-codes.js';
import {
  CANONICAL_GRAPH_HASH_FUNCTION_NAME,
  CANONICAL_GRAPH_HASH_KEEP_LIST,
  CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS,
  CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS,
  GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS,
  graphV3TopLevelFields,
} from '../../src/boundary/graph-hash-contract.js';

function minimalResponse() {
  return {
    response_version: 2 as const,
    assistant_text: 'x',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'analyse' as const,
  };
}

describe('S1 wire fields — graph_hash / computed_against_hash', () => {
  it('OlumiResponse accepts graph_hash and remains valid without it (additive-optional)', () => {
    expect(OlumiResponseSchema.safeParse(minimalResponse()).success).toBe(true);
    const withHash = OlumiResponseSchema.safeParse({
      ...minimalResponse(),
      graph_hash: 'abc123',
    });
    expect(withHash.success).toBe(true);
    if (withHash.success) expect(withHash.data.graph_hash).toBe('abc123');
  });

  it('OlumiResponse rejects an empty graph_hash (min(1))', () => {
    expect(
      OlumiResponseSchema.safeParse({ ...minimalResponse(), graph_hash: '' }).success,
    ).toBe(false);
  });

  it('AnalysisResultBlock accepts computed_against_hash and is valid without it', () => {
    const base = { type: 'analysis_result', summary: 's', leading_option_id: 'o1' };
    expect(AnalysisResultBlockSchema.safeParse(base).success).toBe(true);
    const withHash = AnalysisResultBlockSchema.safeParse({
      ...base,
      computed_against_hash: 'abc123',
    });
    expect(withHash.success).toBe(true);
    if (withHash.success) expect(withHash.data.computed_against_hash).toBe('abc123');
  });
});

describe('S1 — GRAPH_DIVERGED error code', () => {
  it('GRAPH_DIVERGED is a BoundaryErrorCode member', () => {
    expect(BoundaryErrorCode.safeParse('GRAPH_DIVERGED').success).toBe(true);
  });

  it('has declared user-visible outcome text (fail-loud, not silent drop)', () => {
    expect(FAILURE_USER_TEXT.GRAPH_DIVERGED).toBeTruthy();
    expect(FAILURE_USER_TEXT.GRAPH_DIVERGED.length).toBeGreaterThan(10);
  });
});

describe('S1 — canonical graph-hash keep-list CONTRACT', () => {
  it('reserves the unambiguous canonical function name (no rival hash impl here)', () => {
    expect(CANONICAL_GRAPH_HASH_FUNCTION_NAME).toBe('computeCanonicalGraphHash');
  });

  it('the keep-list covers the CORRECTED floor — nodes, edges, options, goal_node_id, goal_constraints', () => {
    for (const field of ['nodes', 'edges', 'options', 'goal_node_id', 'goal_constraints']) {
      expect(
        CANONICAL_GRAPH_HASH_KEEP_LIST as readonly string[],
        `keep-list must cover analysis-affecting field '${field}'`,
      ).toContain(field);
    }
  });

  it('goal_constraints is in the keep-list — the S1 §D defect pin (a constraint edit MUST move the hash)', () => {
    // This is the specific omission the single-graph design shipped: without
    // goal_constraints, analysis read FRESH after a hard-constraint change.
    expect(CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS as readonly string[]).toContain(
      'goal_constraints',
    );
  });

  it('CLASSIFICATION COMPLETENESS — every GraphV3 field is hashed-or-excluded (derived from the schema)', () => {
    const classified = new Set<string>([
      ...CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS,
      ...GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS,
    ]);
    const unclassified = graphV3TopLevelFields().filter((f) => !classified.has(f));
    expect(
      unclassified,
      'A GraphV3 field is neither in the hash keep-list nor explicitly excluded. ' +
        'Classify it (hash it, or add to GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS with a reason) ' +
        '— an unclassified field silently changes hash coverage (trap-12).',
    ).toStrictEqual([]);
  });

  it('no stale exclusion — every excluded GraphV3 field still names a real field', () => {
    const real = new Set(graphV3TopLevelFields());
    const stale = (GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS as readonly string[]).filter(
      (f) => !real.has(f),
    );
    expect(stale).toStrictEqual([]);
  });

  it('derives a non-trivial GraphV3 field set (guards a vacuous pass)', () => {
    expect(graphV3TopLevelFields()).toEqual(expect.arrayContaining(['nodes', 'edges']));
  });
});

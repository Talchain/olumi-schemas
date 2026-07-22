// ============================================================================
// computeGraphHash BYTE-PARITY + MUTATION guard (0.21.0, manifest §5).
//
// Two guarantees this suite pins:
//
//  1. BYTE-PARITY. `identityParityGraph` hashes to a COMMITTED constant. CEE and
//     the UI each ship the mirror of this assertion against their OWN vendored
//     `computeGraphHash` (importing the same fixture) — that cross-repo trio is
//     what proves all three implementations agree byte-for-byte over the amended
//     surface after re-vendor (the thing three separate hash functions could
//     never give). The constant is literal here so ANY change to the projection
//     surface breaks this test loudly and forces a coordinated re-vendor.
//
//  2. MUTATION DISCRIMINATION (trap-4 / trap-11 — a guard that cannot fail is
//     theatre). Flipping an INCLUDED field MUST change the hash; flipping an
//     EXCLUDED field MUST NOT. Both directions are asserted, so the exclusion
//     list cannot silently start hashing (divergence-on-every-CEE-write) and the
//     inclusion list cannot silently stop (freshness reads stale after an edit).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { computeGraphHash } from '../src/graph-hash.js';
import {
  identityParityGraph,
  IDENTITY_PARITY_GRAPH_HASH,
} from '../src/fixtures/index.js';

// The committed expected hash. CEE + UI copy this literal into their own parity
// tests. If the projection surface changes, this line changes — deliberately, in
// the same PR that re-vendors every consumer.
const EXPECTED_PARITY_HASH = '4310378fc45ec344';

type Graph = Parameters<typeof computeGraphHash>[0];

/** Deep structured clone of the frozen fixture, so a mutation is local. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const BASE = computeGraphHash(identityParityGraph as unknown as Graph);

function withMutation(mutate: (g: Record<string, any>) => void): string | null {
  const g = clone(identityParityGraph) as Record<string, any>;
  mutate(g);
  return computeGraphHash(g as unknown as Graph);
}

describe('computeGraphHash byte-parity (manifest §5)', () => {
  it('the identity fixture hashes to the committed constant', () => {
    expect(computeGraphHash(identityParityGraph as unknown as Graph)).toBe(
      EXPECTED_PARITY_HASH,
    );
  });

  it('the fixture-exported constant matches the committed literal (no drift)', () => {
    expect(IDENTITY_PARITY_GRAPH_HASH).toBe(EXPECTED_PARITY_HASH);
  });

  it('is a 16-char lowercase hex string', () => {
    expect(BASE).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic across repeated calls', () => {
    expect(computeGraphHash(identityParityGraph as unknown as Graph)).toBe(BASE);
  });
});

describe('computeGraphHash — structural emptiness → null', () => {
  it('null / undefined / no-nodes are all null (no identity)', () => {
    expect(computeGraphHash(null)).toBeNull();
    expect(computeGraphHash(undefined)).toBeNull();
    expect(computeGraphHash({ nodes: [], edges: [] } as unknown as Graph)).toBeNull();
  });

  it('a single node yields a hash (has identity)', () => {
    expect(
      computeGraphHash({ nodes: [{ id: 'n1', kind: 'factor', label: 'x' }], edges: [] } as unknown as Graph),
    ).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('computeGraphHash — order independence', () => {
  it('reordering nodes / edges does not change the hash', () => {
    const reordered = withMutation((g) => {
      g.nodes.reverse();
      g.options.reverse();
      g.goal_constraints.reverse();
    });
    expect(reordered).toBe(BASE);
  });

  it('reordering object keys does not change the hash', () => {
    const g = clone(identityParityGraph) as Record<string, any>;
    const shuffledNode: Record<string, unknown> = {};
    for (const k of Object.keys(g.nodes[0]).reverse()) shuffledNode[k] = g.nodes[0][k];
    g.nodes[0] = shuffledNode;
    expect(computeGraphHash(g as unknown as Graph)).toBe(BASE);
  });
});

// ----------------------------------------------------------------------------
// MUTATION DISCRIMINATION — flipping INCLUDED changes, EXCLUDED does not.
// ----------------------------------------------------------------------------
describe('computeGraphHash — INCLUDED fields change the hash', () => {
  const cases: Array<[string, (g: Record<string, any>) => void]> = [
    ['node.observed_state.value', (g) => (g.nodes[0].observed_state.value = 99)],
    ['node.observed_state.std', (g) => (g.nodes[0].observed_state.std = 9.9)],
    ['node.goal_threshold', (g) => (g.nodes[0].goal_threshold = 12)],
    ['node.type', (g) => (g.nodes[0].type = 'ordinal')],
    ['node.category', (g) => (g.nodes[0].category = 'controllable')],
    ['node.state_space.range.max', (g) => (g.nodes[0].state_space.range.max = 200)],
    ['node.factor_type (passthrough)', (g) => (g.nodes[0].factor_type = 'external')],
    ['node.is_baseline (passthrough)', (g) => (g.nodes[0].is_baseline = true)],
    ['node.prior.range_max (passthrough)', (g) => (g.nodes[0].prior.range_max = 200)],
    ['node.intercept (passthrough)', (g) => (g.nodes[0].intercept = 0.9)],
    ['node.intervention.value', (g) => (g.nodes[0].interventions.fac_price.value = 999)],
    ['edge.strength.mean', (g) => (g.edges[0].strength.mean = -0.5)],
    ['edge.exists_probability', (g) => (g.edges[0].exists_probability = 0.1)],
    ['edge.effect_direction', (g) => (g.edges[0].effect_direction = 'negative')],
    ['edge.edge_type', (g) => (g.edges[0].edge_type = 'bidirected')],
    ['goal_node_id', (g) => (g.goal_node_id = 'fac_demand')],
    ['option.status', (g) => (g.options[1].status = 'ready')],
    ['option.interventions', (g) => (g.options[0].interventions.fac_demand = 1)],
    // Positive control for the option-path P1 pin: an object-valued option
    // intervention's HASHED subkey must enter identity (proves the routing reads
    // it at all — the anchor the EXCLUDED discriminators below stand on).
    ['option.intervention.value (object-valued, option path)', (g) => (g.options[1].interventions.fac_price.value = 999)],
    ['option.raw_interventions (non-ready)', (g) => (g.options[1].raw_interventions.fac_demand = 'low')],
    ['goal_constraint.value', (g) => (g.goal_constraints[0].value = 1)],
    ['goal_constraint.operator', (g) => (g.goal_constraints[0].operator = '>=')],
    ['adding a node', (g) => g.nodes.push({ id: 'fac_new', kind: 'factor', label: 'new' })],
    ['adding an edge', (g) => g.edges.push({ from: 'fac_demand', to: 'goal_revenue', strength: { mean: 0.1, std: 0.1 }, exists_probability: 0.5 })],
  ];
  for (const [label, mutate] of cases) {
    it(`${label} changes the hash`, () => {
      expect(withMutation(mutate)).not.toBe(BASE);
    });
  }
});

describe('computeGraphHash — EXCLUDED fields do NOT change the hash', () => {
  const cases: Array<[string, (g: Record<string, any>) => void]> = [
    ['node.label', (g) => (g.nodes[0].label = 'RENAMED')],
    ['node.body', (g) => (g.nodes[0].body = 'different description')],
    ['node.observed_state.unit', (g) => (g.nodes[0].observed_state.unit = 'OTHER')],
    ['node.observed_state.source', (g) => (g.nodes[0].observed_state.source = 'OTHER')],
    ['node.position (layout)', (g) => (g.nodes[0].position = { x: 1, y: 2 })],
    ['node.x / node.y (layout)', (g) => { g.nodes[0].x = 1; g.nodes[0].y = 2; }],
    ['node.intervention.unit (cosmetic sub-field)', (g) => (g.nodes[0].interventions.fac_price.unit = 'OTHER')],
    ['node.intervention.reasoning', (g) => (g.nodes[0].interventions.fac_price.reasoning = 'OTHER')],
    ['node.intervention.target_match.confidence', (g) => (g.nodes[0].interventions.fac_price.target_match.confidence = 0.1)],
    // P1 whitelist discriminators — an UNKNOWN passthrough subkey must NOT enter
    // identity. Under the old blacklist/wholesale projection these would LEAK
    // and change the hash; the whitelist drops them.
    ['node.intervention UNKNOWN future subkey (whitelist drops)', (g) => (g.nodes[0].interventions.fac_price.future_display_hint = 'x')],
    ['node.intervention.target_match UNKNOWN subkey (whitelist drops)', (g) => (g.nodes[0].interventions.fac_price.target_match.future_hint = 'x')],
    ['node.state_space UNKNOWN passthrough key (whitelist drops)', (g) => (g.nodes[0].state_space.future_axis = { foo: 1 })],
    ['node.state_space.range UNKNOWN subkey (whitelist drops)', (g) => (g.nodes[0].state_space.range.step = 5)],
    ['edge.label', (g) => (g.edges[0].label = 'RENAMED')],
    ['edge.validation (provenance)', (g) => (g.edges[0].validation = { status: 'warn' })],
    ['edge.defaulted', (g) => (g.edges[0].defaulted = true)],
    ['option.label', (g) => (g.options[0].label = 'RENAMED')],
    ['option.description', (g) => (g.options[0].description = 'different')],
    ['option.raw_interventions on a READY option', (g) => (g.options[0].raw_interventions.fac_demand = 'CHANGED')],
    // P1 option-path whitelist discriminators — an object-valued OPTION
    // intervention's EXCLUDED / UNKNOWN subkeys must NOT enter identity. Under
    // the old wholesale-copy projection (projectOption copying interventions raw)
    // these would LEAK and change the hash; routing through projectInterventionMap
    // drops them. Reverting that routing turns each of these RED (the pin).
    ['option.intervention.display_value (cosmetic, option path)', (g) => (g.options[1].interventions.fac_price.display_value = 'OTHER')],
    ['option.intervention.unit (cosmetic, option path)', (g) => (g.options[1].interventions.fac_price.unit = 'OTHER')],
    ['option.intervention.reasoning (cosmetic, option path)', (g) => (g.options[1].interventions.fac_price.reasoning = 'OTHER')],
    ['option.intervention UNKNOWN future subkey (whitelist drops, option path)', (g) => (g.options[1].interventions.fac_price.future_display_hint = 'x')],
    ['option.intervention.target_match.match_type (cosmetic, option path)', (g) => (g.options[1].interventions.fac_price.target_match.match_type = 'fuzzy')],
    ['option.intervention.target_match.confidence (cosmetic, option path)', (g) => (g.options[1].interventions.fac_price.target_match.confidence = 0.1)],
    ['top-level layout', (g) => (g.layout = { fac_demand: { x: 9, y: 9 } })],
    ['seed (reproducibility)', (g) => (g.seed = 1)],
    ['n_samples (reproducibility)', (g) => (g.n_samples = 5)],
    ['request_id (reproducibility)', (g) => (g.request_id = 'OTHER')],
    ['an unknown cosmetic passthrough field', (g) => (g.nodes[0].some_future_display_field = 'x')],
  ];
  for (const [label, mutate] of cases) {
    it(`${label} does NOT change the hash`, () => {
      expect(withMutation(mutate)).toBe(BASE);
    });
  }
});

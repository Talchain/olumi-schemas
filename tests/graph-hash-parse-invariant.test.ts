// ============================================================================
// computeGraphHash PARSE-NORMALISATION invariant (0.21.0, P0-2).
//
// THE DEFECT: `hash(graph) !== hash(GraphV3Schema.parse(graph))`. `EdgeV3`'s
// `edge_type` is `.optional().default('directed')`, so `.parse()` materialises
// `edge_type: 'directed'` on an edge that omitted it, while the raw wire object
// has no such key. A UI hashing the raw graph and a CEE hashing the parsed
// graph would then compute DIFFERENT identities for the same logical graph:
// silent divergence (the exact class the whole handshake exists to kill).
//
// THE FIX (derive, don't mirror): the projection normalises every Zod-DEFAULTED
// field to its declared default before hashing, and the default set is DERIVED
// from the live schemas (`SCHEMA_DEFAULTS`/`extractDefaults`). This suite pins:
//   (a) raw ≡ parsed for every fixture + a fuzz set (the invariant);
//   (b) omitted-default ≡ explicit-default (the normalisation, independent of
//       parse — this is the discriminating case: revert the normalisation and
//       it goes RED);
//   (c) the derivation actually sees the schema's one default, and would see a
//       newly-added one (anti-mirror positive control).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { computeGraphHash, extractDefaults, SCHEMA_DEFAULTS } from '../src/graph-hash.js';
import { GraphV3Schema, EdgeV3Schema, NodeV3Schema } from '../src/graph.js';
import { identityParityGraph } from '../src/fixtures/index.js';

type Graph = Parameters<typeof computeGraphHash>[0];

function hash(g: unknown): string | null {
  return computeGraphHash(g as Graph);
}

// A minimal valid graph whose single edge OMITS edge_type — the case that only
// passes once the projection normalises the Zod default.
const graphOmittingEdgeType = {
  nodes: [
    { id: 'a', kind: 'factor', label: 'A' },
    { id: 'b', kind: 'goal', label: 'B' },
  ],
  edges: [
    {
      from: 'a',
      to: 'b',
      strength: { mean: 0.5, std: 0.2 },
      exists_probability: 0.8,
      // edge_type deliberately omitted
    },
  ],
};

// The same graph with edge_type stated explicitly.
const graphWithEdgeType = {
  ...graphOmittingEdgeType,
  edges: [{ ...graphOmittingEdgeType.edges[0], edge_type: 'directed' }],
};

describe('P0-2 — hash(raw) === hash(GraphV3Schema.parse(raw)) for fixtures', () => {
  const fixtures: Array<[string, unknown]> = [
    ['identityParityGraph', identityParityGraph],
    ['graphOmittingEdgeType', graphOmittingEdgeType],
    ['graphWithEdgeType', graphWithEdgeType],
  ];
  for (const [name, raw] of fixtures) {
    it(`${name}: raw and parsed hash identically`, () => {
      const parsed = GraphV3Schema.parse(raw);
      expect(hash(raw)).toBe(hash(parsed));
    });
  }

  it('sanity: GraphV3Schema.parse really does materialise the edge_type default', () => {
    const parsed = GraphV3Schema.parse(graphOmittingEdgeType) as { edges: Array<{ edge_type?: string }> };
    // Confirms the defect precondition exists — the parse adds a key the raw lacks.
    expect(parsed.edges[0].edge_type).toBe('directed');
    expect((graphOmittingEdgeType.edges[0] as { edge_type?: string }).edge_type).toBeUndefined();
  });
});

describe('P0-2 — normalisation: omitting a defaulted field ≡ stating its default', () => {
  it('an edge without edge_type hashes the same as edge_type:"directed" (DISCRIMINATING)', () => {
    // This is the assertion that fails if the projection stops normalising.
    expect(hash(graphOmittingEdgeType)).toBe(hash(graphWithEdgeType));
    expect(hash(graphOmittingEdgeType)).not.toBeNull();
  });

  it('stating a NON-default edge_type still changes the hash (normalisation ≠ erasure)', () => {
    const bidirected = {
      ...graphOmittingEdgeType,
      edges: [{ ...graphOmittingEdgeType.edges[0], edge_type: 'bidirected' }],
    };
    expect(hash(bidirected)).not.toBe(hash(graphOmittingEdgeType));
  });
});

// ----------------------------------------------------------------------------
// Fuzz — random valid graphs, each hashed raw vs parsed. Every edge randomly
// omits edge_type and carries random cosmetic passthrough; the invariant must
// hold for all.
// ----------------------------------------------------------------------------
function rand(n: number): number {
  return Math.floor(Math.random() * n);
}

function randomValidGraph(): unknown {
  const nodeCount = 2 + rand(4);
  const ids = Array.from({ length: nodeCount }, (_, i) => `n${i}`);
  const nodes = ids.map((id, i) => {
    const node: Record<string, unknown> = {
      id,
      kind: i === 0 ? 'goal' : 'factor',
      label: `label ${id}`,
    };
    if (rand(2)) node.observed_state = { value: rand(100), std: 1 + rand(5) };
    if (rand(2)) node.some_cosmetic = `cosmetic ${rand(999)}`; // passthrough noise
    if (rand(2)) node.state_space = { range: { min: 0, max: 10 + rand(90) } };
    return node;
  });
  const edges: Array<Record<string, unknown>> = [];
  for (let i = 1; i < nodeCount; i++) {
    const edge: Record<string, unknown> = {
      from: ids[i],
      to: ids[rand(i)],
      strength: { mean: rand(3) / 2 - 0.5, std: 0.1 + rand(5) / 10 },
      exists_probability: rand(11) / 10,
    };
    // Randomly omit edge_type (the whole point) or set it.
    if (rand(2)) edge.edge_type = rand(2) ? 'directed' : 'bidirected';
    if (rand(2)) edge.label = `cosmetic edge ${i}`;
    edges.push(edge);
  }
  return { nodes, edges };
}

describe('P0-2 — fuzz: raw ≡ parsed over 300 random valid graphs', () => {
  it('every random graph hashes identically raw and parsed', () => {
    for (let i = 0; i < 300; i++) {
      const raw = randomValidGraph();
      const parsed = GraphV3Schema.parse(raw);
      expect(hash(raw), `iteration ${i}`).toBe(hash(parsed));
    }
  });
});

// ----------------------------------------------------------------------------
// Anti-mirror — the default set is DERIVED, and the derivation is proven.
// ----------------------------------------------------------------------------
describe('P0-2 — defaults are derived from the live schema (not hand-listed)', () => {
  it('extractDefaults(EdgeV3Schema) finds edge_type → "directed"', () => {
    expect(extractDefaults(EdgeV3Schema)).toEqual({ edge_type: 'directed' });
  });

  it('SCHEMA_DEFAULTS carries the edge default and empty maps for the rest', () => {
    expect(SCHEMA_DEFAULTS.EdgeV3Schema).toEqual({ edge_type: 'directed' });
    expect(SCHEMA_DEFAULTS.NodeV3Schema).toEqual({});
    expect(SCHEMA_DEFAULTS.OptionForAnalysisSchema).toEqual({});
  });

  it('POSITIVE CONTROL — a newly-added .default() on a schema IS derived', () => {
    const Extended = (NodeV3Schema as z.ZodObject<z.ZodRawShape>).extend({
      new_defaulted_field: z.string().optional().default('DFLT'),
    });
    expect(extractDefaults(Extended as z.ZodObject<z.ZodRawShape>)).toEqual({
      new_defaulted_field: 'DFLT',
    });
  });

  it('POSITIVE CONTROL — derives a default declared BELOW an optional wrapper', () => {
    const S = z.object({ f: z.number().default(7).optional() });
    expect(extractDefaults(S as unknown as z.ZodObject<z.ZodRawShape>)).toEqual({ f: 7 });
  });
});

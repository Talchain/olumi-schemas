// ============================================================================
// 0.67.0 — MG: a node's UNIT READING (who read which unit), and STABLE ENTITY REFS.
//   unit_reading — PTL "A" (Paul's funding brief: a funding goal read in GBP from "deals between £1-2 million");
//     proposal P0 SHARED DATA #75 5914707462; meaning AIQ 5914471584 / 5914731075; name MG 5914771697.
//   ref / ref_high_water — the carriers CEE #2357's graph writers persist (never renumbered, never reused).
//
// RED-first: before 0.67.0 NodeV3 passes both keys through unvalidated (passthrough), so a unit reading carrying a
// value, or with no author, parses; and a ref like "O0" or "OInfinity" parses.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS,
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
  GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS,
} from '../../src/boundary/graph-hash-contract.js';
import { EntityRefSchema, GraphV3Schema, NodeV3Schema, UnitReadingSchema } from '../../src/graph.js';

const node = (extra: Record<string, unknown> = {}) => ({ id: 'securing_funding', kind: 'goal', label: 'securing funding', ...extra });
const READING = { unit: 'GBP', source: 'olumi_reading', source_quote: 'investment firms that do deals between £1-2 million' };

describe('0.67.0 · unit_reading — which unit a quantity is read in, and who read it', () => {
  it('RED: Olumi\'s contextual reading parses and is carried verbatim', () => {
    const parsed = NodeV3Schema.parse(node({ unit_reading: READING })) as { unit_reading?: unknown };
    expect(parsed.unit_reading).toEqual(READING);
  });

  it('RED: a unit the user wrote is `user_stated`', () => {
    expect(UnitReadingSchema.parse({ unit: 'hours/week', source: 'user_stated', source_quote: '30 hours a week' }).source).toBe('user_stated');
  });

  it.each([
    ['a value riding on it (a unit is a reading, never a figure — AIQ 5914471584)', { ...READING, value: 1200000 }],
    ['a target riding on it', { ...READING, target: 1200000 }],
    ['no author', { unit: 'GBP', source_quote: READING.source_quote }],
    ['an author outside the two readings', { ...READING, source: 'brief_extraction' }],
    ['no quote (absence of the whole field is the only "unattested")', { unit: 'GBP', source: 'olumi_reading' }],
    ['an empty quote', { ...READING, source_quote: '' }],
    ['an empty unit', { ...READING, unit: '' }],
  ])('REFUSED: %s', (_name, bad) => {
    expect(UnitReadingSchema.safeParse(bad).success).toBe(false);
    expect(NodeV3Schema.safeParse(node({ unit_reading: bad })).success).toBe(false);
  });

  it('CONTROL: absent is today\'s node, unchanged', () => {
    const parsed = NodeV3Schema.parse(node()) as Record<string, unknown>;
    expect('unit_reading' in parsed).toBe(false);
  });
});

describe('0.67.0 · ref / ref_high_water — stable entity references (CEE #2357)', () => {
  it.each(['G1', 'O2', 'F3', 'OC1', 'R1', 'D1', 'A1', 'O999999999'])('RED: %s is a well-formed ref', (ref) => {
    expect((NodeV3Schema.parse(node({ ref })) as { ref?: string }).ref).toBe(ref);
  });

  it.each(['O0', 'O01', 'X1', 'o1', 'O1234567890', 'OInfinity', 'O-1', 'O1.5', ''])('REFUSED: %j', (ref) => {
    expect(EntityRefSchema.safeParse(ref).success).toBe(false);
    expect(NodeV3Schema.safeParse(node({ ref })).success).toBe(false);
  });

  it('RED: the graph carries its counter; a counter past 9 digits, negative or fractional is refused', () => {
    const graph = (hw: unknown) => ({ nodes: [node({ ref: 'G1' })], edges: [], ref_high_water: hw });
    expect((GraphV3Schema.parse(graph({ G: 1, O: 3 })) as { ref_high_water?: unknown }).ref_high_water).toEqual({ G: 1, O: 3 });
    for (const bad of [{ O: 1_000_000_000 }, { O: -1 }, { O: 1.5 }, { O: Number.POSITIVE_INFINITY }]) {
      expect(GraphV3Schema.safeParse(graph(bad)).success).toBe(false);
    }
  });

  it('CONTROL: a graph from before refs parses unchanged (no backfill)', () => {
    const parsed = GraphV3Schema.parse({ nodes: [node()], edges: [] }) as Record<string, unknown>;
    expect('ref_high_water' in parsed).toBe(false);
  });
});

describe('0.67.0 changes NO analysis hash input', () => {
  it('the analysis projection holds none of the new keys (0.67.0 does not bump it)', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBeGreaterThanOrEqual(5); // a later release may bump it; 0.67.0 does not
    const all = Object.values(CANONICAL_GRAPH_HASH_NESTED_PROJECTION).flatMap((v) => [...v.fields]);
    for (const key of ['ref', 'ref_high_water', 'unit_reading']) expect(all).not.toContain(key);
  });

  it('`ref_high_water` is CLASSIFIED as excluded from the graph hash (a counter, not content), never left unclassified', () => {
    expect(GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS as readonly string[]).toEqual(['ref_high_water']);
    expect(CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS as readonly string[]).not.toContain('ref_high_water');
  });
});

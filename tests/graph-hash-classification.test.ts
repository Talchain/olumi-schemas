// ============================================================================
// computeGraphHash CLASSIFICATION-COMPLETENESS guard (0.21.0, manifest §4).
//
// THE FAIL-LOUD MECHANISM (trap-12 — the dominant defect on this platform is a
// hand-maintained mirror that drifts silently green). computeGraphHash reads a
// WHITELIST of analysis-affecting fields. The whitelist is a human decision
// registry (GRAPH_HASH_CLASSIFICATION: is a field hashed or excluded?), and a
// hand list of "which fields exist" WOULD rot the instant someone adds a schema
// field. So the completeness of the registry is not trusted — it is DERIVED:
//
//   This test walks the LIVE Zod shapes of the participating schemas
//   (GRAPH_HASH_CLASSIFIED_SCHEMAS) and requires EVERY declared field — and
//   every nested declared sub-field of a HASHED object — to carry an explicit
//   `hashed` / `excluded` disposition. A field in neither FAILS THE BUILD
//   (npm test = build && vitest). A registry key that matches no declared field
//   (a stale mirror entry) ALSO fails.
//
// This is what stops a future schema field (e.g. a new observed_state
// sub-field) from silently falling out of the identity surface and re-opening
// the "analysis reads fresh after a real edit" class.
//
// POSITIVE CONTROL (trap-13 — an absence assertion is vacuous unless it can see
// a presence): the derivation is proven to FLAG an unclassified field by
// extending a real schema with a new field and asserting the walker reports it.
// An empty/short-circuited walk cannot pass this suite.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  GRAPH_HASH_CLASSIFICATION,
  GRAPH_HASH_CLASSIFIED_SCHEMAS,
  GRAPH_HASH_SUBTREE_CLASSIFICATION,
} from '../src/graph-hash.js';
import { identityParityGraph } from '../src/fixtures/index.js';

// ----------------------------------------------------------------------------
// Peel the wrappers Zod puts between a field declaration and its core shape,
// so `.shape` / `instanceof ZodObject` see through optional / nullable /
// default / effects. (A local, deliberately small unwrap — the participating
// schemas use only these wrappers.)
// ----------------------------------------------------------------------------
function unwrap(schema: z.ZodTypeAny, depth = 0): z.ZodTypeAny {
  if (depth > 20) return schema;
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodReadonly
  ) {
    return unwrap(def.innerType as z.ZodTypeAny, depth + 1);
  }
  if (schema instanceof z.ZodEffects) return unwrap(def.schema as z.ZodTypeAny, depth + 1);
  return schema;
}

interface ClassifiedSchema {
  name: string;
  schema: z.ZodObject<z.ZodRawShape>;
}

interface Gaps {
  /** Declared field paths with no `hashed`/`excluded` disposition. */
  unclassified: string[];
  /** Registry keys that match no declared field path (stale mirror entries). */
  stale: string[];
  /** Every declared path the walk reached (the derived universe). */
  universe: string[];
}

/**
 * Walk the live shapes and derive the full declared-field universe, descending
 * into HASHED nested objects only (an EXCLUDED object's whole subtree is out of
 * scope by construction). Compare it against the registry both ways.
 */
function deriveGaps(
  classified: readonly ClassifiedSchema[],
  classification: Readonly<Record<string, string>>,
): Gaps {
  const universe: string[] = [];
  const unclassified: string[] = [];

  function walk(prefix: string, schema: z.ZodObject<z.ZodRawShape>): void {
    const shape = schema.shape;
    for (const key of Object.keys(shape)) {
      const path = `${prefix}.${key}`;
      universe.push(path);
      const disposition = classification[path];
      if (disposition === undefined) {
        unclassified.push(path);
        continue; // unknown disposition → cannot decide whether to recurse
      }
      if (disposition === 'hashed') {
        const core = unwrap(shape[key]);
        if (core instanceof z.ZodObject) {
          walk(path, core as z.ZodObject<z.ZodRawShape>);
        }
      }
      // 'excluded' → do not descend; the whole subtree is out.
    }
  }

  for (const { name, schema } of classified) walk(name, schema);

  const universeSet = new Set(universe);
  const stale = Object.keys(classification).filter((k) => !universeSet.has(k));
  return { unclassified, stale, universe };
}

describe('computeGraphHash classification completeness — derived, fail-loud (manifest §4)', () => {
  const gaps = deriveGaps(GRAPH_HASH_CLASSIFIED_SCHEMAS, GRAPH_HASH_CLASSIFICATION);

  it('every declared field of the identity surface is classified hashed-or-excluded', () => {
    expect(
      gaps.unclassified,
      'These declared schema fields have NO hashed/excluded disposition in ' +
        'GRAPH_HASH_CLASSIFICATION (src/graph-hash.ts). Each is a field that ' +
        'would silently fall out of — or into — the graph-identity surface. ' +
        'Classify each one explicitly:\n  ' +
        gaps.unclassified.join('\n  '),
    ).toEqual([]);
  });

  it('the registry carries no stale key (every key matches a live declared field)', () => {
    expect(
      gaps.stale,
      'These GRAPH_HASH_CLASSIFICATION keys match no declared field on the live ' +
        'schemas — a stale mirror entry silently widens or narrows the surface. ' +
        'Delete them:\n  ' +
        gaps.stale.join('\n  '),
    ).toEqual([]);
  });

  it('the walk reached a non-trivial surface (anti-vacuity — a short-circuited walk cannot pass)', () => {
    // If the enumeration broke, "0 unclassified" would be a vacuous pass.
    expect(gaps.universe.length).toBeGreaterThan(30);
  });

  // --------------------------------------------------------------------------
  // POSITIVE CONTROL — the derivation provably SEES an unclassified field.
  // --------------------------------------------------------------------------
  it('flags a newly-added, unclassified declared field (positive control)', () => {
    const base = GRAPH_HASH_CLASSIFIED_SCHEMAS[1]; // NodeV3Schema
    const Extended = (base.schema as z.ZodObject<z.ZodRawShape>).extend({
      classification_positive_control_field: z.string().optional(),
    });
    const control = deriveGaps(
      [{ name: 'NodeV3Schema', schema: Extended as z.ZodObject<z.ZodRawShape> }],
      GRAPH_HASH_CLASSIFICATION,
    );
    expect(control.unclassified).toContain(
      'NodeV3Schema.classification_positive_control_field',
    );
  });

  it('classifying the new field clears the gap (the guard is satisfiable, not just noisy)', () => {
    const base = GRAPH_HASH_CLASSIFIED_SCHEMAS[1];
    const Extended = (base.schema as z.ZodObject<z.ZodRawShape>).extend({
      classification_positive_control_field: z.string().optional(),
    });
    const control = deriveGaps(
      [{ name: 'NodeV3Schema', schema: Extended as z.ZodObject<z.ZodRawShape> }],
      {
        ...GRAPH_HASH_CLASSIFICATION,
        'NodeV3Schema.classification_positive_control_field': 'excluded',
      },
    );
    expect(control.unclassified).not.toContain(
      'NodeV3Schema.classification_positive_control_field',
    );
  });

  it('a new sub-field of a HASHED nested object is also caught (recursion is real)', () => {
    // observed_state is HASHED, so the walker must descend and police its
    // sub-fields — the exact "new observed_state sub-field silently drops"
    // class manifest §4 names.
    const ObservedWithNew = z
      .object({
        value: z.number(),
        classification_nested_control: z.string().optional(),
      })
      .passthrough();
    const NodeWithNew = z
      .object({
        id: z.string(),
        kind: z.string(),
        observed_state: ObservedWithNew.optional(),
      })
      .passthrough();
    const control = deriveGaps(
      [{ name: 'NodeV3Schema', schema: NodeWithNew as z.ZodObject<z.ZodRawShape> }],
      GRAPH_HASH_CLASSIFICATION,
    );
    expect(control.unclassified).toContain(
      'NodeV3Schema.observed_state.classification_nested_control',
    );
  });
});

// ============================================================================
// SUBTREE completeness (0.21.0, P1) — the passthrough subtrees that have NO Zod
// schema to derive from (node/option `interventions` entries and their nested
// `target_match`). These are the subtrees the projection now WHITELISTS; a
// hand whitelist is exactly the mirror class (trap-12), so its completeness is
// made fail-loud against the EXHAUSTIVE parity fixture: every subtree key the
// fixture carries must appear in GRAPH_HASH_SUBTREE_CLASSIFICATION as `hashed`
// or `excluded`. The fixture is the presence source (trap-13): it is designed
// to carry every INCLUDED key + at least one EXCLUDED key at each subtree, so a
// NEW wire subkey riding the fixture with no disposition fails the build.
//
// The projection reads the SAME arrays this test polices (one source of truth),
// so a key hashed here is a key hashed there — they cannot drift apart.
// ============================================================================
type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Collect every observed key of each passthrough subtree from a graph. */
function collectSubtreeKeys(graph: Json): { Intervention: string[]; TargetMatch: string[] } {
  const intervention = new Set<string>();
  const targetMatch = new Set<string>();
  const scanMap = (map: unknown): void => {
    if (!isPlainObject(map)) return;
    for (const entry of Object.values(map)) {
      if (!isPlainObject(entry)) continue; // scalar option intervention → no subtree
      for (const k of Object.keys(entry)) intervention.add(k);
      if (isPlainObject(entry.target_match)) {
        for (const k of Object.keys(entry.target_match)) targetMatch.add(k);
      }
    }
  };
  for (const n of (graph.nodes as unknown[]) ?? []) {
    if (isPlainObject(n)) scanMap(n.interventions);
  }
  for (const o of (graph.options as unknown[]) ?? []) {
    if (isPlainObject(o)) scanMap(o.interventions);
  }
  return { Intervention: [...intervention], TargetMatch: [...targetMatch] };
}

function subtreeGaps(
  graph: Json,
  classification: typeof GRAPH_HASH_SUBTREE_CLASSIFICATION,
): { unclassified: string[]; observed: string[] } {
  const observedByCtx = collectSubtreeKeys(graph);
  const unclassified: string[] = [];
  const observed: string[] = [];
  for (const ctx of Object.keys(observedByCtx) as Array<keyof typeof observedByCtx>) {
    const reg = classification[ctx];
    for (const key of observedByCtx[ctx]) {
      observed.push(`${ctx}.${key}`);
      const known = reg.hashed.includes(key) || reg.excluded.includes(key);
      if (!known) unclassified.push(`${ctx}.${key}`);
    }
  }
  return { unclassified, observed };
}

/** Deep clone so a mutation on the frozen fixture is local. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe('computeGraphHash SUBTREE classification completeness — fail-loud (P1)', () => {
  const fixture = identityParityGraph as unknown as Json;

  it('every observed intervention / target_match subkey in the fixture is classified', () => {
    const gaps = subtreeGaps(fixture, GRAPH_HASH_SUBTREE_CLASSIFICATION);
    expect(
      gaps.unclassified,
      'These passthrough subtree keys have NO hashed/excluded disposition in ' +
        'GRAPH_HASH_SUBTREE_CLASSIFICATION (src/graph-hash.ts). Each would silently ' +
        'leak into — or drop out of — the identity surface. Classify each:\n  ' +
        gaps.unclassified.join('\n  '),
    ).toEqual([]);
  });

  it('the walk reached both subtrees non-trivially (anti-vacuity)', () => {
    const gaps = subtreeGaps(fixture, GRAPH_HASH_SUBTREE_CLASSIFICATION);
    // 9 intervention keys + 3 target_match keys in the exhaustive fixture.
    expect(gaps.observed.length).toBeGreaterThanOrEqual(12);
    expect(gaps.observed).toContain('Intervention.value');
    expect(gaps.observed).toContain('Intervention.display_value'); // an EXCLUDED one
    expect(gaps.observed).toContain('TargetMatch.node_id');
    expect(gaps.observed).toContain('TargetMatch.match_type'); // an EXCLUDED one
  });

  it('POSITIVE CONTROL — a new UNCLASSIFIED intervention subkey is flagged', () => {
    const g = clone(fixture);
    (((g.nodes as Json[])[0].interventions as Json).fac_price as Json).future_subkey = 'x';
    const gaps = subtreeGaps(g, GRAPH_HASH_SUBTREE_CLASSIFICATION);
    expect(gaps.unclassified).toContain('Intervention.future_subkey');
  });

  it('POSITIVE CONTROL — a new UNCLASSIFIED target_match subkey is flagged', () => {
    const g = clone(fixture);
    (
      (((g.nodes as Json[])[0].interventions as Json).fac_price as Json).target_match as Json
    ).future_tm_subkey = 'x';
    const gaps = subtreeGaps(g, GRAPH_HASH_SUBTREE_CLASSIFICATION);
    expect(gaps.unclassified).toContain('TargetMatch.future_tm_subkey');
  });

  it('classifying the new subkey clears the gap (satisfiable, not just noisy)', () => {
    const g = clone(fixture);
    (((g.nodes as Json[])[0].interventions as Json).fac_price as Json).future_subkey = 'x';
    const extended = {
      ...GRAPH_HASH_SUBTREE_CLASSIFICATION,
      Intervention: {
        hashed: GRAPH_HASH_SUBTREE_CLASSIFICATION.Intervention.hashed,
        excluded: [...GRAPH_HASH_SUBTREE_CLASSIFICATION.Intervention.excluded, 'future_subkey'],
      },
    } as typeof GRAPH_HASH_SUBTREE_CLASSIFICATION;
    const gaps = subtreeGaps(g, extended);
    expect(gaps.unclassified).not.toContain('Intervention.future_subkey');
  });
});

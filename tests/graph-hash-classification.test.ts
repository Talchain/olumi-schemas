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
} from '../src/graph-hash.js';

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

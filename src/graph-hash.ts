import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GraphV3Schema, NodeV3Schema, EdgeV3Schema } from './graph.js';
import { OptionForAnalysisSchema } from './analysis.js';
import { DraftGoalConstraintSchema } from './boundary/blocks.js';
import type { GraphV3 } from './graph.js';

// ============================================================================
// computeGraphHash — the ONE canonical graph-IDENTITY hash (schemas 0.21.0).
//
// WHY THIS IS THE CENTREPIECE OF THE BUMP: before 0.21.0 the package exported
// NO hash function. Graph identity was computed independently in ≥8 places
// (CEE `computeAnalysisAffectingGraphHash`, UI `generateGraphHash`, several
// CEE internal variants) with ZERO cross-comparable UI↔CEE pairs — the "hash
// babel" (SINGLE-GRAPH-DESIGN v2 §1/§4). A turn's `graph_hash` (request) and a
// response's `computed_against_hash` could never be compared byte-for-byte
// across the two repos, so freshness/divergence was structurally unprovable.
//
// This function is the single definition BOTH CEE and the UI adopt (re-vendor
// + call the vendored fn). After adoption, `graph_hash === computed_against_hash`
// is a meaningful equality: agreement is guaranteed BY CONSTRUCTION (same code,
// same input) — the byte-parity fixture (src/fixtures/index.ts +
// tests/graph-hash-parity.test.ts) is what proves the two repos agree over the
// AMENDED surface, the thing three separate hash functions could never give.
//
// SURFACE = analysis-affecting fields only (SINGLE-GRAPH-DESIGN v2 §2,
// schemas-0.21.0-manifest §3, floored on CEE's live
// `computeAnalysisAffectingGraphHash` whitelist):
//   INCLUDES  nodes (semantics), edges (semantics), options, goal_node_id, and
//             — the S1 §D/§F.1 defect fix — goal_constraints (v1's keep-list
//             omitted it, so a hard-constraint edit read FRESH).
//   EXCLUDES  labels / descriptions / provenance / display fields, layout &
//             positions (the two-writer asymmetry: the CEE server writer strips
//             layout while the UI writer carries it — a position-bearing hash
//             would read every CEE write as divergence; excluding layout also
//             makes CAS no-op on hash-equality for layout-only ticks while
//             positions still persist), and Monte-Carlo reproducibility config
//             (seed / n_samples / request_id).
//
// WHITELIST, not blacklist, BY DESIGN: only the enumerated fields are read, so
// two writers that happen to carry DIFFERENT extra passthrough keys (the exact
// layout asymmetry above) still agree. A blacklist would diverge the moment one
// writer emitted a field the other did not.
//
// FAIL-LOUD COMPLETENESS (trap-12 — the dominant defect class is a
// hand-maintained mirror that drifts silently): the classification below is a
// deliberate human decision registry (is a field analysis-affecting?), but its
// COMPLETENESS is DERIVED. `tests/graph-hash-classification.test.ts` walks the
// live Zod shapes of the participating schemas and FAILS THE BUILD if any
// declared field (or nested declared sub-field of a hashed object) is absent
// from GRAPH_HASH_CLASSIFICATION. A new `observed_state` sub-field, a new node
// key — anything added to the schema without a conscious hashed/excluded call —
// turns the build RED. The mirror cannot drift green.
// ============================================================================

/** One field's identity disposition. */
export type GraphHashDisposition = 'hashed' | 'excluded';

/**
 * The classification registry. Keys are `<SchemaName>.<dotted.path>` where the
 * dotted path descends into a HASHED nested object (so a new sub-field of a
 * hashed object is policed too). EXCLUDED objects are not descended — the whole
 * subtree is out.
 *
 * This is the human decision. Its COMPLETENESS against the live schema is
 * enforced by tests/graph-hash-classification.test.ts (derive-don't-mirror):
 * an unclassified declared field fails the build; a stale key (no matching
 * declared field) also fails.
 *
 * DECISIONS beyond CEE's abbreviated floor list, flagged for review at CEE
 * adoption (all in the SAFE, over-detect direction):
 *   - node.type / node.categories / node.state_space — HASHED. They define the
 *     variable's value domain/encoding, which is analysis-affecting. CEE's
 *     richer graph carries this in prior/encoding_map (passthrough, also
 *     hashed); the thin GraphV3 carries it here. Confirm at CEE adoption.
 *   - observed_state.std — HASHED (uncertainty is analysis-affecting; the floor
 *     list abbreviated observed_state to {value,baseline,cap}).
 *   - goal_constraints — the WHOLE constraint object is hashed (manifest §3
 *     "whole array, stableStringify passthrough"). Provenance/display sub-fields
 *     of a constraint therefore participate; this is the manifest's explicit
 *     choice and the safe (over-detect) direction. Narrowable if Paul prefers.
 */
export const GRAPH_HASH_CLASSIFICATION: Readonly<
  Record<string, GraphHashDisposition>
> = Object.freeze({
  // --- GraphV3 top-level (declared) -----------------------------------------
  // NOTE: options / goal_node_id / goal_constraints ride GraphV3's
  // `.passthrough()` (not declared keys) and are hashed by explicit read in
  // projectGraph(); they are not in this walk because they are not in the
  // declared shape. If they are ever promoted to declared GraphV3 keys, the
  // classification test will require classifying them here.
  'GraphV3Schema.nodes': 'hashed',
  'GraphV3Schema.edges': 'hashed',

  // --- NodeV3 (declared) ----------------------------------------------------
  'NodeV3Schema.id': 'hashed',
  'NodeV3Schema.kind': 'hashed',
  'NodeV3Schema.category': 'hashed',
  'NodeV3Schema.type': 'hashed',
  'NodeV3Schema.categories': 'hashed',
  'NodeV3Schema.observed_state': 'hashed',
  'NodeV3Schema.observed_state.value': 'hashed',
  'NodeV3Schema.observed_state.std': 'hashed',
  'NodeV3Schema.observed_state.baseline': 'hashed',
  'NodeV3Schema.observed_state.unit': 'excluded',
  'NodeV3Schema.observed_state.source': 'excluded',
  'NodeV3Schema.state_space': 'hashed',
  'NodeV3Schema.state_space.range': 'hashed',
  'NodeV3Schema.state_space.range.min': 'hashed',
  'NodeV3Schema.state_space.range.max': 'hashed',
  'NodeV3Schema.goal_threshold': 'hashed',
  'NodeV3Schema.label': 'excluded',
  'NodeV3Schema.body': 'excluded',

  // --- EdgeV3 (declared) ----------------------------------------------------
  'EdgeV3Schema.from': 'hashed',
  'EdgeV3Schema.to': 'hashed',
  'EdgeV3Schema.strength': 'hashed',
  'EdgeV3Schema.strength.mean': 'hashed',
  'EdgeV3Schema.strength.std': 'hashed',
  'EdgeV3Schema.exists_probability': 'hashed',
  'EdgeV3Schema.effect_direction': 'hashed',
  'EdgeV3Schema.edge_type': 'hashed',
  'EdgeV3Schema.label': 'excluded',

  // --- OptionForAnalysis (declared) -----------------------------------------
  'OptionForAnalysisSchema.id': 'hashed',
  'OptionForAnalysisSchema.status': 'hashed',
  'OptionForAnalysisSchema.interventions': 'hashed',
  'OptionForAnalysisSchema.raw_interventions': 'hashed',
  'OptionForAnalysisSchema.label': 'excluded',
  'OptionForAnalysisSchema.description': 'excluded',

  // --- DraftGoalConstraint (whole-array hashed — manifest §3) ---------------
  'DraftGoalConstraintSchema.constraint_id': 'hashed',
  'DraftGoalConstraintSchema.node_id': 'hashed',
  'DraftGoalConstraintSchema.operator': 'hashed',
  'DraftGoalConstraintSchema.value': 'hashed',
  'DraftGoalConstraintSchema.label': 'hashed',
  'DraftGoalConstraintSchema.unit': 'hashed',
  'DraftGoalConstraintSchema.source_quote': 'hashed',
  'DraftGoalConstraintSchema.confidence': 'hashed',
  'DraftGoalConstraintSchema.provenance': 'hashed',
  'DraftGoalConstraintSchema.deadline_metadata': 'hashed',
  'DraftGoalConstraintSchema.deadline_metadata.deadline_date': 'hashed',
  'DraftGoalConstraintSchema.deadline_metadata.reference_date': 'hashed',
  'DraftGoalConstraintSchema.deadline_metadata.assumed_reference_date': 'hashed',
  'DraftGoalConstraintSchema.provenance_unit_normalised': 'hashed',
  'DraftGoalConstraintSchema.provenance_unit_normalised.rule': 'hashed',
  'DraftGoalConstraintSchema.provenance_unit_normalised.original_value': 'hashed',
  'DraftGoalConstraintSchema.provenance_unit_normalised.original_unit': 'hashed',
});

/**
 * The schemas whose DECLARED shape keys the classification test walks. Named
 * here (not in the test) so the hash's notion of "which schemas define the
 * identity surface" is the SAME object the completeness test derives from —
 * one source of truth, no second mirror.
 */
export const GRAPH_HASH_CLASSIFIED_SCHEMAS: ReadonlyArray<{
  readonly name: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
}> = Object.freeze([
  { name: 'GraphV3Schema', schema: GraphV3Schema as z.ZodObject<z.ZodRawShape> },
  { name: 'NodeV3Schema', schema: NodeV3Schema as z.ZodObject<z.ZodRawShape> },
  { name: 'EdgeV3Schema', schema: EdgeV3Schema as z.ZodObject<z.ZodRawShape> },
  {
    name: 'OptionForAnalysisSchema',
    schema: OptionForAnalysisSchema as z.ZodObject<z.ZodRawShape>,
  },
  {
    name: 'DraftGoalConstraintSchema',
    schema: DraftGoalConstraintSchema as z.ZodObject<z.ZodRawShape>,
  },
]);

// ----------------------------------------------------------------------------
// Canonical serialisation
// ----------------------------------------------------------------------------

/**
 * Recursive key-sorted JSON. Object keys are emitted in lexicographic order at
 * every depth and `undefined` values are dropped, so two structurally-equal
 * graphs serialise to the identical byte string regardless of key insertion
 * order. Arrays keep their order — callers sort element arrays (nodes, edges,
 * options, constraints) explicitly before serialising.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const v = source[key];
      if (v === undefined) continue;
      out[key] = sortValue(v);
    }
    return out;
  }
  return value;
}

// ----------------------------------------------------------------------------
// Whitelist projection
// ----------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Keep only `keys` that are present (non-undefined) on `src`. */
function pick(src: Obj, keys: readonly string[]): Obj {
  const out: Obj = {};
  for (const k of keys) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

/** Remove `keys` from a shallow copy of `src`. */
function strip(src: Obj, keys: readonly string[]): Obj {
  const out: Obj = { ...src };
  for (const k of keys) delete out[k];
  return out;
}

// Analysis-affecting node fields read directly (declared + CEE-floor
// passthrough). Nested objects (observed_state / state_space / prior /
// interventions) are sub-projected below.
const NODE_SCALAR_HASHED: readonly string[] = [
  'id',
  'kind',
  'category',
  'type',
  'categories',
  'goal_threshold',
  // CEE-floor passthrough (not declared on the thin GraphV3):
  'factor_type',
  'is_baseline',
  'goal_threshold_raw',
  'goal_threshold_cap',
  'intercept',
  'encoding_map',
];

const OBSERVED_STATE_HASHED: readonly string[] = ['value', 'std', 'baseline', 'cap'];
const PRIOR_HASHED: readonly string[] = ['distribution', 'range_min', 'range_max'];

// Cosmetic / provenance sub-keys stripped from each intervention entry
// (manifest §3 EXCLUDE: intervention.{unit, source, reasoning, value_confidence,
// display_value}; target_match.{match_type, confidence}).
const INTERVENTION_EXCLUDED_SUBKEYS: readonly string[] = [
  'unit',
  'source',
  'reasoning',
  'value_confidence',
  'display_value',
];
const TARGET_MATCH_EXCLUDED_SUBKEYS: readonly string[] = ['match_type', 'confidence'];

const EDGE_HASHED: readonly string[] = [
  'from',
  'to',
  'edge_type',
  'exists_probability',
  'effect_direction',
];

const OPTION_SCALAR_HASHED: readonly string[] = [
  'id',
  'status',
  // CEE-floor passthrough:
  'is_baseline',
];

function projectIntervention(value: unknown): unknown {
  if (!isObj(value)) return value;
  const out = strip(value, INTERVENTION_EXCLUDED_SUBKEYS);
  if (isObj(out.target_match)) {
    out.target_match = strip(out.target_match, TARGET_MATCH_EXCLUDED_SUBKEYS);
  }
  return out;
}

function projectInterventionMap(value: unknown): unknown {
  if (!isObj(value)) return value;
  const out: Obj = {};
  for (const key of Object.keys(value)) out[key] = projectIntervention(value[key]);
  return out;
}

function projectNode(node: unknown): Obj {
  if (!isObj(node)) return {};
  const out = pick(node, NODE_SCALAR_HASHED);
  if (isObj(node.observed_state)) {
    out.observed_state = pick(node.observed_state, OBSERVED_STATE_HASHED);
  }
  if (isObj(node.state_space)) {
    // whole state_space (range → {min,max}) is analysis-affecting
    out.state_space = node.state_space;
  }
  if (isObj(node.prior)) {
    out.prior = pick(node.prior, PRIOR_HASHED);
  }
  if (node.interventions !== undefined) {
    out.interventions = projectInterventionMap(node.interventions);
  }
  return out;
}

function projectEdge(edge: unknown): Obj {
  if (!isObj(edge)) return {};
  const out = pick(edge, EDGE_HASHED);
  if (isObj(edge.strength)) {
    out.strength = pick(edge.strength, ['mean', 'std']);
  }
  return out;
}

function projectOption(option: unknown): Obj {
  if (!isObj(option)) return {};
  const out = pick(option, OPTION_SCALAR_HASHED);
  if (option.interventions !== undefined) {
    out.interventions = option.interventions;
  }
  // manifest §3: raw_interventions only when status !== 'ready'
  if (option.status !== 'ready' && option.raw_interventions !== undefined) {
    out.raw_interventions = option.raw_interventions;
  }
  return out;
}

function nodeIdOf(node: unknown): string {
  return isObj(node) && typeof node.id === 'string' ? node.id : '';
}

function edgeKeyOf(edge: unknown): string {
  if (!isObj(edge)) return '';
  const from = typeof edge.from === 'string' ? edge.from : '';
  const to = typeof edge.to === 'string' ? edge.to : '';
  return `${from} ${to}`;
}

function constraintKeyOf(c: unknown): string {
  return isObj(c) && typeof c.constraint_id === 'string' ? c.constraint_id : '';
}

function byString(keyOf: (v: unknown) => string) {
  return (a: unknown, b: unknown): number => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

/**
 * Build the canonical, analysis-affecting projection of a graph. Element arrays
 * are sorted by a stable natural key (node id; edge from,to; constraint id) so
 * a reordering-only edit produces an identical projection.
 */
function projectGraph(graph: GraphV3): Obj {
  const g = graph as unknown as Obj;
  const nodes = Array.isArray(g.nodes) ? [...g.nodes] : [];
  const edges = Array.isArray(g.edges) ? [...g.edges] : [];
  nodes.sort(byString(nodeIdOf));
  edges.sort(byString(edgeKeyOf));

  const out: Obj = {
    nodes: nodes.map(projectNode),
    edges: edges.map(projectEdge),
  };

  // Passthrough top-level analysis surface (not declared on the thin GraphV3).
  if (Array.isArray(g.options)) {
    const options = [...g.options].sort(byString(nodeIdOf));
    out.options = options.map(projectOption);
  }
  if (typeof g.goal_node_id === 'string') {
    out.goal_node_id = g.goal_node_id;
  }
  if (Array.isArray(g.goal_constraints)) {
    // whole array, stableStringify passthrough (manifest §3) — sorted for
    // determinism.
    out.goal_constraints = [...g.goal_constraints].sort(byString(constraintKeyOf));
  }
  return out;
}

// ----------------------------------------------------------------------------
// The canonical hash
// ----------------------------------------------------------------------------

/**
 * A structurally-empty graph (null/undefined, or no nodes) has NO identity —
 * returns `null`. This is the load-bearing distinction the wire's tri-state
 * `graph_hash` (string = graph rendered, null = no graph rendered, absent = old
 * client) rests on: an empty canvas is `null`, not the hash of `{nodes:[]}`.
 */
function isStructurallyEmpty(graph: GraphV3 | null | undefined): boolean {
  if (graph === null || graph === undefined) return true;
  const g = graph as unknown as Obj;
  return !Array.isArray(g.nodes) || g.nodes.length === 0;
}

/**
 * The ONE canonical graph-identity hash. Deterministic 16-hex prefix of the
 * SHA-256 of the canonical, analysis-affecting projection (§ surface above).
 *
 * @returns a 16-char lowercase hex string, or `null` when the graph is
 * structurally empty (no identity to hash).
 */
export function computeGraphHash(graph: GraphV3 | null | undefined): string | null {
  if (isStructurallyEmpty(graph)) return null;
  const canonical = stableStringify(projectGraph(graph as GraphV3));
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

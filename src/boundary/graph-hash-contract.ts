import { z } from 'zod';
import { GraphV3Schema } from '../graph.js';

// ============================================================================
// Canonical graph-hash CONTRACT (0.22.0 — S1, ROADMAP 1.179/1.181).
//
// This module carries the CONTRACT DOCUMENTATION for the graph-identity
// handshake — the ONE canonical keep-list every producer of a `graph_hash`
// (OlumiResponseSchema, olumi-response.ts) or `computed_against_hash`
// (AnalysisResultBlockSchema, blocks.ts) MUST hash, and the `GRAPH_DIVERGED`
// error code (error-codes.ts) a consumer raises on mismatch.
//
// ⚠ THE IMPLEMENTATION LIVES CEE-SIDE, DELIBERATELY. This module does NOT
// implement a hashing function. The live runtime hash is CEE's
// `computeAnalysisAffectingGraphHash` (`graph-hash.ts`), verified this session
// to hash nodes + edges + options(sorted by id) + goal_node_id +
// goal_constraints. Shipping a SECOND hashing implementation here would create
// exactly the "two same-named hash twins" defect this programme keeps paying
// for (one seed-bearing / one seedless `generateGraphHash`; global CLAUDE.md
// trap 12 — derive, don't mirror). The unambiguous canonical NAME reserved for
// any shared implementation is `computeCanonicalGraphHash` (design §2.2); this
// module names the keep-list it must hash, not a rival digest.
//
// WHY A DOCUMENTED KEEP-LIST + A CLASSIFICATION TEST (not just a comment): the
// single-graph design's own keep-list was DEFECTIVE — it omitted
// `goal_constraints` (and options / goal_node_id), so a hard-constraint edit
// would NOT move the hash and the analysis would read FRESH after the user
// changed a constraint (S1 §D bottom / §F.1). The corrected floor below adopts
// CEE's analysis-affecting whitelist. The classification-completeness test
// (tests/boundary/graph-hash-contract.test.ts) DERIVES the graph-side field
// set from `GraphV3Schema` so a NEW graph field fails the build until it is
// consciously classified hashed-or-excluded — the drift never reads as green.
// ============================================================================

/**
 * The unambiguous exported NAME reserved for a shared canonical hash function
 * (design §2.2). No implementation here — see the module header. Consumers/CEE
 * that need to name the function in logs/telemetry key off this constant so the
 * name cannot drift into a second same-named twin.
 */
export const CANONICAL_GRAPH_HASH_FUNCTION_NAME = 'computeCanonicalGraphHash' as const;

/**
 * The GraphV3 top-level fields that MUST feed the canonical hash. Derived-check:
 * every `GraphV3Schema` field is classified here or in
 * `GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS` below (the classification test enforces
 * completeness). Both current fields are analysis-affecting.
 */
export const CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS = ['nodes', 'edges'] as const;

/**
 * GraphV3 top-level fields DELIBERATELY excluded from the hash. Currently NONE
 * — both `nodes` and `edges` are analysis-affecting. Present so the
 * classification test can assert `keep ∪ excluded == every GraphV3 field`; an
 * excluded entry that no longer names a real field is rejected as stale.
 */
export const GRAPH_HASH_EXCLUDED_GRAPHV3_FIELDS = [] as const;

/**
 * The analysis-state fields carried ALONGSIDE the graph (not on GraphV3 itself
 * — they are assembled scenario-side) that the corrected floor requires. The
 * design's original list omitted these; omitting `goal_constraints` was the
 * freshness-inversion defect. Pinned by the classification test so a
 * regression that drops one fails loud.
 */
export const CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS = [
  'options',
  'goal_node_id',
  'goal_constraints',
] as const;

/**
 * THE ONE canonical keep-list: every field the graph-identity hash MUST cover.
 * The corrected floor (adopts CEE's `computeAnalysisAffectingGraphHash`
 * whitelist): graph nodes + edges + options + goal_node_id + goal_constraints.
 * A producer computing `graph_hash` / `computed_against_hash` that hashes a
 * SUBSET of this list emits a hash that fails to move on an analysis-affecting
 * edit — the freshness-inversion class. Do not narrow without moving the
 * corrected-floor assertion in the classification test.
 */
export const CANONICAL_GRAPH_HASH_KEEP_LIST = [
  ...CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS,
  ...CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS,
] as const;

export type CanonicalGraphHashKeepKey =
  (typeof CANONICAL_GRAPH_HASH_KEEP_LIST)[number];

/**
 * The GraphV3 top-level field set, DERIVED from the schema (never hand-listed)
 * so the classification test sees a new field the moment the schema grows. The
 * test asserts this equals `keep(graphv3) ∪ excluded(graphv3)`.
 */
export function graphV3TopLevelFields(): readonly string[] {
  return Object.keys((GraphV3Schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape);
}

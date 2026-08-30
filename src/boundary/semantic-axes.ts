import { z } from 'zod';
import { NodeV3Schema, EdgeV3Schema } from '../graph.js';
import { OptionForAnalysisSchema } from '../analysis.js';
import { DraftGoalConstraintSchema, CanonicalCommittedGraphReceiptSchema } from './blocks.js';

// ============================================================================
// THE GRAPH TRUTH CONTRACT — semantic axes, quantity companions, boundary fates
//
// WHAT THIS EXISTS TO STOP. Six independent traces converged on one invariant:
//
//   A quantity crosses every boundary in this estate as a BARE FLOAT. Its
//   scale, its provenance and its uncertainty are carried — where they are
//   carried at all — in fields that each hop rebuilds by hand, and no hop
//   fails loud when one goes missing.
//
// The estate has found instances of that invariant one at a time for months.
// This module is the thing that stops us finding them one at a time forever.
//
// ⚠ WHY IT IS A DERIVATION AND NOT A LIST. The obvious implementation is a
// hand-written table of "fields that matter". That is the estate's dominant
// defect class (global CLAUDE.md trap 12): a list a human must remember to
// sync with reality WILL drift, and the drift always reads as green. It is
// also, specifically, how `value_tier` was minted, never classified, never
// transported, and noticed by nobody for months.
//
// So the SET is derived and the CLASSIFICATION is the only hand-written part
// — and the classification cannot be skipped, because a leaf path that is in
// neither `SEMANTIC_AXES` nor `NOT_SEMANTIC` FAILS THE BUILD. There is exactly
// one thing a human writes, and omitting it is the one thing they cannot do.
//
// ⚠ WHAT THIS MODULE IS NOT. It is not a validator, not a projection, and not
// a second copy of anybody's wire format. It declares WHICH LEAVES CARRY
// MEANING and WHAT HAPPENS TO THEM AT EACH REBUILD POINT. The projections
// themselves stay where they are, owned by the repos that perform them; this
// module is what makes their drift loud. Shipping a rival projection here
// would be the twins defect it exists to prevent.
//
// ── EPISTEMICS ────────────────────────────────────────────────────────────
// Every boundary fate carries `rung` (the status-ladder rung its evidence
// reached) and `measured_at` (the SHA it was derived at). A fate with no
// measurement is `unmeasured` and MUST carry a `re_derive_by` date; the gate
// FAILS when that date passes. A standing mechanism that cannot prove it ran
// is worth nothing, and "we will check later" with no date is how this estate
// lost a background reconciler that was recorded RUNNING for a month.
//
// NOTHING IN THIS MODULE IS WIRE-WITNESSED. Every fate below is CODE EXISTS,
// derived by reading the projection sites at the pinned SHAs named in
// `MEASUREMENT_SHAS`. The runtime limb (scripts/graph-truth-runtime-limb.mjs)
// is what raises a fate to WIRE-WITNESSED, and it has not been run against a
// live quartet by the lane that wrote this file — it hard-fails rather than
// reporting a rung it did not reach.
// ============================================================================

/** The SHAs every `measured_at` below refers to. */
export const MEASUREMENT_SHAS = Object.freeze({
  schemas: '25d01ba2ce7210e768996e0f92a15fd36420e6d2',
  cee: 'caceba1a2152c7dcc6ab9bc606fe3179547a5da0',
  plot: '75e7f9747977a28214533ce4af0efdb9ca28b155',
  isl: null,
} as const);

// ----------------------------------------------------------------------------
// §1 — THE AXES
// ----------------------------------------------------------------------------

/**
 * The five things a graph leaf can be, semantically.
 *
 * ⚠ A LEAF MAY CARRY MORE THAN ONE, DELIBERATELY. `observed_state.source`
 * answers BOTH "how did this value enter the model" (provenance) AND "did a
 * human state it or did the system estimate it" (stated_ness) — its literal
 * vocabulary spans `brief_extraction` and `cee_inference`. Forcing such a
 * field into one axis is trap 21 in miniature: two questions under one name,
 * which is how a predicate ends up correct for one reader and wrong for the
 * other. The classification is therefore a SET, and the gate requires it to be
 * non-empty rather than requiring it to be a singleton.
 */
export const SEMANTIC_AXIS_VALUES = [
  /** The magnitude itself — the bare float the other four axes qualify. */
  'quantity',
  /** What units / frame / divisor the magnitude is expressed in. */
  'scale',
  /** How and whence the value entered the model. */
  'provenance',
  /** Whether a human stated it or the system estimated it. */
  'stated_ness',
  /** The spread or confidence around the magnitude. */
  'uncertainty',
] as const;

export type SemanticAxis = (typeof SEMANTIC_AXIS_VALUES)[number];

// ----------------------------------------------------------------------------
// §2 — THE DERIVATION (the part no human maintains)
// ----------------------------------------------------------------------------

/**
 * The canonical graph, as a set of ROOT schemas.
 *
 * These are the objects a user's meaning has to survive as. `receipt` is the
 * container CEE commits and hashes; the other four are the semantic objects
 * inside it. They are declared here as SCHEMAS, not as names, so the leaf walk
 * below reads the real contract rather than a description of it.
 *
 * ⚠ `receipt.nodes` / `receipt.edges` / `receipt.options` are `z.unknown()` on
 * the committed-receipt schema — the receipt is deliberately opaque about its
 * element shapes so nested evolution does not force a schema bump. The walk
 * reports those as OPAQUE leaves rather than silently walking nothing, because
 * "we looked and found no fields" and "we could not look" are different
 * results and only one of them is evidence.
 */
export const CANONICAL_GRAPH_ROOTS = Object.freeze({
  node: NodeV3Schema,
  edge: EdgeV3Schema,
  option: OptionForAnalysisSchema,
  goal_constraint: DraftGoalConstraintSchema,
  receipt: CanonicalCommittedGraphReceiptSchema,
} as unknown as Record<string, z.ZodTypeAny>);

export type CanonicalRootName = 'node' | 'edge' | 'option' | 'goal_constraint' | 'receipt';

/** What the walk found at a leaf. */
export interface CanonicalLeaf {
  /** Dotted path, e.g. `node.observed_state.declared_scale`. */
  readonly path: string;
  /** Zod type name at the leaf, or `union<...>` / `@root:<name>` / `opaque`. */
  readonly kind: string;
  /** True when the leaf is `z.unknown()`/`z.any()` — the contract declines to say. */
  readonly opaque: boolean;
}

/** An object in the walk that admits keys the contract does not declare. */
export interface PassthroughSite {
  readonly path: string;
  /** `passthrough` (undeclared keys travel) or `strip` (undeclared keys vanish). */
  readonly unknownKeys: 'passthrough' | 'strip';
}

export interface CanonicalWalk {
  readonly leaves: readonly CanonicalLeaf[];
  readonly passthroughSites: readonly PassthroughSite[];
  /** Paths where the walk stopped because the sub-schema IS another root. */
  readonly rootAliases: readonly { readonly path: string; readonly root: string }[];
}

type ZodDefLike = {
  typeName?: string;
  innerType?: z.ZodTypeAny;
  type?: z.ZodTypeAny;
  schema?: z.ZodTypeAny;
  getter?: () => z.ZodTypeAny;
  out?: z.ZodTypeAny;
  valueType?: z.ZodTypeAny;
  options?: z.ZodTypeAny[] | Map<string, z.ZodTypeAny>;
  items?: z.ZodTypeAny[];
  unknownKeys?: string;
};

const defOf = (s: z.ZodTypeAny): ZodDefLike => (s as unknown as { _def: ZodDefLike })._def;

/**
 * Strip the wrappers that do not change a field's identity. Deliberately
 * exhaustive over the wrappers this contract actually uses; an unrecognised
 * wrapper falls through and is reported as its own leaf kind rather than being
 * silently unwrapped into something it is not.
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s = schema;
  for (let guard = 0; guard < 32; guard += 1) {
    const def = defOf(s);
    switch (def?.typeName) {
      case 'ZodOptional':
      case 'ZodNullable':
      case 'ZodReadonly':
      case 'ZodBranded':
        s = (def.innerType ?? def.type) as z.ZodTypeAny;
        break;
      case 'ZodDefault':
      case 'ZodCatch':
        s = def.innerType as z.ZodTypeAny;
        break;
      case 'ZodEffects':
        s = def.schema as z.ZodTypeAny;
        break;
      case 'ZodLazy':
        s = (def.getter as () => z.ZodTypeAny)();
        break;
      case 'ZodPipeline':
        s = def.out as z.ZodTypeAny;
        break;
      default:
        return s;
    }
  }
  return s;
}

/**
 * Enumerate every leaf of the canonical graph, DERIVED from the Zod tree.
 *
 * ⚠ ROOT ALIASING IS LOAD-BEARING, not a tidiness. `receipt.goal_constraints[]`
 * IS `DraftGoalConstraintSchema`, which is already the `goal_constraint` root.
 * Without aliasing, the walk emits sixteen duplicate paths and the
 * classification table has to carry the same judgement twice — which is a
 * hand-maintained mirror INSIDE the derivation written to abolish them, and
 * the two copies would be free to disagree. The walk stops at a root by
 * SCHEMA IDENTITY (`===`), never by name matching, so renaming a field cannot
 * silently break the alias.
 */
export function walkCanonicalGraph(
  roots: Record<string, z.ZodTypeAny> = CANONICAL_GRAPH_ROOTS,
): CanonicalWalk {
  const leaves: CanonicalLeaf[] = [];
  const passthroughSites: PassthroughSite[] = [];
  const rootAliases: { path: string; root: string }[] = [];
  const rootEntries = Object.entries(roots);

  const aliasFor = (s: z.ZodTypeAny, selfRoot: string): string | null => {
    for (const [name, rootSchema] of rootEntries) {
      if (name !== selfRoot && (s === rootSchema || unwrap(rootSchema) === s)) return name;
    }
    return null;
  };

  function walk(schema: z.ZodTypeAny, path: string, selfRoot: string, depth: number): void {
    if (depth > 16) {
      leaves.push({ path, kind: 'DEPTH_LIMIT', opaque: true });
      return;
    }
    const alias = aliasFor(schema, selfRoot) ?? aliasFor(unwrap(schema), selfRoot);
    if (alias && path.includes('.')) {
      rootAliases.push({ path, root: alias });
      return;
    }
    const s = unwrap(schema);
    const def = defOf(s);
    switch (def?.typeName) {
      case 'ZodObject': {
        passthroughSites.push({
          path,
          unknownKeys: def.unknownKeys === 'passthrough' ? 'passthrough' : 'strip',
        });
        const shape = (s as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
        for (const key of Object.keys(shape)) {
          walk(shape[key] as z.ZodTypeAny, path ? `${path}.${key}` : key, selfRoot, depth + 1);
        }
        return;
      }
      case 'ZodArray':
        walk(def.type as z.ZodTypeAny, `${path}[]`, selfRoot, depth + 1);
        return;
      case 'ZodRecord':
        walk(def.valueType as z.ZodTypeAny, `${path}{}`, selfRoot, depth + 1);
        return;
      case 'ZodTuple':
        (def.items ?? []).forEach((item, i) => walk(item, `${path}[${i}]`, selfRoot, depth + 1));
        return;
      case 'ZodUnion':
      case 'ZodDiscriminatedUnion': {
        const raw = def.options;
        const opts = Array.isArray(raw) ? raw : [...(raw as Map<string, z.ZodTypeAny>).values()];
        const inner = opts.map(unwrap);
        // A union of primitives is ONE leaf with a union kind. A union that
        // contains an object is walked per-arm, because the arms can carry
        // different meaning-bearing fields and collapsing them would hide one.
        if (inner.every((o) => defOf(o)?.typeName !== 'ZodObject')) {
          leaves.push({
            path,
            kind: `union<${inner.map((o) => defOf(o)?.typeName ?? 'unknown').join('|')}>`,
            opaque: false,
          });
          return;
        }
        opts.forEach((o, i) => walk(o, `${path}|${i}`, selfRoot, depth + 1));
        return;
      }
      case 'ZodUnknown':
      case 'ZodAny':
        leaves.push({ path, kind: 'opaque', opaque: true });
        return;
      default:
        leaves.push({ path, kind: def?.typeName ?? 'UNRECOGNISED', opaque: false });
    }
  }

  for (const [name, schema] of rootEntries) walk(schema, name, name, 0);
  return { leaves, passthroughSites, rootAliases };
}

/** Convenience: just the paths, sorted, deduplicated. */
export function canonicalGraphLeafPaths(
  roots: Record<string, z.ZodTypeAny> = CANONICAL_GRAPH_ROOTS,
): readonly string[] {
  return [...new Set(walkCanonicalGraph(roots).leaves.map((l) => l.path))].sort();
}

// ----------------------------------------------------------------------------
// §3 — THE CLASSIFICATION (the only hand-written part, and it cannot be skipped)
// ----------------------------------------------------------------------------

/**
 * Every leaf that CARRIES USER MEANING, and which axes it carries.
 *
 * The gate asserts `SEMANTIC_AXES ∪ NOT_SEMANTIC == canonicalGraphLeafPaths()`
 * in BOTH directions: a new contract field with no row fails the build, and a
 * row naming a path the contract no longer has fails it too. One-directional
 * completeness lets a stale row sit forever describing a field that is gone,
 * which reads as coverage and is not.
 */
export const SEMANTIC_AXES: Readonly<Record<string, readonly SemanticAxis[]>> = Object.freeze({
  // --- node: the factor baseline, and everything that says what it means ----
  'node.observed_state.value': ['quantity'],
  'node.observed_state.baseline': ['quantity', 'scale'],
  'node.observed_state.std': ['uncertainty'],
  'node.observed_state.unit': ['scale'],
  'node.observed_state.declared_scale': ['scale'],
  'node.observed_state.source': ['provenance', 'stated_ness'],
  'node.observed_state.elicited_from.round_id': ['provenance'],
  'node.observed_state.elicited_from.participant_id': ['provenance'],
  'node.observed_state.elicited_from.evidence_event_id': ['provenance'],
  // --- node: the objective ---------------------------------------------------
  'node.goal_threshold': ['quantity'],
  'node.goal_threshold_frame': ['scale'],
  'node.state_space.range.min': ['scale'],
  'node.state_space.range.max': ['scale'],

  // --- edge: the causal claim ------------------------------------------------
  'edge.strength.mean': ['quantity'],
  'edge.strength.std': ['uncertainty'],
  'edge.exists_probability': ['quantity', 'uncertainty'],
  'edge.effect_direction': ['scale'],

  // --- option: the intervention ---------------------------------------------
  'option.interventions{}': ['quantity'],
  'option.raw_interventions{}': ['quantity', 'scale'],
  'option.status': ['scale'],

  // --- goal_constraint: the stated limit -------------------------------------
  'goal_constraint.value': ['quantity'],
  'goal_constraint.unit': ['scale'],
  'goal_constraint.value_frame': ['scale'],
  'goal_constraint.operator': ['scale'],
  'goal_constraint.source_quote': ['provenance', 'stated_ness'],
  'goal_constraint.provenance': ['provenance', 'stated_ness'],
  'goal_constraint.confidence': ['uncertainty'],
  'goal_constraint.provenance_unit_normalised.rule': ['scale', 'provenance'],
  'goal_constraint.provenance_unit_normalised.original_value': ['quantity', 'scale'],
  'goal_constraint.provenance_unit_normalised.original_unit': ['scale'],
  'goal_constraint.deadline_metadata.deadline_date': ['quantity', 'scale'],
  'goal_constraint.deadline_metadata.reference_date': ['scale'],
  'goal_constraint.deadline_metadata.assumed_reference_date': ['provenance', 'stated_ness'],
});

/**
 * Every leaf that carries NO user meaning, with a one-line reason each.
 *
 * ⚠ THE REASON IS THE POINT. "Not semantic" with no reason is indistinguishable
 * from "nobody looked", and the two have opposite consequences. The gate
 * requires a non-empty reason so the classification cannot be discharged by
 * pasting a path into a list.
 */
export const NOT_SEMANTIC: Readonly<Record<string, string>> = Object.freeze({
  'node.id': 'identity — the handle every assertion binds BY, never a quantity',
  'node.kind': 'structure — which slot in the model, not what the user meant by a number',
  'node.label': 'display — the user\'s words, carried verbatim; meaning-bearing as PROSE, and deliberately not an axis member: a label is exactly where a lost qualifier goes to hide, and treating it as a carrier would license that',
  'node.body': 'display — free prose, same reasoning as label',
  'node.type': 'structure — variable type (numeric/ordinal/nominal/boolean), not the value\'s scale',
  'node.categories[]': 'structure — the level names of a nominal variable',
  'node.category': 'coaching classification (controllable/observable/external) — a classification of the FACTOR, never a statement about its value; PLoT\'s own comment records gating a quantitative statement on this as a defect',
  'edge.from': 'identity — endpoint reference',
  'edge.to': 'identity — endpoint reference',
  'edge.edge_type': 'structure — directed/bidirected topology',
  'edge.label': 'display — free prose',
  'option.id': 'identity',
  'option.label': 'display',
  'option.description': 'display',
  'goal_constraint.constraint_id': 'identity',
  'goal_constraint.node_id': 'identity — the binding target; the constraint\'s meaning is asserted ON this id, not carried by it',
  'goal_constraint.label': 'display',
  'receipt.nodes[]': 'OPAQUE container — z.unknown() by design; its element meaning is the `node` root, classified there',
  'receipt.edges[]': 'OPAQUE container — z.unknown() by design; element meaning is the `edge` root',
  'receipt.options[]': 'OPAQUE container — z.unknown() by design; element meaning is the `option` root',
  'receipt.node_count': 'derived metadata — recomputed from nodes.length by the receipt refinement; never an input',
  'receipt.edge_count': 'derived metadata — recomputed from edges.length; never an input',
  'receipt.goal_node_id': 'identity — which node is the objective, not what the objective means',
});

// ----------------------------------------------------------------------------
// §4 — THE COMPANION RULE (the bare-float invariant, mechanised)
// ----------------------------------------------------------------------------

/**
 * For every `quantity` leaf: the qualifier leaves WITHOUT WHICH THE NUMBER IS
 * MEANINGLESS.
 *
 * ⚠ THIS IS THE HEART OF THE SUITE. The invariant six traces converged on is
 * not "a field went missing" — it is "a number travels alone". A gate that
 * only checks fields cannot state that. This one can: every quantity must
 * NAME its companions, the companions must themselves be classified axis
 * members, and the set must be non-empty. A quantity with no declared
 * companion fails the build — which is the machine-checkable form of "do not
 * mint another bare float".
 *
 * It also gives the boundary limb its teeth. A quantity that is `carried` at a
 * boundary while ALL of its companions are `dropped` is a number arriving
 * stripped of the thing that says what it is, and `unqualifiedCrossings()`
 * below reports exactly that — by identity, per boundary.
 */
export const QUANTITY_QUALIFIERS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'node.observed_state.value': [
    'node.observed_state.unit',
    'node.observed_state.declared_scale',
    'node.observed_state.std',
    'node.observed_state.source',
  ],
  'node.observed_state.baseline': [
    'node.observed_state.unit',
    'node.observed_state.declared_scale',
  ],
  'node.goal_threshold': ['node.goal_threshold_frame', 'node.observed_state.baseline'],
  'edge.strength.mean': ['edge.strength.std', 'edge.effect_direction'],
  'edge.exists_probability': ['edge.strength.std'],
  'option.interventions{}': [
    'option.status',
    'option.raw_interventions{}',
    'node.observed_state.declared_scale',
  ],
  'option.raw_interventions{}': ['option.status'],
  'goal_constraint.value': [
    'goal_constraint.unit',
    'goal_constraint.value_frame',
    'goal_constraint.operator',
    'goal_constraint.provenance',
  ],
  'goal_constraint.provenance_unit_normalised.original_value': [
    'goal_constraint.provenance_unit_normalised.original_unit',
    'goal_constraint.provenance_unit_normalised.rule',
  ],
  'goal_constraint.deadline_metadata.deadline_date': [
    'goal_constraint.deadline_metadata.reference_date',
    'goal_constraint.deadline_metadata.assumed_reference_date',
  ],
});

// ----------------------------------------------------------------------------
// §4b — THE SEMANTIC OBJECTS (what the suite reports ABOUT)
// ----------------------------------------------------------------------------

/**
 * The six things a user says, that the pipeline has to keep saying.
 *
 * ⚠ THIS IS THE UNIT OF REPORTING, AND THAT MATTERS MORE THAN IT LOOKS. A
 * per-FIELD report answers "did a key survive"; a per-OBJECT report answers
 * "did the user's statement survive", which is the only question anybody
 * outside this file cares about. Twelve green fields and one dropped qualifier
 * is a red OBJECT, and a field-level report will not say so.
 *
 * Membership is asserted COMPLETE and DISJOINT against `SEMANTIC_AXES` by
 * `checkSemanticObjectCoverage`: every axis member belongs to exactly one
 * object. So a newly minted qualifier cannot be classified and then quietly
 * belong to nothing — which would classify it out of every report while
 * leaving the completeness gate green.
 */
export interface SemanticObject {
  readonly id: string;
  /** What the user said, in their words, that this object has to preserve. */
  readonly userStatement: string;
  readonly members: readonly string[];
}

export const SEMANTIC_OBJECTS: readonly SemanticObject[] = Object.freeze([
  {
    id: 'objective',
    userStatement: '"I want revenue of GBP 6M" — a target, and the frame it is stated in.',
    members: ['node.goal_threshold', 'node.goal_threshold_frame'],
  },
  {
    id: 'constraint',
    userStatement: '"Do not go over a board-approved cap of GBP 240,000."',
    members: [
      'goal_constraint.value',
      'goal_constraint.unit',
      'goal_constraint.value_frame',
      'goal_constraint.operator',
      'goal_constraint.confidence',
      'goal_constraint.provenance_unit_normalised.rule',
      'goal_constraint.provenance_unit_normalised.original_value',
      'goal_constraint.provenance_unit_normalised.original_unit',
      'goal_constraint.deadline_metadata.deadline_date',
      'goal_constraint.deadline_metadata.reference_date',
    ],
  },
  {
    id: 'option_intervention',
    userStatement: '"Under option B we spend GBP 55,000 on paid acquisition."',
    members: ['option.interventions{}', 'option.raw_interventions{}', 'option.status'],
  },
  {
    id: 'factor_baseline',
    userStatement: '"Set the monthly churn rate to 12 percent."',
    members: [
      'node.observed_state.value',
      'node.observed_state.baseline',
      'node.observed_state.unit',
      'node.observed_state.declared_scale',
      'node.observed_state.std',
      'node.state_space.range.min',
      'node.state_space.range.max',
    ],
  },
  {
    id: 'unknown_vs_estimate',
    userStatement:
      'The difference between a number the user STATED, one the system ESTIMATED, and one nobody knows. ' +
      'This is the object EVPI and every honest-unknown notice depends on: without it the engine cannot ' +
      'tell an admitted unknown from a confident guess, and neither can the user.',
    members: [
      'node.observed_state.source',
      'node.observed_state.elicited_from.round_id',
      'node.observed_state.elicited_from.participant_id',
      'node.observed_state.elicited_from.evidence_event_id',
      'goal_constraint.source_quote',
      'goal_constraint.provenance',
      'goal_constraint.deadline_metadata.assumed_reference_date',
    ],
  },
  {
    id: 'causal_claim',
    userStatement: '"Paid acquisition strongly increases signups, but I am not certain of the size."',
    members: ['edge.strength.mean', 'edge.strength.std', 'edge.exists_probability', 'edge.effect_direction'],
  },
]);

/**
 * COMPLETE and DISJOINT against the classification — derived, both directions.
 */
export function checkSemanticObjectCoverage(reg: TruthRegistry): TruthProblem[] {
  const problems: TruthProblem[] = [];
  const owner = new Map<string, string>();

  for (const obj of reg.objects) {
    if (obj.members.length === 0) {
      problems.push({ code: 'E_EMPTY_OBJECT', subject: obj.id, message: 'a semantic object with no members reports on nothing' });
    }
    for (const m of obj.members) {
      if (!(m in reg.axes)) {
        problems.push({
          code: 'E_OBJECT_MEMBER_NOT_AN_AXIS',
          subject: `${obj.id} -> ${m}`,
          message: 'names a member that is not a classified axis member',
        });
      }
      const prior = owner.get(m);
      if (prior !== undefined) {
        problems.push({
          code: 'E_MEMBER_IN_TWO_OBJECTS',
          subject: m,
          message: `claimed by both "${prior}" and "${obj.id}" — a field in two reports is a field two owners can each assume the other checked`,
        });
      }
      owner.set(m, obj.id);
    }
  }

  for (const path of Object.keys(reg.axes)) {
    if (!owner.has(path)) {
      problems.push({
        code: 'E_MEMBER_IN_NO_OBJECT',
        subject: path,
        message:
          'a classified axis member that belongs to no semantic object — it would be ' +
          'invisible to every per-object report while the completeness gate stayed green',
      });
    }
  }
  return problems;
}

/** Which semantic object a path belongs to, or null. Identity lookup, never a predicate. */
export function objectOf(path: string, reg: TruthRegistry = LIVE_REGISTRY): string | null {
  for (const o of reg.objects) if (o.members.includes(path)) return o.id;
  return null;
}

/**
 * The per-OBJECT verdict at one boundary: which of its members survive, and
 * which are lost. Bound by identity throughout — an object is named, its
 * members are named, and nothing is inferred from a value.
 */
export interface ObjectBoundaryVerdict {
  readonly object: string;
  readonly boundary: string;
  readonly carried: readonly string[];
  readonly transformed: readonly string[];
  readonly lost: readonly string[];
  readonly unmeasured: readonly string[];
  /** True when at least one member of this object is deleted at this boundary. */
  readonly degraded: boolean;
}

export function objectVerdicts(reg: TruthRegistry = LIVE_REGISTRY): ObjectBoundaryVerdict[] {
  const out: ObjectBoundaryVerdict[] = [];
  for (const obj of reg.objects) {
    for (const b of reg.boundaries) {
      const relevant = obj.members.filter((m) =>
        b.roots.includes(m.split(/[.[{|]/)[0] as CanonicalRootName),
      );
      if (relevant.length === 0) continue;
      const carried: string[] = [];
      const transformed: string[] = [];
      const lost: string[] = [];
      const unmeasured: string[] = [];
      for (const m of relevant) {
        const f = reg.fates[fateKey(b.id, m)]?.fate ?? 'carried';
        if (f === 'dropped') lost.push(m);
        else if (f === 'transformed') transformed.push(m);
        else if (f === 'unmeasured') unmeasured.push(m);
        else if (f === 'carried') carried.push(m);
      }
      out.push({ object: obj.id, boundary: b.id, carried, transformed, lost, unmeasured, degraded: lost.length > 0 });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// §5 — THE BOUNDARIES (every point a graph is REBUILT rather than passed on)
// ----------------------------------------------------------------------------

/**
 * A rebuild point is any site that constructs a new object field-by-field
 * instead of forwarding one. Those are the sites where an unnamed key vanishes
 * silently, under a green suite — which is why the boundary list is keyed on
 * the CONSTRUCTOR, not on the repo.
 */
export interface SemanticBoundary {
  readonly id: string;
  readonly repo: 'cee' | 'plot' | 'isl';
  /** The constructor site, as `path:symbol`. */
  readonly site: string;
  /** Which canonical roots pass through this boundary. */
  readonly roots: readonly CanonicalRootName[];
  readonly note: string;
}

export const SEMANTIC_BOUNDARIES: readonly SemanticBoundary[] = Object.freeze([
  {
    id: 'cee.v3_node_egress',
    repo: 'cee',
    site: 'src/cee/transforms/schema-v3.ts:transformNodeToV3',
    roots: ['node'],
    note:
      'Rebuilds the node field-by-field. Its own source says so: "the transform ' +
      'rebuilds the node field-by-field, so an unnamed key is dropped here ' +
      'silently, under a green suite."',
  },
  {
    id: 'plot.graph_normaliser',
    repo: 'plot',
    site: 'src/normalisation/graph-normaliser.ts',
    roots: ['node', 'edge', 'option'],
    note: 'PLoT ingress: CEE V3 wire -> EngineNodeV3. Object literal, no spread.',
  },
  {
    id: 'plot.isl_observed_state',
    repo: 'plot',
    site: 'src/integrations/isl/translator-v3.ts:toISLObservedState',
    roots: ['node'],
    note:
      'GUARDED — the one projection with the full pin set: satisfies + ' +
      'exhaustiveness + canonical-union, plus a test-time mirror against the ' +
      'pinned ISL OpenAPI. This is the pattern the other projections need.',
  },
  {
    id: 'plot.isl_node',
    repo: 'plot',
    site: 'src/integrations/isl/translator-v3.ts:toISLNode',
    roots: ['node'],
    note: 'UNGUARDED six-field object literal. Nothing fails when the contract grows.',
  },
  {
    id: 'plot.isl_edge',
    repo: 'plot',
    site: 'src/integrations/isl/translator-v3.ts:toISLEdge',
    roots: ['edge'],
    note: 'UNGUARDED four-field object literal.',
  },
  {
    id: 'plot.isl_interventions',
    repo: 'plot',
    site: 'src/integrations/isl/translator-v3.ts:toISLInterventions',
    roots: ['option'],
    note:
      'UNGUARDED, and the sharpest instance of the invariant: it flattens ' +
      '`InterventionValueV3` to `Record<string, number>` and its own doc says ' +
      '"the source metadata is stripped for the wire format".',
  },
  {
    id: 'plot.isl_option',
    repo: 'plot',
    site: 'src/integrations/isl/translator-v3.ts:toISLOption',
    roots: ['option'],
    note: 'UNGUARDED three-field object literal.',
  },
  {
    id: 'plot.isl_parameter_uncertainties',
    repo: 'plot',
    site: 'src/integrations/isl/translator-v3.ts:buildParameterUncertaintiesV3',
    roots: ['node'],
    note:
      'UNGUARDED. Synthesises a std where the contract carries none — the one ' +
      'boundary that INVENTS an uncertainty rather than dropping one.',
  },
  {
    id: 'plot.isl_goal_constraints',
    repo: 'plot',
    site: 'src/lib/constraint-compiler.ts + src/lib/constraint-filter.ts',
    roots: ['goal_constraint'],
    note:
      'Compiles constraints for ISL and FILTERS some out. Temporal constraints ' +
      'are deleted here by design (time is not a modelled dimension) — that is ' +
      'an honest drop that must be DISCLOSED, not a defect to fix.',
  },
]);

// ----------------------------------------------------------------------------
// §6 — THE FATES
// ----------------------------------------------------------------------------

export const FATE_VALUES = [
  /** Arrives on the far side under the same name. */
  'carried',
  /** Arrives, but relocated / renamed / reshaped. Must name `to`. */
  'transformed',
  /** Structurally deleted at this boundary. Must appear in KNOWN_DROPPED. */
  'dropped',
  /** This root does not pass through this boundary at all. */
  'not_applicable',
  /** Never derived. Must carry `re_derive_by`; the gate fails when it passes. */
  'unmeasured',
] as const;
export type Fate = (typeof FATE_VALUES)[number];

export interface BoundaryFate {
  readonly fate: Fate;
  /** Status-ladder rung the evidence reached. */
  readonly rung: 'CODE_EXISTS' | 'TESTED' | 'DEPLOYED' | 'MOUNTED' | 'WIRE_WITNESSED' | 'NONE';
  /** Key of MEASUREMENT_SHAS the derivation was performed at, or null. */
  readonly measured_at: 'schemas' | 'cee' | 'plot' | 'isl' | null;
  /** Required for `transformed`: where it ends up. */
  readonly to?: string;
  /** Required for `unmeasured`: the date the gate starts failing. */
  readonly re_derive_by?: string;
  readonly reason: string;
}

/** `${boundaryId}::${leafPath}` -> fate. */
export type FateKey = string;
export const fateKey = (boundaryId: string, path: string): FateKey => `${boundaryId}::${path}`;

/**
 * The declared fate of every axis member at every boundary its root passes.
 *
 * ⚠ THE PRODUCT IS DERIVED, THE CELLS ARE DECLARED. The gate computes
 * {axis members} × {boundaries whose `roots` contain that member's root} and
 * requires a cell for each. Mint a field, or add a boundary, and the missing
 * cells fail the build. Nobody has to remember to extend this table; they are
 * only allowed to fill it in.
 *
 * Only cells that are NOT `carried` are written here — `carried` is the
 * default, and writing forty tautological rows would bury the twelve that say
 * something. `DEFAULT_FATE` below makes that explicit rather than implicit.
 */
export const DEFAULT_FATE: BoundaryFate = Object.freeze({
  fate: 'unmeasured',
  rung: 'NONE',
  measured_at: null,
  re_derive_by: '2026-10-31',
  reason:
    'No derivation has been performed for this cell. This is the DEFAULT, and it ' +
    'is deliberately `unmeasured` rather than `carried`: assuming a field survives ' +
    'a rebuild point it was never checked at is precisely the optimism this suite ' +
    'exists to remove.',
});

export const AXIS_BOUNDARY_FATES: Readonly<Record<FateKey, BoundaryFate>> = Object.freeze({
  // --- CEE V3 node egress (measured at cee caceba1a) -------------------------
  [fateKey('cee.v3_node_egress', 'node.observed_state.declared_scale')]: {
    fate: 'unmeasured',
    rung: 'NONE',
    measured_at: null,
    re_derive_by: '2026-10-31',
    reason:
      'CEE stamps an UNTYPED `declared_scale` at unreachable-factors.ts and reads ' +
      'it once, display-only. Whether the V3 egress transform names it was not ' +
      'derived. Do not assume: the transform drops unnamed keys silently.',
  },
  [fateKey('cee.v3_node_egress', 'node.goal_threshold_frame')]: {
    fate: 'carried',
    rung: 'CODE_EXISTS',
    measured_at: 'cee',
    reason:
      'Named explicitly at schema-v3.ts, gated on the threshold being present so ' +
      'the frame can never travel without the number it describes.',
  },
  [fateKey('cee.v3_node_egress', 'node.observed_state.elicited_from.round_id')]: DEFAULT_FATE,
  [fateKey('cee.v3_node_egress', 'node.observed_state.elicited_from.participant_id')]: DEFAULT_FATE,
  [fateKey('cee.v3_node_egress', 'node.observed_state.elicited_from.evidence_event_id')]: DEFAULT_FATE,

  // --- PLoT ingress (measured at plot 75e7f974, rg -a with contrast) ---------
  [fateKey('plot.graph_normaliser', 'node.observed_state.declared_scale')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      '`declared_scale` reads ZERO files across plot/src (contrast in the same ' +
      'run: observed_state 37 files, raw_value 14 — the instrument was sighted). ' +
      'The declared scale of every factor value is deleted at PLoT ingress.',
  },
  [fateKey('plot.graph_normaliser', 'node.observed_state.elicited_from.round_id')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: '`elicited_from` reads ZERO files across plot/src, same contrast run.',
  },
  [fateKey('plot.graph_normaliser', 'node.observed_state.elicited_from.participant_id')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: '`elicited_from` reads ZERO files across plot/src, same contrast run.',
  },
  [fateKey('plot.graph_normaliser', 'node.observed_state.elicited_from.evidence_event_id')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: '`elicited_from` reads ZERO files across plot/src, same contrast run.',
  },
  [fateKey('plot.graph_normaliser', 'option.raw_interventions{}')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      '`raw_interventions` reads ZERO files across plot/src (contrast: ' +
      'interventions 43 files). The user-unit spelling of every intervention is ' +
      'deleted at ingress, leaving only the model-scale number.',
  },
  [fateKey('plot.graph_normaliser', 'goal_constraint.provenance_unit_normalised.rule')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      '`provenance_unit_normalised` reads ZERO files across plot/src (contrast: ' +
      'goal_constraints 16 files). The audit trail for the percent->fraction ' +
      'rewrite does not survive ingress.',
  },
  [fateKey('plot.graph_normaliser', 'goal_constraint.provenance_unit_normalised.original_value')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Same zero-with-contrast measurement as the sibling `rule` field.',
  },
  [fateKey('plot.graph_normaliser', 'goal_constraint.provenance_unit_normalised.original_unit')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Same zero-with-contrast measurement as the sibling `rule` field.',
  },

  // --- PLoT -> ISL projections (measured at plot 75e7f974, read at the bytes) --
  [fateKey('plot.isl_observed_state', 'node.observed_state.declared_scale')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      'ISL_DECLARED_OBSERVED_STATE_FIELDS is a ten-member allow-list and this is ' +
      'not on it. The projection is by presence over that list, so an undeclared ' +
      'key cannot transit even if ingress had preserved it.',
  },
  [fateKey('plot.isl_observed_state', 'node.observed_state.elicited_from.round_id')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Not on ISL_DECLARED_OBSERVED_STATE_FIELDS.',
  },
  [fateKey('plot.isl_observed_state', 'node.observed_state.elicited_from.participant_id')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Not on ISL_DECLARED_OBSERVED_STATE_FIELDS.',
  },
  [fateKey('plot.isl_observed_state', 'node.observed_state.elicited_from.evidence_event_id')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Not on ISL_DECLARED_OBSERVED_STATE_FIELDS.',
  },
  [fateKey('plot.isl_node', 'node.goal_threshold')]: {
    fate: 'transformed',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    to: 'ISLRobustnessRequestV3.goal_threshold (request-level scalar)',
    reason:
      'toISLNode is a six-field literal that does not name it; the threshold ' +
      'travels as a REQUEST scalar instead. Relocation, not loss — but a reader ' +
      'looking for it on the node will not find it.',
  },
  [fateKey('plot.isl_node', 'node.goal_threshold_frame')]: {
    fate: 'transformed',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    to: 'ISLRobustnessRequestV3.goal_threshold_frame (request-level scalar)',
    reason:
      '⚠ CORRECTS A STALE CONTRACT COMMENT. graph.ts still says "PLoT DOES NOT ' +
      'FORWARD THIS FIELD TODAY, AND WILL NOT BY DEFAULT", derived at PLoT ' +
      '9beb4229. At 75e7f974 it DOES: translator-v3.ts assigns ' +
      '`request.goal_threshold_frame`, and the frame reads across three files ' +
      '(contrast in the same run: declared_scale 0, scale_frame 0). The comment ' +
      'went stale under a green suite, which is the drift this cell now pins.',
  },
  [fateKey('plot.isl_node', 'node.state_space.range.min')]: {
    fate: 'unmeasured',
    rung: 'NONE',
    measured_at: null,
    re_derive_by: '2026-10-31',
    reason:
      '`state_space` reads across nine PLoT files, so it is NOT absent — but ' +
      'toISLNode does not name it, and which of those nine sites (if any) puts ' +
      'the range on the ISL request was not traced. Presence-in-repo is not ' +
      'presence-on-the-wire; recording this as `carried` would be exactly that ' +
      'error.',
  },
  [fateKey('plot.isl_node', 'node.state_space.range.max')]: {
    fate: 'unmeasured',
    rung: 'NONE',
    measured_at: null,
    re_derive_by: '2026-10-31',
    reason: 'Same as the sibling `min` — nine files present, projection untraced.',
  },
  [fateKey('plot.isl_edge', 'edge.effect_direction')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      'toISLEdge is a four-field literal: from, to, exists_probability, strength ' +
      '{mean,std}. `effect_direction` reads across seven PLoT files but is not ' +
      'among them — the clearest available demonstration that presence in a repo ' +
      'says nothing about arrival at a boundary.',
  },
  [fateKey('plot.isl_interventions', 'option.raw_interventions{}')]: {
    fate: 'not_applicable',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      'Already deleted one hop earlier at PLoT ingress; there is nothing left ' +
      'here to drop. Recorded so the chain reads honestly rather than implying ' +
      'this boundary is where it went.',
  },
  [fateKey('plot.isl_interventions', 'option.status')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      'toISLInterventions returns Record<string, number>. Its own doc: "the ' +
      'source metadata is stripped for the wire format". Every qualifier an ' +
      'intervention carried arrives as nothing; the number arrives alone.',
  },
  [fateKey('plot.isl_option', 'option.raw_interventions{}')]: {
    fate: 'not_applicable',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Deleted at ingress; toISLOption never sees it.',
  },
  [fateKey('plot.isl_option', 'option.status')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      'toISLOption is a three-field literal (id, label, interventions). The ' +
      'readiness status that says whether the interventions are even encoded ' +
      'does not travel with them.',
  },
  [fateKey('plot.isl_parameter_uncertainties', 'node.observed_state.std')]: {
    fate: 'transformed',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    to: 'parameter_uncertainties[].std, clamped to [MIN_USER_STD, MAX_USER_STD]',
    reason:
      'A finite positive user std is honoured and clamped; a non-finite, zero or ' +
      'negative one is treated as MISSING and a default is SYNTHESISED. This is ' +
      'the one boundary that invents an uncertainty rather than dropping one, ' +
      'which is why it is a distinct fate and not a carry.',
  },
  [fateKey('plot.isl_parameter_uncertainties', 'node.observed_state.declared_scale')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      'Zero files in plot/src. The synthesised std is a fraction of |value| with ' +
      'no knowledge of the scale that value is on.',
  },
  [fateKey('plot.isl_goal_constraints', 'goal_constraint.deadline_metadata.deadline_date')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason:
      'HONEST BY DESIGN — temporal constraints are filtered out because time is ' +
      'not a modelled dimension. This cell exists so the drop is DISCLOSED. It ' +
      'is not a defect and must not be "fixed" into a carry.',
  },
  [fateKey('plot.isl_goal_constraints', 'goal_constraint.deadline_metadata.reference_date')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Same deliberate temporal filter as the sibling deadline_date.',
  },
  [fateKey('plot.isl_goal_constraints', 'goal_constraint.deadline_metadata.assumed_reference_date')]: {
    fate: 'dropped',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Same deliberate temporal filter.',
  },
  [fateKey('plot.isl_goal_constraints', 'goal_constraint.provenance_unit_normalised.rule')]: {
    fate: 'not_applicable',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Deleted at ingress; the compiler never sees it.',
  },
  [fateKey('plot.isl_goal_constraints', 'goal_constraint.provenance_unit_normalised.original_value')]: {
    fate: 'not_applicable',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Deleted at ingress.',
  },
  [fateKey('plot.isl_goal_constraints', 'goal_constraint.provenance_unit_normalised.original_unit')]: {
    fate: 'not_applicable',
    rung: 'CODE_EXISTS',
    measured_at: 'plot',
    reason: 'Deleted at ingress.',
  },
});

/**
 * THE KNOWN-DROPPED SET — asserted EXACTLY, and RED if it grows OR shrinks.
 *
 * ⚠ WHY BOTH DIRECTIONS. A set that only fails on growth lets a fix land
 * silently, so nobody learns the gap closed and the suite stays green for the
 * wrong reason. A set that only fails on shrinkage cannot see a new loss at
 * all. A gap recorded in the suite is honest; a gap invisible to it is how
 * four rounds of the same defect happen.
 *
 * Membership is DERIVED from AXIS_BOUNDARY_FATES (every cell whose fate is
 * `dropped`), so the two cannot disagree — this constant is the EXPECTED
 * value the derivation is asserted against, never a second source of truth.
 */
export const KNOWN_DROPPED: readonly FateKey[] = Object.freeze([
  'plot.graph_normaliser::goal_constraint.provenance_unit_normalised.original_unit',
  'plot.graph_normaliser::goal_constraint.provenance_unit_normalised.original_value',
  'plot.graph_normaliser::goal_constraint.provenance_unit_normalised.rule',
  'plot.graph_normaliser::node.observed_state.declared_scale',
  'plot.graph_normaliser::node.observed_state.elicited_from.evidence_event_id',
  'plot.graph_normaliser::node.observed_state.elicited_from.participant_id',
  'plot.graph_normaliser::node.observed_state.elicited_from.round_id',
  'plot.graph_normaliser::option.raw_interventions{}',
  'plot.isl_edge::edge.effect_direction',
  'plot.isl_goal_constraints::goal_constraint.deadline_metadata.assumed_reference_date',
  'plot.isl_goal_constraints::goal_constraint.deadline_metadata.deadline_date',
  'plot.isl_goal_constraints::goal_constraint.deadline_metadata.reference_date',
  'plot.isl_interventions::option.status',
  'plot.isl_observed_state::node.observed_state.declared_scale',
  'plot.isl_observed_state::node.observed_state.elicited_from.evidence_event_id',
  'plot.isl_observed_state::node.observed_state.elicited_from.participant_id',
  'plot.isl_observed_state::node.observed_state.elicited_from.round_id',
  'plot.isl_option::option.status',
  'plot.isl_parameter_uncertainties::node.observed_state.declared_scale',
]);

/**
 * THE BARE FLOATS WE CURRENTLY SHIP — asserted EXACTLY, RED if it grows OR shrinks.
 *
 * Each entry is `${boundary}::${quantity}`: a number that crosses that rebuild
 * point with every single one of its declared qualifiers deleted. Derived from
 * `unqualifiedCrossings()`, so this constant is the EXPECTED value, never a
 * second source of truth.
 *
 * ⚠ THIS LIST IS THE PRODUCT FINDING, not an implementation detail. Both
 * entries are one number: an option's intervention magnitude arriving at the
 * science layer with neither its readiness status nor its user-unit spelling.
 * `toISLInterventions` says so in its own doc — "the source metadata is
 * stripped for the wire format" — and until now nothing failed when it did.
 */
export const KNOWN_UNQUALIFIED_CROSSINGS: readonly string[] = Object.freeze([
  'plot.isl_interventions::option.interventions{}',
  'plot.isl_option::option.interventions{}',
]);

// ----------------------------------------------------------------------------
// §7 — THE CHECKS (pure, injectable, and reported BY IDENTITY)
// ----------------------------------------------------------------------------

/**
 * Every problem is keyed by the SUBJECT it is about — the leaf path, or the
 * `boundary::path` cell. That is what lets a test assert "object A is clean
 * while object B is not" in one run, which is the only way to show an
 * assertion is BOUND to its object rather than merely SENSITIVE to change.
 */
export interface TruthProblem {
  readonly code: string;
  readonly subject: string;
  readonly message: string;
}

/** Everything the checks need, injectable so a test can perturb exactly one input. */
export interface TruthRegistry {
  readonly roots: Record<string, z.ZodTypeAny>;
  readonly axes: Readonly<Record<string, readonly SemanticAxis[]>>;
  readonly notSemantic: Readonly<Record<string, string>>;
  readonly qualifiers: Readonly<Record<string, readonly string[]>>;
  readonly boundaries: readonly SemanticBoundary[];
  readonly fates: Readonly<Record<FateKey, BoundaryFate>>;
  readonly knownDropped: readonly FateKey[];
  readonly knownUnqualifiedCrossings: readonly string[];
  readonly objects: readonly SemanticObject[];
}

export const LIVE_REGISTRY: TruthRegistry = Object.freeze({
  roots: CANONICAL_GRAPH_ROOTS,
  axes: SEMANTIC_AXES,
  notSemantic: NOT_SEMANTIC,
  qualifiers: QUANTITY_QUALIFIERS,
  boundaries: SEMANTIC_BOUNDARIES,
  fates: AXIS_BOUNDARY_FATES,
  knownDropped: KNOWN_DROPPED,
  knownUnqualifiedCrossings: KNOWN_UNQUALIFIED_CROSSINGS,
  objects: SEMANTIC_OBJECTS,
});

const rootOf = (path: string): string => path.split(/[.[{|]/)[0] as string;

/**
 * LIMB 0 — COMPLETENESS. Every derived leaf is classified, in both directions.
 * This is the check that makes minting a qualifier without classifying it
 * impossible, and it is the only limb whose failure means "somebody added a
 * field and did not think about it".
 */
export function checkClassificationCompleteness(reg: TruthRegistry): TruthProblem[] {
  const problems: TruthProblem[] = [];
  const derived = canonicalGraphLeafPaths(reg.roots);
  const classified = new Set([...Object.keys(reg.axes), ...Object.keys(reg.notSemantic)]);

  for (const path of derived) {
    const inAxes = path in reg.axes;
    const inNot = path in reg.notSemantic;
    if (!inAxes && !inNot) {
      problems.push({
        code: 'E_UNCLASSIFIED',
        subject: path,
        message:
          `the contract declares this leaf and neither SEMANTIC_AXES nor ` +
          `NOT_SEMANTIC classifies it — say which axes it carries, or say why it ` +
          `carries none. An unclassified field is how a qualifier ships dark.`,
      });
    }
    if (inAxes && inNot) {
      problems.push({
        code: 'E_DOUBLE_CLASSIFIED',
        subject: path,
        message: 'classified as BOTH meaning-bearing and not — the two cannot both be true',
      });
    }
    if (inAxes && (reg.axes[path] ?? []).length === 0) {
      problems.push({
        code: 'E_EMPTY_AXES',
        subject: path,
        message: 'listed in SEMANTIC_AXES with no axis — an empty classification asserts nothing',
      });
    }
    if (inNot && !(reg.notSemantic[path] ?? '').trim()) {
      problems.push({
        code: 'E_NO_REASON',
        subject: path,
        message:
          'declared not-semantic with no reason. "Not semantic" and "nobody looked" ' +
          'are indistinguishable without one, and they have opposite consequences',
      });
    }
  }

  const derivedSet = new Set(derived);
  for (const path of classified) {
    if (!derivedSet.has(path)) {
      problems.push({
        code: 'E_STALE_CLASSIFICATION',
        subject: path,
        message:
          'classified, but the contract no longer declares this leaf. A stale row ' +
          'reads as coverage and is not — delete it, or restore the field',
      });
    }
  }
  return problems;
}

/**
 * LIMB 0b — THE COMPANION RULE. Every quantity names the qualifiers that give
 * it meaning; every named qualifier is itself a classified axis member.
 */
export function checkQuantityCompanions(reg: TruthRegistry): TruthProblem[] {
  const problems: TruthProblem[] = [];
  const quantities = Object.keys(reg.axes).filter((p) => (reg.axes[p] ?? []).includes('quantity'));

  for (const q of quantities) {
    const companions = reg.qualifiers[q];
    if (companions === undefined) {
      problems.push({
        code: 'E_BARE_FLOAT',
        subject: q,
        message:
          'a `quantity` leaf with no QUANTITY_QUALIFIERS entry — this is the bare ' +
          'float the whole suite exists to prevent. Name the fields without which ' +
          'the number is meaningless',
      });
      continue;
    }
    if (companions.length === 0) {
      problems.push({
        code: 'E_BARE_FLOAT',
        subject: q,
        message: 'declared with an EMPTY qualifier set — an empty companion list is a bare float with paperwork',
      });
    }
    for (const c of companions) {
      if (!(c in reg.axes)) {
        problems.push({
          code: 'E_QUALIFIER_NOT_AN_AXIS',
          subject: `${q} -> ${c}`,
          message:
            'names a companion that is not a classified axis member. A qualifier ' +
            'nothing classifies is a qualifier nothing transports',
        });
      }
      if (c === q) {
        problems.push({
          code: 'E_SELF_QUALIFIER',
          subject: q,
          message: 'names itself as its own qualifier — a number cannot say what it means',
        });
      }
    }
  }

  for (const q of Object.keys(reg.qualifiers)) {
    if (!(reg.axes[q] ?? []).includes('quantity')) {
      problems.push({
        code: 'E_QUALIFIERS_FOR_NON_QUANTITY',
        subject: q,
        message: 'has a qualifier set but is not classified `quantity` — one of the two is wrong',
      });
    }
  }
  return problems;
}

/**
 * LIMB 1 — FATE COMPLETENESS. The product {axis members} × {boundaries their
 * root crosses} is DERIVED; every cell must be declared, every declaration
 * must be well-formed, and every `unmeasured` cell must carry a live deadline.
 */
export function checkBoundaryFates(reg: TruthRegistry, today = new Date().toISOString().slice(0, 10)): TruthProblem[] {
  const problems: TruthProblem[] = [];
  const boundaryIds = new Set(reg.boundaries.map((b) => b.id));

  for (const b of reg.boundaries) {
    for (const path of Object.keys(reg.axes)) {
      if (!b.roots.includes(rootOf(path) as CanonicalRootName)) continue;
      const key = fateKey(b.id, path);
      const declared = reg.fates[key];
      const cell = declared ?? { fate: 'carried' as Fate, rung: 'NONE' as const, measured_at: null, reason: 'default' };

      if (declared === undefined) continue; // `carried` by default — see DEFAULT_FATE note

      if (!FATE_VALUES.includes(cell.fate)) {
        problems.push({ code: 'E_BAD_FATE', subject: key, message: `fate "${cell.fate}" is not in the closed vocabulary` });
      }
      if (!cell.reason?.trim()) {
        problems.push({ code: 'E_FATE_NO_REASON', subject: key, message: 'a fate with no reason is an assertion with no evidence' });
      }
      if (cell.fate === 'transformed' && !cell.to?.trim()) {
        problems.push({
          code: 'E_TRANSFORM_NO_TARGET',
          subject: key,
          message: '`transformed` without naming `to` is indistinguishable from `dropped` for every reader',
        });
      }
      if (cell.fate === 'unmeasured') {
        if (!cell.re_derive_by) {
          problems.push({
            code: 'E_UNMEASURED_NO_DEADLINE',
            subject: key,
            message:
              '`unmeasured` with no re_derive_by. A parked question with no trigger ' +
              'is how this estate loses schedulers rather than records',
          });
        } else if (cell.re_derive_by < today) {
          problems.push({
            code: 'E_UNMEASURED_EXPIRED',
            subject: key,
            message: `re_derive_by ${cell.re_derive_by} has passed — derive this cell or delete the field`,
          });
        }
        if (cell.measured_at !== null) {
          problems.push({ code: 'E_UNMEASURED_WITH_SHA', subject: key, message: '`unmeasured` cannot name a measurement SHA' });
        }
      }
      if (cell.fate !== 'unmeasured' && cell.measured_at === null) {
        problems.push({
          code: 'E_MEASURED_WITHOUT_SHA',
          subject: key,
          message: 'a measured fate must name the SHA it was derived at — a claim with no tip is not a result',
        });
      }
    }
  }

  for (const key of Object.keys(reg.fates)) {
    const [bid, path] = key.split('::');
    if (!boundaryIds.has(bid as string)) {
      problems.push({ code: 'E_FATE_UNKNOWN_BOUNDARY', subject: key, message: `names boundary "${bid}", which SEMANTIC_BOUNDARIES does not declare` });
      continue;
    }
    if (!(path as string in reg.axes)) {
      problems.push({
        code: 'E_FATE_UNKNOWN_PATH',
        subject: key,
        message: `names "${path}", which is not a classified axis member — a fate for a field nobody classified`,
      });
    }
  }
  return problems;
}

/**
 * LIMB 1b — THE KNOWN-DROPPED SET, asserted EXACTLY in both directions.
 */
export function checkKnownDropped(reg: TruthRegistry): TruthProblem[] {
  const problems: TruthProblem[] = [];
  const actual = new Set(Object.entries(reg.fates).filter(([, f]) => f.fate === 'dropped').map(([k]) => k));
  const expected = new Set(reg.knownDropped);

  for (const k of actual) {
    if (!expected.has(k)) {
      problems.push({
        code: 'E_NEW_DROP',
        subject: k,
        message: 'a drop that KNOWN_DROPPED does not record — a new loss, or a loss nobody wrote down',
      });
    }
  }
  for (const k of expected) {
    if (!actual.has(k)) {
      problems.push({
        code: 'E_STALE_DROP',
        subject: k,
        message:
          'KNOWN_DROPPED records a drop the fates no longer declare. If the gap ' +
          'closed, say so by removing this entry — a set that only fails on growth ' +
          'lets a fix land invisibly and stays green for the wrong reason',
      });
    }
  }
  return problems;
}

/**
 * LIMB 1c — THE INVARIANT ITSELF. A quantity that crosses a boundary while
 * EVERY ONE of its declared qualifiers is dropped or absent there is a bare
 * float on the wire. This is the check that states the finding rather than its
 * symptoms, and it reports by identity so the offending crossing is named.
 */
export interface UnqualifiedCrossing {
  readonly boundary: string;
  readonly quantity: string;
  readonly lostQualifiers: readonly string[];
}

export function unqualifiedCrossings(reg: TruthRegistry = LIVE_REGISTRY): UnqualifiedCrossing[] {
  const out: UnqualifiedCrossing[] = [];
  const quantities = Object.keys(reg.axes).filter((p) => (reg.axes[p] ?? []).includes('quantity'));

  for (const b of reg.boundaries) {
    for (const q of quantities) {
      if (!b.roots.includes(rootOf(q) as CanonicalRootName)) continue;
      const qFate = reg.fates[fateKey(b.id, q)]?.fate ?? 'carried';
      if (qFate === 'dropped' || qFate === 'not_applicable') continue;

      const companions = reg.qualifiers[q] ?? [];
      const relevant = companions.filter((c) => b.roots.includes(rootOf(c) as CanonicalRootName));
      if (relevant.length === 0) continue;
      const lost = relevant.filter((c) => {
        const f = reg.fates[fateKey(b.id, c)]?.fate ?? 'carried';
        return f === 'dropped' || f === 'not_applicable';
      });
      if (lost.length === relevant.length) {
        out.push({ boundary: b.id, quantity: q, lostQualifiers: lost });
      }
    }
  }
  return out;
}

export function checkUnqualifiedCrossings(reg: TruthRegistry): TruthProblem[] {
  const problems: TruthProblem[] = [];
  const actual = new Set(unqualifiedCrossings(reg).map((c) => `${c.boundary}::${c.quantity}`));
  const expected = new Set(reg.knownUnqualifiedCrossings);

  for (const k of actual) {
    if (!expected.has(k)) {
      problems.push({
        code: 'E_NEW_BARE_FLOAT',
        subject: k,
        message:
          'a quantity now crosses this boundary with EVERY declared qualifier ' +
          'lost. This is the invariant the suite exists to stop — restore a ' +
          'qualifier, or record the regression here deliberately',
      });
    }
  }
  for (const k of expected) {
    if (!actual.has(k)) {
      problems.push({
        code: 'E_STALE_BARE_FLOAT',
        subject: k,
        message:
          'recorded as a bare-float crossing, but the fates no longer say so. If a ' +
          'qualifier now survives, remove this entry and say which one — a fix that ' +
          'lands invisibly teaches nobody that the gap closed',
      });
    }
  }
  return problems;
}

/** Everything, in one call. Used by the gate script and by the suite. */
export function checkGraphTruthContract(
  reg: TruthRegistry = LIVE_REGISTRY,
  today?: string,
): TruthProblem[] {
  return [
    ...checkClassificationCompleteness(reg),
    ...checkQuantityCompanions(reg),
    ...checkBoundaryFates(reg, today),
    ...checkKnownDropped(reg),
    ...checkUnqualifiedCrossings(reg),
    ...checkSemanticObjectCoverage(reg),
  ];
}

/** The suite's own epistemics, printed rather than assumed. */
export function graphTruthEpistemics(reg: TruthRegistry = LIVE_REGISTRY): {
  leaves: number;
  axisMembers: number;
  notSemantic: number;
  quantities: number;
  boundaries: number;
  declaredFates: number;
  unmeasuredFates: number;
  knownDropped: number;
  passthroughSites: number;
  shas: typeof MEASUREMENT_SHAS;
} {
  const walk = walkCanonicalGraph(reg.roots);
  const fates = Object.values(reg.fates);
  return {
    leaves: new Set(walk.leaves.map((l) => l.path)).size,
    axisMembers: Object.keys(reg.axes).length,
    notSemantic: Object.keys(reg.notSemantic).length,
    quantities: Object.keys(reg.axes).filter((p) => (reg.axes[p] ?? []).includes('quantity')).length,
    boundaries: reg.boundaries.length,
    declaredFates: fates.length,
    unmeasuredFates: fates.filter((f) => f.fate === 'unmeasured').length,
    knownDropped: reg.knownDropped.length,
    passthroughSites: walk.passthroughSites.filter((s) => s.unknownKeys === 'passthrough').length,
    shas: MEASUREMENT_SHAS,
  };
}

// ----------------------------------------------------------------------------
// §8 — LIMB 3: THE ROUND-TRIP LEAF DIFFER
// ----------------------------------------------------------------------------

/**
 * Enumerate every LEAF of a graph VALUE (not a schema), keyed BY IDENTITY.
 *
 * ⚠ ARRAYS ARE KEYED BY ELEMENT ID, NEVER BY POSITION, and that is the whole
 * point of writing this rather than reaching for a generic deep-diff. A
 * persisted graph that comes back with its nodes reordered is UNCHANGED; a
 * positional differ calls it a total rewrite, and the noise then hides the one
 * real loss. Worse, the inverse: two nodes swapping positions can make a
 * genuine change look like an equal exchange. Binding by id is the same rule
 * that stops an assertion passing on a sibling object.
 *
 * Elements with no recognisable identity fall back to `[i]` AND are reported,
 * so an identity the differ could not establish is visible rather than assumed.
 */
const IDENTITY_KEYS = ['id', 'constraint_id', 'node_id'] as const;

/**
 * ⚠ EDGES HAVE NO `id` IN THIS CONTRACT — found by running this differ against
 * the repo's own canonical fixture, which reported both edges as unidentified.
 * `EdgeV3Schema` declares `from`/`to`/`strength`/... and no identifier, so an
 * edge's identity IS its endpoint pair. Keying edges positionally would have
 * made a reordered edge array read as a total rewrite, and — worse — made two
 * edges swapping places look like an equal exchange of their strengths.
 *
 * The composite is derived here rather than assumed anywhere else: if the
 * contract ever gives edges an `id`, the `IDENTITY_KEYS` branch above wins and
 * this one stops being reached, with no second place to update.
 */
function elementIdentity(el: unknown): string | null {
  if (el === null || typeof el !== 'object' || Array.isArray(el)) return null;
  const rec = el as Record<string, unknown>;
  for (const k of IDENTITY_KEYS) {
    const v = rec[k];
    if (typeof v === 'string' && v.length > 0) return `${k}=${v}`;
  }
  if (typeof rec.from === 'string' && typeof rec.to === 'string' && rec.from && rec.to) {
    return `from=${rec.from}->to=${rec.to}`;
  }
  return null;
}

export interface ValueLeaves {
  readonly leaves: ReadonlyMap<string, unknown>;
  /** Array positions the differ could not bind to an identity. */
  readonly unidentifiedElements: readonly string[];
}

export function enumerateValueLeaves(value: unknown): ValueLeaves {
  const leaves = new Map<string, unknown>();
  const unidentifiedElements: string[] = [];

  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > 24) {
      leaves.set(`${path}<DEPTH_LIMIT>`, '<DEPTH_LIMIT>');
      return;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) {
        // An empty array is a LEAF, not nothing. `goal_constraints: []` is a
        // producer attesting "no constraints"; treating it as absent would make
        // an attestation and a silence indistinguishable.
        leaves.set(`${path}[]<empty>`, '<empty array>');
        return;
      }
      v.forEach((el, i) => {
        const ident = elementIdentity(el);
        // Only an OBJECT with no identity is a reporting failure. A primitive
        // in an array (a `categories` level name) has no identity to find and
        // is legitimately positional — reporting it would bury the real cases.
        const isObject = el !== null && typeof el === 'object' && !Array.isArray(el);
        if (ident === null && isObject) unidentifiedElements.push(`${path}[${i}]`);
        walk(el, `${path}[${ident ?? i}]`, depth + 1);
      });
      return;
    }
    if (v !== null && typeof v === 'object') {
      const keys = Object.keys(v as Record<string, unknown>);
      if (keys.length === 0) {
        leaves.set(`${path}{}<empty>`, '<empty object>');
        return;
      }
      for (const k of keys) walk((v as Record<string, unknown>)[k], path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    leaves.set(path, v);
  };

  walk(value, '', 0);
  return { leaves, unidentifiedElements };
}

export interface LeafDiff {
  /** Present before, absent after — the loss class this suite exists to catch. */
  readonly lost: readonly string[];
  /** Absent before, present after. */
  readonly gained: readonly string[];
  /** Present in both, different value. */
  readonly changed: readonly { readonly path: string; readonly before: unknown; readonly after: unknown }[];
  readonly beforeCount: number;
  readonly afterCount: number;
}

export function diffGraphLeaves(before: unknown, after: unknown): LeafDiff {
  const a = enumerateValueLeaves(before).leaves;
  const b = enumerateValueLeaves(after).leaves;
  const lost: string[] = [];
  const gained: string[] = [];
  const changed: { path: string; before: unknown; after: unknown }[] = [];

  for (const [k, v] of a) {
    if (!b.has(k)) lost.push(k);
    else if (!Object.is(b.get(k), v)) changed.push({ path: k, before: v, after: b.get(k) });
  }
  for (const k of b.keys()) if (!a.has(k)) gained.push(k);

  return {
    lost: lost.sort(),
    gained: gained.sort(),
    changed: changed.sort((x, y) => x.path.localeCompare(y.path)),
    beforeCount: a.size,
    afterCount: b.size,
  };
}

// ----------------------------------------------------------------------------
// §9 — THE CROSS-REPO BOND (what stops the fate table becoming a mirror)
// ----------------------------------------------------------------------------

/**
 * Where each PLoT boundary's projection actually lives, so the fate table can
 * be CHECKED AGAINST THE PROJECTION rather than describing it from memory.
 *
 * ⚠ THIS IS THE ANSWER TO THE OBVIOUS OBJECTION. Everything above is derived
 * from the contract — but `AXIS_BOUNDARY_FATES` is a hand-written description
 * of ANOTHER REPO's code, which is the hand-maintained-mirror defect wearing a
 * new hat. `scripts/check-plot-projection-drift.mjs` closes that: given
 * `OLUMI_ESTATE_ROOT` it DERIVES each projection's real key set from PLoT's
 * source and asserts, in both directions, that a `carried` fate names a key the
 * projection emits and a `dropped` fate names one it does not.
 *
 * When the estate root is unset the check reports SKIPPED **loudly** and says
 * so in its output — never silently, because a check that quietly stops
 * checking is indistinguishable from one that found nothing wrong.
 *
 * `keyDepth` says which path segment is the projected key: 1 for `edge.<key>`,
 * 2 for `node.observed_state.<key>`. Declared rather than inferred, because
 * inferring it from the path shape would silently mis-key a nested projection.
 */
export interface PlotProjection {
  readonly boundary: string;
  readonly file: string;
  /** `object-literal` reads the returned literal's keys; `const-array` reads a `[...] as const`. */
  readonly form: 'object-literal' | 'const-array';
  readonly symbol: string;
  /** Path prefix whose next segment is the projected key. */
  readonly pathPrefix: string;
  readonly keyDepth: number;
}

export const PLOT_PROJECTIONS: readonly PlotProjection[] = Object.freeze([
  {
    boundary: 'plot.isl_observed_state',
    file: 'src/integrations/isl/translator-v3.ts',
    form: 'const-array',
    symbol: 'ISL_DECLARED_OBSERVED_STATE_FIELDS',
    pathPrefix: 'node.observed_state.',
    keyDepth: 2,
  },
  {
    boundary: 'plot.isl_node',
    file: 'src/integrations/isl/translator-v3.ts',
    form: 'object-literal',
    symbol: 'toISLNode',
    pathPrefix: 'node.',
    keyDepth: 1,
  },
  {
    boundary: 'plot.isl_edge',
    file: 'src/integrations/isl/translator-v3.ts',
    form: 'object-literal',
    symbol: 'toISLEdge',
    pathPrefix: 'edge.',
    keyDepth: 1,
  },
  {
    boundary: 'plot.isl_option',
    file: 'src/integrations/isl/translator-v3.ts',
    form: 'object-literal',
    symbol: 'toISLOption',
    pathPrefix: 'option.',
    keyDepth: 1,
  },
]);

/** The projected key a member path lands on at a projection, or null. */
export function projectedKeyFor(projection: PlotProjection, path: string): string | null {
  if (!path.startsWith(projection.pathPrefix)) return null;
  const rest = path.slice(projection.pathPrefix.length);
  const key = rest.split(/[.[{|]/)[0];
  return key ? key : null;
}

/**
 * Compare a projection's DERIVED key set against what the fate table claims.
 * Pure — the caller does the file reading, so this is testable without an
 * estate checkout and cannot be defeated by a mocked filesystem.
 */
export function reconcileProjection(
  projection: PlotProjection,
  derivedKeys: readonly string[],
  reg: TruthRegistry = LIVE_REGISTRY,
): TruthProblem[] {
  const problems: TruthProblem[] = [];
  const emitted = new Set(derivedKeys);

  for (const path of Object.keys(reg.axes)) {
    const key = projectedKeyFor(projection, path);
    if (key === null) continue;
    const fate = reg.fates[fateKey(projection.boundary, path)]?.fate ?? 'carried';
    if (fate === 'carried' && !emitted.has(key)) {
      problems.push({
        code: 'E_CLAIMED_CARRIED_BUT_NOT_EMITTED',
        subject: fateKey(projection.boundary, path),
        message:
          `the fate table says this is carried, but ${projection.symbol} emits ` +
          `[${[...emitted].join(', ')}] and "${key}" is not among them. The table is ` +
          `describing a projection that no longer does this.`,
      });
    }
    if (fate === 'dropped' && emitted.has(key)) {
      problems.push({
        code: 'E_CLAIMED_DROPPED_BUT_EMITTED',
        subject: fateKey(projection.boundary, path),
        message:
          `the fate table records this as a known loss, but ${projection.symbol} DOES ` +
          `emit "${key}". A gap that has closed must be recorded as closed — a stale ` +
          `loss entry is how a fix lands invisibly and nobody learns it landed.`,
      });
    }
  }
  return problems;
}

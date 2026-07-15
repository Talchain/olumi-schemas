import { z } from 'zod';

// ============================================================================
// Maximality walker (W2E-1 hardening).
//
// THE HOLE THIS CLOSES: the completeness ratchet only checks schema *identity*
// membership — "does this exported schema have SOME registry entry?". It is
// therefore satisfied by an empty or trivial fixture, and the DOMINANT
// real-world drift path — adding a new optional field to an EXISTING exported
// schema — trips nothing at all. That is precisely the shape of every
// historical silent-drop incident (coaching, evidence, enrichment were all NEW
// FIELDS ON EXISTING SHAPES).
//
// This walker introspects each registered schema's `_def` (the same
// introspection the union-coverage tests already use) and reports every place
// the fixture library fails to be maximal:
//   * an optional / nullable field never populated in ANY fixture,
//   * an array / record / map / set left empty where the schema allows
//     contents,
//   * a union branch no fixture ever exercises.
//
// AGGREGATION BY SCHEMA IDENTITY. A gap is only reported if a shape is
// under-populated at EVERY site it appears across the whole registry. A nested
// `EdgeV3Schema` inside a `GraphV3Schema` fixture need not repeat every
// optional the standalone `EdgeV3Schema` fixture already carries — the
// question this library exists to answer is "does the library exercise this
// field ANYWHERE", not "at every site".
//
// NO SILENT SKIPS. Where a field genuinely cannot be populated, the caller
// passes an explicit documented exclusion keyed by the exact gap key printed
// in the failure message (see MAXIMALITY_EXCLUSIONS in ./index.ts). An
// exclusion is a conscious, reasoned decision, never an omission.
// ============================================================================

/** A place where the fixture library is not maximal. */
export interface MaximalityGap {
  /**
   * Stable exclusion key. `<SchemaName>.<relative.path>` where SchemaName is
   * the schema's exported `<namespace>/<ExportName>` when the walker was given
   * a name map, else the lexicographically-smallest observation site (so the
   * key is order-independent and does not shift when the registry is
   * reordered).
   */
  key: string;
  kind: 'unpopulated-field' | 'empty-collection' | 'unexercised-union-branch';
  /** Human-readable explanation, including a representative fixture site. */
  detail: string;
}

export interface AuditMaximalityOptions {
  /**
   * Identity → `<namespace>/<ExportName>`, used to build stable gap keys.
   * Typically built by enumerating the package entry points.
   */
  schemaNames?: ReadonlyMap<z.ZodTypeAny, string>;
  /**
   * Gap key → documented reason. Keys must match a real gap (no stale).
   * Honoured by BOTH `auditMaximality` (the gap is dropped) and
   * `maximalityStats` (the site is counted under `excluded*`), so the two
   * assertions a suite makes off this module stay simultaneously satisfiable
   * once an exclusion exists.
   */
  exclusions?: Readonly<Record<string, string>>;
  /** Recursion guard for lazy / self-referential schemas. */
  maxDepth?: number;
}

interface RegistryEntryLike {
  family: string;
  schema: z.ZodTypeAny;
  fixture: unknown;
}

// ----------------------------------------------------------------------------
// Wrapper unwrapping
// ----------------------------------------------------------------------------

/**
 * Step through every wrapper Zod puts between a field declaration and the
 * shape that actually carries fields: optional / nullable / default / catch /
 * readonly / branded / effects (refinements + transforms) / pipeline / lazy.
 * Returns the innermost "core" type.
 */
function unwrapCore(schema: z.ZodTypeAny, depth = 0): z.ZodTypeAny {
  if (depth > 20) return schema; // pathological wrapper nesting
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodBranded
  ) {
    return unwrapCore(def.innerType as z.ZodTypeAny, depth + 1);
  }
  if (schema instanceof z.ZodEffects) {
    return unwrapCore(def.schema as z.ZodTypeAny, depth + 1);
  }
  if (schema instanceof z.ZodPipeline) {
    // Input side: fixtures are wire-shaped inputs, not pipeline outputs.
    return unwrapCore(def.in as z.ZodTypeAny, depth + 1);
  }
  if (schema instanceof z.ZodLazy) {
    return unwrapCore((def.getter as () => z.ZodTypeAny)(), depth + 1);
  }
  return schema;
}

// ----------------------------------------------------------------------------
// Observation accumulators — all keyed by schema OBJECT IDENTITY
//
// NOTE: population is judged from the VALUE, not from whether the schema marks
// the field optional. A required field is always present in a valid fixture, so
// it is populated for free; a required-but-absent field is a fixture bug worth
// reporting anyway (see the trivial-fixture negative control). This keeps the
// walker honest about `z.any()` / `z.unknown()` fields too, which `isOptional()`
// would wrongly report as absent-tolerant.
// ----------------------------------------------------------------------------

interface ObjectObs {
  /** field name → was it ever populated at any site */
  populated: Map<string, boolean>;
  /** field name → representative site where it was seen unpopulated */
  sites: Map<string, string>;
  /** lexicographically-smallest site this object was observed at */
  minSite: string;
}

interface CollectionObs {
  nonEmpty: boolean;
  minSite: string;
  label: string;
}

interface UnionObs {
  seen: Set<number>;
  labels: string[];
  minSite: string;
}

function keepMin(current: string, candidate: string): string {
  return candidate < current ? candidate : current;
}

// ----------------------------------------------------------------------------
// The walker
// ----------------------------------------------------------------------------

interface WalkResult {
  objects: Map<z.ZodTypeAny, ObjectObs>;
  collections: Map<z.ZodTypeAny, CollectionObs>;
  unions: Map<z.ZodTypeAny, UnionObs>;
}

function runWalk(
  entries: readonly RegistryEntryLike[],
  options: AuditMaximalityOptions,
): WalkResult {
  const maxDepth = options.maxDepth ?? 40;

  const objects = new Map<z.ZodTypeAny, ObjectObs>();
  const collections = new Map<z.ZodTypeAny, CollectionObs>();
  const unions = new Map<z.ZodTypeAny, UnionObs>();

  function walk(
    schema: z.ZodTypeAny,
    value: unknown,
    site: string,
    depth: number,
  ): void {
    if (depth > maxDepth) return; // lazy / recursive guard
    if (value === undefined || value === null) return;

    const core = unwrapCore(schema);

    // -- object --------------------------------------------------------------
    if (core instanceof z.ZodObject) {
      const shape = core.shape as Record<string, z.ZodTypeAny>;
      let obs = objects.get(core);
      if (!obs) {
        obs = { populated: new Map(), sites: new Map(), minSite: site };
        for (const key of Object.keys(shape)) obs.populated.set(key, false);
        objects.set(core, obs);
      }
      obs.minSite = keepMin(obs.minSite, site);
      const record = value as Record<string, unknown>;
      for (const [key, fieldSchema] of Object.entries(shape)) {
        const fieldValue = record[key];
        const present = fieldValue !== undefined && fieldValue !== null;
        if (present) {
          obs.populated.set(key, true);
          walk(fieldSchema, fieldValue, `${site}.${key}`, depth + 1);
        } else if (!obs.sites.has(key)) {
          obs.sites.set(key, `${site}.${key}`);
        }
      }
      return;
    }

    // -- discriminated union -------------------------------------------------
    if (core instanceof z.ZodDiscriminatedUnion) {
      const opts = core.options as z.ZodTypeAny[];
      recordUnion(core, opts, value, site, depth);
      return;
    }

    // -- plain union ---------------------------------------------------------
    if (core instanceof z.ZodUnion) {
      const opts = (core as unknown as { options: z.ZodTypeAny[] }).options;
      recordUnion(core, opts, value, site, depth);
      return;
    }

    // -- intersection --------------------------------------------------------
    if (core instanceof z.ZodIntersection) {
      const def = (core as unknown as {
        _def: { left: z.ZodTypeAny; right: z.ZodTypeAny };
      })._def;
      walk(def.left, value, site, depth + 1);
      walk(def.right, value, site, depth + 1);
      return;
    }

    // -- tuple ---------------------------------------------------------------
    if (core instanceof z.ZodTuple) {
      const def = (core as unknown as {
        _def: { items: z.ZodTypeAny[]; rest?: z.ZodTypeAny | null };
      })._def;
      const arr = value as unknown[];
      def.items.forEach((item, i) => walk(item, arr[i], `${site}[${i}]`, depth + 1));
      if (def.rest) {
        for (let i = def.items.length; i < arr.length; i++) {
          walk(def.rest, arr[i], `${site}[${i}]`, depth + 1);
        }
      }
      return;
    }

    // -- array ---------------------------------------------------------------
    if (core instanceof z.ZodArray) {
      const arr = value as unknown[];
      observeCollection(core, arr.length > 0, site, 'array');
      const element = (core as unknown as { element: z.ZodTypeAny }).element;
      arr.forEach((item, i) => walk(element, item, `${site}[${i}]`, depth + 1));
      return;
    }

    // -- record --------------------------------------------------------------
    if (core instanceof z.ZodRecord) {
      const rec = value as Record<string, unknown>;
      const keys = Object.keys(rec);
      observeCollection(core, keys.length > 0, site, 'record');
      const valueType = (core as unknown as { valueSchema: z.ZodTypeAny }).valueSchema;
      for (const key of keys) walk(valueType, rec[key], `${site}.${key}`, depth + 1);
      return;
    }

    // -- set / map -----------------------------------------------------------
    if (core instanceof z.ZodSet) {
      const set = value as Set<unknown>;
      observeCollection(core, set.size > 0, site, 'set');
      const def = (core as unknown as { _def: { valueType: z.ZodTypeAny } })._def;
      let i = 0;
      for (const item of set) walk(def.valueType, item, `${site}{${i++}}`, depth + 1);
      return;
    }
    if (core instanceof z.ZodMap) {
      const map = value as Map<unknown, unknown>;
      observeCollection(core, map.size > 0, site, 'map');
      const def = (core as unknown as { _def: { valueType: z.ZodTypeAny } })._def;
      for (const [k, v] of map) walk(def.valueType, v, `${site}.${String(k)}`, depth + 1);
      return;
    }

    // scalars / any / unknown — nothing further to introspect.
  }

  function recordUnion(
    core: z.ZodTypeAny,
    opts: z.ZodTypeAny[],
    value: unknown,
    site: string,
    depth: number,
  ): void {
    let obs = unions.get(core);
    if (!obs) {
      obs = { seen: new Set(), labels: opts.map(unionMemberLabel), minSite: site };
      unions.set(core, obs);
    }
    obs.minSite = keepMin(obs.minSite, site);
    let matched = -1;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].safeParse(value).success) {
        obs.seen.add(i);
        if (matched === -1) matched = i;
      }
    }
    if (matched >= 0) walk(opts[matched], value, site, depth + 1);
  }

  function observeCollection(
    core: z.ZodTypeAny,
    nonEmpty: boolean,
    site: string,
    label: string,
  ): void {
    const obs = collections.get(core);
    if (!obs) {
      collections.set(core, { nonEmpty, minSite: site, label });
      return;
    }
    obs.nonEmpty = obs.nonEmpty || nonEmpty;
    obs.minSite = keepMin(obs.minSite, site);
  }

  for (const entry of entries) {
    walk(entry.schema, entry.fixture, entry.family, 0);
  }
  return { objects, collections, unions };
}

type Walk = ReturnType<typeof runWalk>;

/**
 * Reduce raw walk observations → the complete gap list, BEFORE exclusions are
 * applied. Both `auditMaximality` and `maximalityStats` derive from this single
 * function, so a gap key means exactly the same thing to the reporter and to
 * the counters — an exclusion cannot be honoured by one and ignored by the
 * other.
 */
function reduceGaps(
  { objects, collections, unions }: Walk,
  names?: ReadonlyMap<z.ZodTypeAny, string>,
): MaximalityGap[] {
  const gaps: MaximalityGap[] = [];

  const nameOf = (schema: z.ZodTypeAny, fallback: string): string =>
    names?.get(schema) ?? fallback;

  for (const [schema, obs] of objects) {
    for (const [field, populated] of obs.populated) {
      if (populated) continue;
      const key = `${nameOf(schema, obs.minSite)}.${field}`;
      gaps.push({
        key,
        kind: 'unpopulated-field',
        detail:
          `field '${field}' is never populated by any fixture ` +
          `(e.g. ${obs.sites.get(field) ?? obs.minSite}). A consumer on an older ` +
          'pin could silently drop it and no test would notice.',
      });
    }
  }

  for (const [schema, obs] of collections) {
    if (obs.nonEmpty) continue;
    gaps.push({
      key: nameOf(schema, obs.minSite),
      kind: 'empty-collection',
      detail:
        `${obs.label} at ${obs.minSite} is empty in every fixture, so the ` +
        'element shape is never exercised.',
    });
  }

  for (const [schema, obs] of unions) {
    obs.labels.forEach((label, i) => {
      if (obs.seen.has(i)) return;
      gaps.push({
        key: `${nameOf(schema, obs.minSite)}#${label}`,
        kind: 'unexercised-union-branch',
        detail:
          `union branch '${label}' (index ${i}, at ${obs.minSite}) is never ` +
          'exercised by any fixture.',
      });
    });
  }

  return gaps;
}

/**
 * Walk every registered fixture against its schema and report every
 * non-maximal site. Returns [] when the library is fully maximal.
 */
export function auditMaximality(
  entries: readonly RegistryEntryLike[],
  options: AuditMaximalityOptions = {},
): MaximalityGap[] {
  const gaps = reduceGaps(runWalk(entries, options), options.schemaNames);
  const exclusions = options.exclusions ?? {};
  const surviving = gaps.filter((gap) => !(gap.key in exclusions));
  surviving.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return surviving;
}

/**
 * How much surface the walk actually reached. A walker that silently stopped
 * introspecting (a Zod internals change, a wrapper type it no longer
 * recognises) would report zero gaps and pass vacuously — exactly the failure
 * mode this whole module exists to close. Assert these counts so the guard
 * cannot rot into a no-op.
 */
export interface MaximalityStats {
  /** distinct ZodObject identities reached */
  objectSchemas: number;
  /** distinct (object, field) sites reached */
  fieldSites: number;
  /** (object, field) sites observed populated at least once */
  populatedFieldSites: number;
  /**
   * Unpopulated (object, field) sites carved out by a documented exclusion.
   * `populatedFieldSites + excludedFieldSites === fieldSites` is the maximality
   * invariant callers should assert: an exclusion narrows the GUARANTEE, never
   * the walk, so the reached-surface counts stay honest.
   */
  excludedFieldSites: number;
  /** distinct union identities reached */
  unions: number;
  /** union branches exercised at least once */
  exercisedUnionBranches: number;
  /** un-exercised union branches carved out by a documented exclusion */
  excludedUnionBranches: number;
  /** distinct array/record/set/map identities reached */
  collections: number;
  /** empty collections carved out by a documented exclusion */
  excludedCollections: number;
}

export function maximalityStats(
  entries: readonly RegistryEntryLike[],
  options: AuditMaximalityOptions = {},
): MaximalityStats {
  const walk = runWalk(entries, options);
  const { objects, collections, unions } = walk;
  let fieldSites = 0;
  let populatedFieldSites = 0;
  for (const obs of objects.values()) {
    for (const populated of obs.populated.values()) {
      fieldSites++;
      if (populated) populatedFieldSites++;
    }
  }
  let exercisedUnionBranches = 0;
  for (const obs of unions.values()) exercisedUnionBranches += obs.seen.size;

  // Honour `exclusions` off the SAME reduction auditMaximality uses, so an
  // excluded gap is accounted for here exactly as it is dropped there. An
  // exclusion key that matches no real gap (a stale one) counts nothing — the
  // stale-exclusion check remains the thing that catches it.
  const exclusions = options.exclusions ?? {};
  let excludedFieldSites = 0;
  let excludedUnionBranches = 0;
  let excludedCollections = 0;
  for (const gap of reduceGaps(walk, options.schemaNames)) {
    if (!(gap.key in exclusions)) continue;
    if (gap.kind === 'unpopulated-field') excludedFieldSites++;
    else if (gap.kind === 'empty-collection') excludedCollections++;
    else excludedUnionBranches++;
  }

  return {
    objectSchemas: objects.size,
    fieldSites,
    populatedFieldSites,
    excludedFieldSites,
    unions: unions.size,
    exercisedUnionBranches,
    excludedUnionBranches,
    collections: collections.size,
    excludedCollections,
  };
}

/**
 * Gap keys the walker WOULD have produced but for an exclusion. Used to reject
 * stale exclusions — an exclusion that no longer describes a real gap is a lie
 * in the documentation and must be deleted.
 */
export function auditMaximalityRaw(
  entries: readonly RegistryEntryLike[],
  options: AuditMaximalityOptions = {},
): MaximalityGap[] {
  return auditMaximality(entries, { ...options, exclusions: {} });
}

/** Best-effort human label for a union member (discriminator literal if any). */
function unionMemberLabel(option: z.ZodTypeAny): string {
  const core = unwrapCore(option);
  if (core instanceof z.ZodObject) {
    const shape = core.shape as Record<string, z.ZodTypeAny>;
    for (const discriminator of ['type', 'kind', 'status', 'claim_type', 'code']) {
      const field = shape[discriminator];
      if (field instanceof z.ZodLiteral) {
        return `${discriminator}=${String(field.value)}`;
      }
    }
  }
  const typeName = (core as unknown as { _def: { typeName: string } })._def.typeName;
  return String(typeName).replace(/^Zod/, '').toLowerCase();
}

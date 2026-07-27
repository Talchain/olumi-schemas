// ============================================================================
// ABSENCE-SEMANTICS WALKER — the derivation half of the two-states-one-byte gate.
//
// THE DEFECT CLASS. A field whose ABSENCE and whose DEFAULT/EMPTY value carry
// DIFFERENT meanings, with no discriminator on the wire, is two states encoded
// in one byte. The consumer cannot tell them apart, so it picks one — and the
// choice is invisible in every test that only checks the value parses. Six
// independent instances of exactly this shape were found by hand across the
// four consumer services in one review wave (see census.json `seed_instances`),
// each discovered separately, each fixed separately, with no shared instrument.
// This is that instrument.
//
// WHAT IT DOES. Walks the exported Zod schema graph and enumerates every field
// whose declaration admits absence or emptiness in ANY form:
//
//   optional            `.optional()`        — the key may be absent
//   nullable            `.nullable()`        — the value may be null
//   default             `.default(v)`        — ABSENCE IS REWRITTEN to v; the
//                                              consumer can never see absence.
//                                              This is `?? 0` expressed in the
//                                              contract, and it is the highest-
//                                              risk marker in this vocabulary.
//   catch               `.catch(v)`          — a PARSE FAILURE is rewritten to
//                                              v; failure and legitimate-v are
//                                              one byte.
//   null-in-union       `z.union([…, z.null()])`
//   undefined-in-union  `z.union([…, z.undefined()])`
//   any-or-unknown      `z.any()` / `z.unknown()` — Zod accepts `undefined`
//                                              for these, so the field is
//                                              silently optional with no
//                                              `.optional()` anywhere in sight.
//
// DERIVED, NEVER HAND-LISTED. The estate's dominant defect is the mirror a
// human must remember to sync, whose drift always reads as green. Nothing here
// is enumerated by hand: the entry points come from `package.json` `exports`,
// the schemas come from the namespace objects, the fields come from Zod's own
// `_def`. The only hand-written artefact is the ANSWER to the question, which
// is the one thing that cannot be derived.
//
// NO SILENT OMISSION. An absence assertion must derive the node set it visits
// (`~/.claude/CLAUDE.md`, "Evidence for absence / coverage claims"). Every
// construct this walker cannot introspect is emitted as an UNPARSEABLE entry
// and fails the gate loudly. Falling through to "scalar, nothing to do" — which
// is what an unrecognised `typeName` would do in a permissive walker — would
// make the census silently incomplete while reading as green. There is no
// default branch that swallows a node.
//
// TWO INDEPENDENT DERIVATIONS, CROSS-CHECKED. Marker classification walks the
// wrapper chain structurally; Zod's own `isOptional()` / `isNullable()` decide
// the same question behaviourally by parsing `undefined` / `null`. They must
// agree on every field. A disagreement is an UNPARSEABLE entry
// (`classification-disagreement`), because it means this file's understanding
// of Zod has diverged from Zod's — which is precisely how a walker rots into a
// no-op after a dependency bump.
// ============================================================================
import { z } from 'zod';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type OptionalityMarker =
  | 'optional'
  | 'nullable'
  | 'default'
  | 'catch'
  | 'null-in-union'
  | 'undefined-in-union'
  | 'any-or-unknown';

/** A derived field whose declaration admits absence in some form. */
export interface DerivedField {
  /**
   * `<namespace>/<ExportName>[.relative.path].<field>` — anchored at the
   * NEAREST EXPORTED ancestor schema, and the lexicographically smallest such
   * path over every route that reaches the owning object. Anchoring at the
   * nearest export (rather than at whichever root happened to be walked first)
   * is what keeps keys stable when an unrelated export is added.
   */
  key: string;
  /** Sorted, de-duplicated. Stored in the census and verified against it. */
  markers: OptionalityMarker[];
  /**
   * The field's `.describe()` text, when it has one. REPORTING ONLY — never
   * stored in the census. Several fields in this contract carry an explicit
   * machine-readable absence rule here (`ABSENCE_FAIL_CLOSED_RULE` and
   * friends), and printing it in the gate's failure message is what lets an
   * author answer the census question from the contract rather than from
   * memory.
   */
  description?: string;
}

export type UnparseableKind =
  /** A `_def.typeName` this walker does not handle. The census cannot claim completeness over it. */
  | 'unknown-type'
  /** Traversal hit the depth cap; the subtree below is UNVISITED, not empty. */
  | 'depth-limit'
  /** Structural marker classification and Zod's own isOptional/isNullable disagree. */
  | 'classification-disagreement'
  /** A `z.lazy()` getter threw, so its inner type is unreachable. */
  | 'unresolvable-lazy'
  /** A `.transform()` whose OUTPUT shape is not derivable from its input schema. */
  | 'effects-transform'
  /** An object with a catchall / passthrough: unknown keys flow through untyped. */
  | 'open-object';

export interface UnparseableEntry {
  key: string;
  kind: UnparseableKind;
  detail: string;
}

export interface WalkStats {
  /** entry-point namespaces walked */
  namespaces: number;
  /** exported Zod schemas used as walk roots */
  exportedRoots: number;
  /** distinct ZodObject identities reached */
  objectSchemas: number;
  /** distinct (object, field) declaration sites reached */
  fieldSites: number;
  /** of those, the ones bearing at least one optionality marker */
  optionalityBearingFields: number;
  /** distinct non-object composite identities reached (array/record/union/…) */
  composites: number;
}

export interface DerivedCensus {
  fields: DerivedField[];
  unparseable: UnparseableEntry[];
  stats: WalkStats;
}

export interface WalkOptions {
  /** Recursion guard. Exceeding it is REPORTED (`depth-limit`), never silent. */
  maxDepth?: number;
}

// ----------------------------------------------------------------------------
// The recognised terminal (scalar) types.
//
// This list is an ALLOWLIST, and that direction matters: an unrecognised type
// becomes UNPARSEABLE rather than being treated as a harmless leaf. A denylist
// would fail open on every construct Zod adds after this file was written.
// ----------------------------------------------------------------------------
function isTerminal(schema: z.ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBigInt ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodDate ||
    schema instanceof z.ZodSymbol ||
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodNativeEnum ||
    schema instanceof z.ZodLiteral ||
    schema instanceof z.ZodNull ||
    schema instanceof z.ZodUndefined ||
    schema instanceof z.ZodVoid ||
    schema instanceof z.ZodNever ||
    schema instanceof z.ZodNaN ||
    schema instanceof z.ZodAny ||
    schema instanceof z.ZodUnknown
  );
}

function defOf(schema: z.ZodTypeAny): Record<string, unknown> {
  return (schema as unknown as { _def: Record<string, unknown> })._def;
}

/**
 * A field's `.describe()` text, looked through the wrapper chain: `.describe()`
 * applied before `.optional()` lands on the INNER type, and applied after lands
 * on the outer, so a single-level read misses half the sites.
 */
function describeOf(schema: z.ZodTypeAny): string | undefined {
  let current: z.ZodTypeAny | undefined = schema;
  for (let guard = 0; guard < 32 && current; guard++) {
    const def = defOf(current);
    if (typeof def.description === 'string' && def.description.length > 0) {
      return def.description;
    }
    const inner = (def.innerType ?? def.schema ?? def.in) as z.ZodTypeAny | undefined;
    if (!inner) return undefined;
    current = inner;
  }
  return undefined;
}

function typeNameOf(schema: z.ZodTypeAny): string {
  return String(defOf(schema).typeName ?? 'unknown');
}

// ----------------------------------------------------------------------------
// Field-level marker classification (derivation #1: structural)
// ----------------------------------------------------------------------------

interface Classification {
  markers: Set<OptionalityMarker>;
  /** The type left after every wrapper is stripped. */
  core: z.ZodTypeAny;
  /** Wrapper-chain problems worth reporting as UNPARSEABLE. */
  problems: Array<{ kind: UnparseableKind; detail: string }>;
}

function classify(schema: z.ZodTypeAny): Classification {
  const markers = new Set<OptionalityMarker>();
  const problems: Array<{ kind: UnparseableKind; detail: string }> = [];
  let current = schema;

  for (let guard = 0; guard < 32; guard++) {
    const def = defOf(current);
    if (current instanceof z.ZodOptional) {
      markers.add('optional');
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      markers.add('nullable');
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      markers.add('default');
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodCatch) {
      markers.add('catch');
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodReadonly || current instanceof z.ZodBranded) {
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      const effect = def.effect as { type?: string } | undefined;
      if (effect?.type === 'transform') {
        problems.push({
          kind: 'effects-transform',
          detail:
            'a .transform() sits between the declaration and the shape: the ' +
            'OUTPUT type a consumer receives is not derivable from the input ' +
            'schema, so the census cannot speak for what crosses the wire here.',
        });
      }
      current = def.schema as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodPipeline) {
      // Wire shape is the INPUT side; a consumer validates what it is sent.
      current = def.in as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodLazy) {
      try {
        current = (def.getter as () => z.ZodTypeAny)();
      } catch (error) {
        problems.push({
          kind: 'unresolvable-lazy',
          detail: `z.lazy() getter threw: ${String(error)}`,
        });
        break;
      }
      continue;
    }
    break;
  }

  // Types that admit absence WITHOUT any wrapper saying so.
  if (current instanceof z.ZodAny || current instanceof z.ZodUnknown) {
    markers.add('any-or-unknown');
  }
  if (current instanceof z.ZodNull) markers.add('nullable');
  if (current instanceof z.ZodUndefined) markers.add('optional');

  if (current instanceof z.ZodUnion || current instanceof z.ZodDiscriminatedUnion) {
    const options = (current as unknown as { options: z.ZodTypeAny[] }).options ?? [];
    for (const option of options) {
      const inner = classify(option);
      if (inner.core instanceof z.ZodNull) markers.add('null-in-union');
      if (inner.core instanceof z.ZodUndefined) markers.add('undefined-in-union');
      // A union member that is itself optional/nullable makes the whole field so.
      for (const marker of inner.markers) {
        if (marker === 'optional' || marker === 'nullable') markers.add(marker);
      }
    }
  }

  return { markers, core: current, problems };
}

const MARKER_ORDER: OptionalityMarker[] = [
  'optional',
  'nullable',
  'default',
  'catch',
  'null-in-union',
  'undefined-in-union',
  'any-or-unknown',
];

function sortMarkers(markers: Set<OptionalityMarker>): OptionalityMarker[] {
  return MARKER_ORDER.filter((marker) => markers.has(marker));
}

// ----------------------------------------------------------------------------
// The walk
// ----------------------------------------------------------------------------

interface FieldFacts {
  markers: OptionalityMarker[];
  description?: string;
}

export function deriveAbsenceCensus(
  namespaces: Readonly<Record<string, Record<string, unknown>>>,
  options: WalkOptions = {},
): DerivedCensus {
  const maxDepth = options.maxDepth ?? 40;

  // -- exported names, smallest-wins so re-exports resolve deterministically --
  const exportedNames = new Map<z.ZodTypeAny, string>();
  let exportedRoots = 0;
  const roots: Array<{ name: string; schema: z.ZodTypeAny }> = [];
  for (const nsName of Object.keys(namespaces).sort()) {
    for (const exportName of Object.keys(namespaces[nsName]).sort()) {
      const value = namespaces[nsName][exportName];
      if (!(value instanceof z.ZodType)) continue;
      const key = `${nsName}/${exportName}`;
      const existing = exportedNames.get(value);
      if (existing === undefined || key < existing) exportedNames.set(value, key);
      roots.push({ name: key, schema: value });
      exportedRoots++;
    }
  }

  // -- accumulators, all keyed by schema OBJECT IDENTITY ----------------------
  /** best (smallest) anchored path per reached schema identity */
  const bestPath = new Map<z.ZodTypeAny, string>();
  const objectFields = new Map<z.ZodTypeAny, Map<string, FieldFacts>>();
  const composites = new Set<z.ZodTypeAny>();
  /** identity+kind -> entry; path improves as better routes are found */
  const unparseable = new Map<string, { schema: z.ZodTypeAny | null; path: string; kind: UnparseableKind; detail: string }>();

  function reportUnparseable(
    schema: z.ZodTypeAny | null,
    path: string,
    kind: UnparseableKind,
    detail: string,
  ): void {
    const identity = schema ? `${typeNameOf(schema)}@${path}` : path;
    const mapKey = `${kind}::${identity}`;
    const existing = unparseable.get(mapKey);
    if (existing && existing.path <= path) return;
    unparseable.set(mapKey, { schema, path, kind, detail });
  }

  function visit(schema: z.ZodTypeAny, incomingPath: string, depth: number): void {
    if (depth > maxDepth) {
      reportUnparseable(
        schema,
        incomingPath,
        'depth-limit',
        `traversal stopped at depth ${depth}; the subtree below this point is ` +
          'UNVISITED, so the census makes no claim about it.',
      );
      return;
    }

    const { core, problems } = classify(schema);
    for (const problem of problems) {
      reportUnparseable(schema, incomingPath, problem.kind, problem.detail);
    }

    // Anchor the path at the nearest exported ancestor.
    const exported = exportedNames.get(schema) ?? exportedNames.get(core);
    const path = exported ?? incomingPath;

    // Relaxation: only (re-)expand when this route is an improvement, so the
    // recorded key for a shared shape is route-order-independent.
    const previous = bestPath.get(core);
    if (previous !== undefined && previous <= path) return;
    bestPath.set(core, path);

    if (isTerminal(core)) return;

    if (core instanceof z.ZodObject) {
      const shape = core.shape as Record<string, z.ZodTypeAny>;
      let fields = objectFields.get(core);
      if (!fields) {
        fields = new Map<string, FieldFacts>();
        objectFields.set(core, fields);
      }

      const def = defOf(core);
      const unknownKeys = String(def.unknownKeys ?? '');
      const catchall = def.catchall as z.ZodTypeAny | undefined;
      const hasCatchall = catchall !== undefined && !(catchall instanceof z.ZodNever);
      if (unknownKeys === 'passthrough' || hasCatchall) {
        reportUnparseable(
          core,
          path,
          'open-object',
          `object is ${hasCatchall ? 'catchall-typed' : 'passthrough'}: keys not ` +
            'in the declared shape cross the wire un-enumerated, so the census ' +
            'cannot be complete over this object by construction.',
        );
      }

      for (const fieldName of Object.keys(shape).sort()) {
        const fieldSchema = shape[fieldName];
        const fieldPath = `${path}.${fieldName}`;
        const classification = classify(fieldSchema);
        for (const problem of classification.problems) {
          reportUnparseable(fieldSchema, fieldPath, problem.kind, problem.detail);
        }

        // -- derivation #2: Zod's own behavioural answer, cross-checked -------
        const structurallyOptional = classification.markers.size > 0;
        let behaviourallyOptional: boolean;
        try {
          behaviourallyOptional = fieldSchema.isOptional() || fieldSchema.isNullable();
        } catch (error) {
          reportUnparseable(
            fieldSchema,
            fieldPath,
            'classification-disagreement',
            `isOptional()/isNullable() threw: ${String(error)}`,
          );
          behaviourallyOptional = structurallyOptional;
        }
        if (structurallyOptional !== behaviourallyOptional) {
          reportUnparseable(
            fieldSchema,
            fieldPath,
            'classification-disagreement',
            `structural markers [${sortMarkers(classification.markers).join(', ')}] say ` +
              `${structurallyOptional ? 'absence-admitting' : 'required'}, but Zod's own ` +
              `isOptional()/isNullable() say ${behaviourallyOptional ? 'absence-admitting' : 'required'}. ` +
              'This walker\'s model of Zod has diverged from Zod — the census cannot ' +
              'be trusted for this field until the walker is taught the construct.',
          );
        }

        const description = describeOf(fieldSchema);
        if (structurallyOptional) {
          fields.set(fieldName, {
            markers: sortMarkers(classification.markers),
            ...(description ? { description } : {}),
          });
        } else if (!fields.has(fieldName)) {
          fields.set(fieldName, { markers: [] });
        }

        visit(fieldSchema, fieldPath, depth + 1);
      }

      if (hasCatchall && catchall) visit(catchall, `${path}.*`, depth + 1);
      return;
    }

    composites.add(core);

    if (core instanceof z.ZodArray) {
      visit((core as unknown as { element: z.ZodTypeAny }).element, `${path}[]`, depth + 1);
      return;
    }
    if (core instanceof z.ZodRecord) {
      const def = defOf(core);
      if (def.keyType) visit(def.keyType as z.ZodTypeAny, `${path}.<key>`, depth + 1);
      visit(def.valueType as z.ZodTypeAny, `${path}.*`, depth + 1);
      return;
    }
    if (core instanceof z.ZodMap) {
      const def = defOf(core);
      visit(def.keyType as z.ZodTypeAny, `${path}.<key>`, depth + 1);
      visit(def.valueType as z.ZodTypeAny, `${path}.*`, depth + 1);
      return;
    }
    if (core instanceof z.ZodSet) {
      visit(defOf(core).valueType as z.ZodTypeAny, `${path}{}`, depth + 1);
      return;
    }
    if (core instanceof z.ZodTuple) {
      const def = defOf(core) as unknown as { items: z.ZodTypeAny[]; rest?: z.ZodTypeAny | null };
      def.items.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      if (def.rest) visit(def.rest, `${path}[...]`, depth + 1);
      return;
    }
    if (core instanceof z.ZodDiscriminatedUnion || core instanceof z.ZodUnion) {
      const opts = (core as unknown as { options: z.ZodTypeAny[] }).options ?? [];
      opts.forEach((option, index) => {
        visit(option, `${path}|${unionMemberLabel(option, index)}`, depth + 1);
      });
      return;
    }
    if (core instanceof z.ZodIntersection) {
      const def = defOf(core) as unknown as { left: z.ZodTypeAny; right: z.ZodTypeAny };
      visit(def.left, `${path}&left`, depth + 1);
      visit(def.right, `${path}&right`, depth + 1);
      return;
    }
    if (core instanceof z.ZodPromise) {
      visit(defOf(core).type as z.ZodTypeAny, `${path}<await>`, depth + 1);
      return;
    }

    // NO SILENT FALL-THROUGH. Anything not handled above is declared, loudly.
    reportUnparseable(
      core,
      path,
      'unknown-type',
      `${typeNameOf(core)} is a construct this walker does not introspect, so ` +
        'every field beneath it is ABSENT FROM THE CENSUS. Teach the walker ' +
        'the construct, or the completeness claim is false.',
    );
  }

  for (const root of roots.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    visit(root.schema, root.name, 0);
  }

  // -- name everything from the converged best paths --------------------------
  const fields: DerivedField[] = [];
  let fieldSites = 0;
  for (const [objectSchema, shape] of objectFields) {
    const anchor = bestPath.get(objectSchema);
    if (anchor === undefined) continue;
    for (const [fieldName, facts] of shape) {
      fieldSites++;
      if (facts.markers.length === 0) continue;
      fields.push({
        key: `${anchor}.${fieldName}`,
        markers: facts.markers,
        ...(facts.description ? { description: facts.description } : {}),
      });
    }
  }
  fields.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const unparseableList: UnparseableEntry[] = [...unparseable.values()]
    .map((entry) => ({
      key: `${entry.kind}::${entry.schema ? bestPath.get(entry.schema) ?? entry.path : entry.path}`,
      kind: entry.kind,
      detail: entry.detail,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    fields,
    unparseable: unparseableList,
    stats: {
      namespaces: Object.keys(namespaces).length,
      exportedRoots,
      objectSchemas: objectFields.size,
      fieldSites,
      optionalityBearingFields: fields.length,
      composites: composites.size,
    },
  };
}

/** Best-effort human label for a union member (discriminator literal if any). */
function unionMemberLabel(option: z.ZodTypeAny, index: number): string {
  const { core } = classify(option);
  if (core instanceof z.ZodObject) {
    const shape = core.shape as Record<string, z.ZodTypeAny>;
    for (const discriminator of ['type', 'kind', 'status', 'claim_type', 'code']) {
      const field = shape[discriminator];
      if (field instanceof z.ZodLiteral) return `${discriminator}=${String(field.value)}`;
    }
  }
  if (core instanceof z.ZodLiteral) return `literal=${String(core.value)}`;
  return `${typeNameOf(core).replace(/^Zod/, '').toLowerCase()}#${index}`;
}

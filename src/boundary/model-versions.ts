import { z } from 'zod';

import { GraphV3Schema } from '../graph.js';
import { AnalysisStateV1Schema } from './analysis-state.js';
import { AuthoredBySchema } from './collab.js';

// ============================================================================
// Versioned-model history contracts.
//
// These contracts describe persisted MODEL versions. They are deliberately
// separate from `run-delta.ts`, which compares two stochastic ANALYSIS runs.
// A model diff may explain which model facts changed; it never licenses a
// claim that those edits caused a change in an analysis result.
//
// The first producer is CEE. The shapes therefore carry only facts that CEE
// can attest from persisted snapshots and metadata. In particular, v1 diff
// relation is only `identical | different`: ancestry classifications do not
// become truthful until a parent-lineage carrier exists. History metadata uses
// explicit `unknown` arms for the same reason.
// ============================================================================

const UuidSchema = z.string().uuid();
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const NonEmptyStringSchema = z.string().min(1);

const ModelVersionKnownActorSchema = z.object({
  kind: z.literal('known'),
  authored_by: AuthoredBySchema,
}).strict();

const ModelVersionUnknownActorSchema = z.object({
  kind: z.literal('unknown'),
}).strict();

const ModelVersionSystemActorSchema = z.object({
  kind: z.literal('system'),
}).strict();

const ModelVersionActorSchema = z.discriminatedUnion('kind', [
  ModelVersionKnownActorSchema,
  ModelVersionSystemActorSchema,
  ModelVersionUnknownActorSchema,
]);

const creationMetadataShape = {
  mutation_id: UuidSchema.nullable().describe(
    'The idempotent mutation that created this version. Required on the wire: null means ' +
      'the persisted version predates mutation-id capture; omission is invalid.',
  ),
  source_turn_id: NonEmptyStringSchema.nullable().describe(
    'The turn that caused this version to be written. Required on the wire: null means ' +
      'the persisted version predates source-turn capture; omission is invalid.',
  ),
};

const ModelVersionCreationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('initial'),
    ...creationMetadataShape,
  }).strict(),
  z.object({
    kind: z.literal('committed_mutation'),
    ...creationMetadataShape,
  }).strict(),
  z.object({
    kind: z.literal('restore'),
    source_version_id: UuidSchema,
    ...creationMetadataShape,
  }).strict(),
  z.object({
    kind: z.literal('variant_creation'),
    source_version_id: UuidSchema,
    ...creationMetadataShape,
  }).strict(),
  z.object({
    kind: z.literal('variant_promotion'),
    source_version_id: UuidSchema,
    ...creationMetadataShape,
  }).strict(),
  z.object({
    kind: z.literal('unknown'),
    ...creationMetadataShape,
  }).strict(),
]);

const ModelVersionLineageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('known'),
    parent_version_id: UuidSchema.nullable().describe(
      'The direct parent when lineage is known. Null means this version is the lineage root; ' +
        'unavailable lineage uses the separate unknown arm.',
    ),
    root_version_id: UuidSchema,
  }).strict(),
  z.object({
    kind: z.literal('unknown'),
  }).strict(),
]);

const ModelVersionSummaryV2ObjectSchema = z.object({
  version_id: UuidSchema,
  scenario_id: UuidSchema,
  sequence: z.number().int().min(1),
  label: z.string().nullable().describe(
    'User-facing version label. Required on the wire: null means no label was persisted; omission is invalid.',
  ),
  created_at: z.string().datetime({ offset: true }),
  actor: ModelVersionActorSchema,
  creation: ModelVersionCreationSchema,
  lineage: ModelVersionLineageSchema,
  full_hash: Sha256Schema,
  analysis_affecting_hash: Sha256Schema,
}).strict();

/**
 * One persisted model version as rendered in history. `actor`, `creation`, and
 * `lineage` never disappear when their source metadata is unavailable: they
 * carry an explicit `unknown` arm, preventing a consumer from filling the gap
 * with a guessed author or ancestry.
 */
export const ModelVersionSummaryV2Schema = ModelVersionSummaryV2ObjectSchema.superRefine(
  (data, ctx) => {
    if (data.lineage.kind === 'known' && data.lineage.parent_version_id === data.version_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineage', 'parent_version_id'],
        message: 'a model version cannot be its own parent',
      });
    }

    if (
      'source_version_id' in data.creation &&
      data.creation.source_version_id === data.version_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['creation', 'source_version_id'],
        message: 'a model version cannot be created from itself',
      });
    }
  },
);
export type ModelVersionSummaryV2 = z.infer<typeof ModelVersionSummaryV2Schema>;

const ModelVersionMutationReceiptCreationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('initial'),
  }).strict(),
  z.object({
    kind: z.literal('committed_mutation'),
  }).strict(),
  z.object({
    kind: z.literal('restore'),
    source_version_id: UuidSchema,
  }).strict(),
]);

type JsonCloneResult =
  | { ok: true; value: unknown }
  | { ok: false; path: Array<string | number>; message: string };

function cloneJsonData(
  value: unknown,
  path: Array<string | number> = [],
  ancestors: Set<object> = new Set(),
): JsonCloneResult {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, path, message: 'receipt graph values must be finite JSON numbers' };
  }
  if (typeof value !== 'object') {
    return { ok: false, path, message: 'receipt graph values must be JSON data' };
  }
  if (ancestors.has(value)) {
    return { ok: false, path, message: 'receipt graph values must not be cyclic' };
  }

  const expectedPrototype = Array.isArray(value) ? Array.prototype : Object.prototype;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== expectedPrototype && prototype !== null) {
    return { ok: false, path, message: 'receipt graph objects must have a plain JSON prototype' };
  }
  const toJsonDescriptor = Object.getOwnPropertyDescriptor(value, 'toJSON');
  const hasSafeToJsonShadow =
    toJsonDescriptor !== undefined &&
    'value' in toJsonDescriptor &&
    toJsonDescriptor.value === undefined &&
    toJsonDescriptor.enumerable === false &&
    toJsonDescriptor.configurable === false &&
    toJsonDescriptor.writable === false;
  if (toJsonDescriptor !== undefined && !hasSafeToJsonShadow) {
    return { ok: false, path, message: 'receipt graph objects must not define toJSON' };
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (
      keys.length !== value.length ||
      keys.some((key, index) => key !== String(index))
    ) {
      return { ok: false, path, message: 'receipt graph arrays must be dense JSON arrays' };
    }

    const clone: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !('value' in descriptor)) {
        return {
          ok: false,
          path: [...path, index],
          message: 'receipt graph properties must be stable data properties',
        };
      }
      const child = cloneJsonData(descriptor.value, [...path, index], ancestors);
      if (!child.ok) return child;
      clone[index] = child.value;
    }
    // Arrays retain Array.prototype so consumers keep ordinary array methods,
    // but an immutable own shadow prevents a polluted inherited `toJSON` from
    // changing their wire representation. Re-parsing this carrier recognises
    // only this exact inert descriptor.
    Object.defineProperty(clone, 'toJSON', {
      value: undefined,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    ancestors.delete(value);
    return { ok: true, value: clone };
  }

  const clone = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return {
        ok: false,
        path: [...path, key],
        message: 'receipt graph properties must not use prototype-control names',
      };
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      return {
        ok: false,
        path: [...path, key],
        message: 'receipt graph properties must be stable data properties',
      };
    }
    const child = cloneJsonData(descriptor.value, [...path, key], ancestors);
    if (!child.ok) return child;
    Object.defineProperty(clone, key, {
      value: child.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  ancestors.delete(value);
  return { ok: true, value: clone };
}

function exposeStableJsonData(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) {
      exposeStableJsonData(descriptor.value);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'toJSON')) {
    Object.defineProperty(value, 'toJSON', {
      value: undefined,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  if (!Array.isArray(value)) Object.setPrototypeOf(value, Object.prototype);
}

const ModelVersionReceiptGraphInputSchema = z.custom<z.input<typeof GraphV3Schema>>(
  (value) => {
    try {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    } catch {
      return false;
    }
  },
  { message: 'receipt graph must be a JSON object' },
);

/**
 * Preserve the receipt's exact JSON data without preserving executable object
 * behaviour. The stable plain-data clone closes validation/serialization TOCTOU
 * paths (getters, custom prototypes and `toJSON`), then the full GraphV3 parse
 * validates that clone. Its rebuilt value is deliberately discarded because it
 * would materialise `edge_type: "directed"` and move the persisted hash.
 */
const ModelVersionReceiptGraphVerbatimSchema = ModelVersionReceiptGraphInputSchema.transform(
  (value, ctx) => {
    let clone: JsonCloneResult;
    try {
      clone = cloneJsonData(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'receipt graph could not be read as stable JSON data',
      });
      return z.NEVER;
    }

    if (!clone.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: clone.path, message: clone.message });
      return z.NEVER;
    }

    let validation: ReturnType<typeof GraphV3Schema.safeParse>;
    try {
      validation = GraphV3Schema.safeParse(clone.value, { path: ctx.path });
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'receipt graph could not be validated as stable GraphV3 data',
      });
      return z.NEVER;
    }
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        ctx.addIssue({ ...issue, path: issue.path.slice(ctx.path.length) });
      }
      return z.NEVER;
    }

    // Validation ran over null-prototype object snapshots, so inherited fields
    // could not satisfy GraphV3. Restore ordinary object prototypes only after
    // that gate, with an immutable own `toJSON: undefined` shadow on every
    // container so polluted inherited serializers still cannot move the wire.
    try {
      exposeStableJsonData(clone.value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'receipt graph could not be exposed as stable JSON data',
      });
      return z.NEVER;
    }

    return clone.value as z.input<typeof GraphV3Schema>;
  },
);

const ModelVersionMutationReceiptV1ObjectSchema = z.object({
  schema: z.literal('model_version_mutation_receipt.v1'),
  scenario_id: UuidSchema,
  mutation_id: UuidSchema,
  version_id: UuidSchema,
  sequence: z.number().int().min(1),
  graph: ModelVersionReceiptGraphVerbatimSchema,
  full_hash: Sha256Schema,
  hash_algorithm: NonEmptyStringSchema,
  identity_projection_version: NonEmptyStringSchema,
  identity_normaliser_version: NonEmptyStringSchema,
  graph_schema_version: NonEmptyStringSchema,
  analysis_affecting_hash: Sha256Schema,
  actor: ModelVersionActorSchema,
  creation: ModelVersionMutationReceiptCreationSchema,
  source_turn_id: NonEmptyStringSchema.nullable().describe(
    'The turn whose atomic mutation produced this receipt. Required on the wire: null means ' +
      'source-turn correlation was not captured; omission is invalid.',
  ),
  lineage: ModelVersionLineageSchema,
  undo_version_id: UuidSchema.nullable().describe(
    'The exact pre-mutation version that can restore the prior model. Required on the wire: ' +
      'null means no undo version exists; omission is invalid.',
  ),
  event_id: NonEmptyStringSchema,
}).strict();

/**
 * Atomic receipt for the authoritative model snapshot committed by this turn.
 * It intentionally contains neither replay/dedupe flags nor analysis
 * freshness: a replay has the same receipt bytes, while the enclosing
 * OlumiResponse.analysis_state remains the sole analysis-state authority.
 */
export const ModelVersionMutationReceiptV1Schema =
  ModelVersionMutationReceiptV1ObjectSchema.superRefine((data, ctx) => {
    if (data.lineage.kind === 'known' && data.lineage.parent_version_id === data.version_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineage', 'parent_version_id'],
        message: 'a model version cannot be its own parent',
      });
    }

    if (data.creation.kind === 'restore' && data.creation.source_version_id === data.version_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['creation', 'source_version_id'],
        message: 'a restored model version cannot source itself',
      });
    }

    if (data.undo_version_id === data.version_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['undo_version_id'],
        message: 'a model version cannot be its own undo version',
      });
    }
  });
export type ModelVersionMutationReceiptV1 = z.infer<
  typeof ModelVersionMutationReceiptV1Schema
>;

/**
 * All-or-nothing restore response. The nested receipt is the same canonical
 * mutation receipt used by ordinary semantic commits; AnalysisState remains a
 * sibling producer authority and is never recomputed by a consumer.
 */
export const ModelVersionRestoreV2Schema = z.object({
  schema: z.literal('model_version_restore.v2'),
  scenario_id: UuidSchema,
  restored: z.literal(true),
  receipt: ModelVersionMutationReceiptV1Schema,
  analysis_state: AnalysisStateV1Schema.nullable().describe(
    'Canonical post-restore analysis state. Null means no analysis-state fact was available; omission is invalid.',
  ),
  request_id: NonEmptyStringSchema,
}).strict().superRefine((data, ctx) => {
  if (data.receipt.scenario_id !== data.scenario_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['receipt', 'scenario_id'],
      message: 'the restore receipt must belong to the response scenario_id',
    });
  }
  if (data.receipt.creation.kind !== 'restore') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['receipt', 'creation', 'kind'],
      message: 'a restore response requires a restore mutation receipt',
    });
  }
});
export type ModelVersionRestoreV2 = z.infer<typeof ModelVersionRestoreV2Schema>;

const ModelVersionsListV2ObjectSchema = z.object({
  schema: z.literal('model_versions_list.v2'),
  request_id: NonEmptyStringSchema.nullable().describe(
    'Route request correlation id. Required on the wire: null means correlation was not available; omission is invalid.',
  ),
  scenario_id: UuidSchema,
  current_version_id: UuidSchema.nullable().describe(
    'Authoritative current persisted head. Null means the scenario has no head. On later ' +
      'cursor pages the referenced head may be outside `versions`; consumers mark only an ' +
      'exact id match and never infer currentness from row order.',
  ),
  versions: z.array(ModelVersionSummaryV2Schema),
  next_cursor: NonEmptyStringSchema.nullable().describe(
    'Opaque cursor for the next history page. Null means this is the final page; omission is invalid.',
  ),
}).strict();

/**
 * Cursor page of model history. Versions are strictly newest-first by the
 * server-owned sequence and unique by version id, so pagination and rendering
 * never depend on database return order.
 */
export const ModelVersionsListV2Schema = ModelVersionsListV2ObjectSchema.superRefine(
  (data, ctx) => {
    const seenVersionIds = new Set<string>();

    if (data.current_version_id === null && data.versions.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['current_version_id'],
        message: 'a history page with versions must identify an authoritative current head',
      });
    }
    if (data.current_version_id === null && data.next_cursor !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['next_cursor'],
        message: 'a scenario with no persisted head cannot have another history page',
      });
    }

    for (let index = 0; index < data.versions.length; index += 1) {
      const version = data.versions[index];
      if (version.scenario_id !== data.scenario_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['versions', index, 'scenario_id'],
          message: 'every version must belong to the list scenario_id',
        });
      }

      if (seenVersionIds.has(version.version_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['versions', index, 'version_id'],
          message: 'version_id values must be unique within a history page',
        });
      }
      seenVersionIds.add(version.version_id);

      const previous = data.versions[index - 1];
      if (previous !== undefined && previous.sequence <= version.sequence) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['versions', index, 'sequence'],
          message: 'versions must be strictly descending by sequence',
        });
      }
    }
  },
);
export type ModelVersionsListV2 = z.infer<typeof ModelVersionsListV2Schema>;

const JsonPointerSchema = z.string().regex(
  /^(?:\/(?:[^~/]|~0|~1)*)+$/,
  'path must be a non-empty RFC 6901 JSON Pointer',
);

const ModelVersionDiffItemSchema = z.object({
  path: JsonPointerSchema,
  change_kind: z.enum(['added', 'removed', 'changed']),
  entity_kind: z.enum(['model', 'node', 'edge', 'option', 'constraint']),
  entity_id: NonEmptyStringSchema.nullable().describe(
    'Stable entity id when the change belongs to one entity. Null means model-level change.',
  ),
  label: z.string().nullable().describe(
    'Display label when the producer can attest one. Null means no label travelled.',
  ),
  before_display: z.string().nullable().describe(
    'User-readable prior value. Null means there is no prior display value or it cannot be rendered.',
  ),
  after_display: z.string().nullable().describe(
    'User-readable next value. Null means there is no next display value or it cannot be rendered.',
  ),
  summary: NonEmptyStringSchema,
  why_it_matters: NonEmptyStringSchema,
}).strict();
type ModelVersionDiffItem = z.infer<typeof ModelVersionDiffItemSchema>;

function diffItemSortKey(item: ModelVersionDiffItem): string {
  return JSON.stringify([
    item.path,
    item.change_kind,
    item.entity_kind,
    item.entity_id,
  ]);
}

const DeterministicDiffItemsSchema = z.array(ModelVersionDiffItemSchema).superRefine(
  (items, ctx) => {
    for (let index = 1; index < items.length; index += 1) {
      const previousKey = diffItemSortKey(items[index - 1]);
      const currentKey = diffItemSortKey(items[index]);
      if (previousKey >= currentKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message:
            'diff items must be unique and strictly ascending by path, change_kind, entity_kind, and entity_id',
        });
      }
    }
  },
);

const DeterministicStringListSchema = z.array(NonEmptyStringSchema).superRefine(
  (items, ctx) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1] >= items[index]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'entries must be unique and strictly ascending',
        });
      }
    }
  },
);

const MODEL_VERSION_DIFF_CATEGORY_KEYS = [
  'structure',
  'relationships',
  'values_uncertainty',
  'evidence_provenance',
  'goals_constraints_options',
  'assumptions_claims',
  'presentation',
  'other_model_fields',
] as const;

const ModelVersionDiffCategoriesSchema = z.object({
  structure: DeterministicDiffItemsSchema,
  relationships: DeterministicDiffItemsSchema,
  values_uncertainty: DeterministicDiffItemsSchema,
  evidence_provenance: DeterministicDiffItemsSchema,
  goals_constraints_options: DeterministicDiffItemsSchema,
  assumptions_claims: DeterministicDiffItemsSchema,
  presentation: DeterministicDiffItemsSchema,
  other_model_fields: DeterministicDiffItemsSchema,
}).strict();

const ModelVersionDiffCoverageSchema = z.object({
  known_undetectable: DeterministicStringListSchema,
  known_uninterpreted_paths: DeterministicStringListSchema,
}).strict();

const ModelVersionDiffV1ObjectSchema = z.object({
  schema: z.literal('model_version_diff.v1'),
  request_id: NonEmptyStringSchema.nullable().describe(
    'Route request correlation id. Required on the wire: null means correlation was not available; omission is invalid.',
  ),
  scenario_id: UuidSchema,
  from_version_id: UuidSchema,
  to_version_id: UuidSchema,
  relation: z.enum(['identical', 'different']),
  from_full_hash: Sha256Schema,
  to_full_hash: Sha256Schema,
  analysis_equivalent: z.boolean(),
  categories: ModelVersionDiffCategoriesSchema,
  coverage: ModelVersionDiffCoverageSchema,
}).strict();

/**
 * Deterministic semantic diff of two persisted model snapshots. Display text
 * is producer-authored, bounded to the changed fact, and kept beside stable
 * identity/path fields. `coverage` makes known blind spots first-class rather
 * than silently presenting a partial diff as exhaustive.
 */
export const ModelVersionDiffV1Schema = ModelVersionDiffV1ObjectSchema.superRefine(
  (data, ctx) => {
    if (data.relation === 'identical' && data.from_full_hash !== data.to_full_hash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relation'],
        message: 'an identical relation requires equal full hashes',
      });
    }

    if (data.from_version_id === data.to_version_id && data.relation !== 'identical') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relation'],
        message: 'the same version_id cannot compare as different',
      });
    }

    const categoryEntries = MODEL_VERSION_DIFF_CATEGORY_KEYS.flatMap((category) =>
      data.categories[category].map((item, index) => ({ category, item, index })),
    );

    if (data.relation === 'identical') {
      if (!data.analysis_equivalent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['analysis_equivalent'],
          message: 'identical full models must be analysis-equivalent',
        });
      }
      if (categoryEntries.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categories'],
          message: 'an identical comparison cannot carry changed category items',
        });
      }
    }

    if (
      data.relation === 'different' &&
      categoryEntries.length === 0 &&
      data.coverage.known_undetectable.length === 0 &&
      data.coverage.known_uninterpreted_paths.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coverage'],
        message:
          'a different comparison with no categorised items must disclose a coverage limitation',
      });
    }

    const seenItems = new Map<string, string>();
    for (const { category, item, index } of categoryEntries) {
      const key = diffItemSortKey(item);
      const priorCategory = seenItems.get(key);
      if (priorCategory !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categories', category, index],
          message: `the same diff item is already classified under ${priorCategory}`,
        });
      } else {
        seenItems.set(key, category);
      }

      if (
        category !== 'other_model_fields' &&
        data.coverage.known_uninterpreted_paths.includes(item.path)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categories', category, index, 'path'],
          message: 'an interpreted category path cannot also be declared uninterpreted',
        });
      }
    }

    const otherModelFieldPaths = [
      ...new Set(data.categories.other_model_fields.map((item) => item.path)),
    ].sort();
    if (
      otherModelFieldPaths.length !== data.coverage.known_uninterpreted_paths.length ||
      otherModelFieldPaths.some(
        (path, index) => path !== data.coverage.known_uninterpreted_paths[index],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coverage', 'known_uninterpreted_paths'],
        message:
          'known_uninterpreted_paths must equal the sorted unique paths classified under other_model_fields',
      });
    }
  },
);
export type ModelVersionDiffV1 = z.infer<typeof ModelVersionDiffV1Schema>;

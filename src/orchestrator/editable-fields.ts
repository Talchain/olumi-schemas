/**
 * THE CLASSED FIELD-PARITY TABLE — ROADMAP 2.474, design-review amendment A6.
 *
 * WHAT THIS IS. The single, derivable source of truth for which graph fields the
 * conversational AI may edit, and in WHICH CLASS. It replaces two hand-maintained
 * mirrors that had drifted apart:
 *
 *   - CEE `src/orchestrator-v5/graph-management/field-safety.ts` —
 *     `ALLOWED_NODE_FIELD_ROOTS` (14 roots), `ALLOWED_EDGE_FIELD_ROOTS` (4),
 *     `ALLOWED_OBSERVED_SUBKEYS` (4), `PIPELINE_OWNED_ROOTS` (8). Self-described
 *     as "reconciled to the sanctioned edit vocabulary" — i.e. a mirror.
 *   - UI `src/canvas/ui/inspector-v2/useInspectorMutations.ts` —
 *     `NODE_SETTER_FIELDS` (21 setters) + `EDGE_SETTER_FIELDS` (5 setters).
 *
 * WHY IT IS *CLASSED* AND NOT A FLAT ALLOWLIST. The "14 vs 26 setters" gap does
 * NOT decompose into "fields the AI is missing". It decomposes into four kinds,
 * and naive parity would be a shipped defect in two of them:
 *
 *   `grant`             the AI should simply hold this field. 22 rows.
 *   `invariant_coupled` the field belongs to a set that MUST move together. A raw
 *                       grant here recreates a desync no validator re-checks — the
 *                       goal_threshold quad has "exactly one sanctioned writer
 *                       (add_constraint's goal-join, which keeps raw/unit/cap/
 *                       normalised consistent)" (field-safety.ts:74-79). Parity is
 *                       owed at the OPERATION level, in a later leg of this train.
 *   `provenance_owned`  parity is DENIED, permanently. "Relabelling an AI-invented
 *                       value as user-extracted is a provenance integrity breach"
 *                       (field-safety.ts:158-161). The 2.474 constraint is
 *                       "AI <= human", and <= is satisfied by <.
 *   `ai_only`           the AI holds it and NO human setter reaches it. Recorded
 *                       rather than normalised: the asymmetry runs both ways and
 *                       hiding that was how the "14 vs 23" framing got minted.
 *
 * VOCABULARY. Rows are keyed on the WIRE field path — the thing the referee
 * actually screens. `adapters/edit-graph-producer.ts:88-141` projects an
 * `update_node` PatchOperation by iterating its `value` KEYS, one envelope per
 * key, so *a PatchOperation update value's keys ARE this vocabulary*. The UI's
 * client spellings (`observedState`, `weight`, `beliefExists`, `strengthStd`)
 * differ, so each row states its own mapping in `ui_client_fields` — the bridge
 * is IN the table, where it is reviewable, rather than in a second hidden mirror.
 *
 * HOW THE TWO CONSUMERS BIND (A6):
 *   CEE  — derives its allowlist from `aiEditableFieldRoots` / `aiEditableObservedSubkeys`.
 *   UI   — asserts every `useInspectorMutations` setter appears in `editableFieldUiSetters()`.
 *   BOTH — call `requireEditableFieldTableRevision(n)` at boot so a repo on an
 *          older `@talchain/schemas` pin fails LOUD instead of silently using a
 *          shorter table (hazard 1: a consumer on an older pin silently drops
 *          what it does not know).
 *
 * AND THE HALF DERIVATION CANNOT PROVIDE (trap 12d, measured 4 Aug 2026): a
 * derived guard proves the copies AGREE and is structurally BLIND to this table
 * being SHORT. `tests/orchestrator/editable-fields.test.ts` therefore also ships
 * a HAND-WRITTEN corpus that spells the real field and setter names out. Both
 * guards ship; neither supersedes the other.
 *
 * Derived at: UI staging dae8908fdf4fdc9328c7b28048d03e6de37911d4,
 *             CEE staging ac62fd4d3a3a8657b4bcb58e64b0e91a1454f59f (5 Aug 2026).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const EDITABLE_FIELD_CLASSES = [
  'grant',
  'invariant_coupled',
  'deferred_derivation',
  'provenance_owned',
  'ai_only',
] as const;

export const EditableFieldClassSchema = z.enum(EDITABLE_FIELD_CLASSES);
export type EditableFieldClass = z.infer<typeof EditableFieldClassSchema>;

export const EDITABLE_FIELD_ENTITIES = ['node', 'edge'] as const;
export const EditableFieldEntitySchema = z.enum(EDITABLE_FIELD_ENTITIES);
export type EditableFieldEntity = z.infer<typeof EditableFieldEntitySchema>;

export const EditableFieldRowSchema = z
  .object({
    /** Which graph entity the field lives on. */
    entity: EditableFieldEntitySchema,
    /** Canonical WIRE path, dot-separated (`observed_state.std`). */
    wire_field: z.string().min(1),
    /** First path segment — what the referee's root allowlist screens. */
    field_root: z.string().min(1),
    /** A6 class. */
    field_class: EditableFieldClassSchema,
    /** `useInspectorMutations` setter names that write this field. */
    ui_setters: z.array(z.string().min(1)),
    /** Client-side `data` key(s) the UI store actually holds. */
    ui_client_fields: z.array(z.string().min(1)),
    /** Human write sites OUTSIDE the inspector hook, `file:line` where known. */
    ui_write_sites: z.array(z.string().min(1)),
    /** Why this class. One line, load-bearing — reviewed, not decorative. */
    reason: z.string().min(1),
    /**
     * The DERIVATION THIS ROW IS WAITING ON. Empty for every row whose class is
     * settled. REQUIRED and non-empty on `deferred_derivation` rows, which is
     * what stops that class becoming a place to park a field nobody wants to
     * argue about: to defer, you must write down what would end the deferral.
     *
     * Required (never optional) on purpose — an absent question and an empty
     * question would be two states in one byte, and this package has a census
     * gate whose entire job is to notice that.
     */
    open_question: z.string(),
  })
  .strict();

export type EditableFieldRow = z.infer<typeof EditableFieldRowSchema>;

// ---------------------------------------------------------------------------
// THE TABLE
// ---------------------------------------------------------------------------

export const EDITABLE_FIELD_TABLE: readonly EditableFieldRow[] = Object.freeze([
  // ── node · grant (already at parity) ────────────────────────────────────
  {
    entity: 'node', wire_field: 'label', field_root: 'label', field_class: 'grant',
    ui_setters: ['setLabel'], ui_client_fields: ['label'], ui_write_sites: [],
    reason: 'Already granted. Projected to the `rename_node` candidate kind, so it bypasses the field screen entirely (edit-graph-producer.ts:92-100).',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'description', field_root: 'description', field_class: 'grant',
    ui_setters: ['setDescription'], ui_client_fields: ['description'], ui_write_sites: [],
    reason: 'Already granted. NOTE: NodeV3Schema declares `body`, not `description`; `description` survives on the schema\'s .passthrough(). Vocabulary divergence recorded, not resolved here.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'category', field_root: 'category', field_class: 'grant',
    ui_setters: ['setCategory'], ui_client_fields: ['category'], ui_write_sites: [],
    reason: 'Already granted. Closed enum (controllable | observable | external), so the type system guards it.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'factor_type', field_root: 'factor_type', field_class: 'grant',
    ui_setters: ['setFactorType'], ui_client_fields: ['factor_type'], ui_write_sites: [],
    reason: 'Already granted. Free-form classification with no downstream invariant.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'uncertainty_drivers', field_root: 'uncertainty_drivers', field_class: 'grant',
    ui_setters: ['setUncertaintyDrivers'], ui_client_fields: ['uncertainty_drivers'], ui_write_sites: [],
    reason: 'Already granted. Narrative list; covered by the engine-claim scan on every string leaf.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'prior', field_root: 'prior', field_class: 'grant',
    ui_setters: ['setPriorRange'], ui_client_fields: ['prior'], ui_write_sites: [],
    reason: 'Already granted. PriorSchema bounds range_min/range_max; no cross-field coupling.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'interventions', field_root: 'interventions', field_class: 'grant',
    ui_setters: ['setIntervention', 'removeIntervention'], ui_client_fields: ['interventions'], ui_write_sites: [],
    reason: 'Already granted. The intervention contract keys are already DERIVED from InterventionV3.shape in field-safety.ts, so this subtree is the estate\'s existing derive-don\'t-mirror precedent.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'display_value', field_root: 'display_value', field_class: 'grant',
    ui_setters: ['setObservedValue'], ui_client_fields: ['display_value'], ui_write_sites: [],
    reason: 'Already granted, status quo. Server-authored prose; the human setter only CLEARS it when a value commit invalidates the old string. A case exists for reclassing it pipeline-owned — not changed by this lane.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'is_baseline', field_root: 'is_baseline', field_class: 'grant',
    ui_setters: [], ui_client_fields: ['is_baseline'],
    ui_write_sites: ['OutputsDock baseline toggle', 'useAddBaseline', 'applyDraftResult'],
    reason: 'Already granted. Human-editable outside the inspector hook — a boolean flag with no coupled set.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'observed_state.value', field_root: 'observed_state', field_class: 'grant',
    ui_setters: ['setObservedValue'], ui_client_fields: ['observedState'], ui_write_sites: [],
    reason: 'Already granted (ALLOWED_OBSERVED_SUBKEYS). The model-scale number.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'observed_state.unit', field_root: 'observed_state', field_class: 'grant',
    ui_setters: ['setObservedUnit'], ui_client_fields: ['observedState'], ui_write_sites: [],
    reason: 'Already granted (ALLOWED_OBSERVED_SUBKEYS).',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'observed_state.baseline', field_root: 'observed_state', field_class: 'grant',
    ui_setters: ['setObservedBaseline'], ui_client_fields: ['observedState'], ui_write_sites: [],
    reason: 'Already granted (ALLOWED_OBSERVED_SUBKEYS).',
    open_question: '',
  },

  // ── node · GENUINE NEW GRANTS (the real half of the gap) ─────────────────
  {
    entity: 'node', wire_field: 'observed_state.std', field_root: 'observed_state', field_class: 'grant',
    ui_setters: ['setObservedStd'], ui_client_fields: ['observedState'], ui_write_sites: [],
    reason: 'NEW GRANT. A pure uncertainty tunable with a human setter and no AI access. ObservedStateSchema already bounds it (positive().optional()) and the patch path already enforces observed_state.std > 0 via refineNodeNumericBounds — nothing about it is coupled.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'state_space', field_root: 'state_space', field_class: 'grant',
    ui_setters: ['setStateSpaceRange'], ui_client_fields: ['state_space'], ui_write_sites: [],
    reason: 'NEW GRANT — the design review\'s named first genuine grant. StateSpaceSchema is a bare { range: { min, max } }; the setter exists and the allowlist simply never listed it.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'probability', field_root: 'probability', field_class: 'grant',
    ui_setters: ['setProbability'], ui_client_fields: ['probability'], ui_write_sites: [],
    reason: 'NEW GRANT. Risk probability, 0-1, already clamped at the setter and finiteness-checked on the patch path. Independent of impact.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'impact', field_root: 'impact', field_class: 'grant',
    ui_setters: ['setImpact'], ui_client_fields: ['impact'], ui_write_sites: [],
    reason: 'NEW GRANT. RiskImpact is a closed enum, so the vocabulary itself is the guard.',
    open_question: '',
  },

  // ── node · invariant-coupled ────────────────────────────────────────────
  {
    entity: 'node', wire_field: 'observed_state.cap', field_root: 'observed_state', field_class: 'invariant_coupled',
    ui_setters: ['setObservedCap'], ui_client_fields: ['observedState'], ui_write_sites: [],
    reason: 'COUPLED. `cap` is the normaliser denominator (value = raw/cap). Setting it alone silently re-scales every stored value. A typed op must move cap + value (+ raw_value) together.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'observed_state.raw_value', field_root: 'observed_state', field_class: 'invariant_coupled',
    ui_setters: ['setObservedRawValue'], ui_client_fields: ['observedState'], ui_write_sites: [],
    reason: 'COUPLED — judgement J1, ACCEPTED by the orchestrator 5 Aug 2026. CEE files raw_value under PIPELINE_OWNED_ROOTS beside source/extractiontype, but it is a NUMBER THE USER TYPED, not a provenance stamp: setObservedValue deliberately commits value+raw_value in ONE update so they cannot disagree, and INTERVENTION_CONTRACT_KEYS already exempts it as a contract value inside the interventions subtree. THE TYPED OP OWES THE RE-DERIVATION: it takes raw_value and RE-DERIVES the tuple (value = raw/cap), rather than accepting the three numbers and trusting them to agree. Never a raw field grant.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'goal_threshold_raw', field_root: 'goal_threshold_raw', field_class: 'invariant_coupled',
    ui_setters: ['setThreshold'], ui_client_fields: ['goal_threshold_raw'], ui_write_sites: [],
    reason: 'COUPLED — the goal_threshold quad. field-safety.ts:74-79: "exactly one sanctioned writer (add_constraint\'s goal-join, which keeps raw/unit/cap/normalised consistent)". A candidate setting it alone creates the registered/scored desync.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'goal_threshold_unit', field_root: 'goal_threshold_unit', field_class: 'invariant_coupled',
    ui_setters: ['setThreshold'], ui_client_fields: ['goal_threshold_unit'], ui_write_sites: [],
    reason: 'COUPLED — the goal_threshold quad. Same sanctioned writer.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'goal_threshold_cap', field_root: 'goal_threshold_cap', field_class: 'invariant_coupled',
    ui_setters: ['setGoalCap'], ui_client_fields: ['goal_threshold_cap'], ui_write_sites: [],
    reason: 'COUPLED — the goal_threshold quad. Same sanctioned writer.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'goal_threshold', field_root: 'goal_threshold', field_class: 'invariant_coupled',
    ui_setters: [], ui_client_fields: ['goalThreshold', 'goal_threshold'],
    ui_write_sites: ['store.ts setGoalThreshold action', 'model-tab GoalSection'],
    reason: 'COUPLED — the NORMALISED member of the quad; the NodeV3 field the engine actually reads (with goal_threshold_frame). Derived from raw/unit/cap, never set independently.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'success_threshold', field_root: 'success_threshold', field_class: 'invariant_coupled',
    ui_setters: [], ui_client_fields: ['success_threshold'],
    ui_write_sites: ['store.ts setGoalThreshold action', 'model-tab GoalSection'],
    reason: 'COUPLED — same goal-target seam, written by the same store action as threshold_source.',
    open_question: '',
  },

  // ── node · provenance-owned (DENIED BY DESIGN) ──────────────────────────
  {
    entity: 'node', wire_field: 'observed_state.source', field_root: 'observed_state', field_class: 'provenance_owned',
    ui_setters: ['setObservedSource'], ui_client_fields: ['observedState'], ui_write_sites: [],
    reason: 'DENIED. field-safety.ts:158-161 verbatim: "relabelling an AI-invented value as user-extracted is a provenance integrity breach". This field gates the "AI estimate" / "User edited" pill; the EXECUTOR stamps it server-side (A12), never the model payload.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'extractiontype', field_root: 'extractiontype', field_class: 'provenance_owned',
    ui_setters: ['setExtractionType'], ui_client_fields: ['extractionType'], ui_write_sites: [],
    reason: 'DENIED. Records HOW a value entered the model (explicit | inferred). Same integrity argument as observed_state.source.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'threshold_source', field_root: 'threshold_source', field_class: 'provenance_owned',
    ui_setters: [], ui_client_fields: ['threshold_source'],
    ui_write_sites: ['store.ts setGoalThreshold action', 'model-tab GoalSection'],
    reason: 'DENIED — judgement J2, ACCEPTED by the orchestrator 5 Aug 2026. Stamps WHO set the goal threshold, the same class as observed_state.source. ⚠ THIS IS STRICTER THAN CEE TODAY: `threshold_source` is not in PIPELINE_OWNED_ROOTS (the match is exact-segment, and threshold_source != source), so CEE currently rejects it with the vaguer FIELD_NOT_ALLOWED. THE CEE LEG TAKES THIS AS A DELIBERATE BEHAVIOUR CHANGE AND OWES ITS OWN RED TEST: a test that FAILS at CEE pristine (proving the field is not owned today) and passes once threshold_source joins PIPELINE_OWNED_ROOTS, with the reason code asserted as PIPELINE_OWNED_FIELD rather than FIELD_NOT_ALLOWED. Absorbing this into a wiring commit would ship a behaviour change unwitnessed.',
    open_question: '',
  },

  // ── node · ai_only (the asymmetry, recorded rather than hidden) ──────────
  {
    entity: 'node', wire_field: 'data', field_root: 'data', field_class: 'ai_only',
    ui_setters: [], ui_client_fields: [], ui_write_sites: [],
    reason: 'AI-ONLY. The PLoT-canonical rename of observed_state (normaliseEditOpsForPlot). Same sub-key rule applies; no human setter writes this spelling.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'goal_constraints', field_root: 'goal_constraints', field_class: 'ai_only',
    ui_setters: [], ui_client_fields: [], ui_write_sites: [],
    reason: 'AI-ONLY at the FIELD level. The human reaches constraints OPERATION-level, through the GoalPanel add-constraint journey (read back at inspector-v2/editors/GoalAdvancedEditor.tsx:29), never by writing this key.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'encoding_map', field_root: 'encoding_map', field_class: 'ai_only',
    ui_setters: [], ui_client_fields: [], ui_write_sites: [],
    reason: 'AI-ONLY. No human setter at the pinned UI tip.',
    open_question: '',
  },
  {
    entity: 'node', wire_field: 'intercept', field_root: 'intercept', field_class: 'ai_only',
    ui_setters: [], ui_client_fields: [], ui_write_sites: [],
    reason: 'AI-ONLY. No human setter at the pinned UI tip.',
    open_question: '',
  },

  // ── edge · grant (already at parity) ────────────────────────────────────
  {
    entity: 'edge', wire_field: 'strength.mean', field_root: 'strength', field_class: 'grant',
    ui_setters: ['setStrength'], ui_client_fields: ['weight'], ui_write_sites: [],
    reason: 'Already granted. Client holds the MAGNITUDE in `weight` with the sign in `direction`; the wire carries a SIGNED mean in [-1, 1].',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'strength.std', field_root: 'strength', field_class: 'grant',
    ui_setters: ['setStd'], ui_client_fields: ['strengthStd'], ui_write_sites: [],
    reason: 'Already granted. StrengthSchema bounds it (positive()).',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'exists_probability', field_root: 'exists_probability', field_class: 'grant',
    ui_setters: ['setExistsProbability'], ui_client_fields: ['beliefExists'], ui_write_sites: [],
    reason: 'Already granted. 0-1, bounded by EdgeV3Schema and by refineEdgeNumericBounds.',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'effect_direction', field_root: 'effect_direction', field_class: 'grant',
    ui_setters: ['setDirection'], ui_client_fields: ['direction'], ui_write_sites: [],
    reason: 'Already granted. Closed enum (positive | negative | unknown).',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'label', field_root: 'label', field_class: 'grant',
    ui_setters: ['setLabel'], ui_client_fields: ['label'], ui_write_sites: [],
    reason: 'NEW GRANT. EdgeV3Schema:238 declares it and the human setter exists, but ALLOWED_EDGE_FIELD_ROOTS never listed it and edges have no `rename_node` analogue — so an AI edge-label edit is rejected today. Free text, already covered by the engine-claim scan on every string leaf.',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'confidence', field_root: 'confidence', field_class: 'deferred_derivation',
    ui_setters: [], ui_client_fields: ['confidence'],
    ui_write_sites: ['useModelActionApply.ts:353 (model-action apply path)'],
    reason: 'NOT GRANTED — orchestrator ruling on judgement J3 (5 Aug 2026), and the ruling is the general rule: a field is not granted on LOW CONFIDENCE THAT IT MEANS ANYTHING. It is human-writable outside the inspector hook, but it is absent from EdgeV3Schema, so nothing establishes that a write to it reaches any computation. Granting an AI write to a field with no known reader manufactures a lever that moves nothing while looking like it moves something.',
    open_question: 'Who READS edge.confidence — is there an engine reader (ISL/PLoT/the referee), or is it client-only display state? Grant ONLY if a reader in the compute path is named at a pinned sha. If the complete reader manifest is empty, the row leaves the table entirely rather than being reclassed (a write-only field is not an editable field). Note the shape of the evidence required: an ABSENCE claim about readers needs a complete reviewed manifest plus the explicit scope searched, not a partial grep.',
  },

  // ── edge · provenance-owned (DENIED BY DESIGN) ──────────────────────────
  {
    entity: 'edge', wire_field: 'weightSource', field_root: 'weightSource', field_class: 'provenance_owned',
    ui_setters: ['setStrength'], ui_client_fields: ['weightSource'], ui_write_sites: [],
    reason: 'DENIED. A client-derived stamp minted from what the wire carried (mergeAppliedGraph.ts:324,:368) — it is not a writable wire field at all. A12: the EXECUTOR stamps provenance on applied ops, never the LLM payload.',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'directionSource', field_root: 'directionSource', field_class: 'provenance_owned',
    ui_setters: ['setStrength', 'setDirection'], ui_client_fields: ['directionSource'], ui_write_sites: [],
    reason: 'DENIED. Same class as weightSource — the user picking +/- is the only thing that turns a defaulted direction into a stated one (ROADMAP 2.263).',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'strengthStdSource', field_root: 'strengthStdSource', field_class: 'provenance_owned',
    ui_setters: ['setStd'], ui_client_fields: ['strengthStdSource'], ui_write_sites: [],
    reason: 'DENIED. Same class as weightSource.',
    open_question: '',
  },
  {
    entity: 'edge', wire_field: 'beliefExistsSource', field_root: 'beliefExistsSource', field_class: 'provenance_owned',
    ui_setters: ['setExistsProbability'], ui_client_fields: ['beliefExistsSource'], ui_write_sites: [],
    reason: 'DENIED. Same class as weightSource.',
    open_question: '',
  },

  // ── edge · ai_only ──────────────────────────────────────────────────────
  {
    entity: 'edge', wire_field: 'edge_type', field_root: 'edge_type', field_class: 'ai_only',
    ui_setters: [], ui_client_fields: [], ui_write_sites: [],
    reason: 'AI-ONLY. Closed enum (directed | bidirected) with no human setter at the pinned UI tip.',
    open_question: '',
  },
] as const satisfies readonly EditableFieldRow[]);

// ---------------------------------------------------------------------------
// Derived views — every consumer binds through these, never through the array
// ---------------------------------------------------------------------------

/** Classes whose rows the AI may edit. `ai_only` counts: the class records HUMAN reach, not AI reach. */
const AI_EDITABLE_CLASSES: ReadonlySet<EditableFieldClass> = new Set(['grant', 'ai_only']);

export function fieldsOfClass(cls: EditableFieldClass): readonly EditableFieldRow[] {
  return EDITABLE_FIELD_TABLE.filter((r) => r.field_class === cls);
}

export function lookupEditableField(
  entity: EditableFieldEntity,
  wireField: string,
): EditableFieldRow | undefined {
  return EDITABLE_FIELD_TABLE.find((r) => r.entity === entity && r.wire_field === wireField);
}

/** The ROOT segments the AI may name, per entity — CEE's allowlist, derived. */
export function aiEditableFieldRoots(entity: EditableFieldEntity): ReadonlySet<string> {
  return new Set(
    EDITABLE_FIELD_TABLE.filter((r) => r.entity === entity && AI_EDITABLE_CLASSES.has(r.field_class))
      .map((r) => r.field_root),
  );
}

/** The depth-1 sub-keys the AI may name inside `observed_state` / `data`. */
export function aiEditableObservedSubkeys(): ReadonlySet<string> {
  return new Set(
    EDITABLE_FIELD_TABLE.filter(
      (r) =>
        r.entity === 'node' &&
        r.field_root === 'observed_state' &&
        r.wire_field.includes('.') &&
        AI_EDITABLE_CLASSES.has(r.field_class),
    ).map((r) => r.wire_field.split('.')[1]!),
  );
}

/**
 * Path SEGMENTS (lowercased) that are provenance-owned. Screened on EVERY
 * segment, matching field-safety.ts's `isPipelineOwned`, so
 * `observed_state.source` and `data/source` are as owned as the bare spelling.
 */
export function provenanceOwnedSegments(): ReadonlySet<string> {
  return new Set(
    fieldsOfClass('provenance_owned').map((r) => {
      const segs = r.wire_field.split('.');
      return segs[segs.length - 1]!.toLowerCase();
    }),
  );
}

/** Path SEGMENTS (lowercased) that belong to an invariant-coupled set. */
export function invariantCoupledSegments(): ReadonlySet<string> {
  return new Set(
    fieldsOfClass('invariant_coupled').map((r) => {
      const segs = r.wire_field.split('.');
      return segs[segs.length - 1]!.toLowerCase();
    }),
  );
}

/**
 * Path SEGMENTS (lowercased) whose grant DECISION IS NOT MADE. Not granted, not
 * denied on principle, and — critically — NOT the same as having no row: the
 * generic "no row in the table" rejection would be a false statement about a
 * field that has one, and a model told the wrong reason retries the wrong way.
 * Each of these rows carries the derivation that would settle it.
 */
export function deferredDerivationSegments(): ReadonlySet<string> {
  return new Set(
    fieldsOfClass('deferred_derivation').map((r) => {
      const segs = r.wire_field.split('.');
      return segs[segs.length - 1]!.toLowerCase();
    }),
  );
}

/**
 * Every inspector setter name the table accounts for. The UI's union assertion
 * runs against this: a NEW setter with no row is the drift derivation cannot
 * see, and it is the reason the corpus half exists.
 */
export function editableFieldUiSetters(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const row of EDITABLE_FIELD_TABLE) for (const s of row.ui_setters) out.add(s);
  return out;
}

// ---------------------------------------------------------------------------
// Pin-skew guard (A6 rider) — fail LOUD, never silently-narrow
// ---------------------------------------------------------------------------

/**
 * Monotone revision of the TABLE CONTENTS, independent of the package version.
 * Bump it in the same change as any row edit. A consumer states the revision it
 * was written against; an older pin then throws instead of quietly enforcing a
 * shorter list.
 */
export const EDITABLE_FIELD_TABLE_REVISION = 1;

/**
 * Content digest of the table, pinned. Any row added, removed, reclassed or
 * re-worded REDs `tests/orchestrator/editable-fields.test.ts`, which is what
 * makes a revision bump a deliberate act rather than something to forget.
 * Non-cryptographic (FNV-1a x2) on purpose: no node:crypto import in a package
 * the UI bundles for the browser.
 */
export const EDITABLE_FIELD_TABLE_DIGEST = 'ac880b21-db417497';

function fnv1a(input: string, offset: number, prime: number): string {
  let h = offset >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, prime) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Deterministic, order-independent digest of a table's semantic content. */
export function computeEditableFieldTableDigest(rows: readonly EditableFieldRow[]): string {
  const canonical = rows
    .map((r) =>
      [
        r.entity,
        r.wire_field,
        r.field_root,
        r.field_class,
        [...r.ui_setters].sort().join(','),
        [...r.ui_client_fields].sort().join(','),
        [...r.ui_write_sites].sort().join(','),
      ].join('|'),
    )
    .sort()
    .join('\n');
  return `${fnv1a(canonical, 0x811c9dc5, 0x01000193)}-${fnv1a(canonical, 0x1000193, 0x01000193)}`;
}

/**
 * Assert the pinned `@talchain/schemas` carries at least revision `minimum` of
 * the table. Hazard 1 made loud: a consumer on an older pin would otherwise
 * enforce a SHORTER allowlist and silently deny fields the design granted.
 */
export function requireEditableFieldTableRevision(minimum: number): void {
  if (EDITABLE_FIELD_TABLE_REVISION < minimum) {
    throw new Error(
      `@talchain/schemas: editable-field table revision ${EDITABLE_FIELD_TABLE_REVISION} is older than the ` +
        `required revision ${minimum}. This pin carries a SHORTER table, so field grants would be silently ` +
        `denied. Re-vendor @talchain/schemas in this repo (see vendor/README.md) before relying on the table.`,
    );
  }
}

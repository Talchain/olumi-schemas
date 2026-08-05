/**
 * Classed field-parity table — ROADMAP 2.474, design-review amendment A6.
 *
 * WHAT THIS GUARDS, AND WHY IT IS TWO GUARDS AND NOT ONE (trap 12d).
 *
 * The table (`src/orchestrator/editable-fields.ts`) is the single source of
 * truth for which graph fields the conversational AI may edit, and in which
 * CLASS. Two independent failure modes have to be closed, and the estate has
 * learned the hard way that ONE mechanism cannot close both:
 *
 *   1. DRIFT between the table and its consumers — closed by DERIVATION.
 *      CEE derives its referee allowlist from the table's `grant` rows; the UI
 *      asserts every inspector setter maps to a row. A derived guard proves the
 *      copies AGREE.
 *
 *   2. THE TABLE ITSELF BEING SHORT — a real, human-editable field that simply
 *      has no row. Derivation is structurally BLIND to this (delete a key from
 *      the canonical map and every derived guard stays green — measured, 4 Aug
 *      2026, the `thousand` case). The only thing that notices is a
 *      HAND-WRITTEN CORPUS spelling the real field names out. That is the
 *      `REAL_*` blocks below: they are deliberately re-typed from the UI tip,
 *      NOT derived from the table, and they are the reason a dropped row REDs.
 *
 * Both halves ship. Neither supersedes the other.
 *
 * CORPUS PROVENANCE (re-derive at your tip before trusting it):
 *   UI `DecisionGuideAI` staging @ dae8908fdf4fdc9328c7b28048d03e6de37911d4
 *     - src/canvas/ui/inspector-v2/useInspectorMutations.ts
 *       NODE_SETTER_FIELDS (21 setters) / EDGE_SETTER_FIELDS (5 setters)
 *     - src/canvas/domain/__tests__/analyticalNodeFields.registry.spec.ts:81-88
 *       the non-inspector residual write sites (4 fields)
 *   CEE `olumi-assistants-service` staging @ ac62fd4d3a3a8657b4bcb58e64b0e91a1454f59f
 *     - src/orchestrator-v5/graph-management/field-safety.ts
 *       ALLOWED_NODE_FIELD_ROOTS (14) / ALLOWED_EDGE_FIELD_ROOTS (4) /
 *       ALLOWED_OBSERVED_SUBKEYS (4) / PIPELINE_OWNED_ROOTS (8)
 */
import { describe, it, expect } from 'vitest';

import {
  EDITABLE_FIELD_TABLE,
  EDITABLE_FIELD_CLASSES,
  EditableFieldRowSchema,
  EDITABLE_FIELD_TABLE_REVISION,
  EDITABLE_FIELD_TABLE_DIGEST,
  computeEditableFieldTableDigest,
  requireEditableFieldTableRevision,
  aiEditableFieldRoots,
  aiEditableObservedSubkeys,
  deferredDerivationSegments,
  fieldsOfClass,
  editableFieldUiSetters,
  lookupEditableField,
} from '../../src/orchestrator/editable-fields.js';

// ---------------------------------------------------------------------------
// THE CORPUS — hand-written, re-typed from the UI tip. NOT derived.
// This is the half that notices the TABLE IS SHORT.
// ---------------------------------------------------------------------------

/** Every setter `useNodeMutations` returns at the pinned UI tip. 21 names. */
const REAL_NODE_SETTERS = [
  'setLabel',
  'setDescription',
  'setThreshold',
  'setObservedValue',
  'setIntervention',
  'removeIntervention',
  'setPriorRange',
  'setObservedRawValue',
  'setObservedUnit',
  'setObservedCap',
  'setObservedBaseline',
  'setObservedStd',
  'setObservedSource',
  'setCategory',
  'setExtractionType',
  'setFactorType',
  'setStateSpaceRange',
  'setUncertaintyDrivers',
  'setGoalCap',
  'setProbability',
  'setImpact',
] as const;

/** Every setter `useEdgeMutations` returns at the pinned UI tip. 5 names. */
const REAL_EDGE_SETTERS = [
  'setStrength',
  'setStd',
  'setExistsProbability',
  'setLabel',
  'setDirection',
] as const;

/**
 * Human-editable fields written OUTSIDE the inspector hook, with their write
 * sites (analyticalNodeFields.registry.spec.ts:81-88). A human-editable field
 * with no row is exactly the gap this corpus exists to catch, and three of
 * these four are invisible to `useInspectorMutations` entirely.
 */
const REAL_NON_INSPECTOR_FIELDS = [
  { entity: 'node', wire_field: 'is_baseline' },
  { entity: 'node', wire_field: 'success_threshold' },
  { entity: 'node', wire_field: 'threshold_source' },
  { entity: 'edge', wire_field: 'confidence' },
  // Revision 2 (2.474 panel leg). The RIGHT-HAND PANEL's contested-edge card
  // writes edge `validation` (user_action / resolved_by / resolved_value) at
  // ModelTabBody.tsx:638,:662,:670 — three human write sites, none of them a
  // `useInspectorMutations` setter, which is exactly the blind spot this corpus
  // exists for. Its absence was not a missing row so much as a FALSE PREMISE:
  // provenanceOwnedSegments()'s doc asserted these stamps "have no human setter
  // and therefore no row here". They do. Derivation could never have caught this
  // — the table agreed with itself perfectly.
  { entity: 'edge', wire_field: 'validation' },
] as const;

/**
 * The five GENUINE GRANTS — fields a human setter reaches that the AI cannot
 * touch at the CEE tip, that carry no invariant coupling and no provenance
 * ownership, AND whose meaning is established. If any of these loses its row or
 * its `grant` class, the tool's field parity silently narrows back to the
 * 14-root allowlist.
 */
const REAL_GENUINE_GRANTS = [
  { entity: 'node', wire_field: 'observed_state.std' },
  { entity: 'node', wire_field: 'state_space' },
  { entity: 'node', wire_field: 'probability' },
  { entity: 'node', wire_field: 'impact' },
  { entity: 'edge', wire_field: 'label' },
] as const;

/**
 * NOT GRANTED, and NOT denied on principle either — the grant decision is
 * DEFERRED pending a named derivation (orchestrator ruling on J3, 5 Aug 2026).
 * The general rule the ruling states: a field is not granted on low confidence
 * that it means anything. This corpus entry is what stops the class quietly
 * resolving itself into a grant without the derivation ever being done.
 */
const REAL_DEFERRED_DERIVATION = [
  { entity: 'edge', wire_field: 'confidence' },
] as const;

/**
 * PERMANENTLY DENIED. field-safety.ts:158-161, verbatim: "relabelling an
 * AI-invented value as user-extracted is a provenance integrity breach."
 * "AI <= human" is satisfied by <=, not by =. A row here flipping to `grant`
 * is a provenance breach shipped as a feature.
 */
const REAL_PROVENANCE_OWNED = [
  { entity: 'node', wire_field: 'observed_state.source' },
  { entity: 'node', wire_field: 'extractiontype' },
  { entity: 'node', wire_field: 'threshold_source' },
  { entity: 'edge', wire_field: 'weightSource' },
  { entity: 'edge', wire_field: 'directionSource' },
  { entity: 'edge', wire_field: 'strengthStdSource' },
  { entity: 'edge', wire_field: 'beliefExistsSource' },
  // Revision 2 (2.474 panel leg). `validation` carries ADJUDICATION provenance,
  // which is a strictly stronger claim than a value stamp: an AI writing
  // `resolved_by: 'user'` asserts a human settled a producer disagreement when
  // none did — it launders CONSENT, not just a number. CEE already denied it
  // (field-safety.ts:173 → PIPELINE_OWNED_ROOTS at :216-218), so the row changes
  // no behaviour anywhere; it makes the denial explicit and stops the next
  // re-derivation from "discovering" a human setter and granting the field.
  { entity: 'edge', wire_field: 'validation' },
] as const;

/**
 * INVARIANT-COUPLED. The goal_threshold quad has "exactly one sanctioned
 * writer (add_constraint's goal-join, which keeps raw/unit/cap/normalised
 * consistent)" (field-safety.ts:74-79). Raw field parity here recreates the
 * registered/scored desync. `observed_state.cap` is the normaliser denominator
 * (`value = raw/cap`) and `observed_state.raw_value` is the magnitude that
 * produced `value` — the inspector commits both in ONE update for that reason.
 */
const REAL_INVARIANT_COUPLED = [
  { entity: 'node', wire_field: 'goal_threshold_raw' },
  { entity: 'node', wire_field: 'goal_threshold_unit' },
  { entity: 'node', wire_field: 'goal_threshold_cap' },
  { entity: 'node', wire_field: 'goal_threshold' },
  { entity: 'node', wire_field: 'success_threshold' },
  { entity: 'node', wire_field: 'observed_state.cap' },
  { entity: 'node', wire_field: 'observed_state.raw_value' },
] as const;

/**
 * The CEE allowlist at the pinned tip — re-typed, not derived. The table's
 * `grant` + `ai_only` rows must reproduce it exactly, which is what makes the
 * CEE leg's derivation a no-op rename rather than a behaviour change.
 */
const REAL_CEE_ALLOWED_NODE_ROOTS = [
  'label', 'description', 'category', 'display_value', 'observed_state', 'data',
  'goal_constraints', 'encoding_map', 'prior', 'factor_type',
  'uncertainty_drivers', 'intercept', 'interventions', 'is_baseline',
] as const;

const REAL_CEE_ALLOWED_EDGE_ROOTS = [
  'strength', 'exists_probability', 'effect_direction', 'edge_type',
] as const;

const REAL_CEE_ALLOWED_OBSERVED_SUBKEYS = ['value', 'baseline', 'unit', 'interventions'] as const;

/**
 * WIRE SPELLINGS THAT ARE LIVE TODAY and must keep parsing. Hand-written, from
 * the producer rather than from the table: `edit-graph-producer.ts:88-141` fans
 * an update value out one envelope PER KEY, and CEE's `checkObservedSubtree`
 * screens the observed subtree on `segs[1]`, so THESE are the strings the model
 * actually emits for an option-configure edit. A derived guard cannot notice
 * that one of them stopped parsing; this list can.
 */
const REAL_LIVE_WIRE_SPELLINGS = [
  'data/interventions/fac_marketing_spend',
  'observed_state.interventions.fac_marketing_spend',
  'interventions',
  'observed_state.value',
  'data/value',
] as const;

// ---------------------------------------------------------------------------
// 1. Well-formedness
// ---------------------------------------------------------------------------

describe('editable-fields table — well-formed', () => {
  it('every row parses its own strict schema', () => {
    for (const row of EDITABLE_FIELD_TABLE) {
      const parsed = EditableFieldRowSchema.safeParse(row);
      expect(parsed.success, `row ${row.entity}/${row.wire_field} failed: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });

  it('(entity, wire_field) is unique — the table is a map, not a list', () => {
    const keys = EDITABLE_FIELD_TABLE.map((r) => `${r.entity}/${r.wire_field}`);
    expect(keys).toHaveLength(new Set(keys).size);
  });

  it('every row carries a non-empty reason', () => {
    for (const row of EDITABLE_FIELD_TABLE) {
      expect(row.reason.trim().length, `${row.entity}/${row.wire_field} has no reason`).toBeGreaterThan(0);
    }
  });

  it('field_root is the first path segment of wire_field', () => {
    for (const row of EDITABLE_FIELD_TABLE) {
      expect(row.field_root, `${row.wire_field}`).toBe(row.wire_field.split('.')[0]);
    }
  });

  it('the class vocabulary is exactly the five classes (A6 + the J3 ruling)', () => {
    expect([...EDITABLE_FIELD_CLASSES]).toEqual([
      'grant', 'invariant_coupled', 'deferred_derivation', 'provenance_owned', 'ai_only',
    ]);
  });

  it('a deferred_derivation row MUST carry the question that would settle it', () => {
    const deferred = fieldsOfClass('deferred_derivation');
    expect(deferred.length, 'the class exists but holds nothing — delete it or use it').toBeGreaterThan(0);
    for (const row of deferred) {
      expect(
        row.open_question.trim().length,
        `${row.entity}/${row.wire_field} is deferred with no stated derivation — that is a parking space, not a deferral`,
      ).toBeGreaterThan(0);
    }
  });

  it('a deferred row names a READER question, not a preference — the derivation must be answerable', () => {
    for (const row of fieldsOfClass('deferred_derivation')) {
      expect(row.open_question.toLowerCase()).toMatch(/read|reader|consumer/);
    }
  });

  it('an ai_only row has no ui_setters and no ui_write_sites (that is what makes it ai_only)', () => {
    for (const row of fieldsOfClass('ai_only')) {
      expect(row.ui_setters, `${row.wire_field}`).toEqual([]);
    }
  });

  it('every non-ai_only row is reachable by a human — a setter or a named write site', () => {
    for (const row of EDITABLE_FIELD_TABLE) {
      if (row.field_class === 'ai_only') continue;
      const reachable = row.ui_setters.length + row.ui_write_sites.length;
      expect(reachable, `${row.entity}/${row.wire_field} is human-unreachable but not classed ai_only`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. THE CORPUS — the half that notices the table is SHORT (12d)
// ---------------------------------------------------------------------------

describe('editable-fields table — hand-written corpus (completeness, NOT derived)', () => {
  it('every real inspector NODE setter maps to at least one row', () => {
    const covered = editableFieldUiSetters();
    const missing = REAL_NODE_SETTERS.filter((s) => !covered.has(s));
    expect(missing, `inspector setters with no table row: ${missing.join(', ')}`).toEqual([]);
  });

  it('every real inspector EDGE setter maps to at least one row', () => {
    const covered = editableFieldUiSetters();
    const missing = REAL_EDGE_SETTERS.filter((s) => !covered.has(s));
    expect(missing, `inspector setters with no table row: ${missing.join(', ')}`).toEqual([]);
  });

  it('no row cites a setter that does not exist at the UI tip (the reverse direction)', () => {
    const real = new Set<string>([...REAL_NODE_SETTERS, ...REAL_EDGE_SETTERS]);
    const fabricated = [...editableFieldUiSetters()].filter((s) => !real.has(s));
    expect(fabricated, `table cites setters absent from the UI tip: ${fabricated.join(', ')}`).toEqual([]);
  });

  it('every LIVE wire spelling resolves to a row whose class permits it', () => {
    for (const spelling of REAL_LIVE_WIRE_SPELLINGS) {
      const segs = spelling.split(/[/.]/);
      const root = segs[0]!;
      expect(
        aiEditableFieldRoots('node').has(root),
        `live spelling '${spelling}' has root '${root}' which is not AI-editable`,
      ).toBe(true);
      if ((root === 'observed_state' || root === 'data') && segs.length > 1) {
        expect(
          aiEditableObservedSubkeys().has(segs[1]!),
          `live spelling '${spelling}' names sub-key '${segs[1]}', which the derived set drops — this REVOKES a live capability`,
        ).toBe(true);
      }
    }
  });

  it('every non-inspector human-editable field has a row', () => {
    for (const f of REAL_NON_INSPECTOR_FIELDS) {
      const row = lookupEditableField(f.entity, f.wire_field);
      expect(row, `${f.entity}/${f.wire_field} (non-inspector write site) has no table row`).toBeDefined();
      expect(row!.ui_write_sites.length, `${f.wire_field} must name its write site`).toBeGreaterThan(0);
    }
  });

  it('the five GENUINE GRANTS are present and classed `grant`', () => {
    for (const f of REAL_GENUINE_GRANTS) {
      const row = lookupEditableField(f.entity, f.wire_field);
      expect(row, `${f.entity}/${f.wire_field} missing from the table`).toBeDefined();
      expect(row!.field_class, `${f.entity}/${f.wire_field} must be a grant`).toBe('grant');
    }
  });

  it('every PROVENANCE-OWNED field is present and DENIED — never `grant`', () => {
    for (const f of REAL_PROVENANCE_OWNED) {
      const row = lookupEditableField(f.entity, f.wire_field);
      expect(row, `${f.entity}/${f.wire_field} missing from the table`).toBeDefined();
      expect(
        row!.field_class,
        `${f.entity}/${f.wire_field} is provenance-owned: granting it lets the AI relabel its own invention as user-extracted`,
      ).toBe('provenance_owned');
    }
  });

  it('every DEFERRED field is present, classed deferred_derivation, and NOT editable', () => {
    for (const f of REAL_DEFERRED_DERIVATION) {
      const row = lookupEditableField(f.entity, f.wire_field);
      expect(row, `${f.entity}/${f.wire_field} missing from the table`).toBeDefined();
      expect(
        row!.field_class,
        `${f.entity}/${f.wire_field} was granted without the derivation that would justify it`,
      ).toBe('deferred_derivation');
      // The point of the class: it must not leak into the AI-editable set.
      expect(
        aiEditableFieldRoots(f.entity).has(row!.field_root),
        `deferred root '${row!.field_root}' leaked into the AI-editable roots`,
      ).toBe(false);
      expect(deferredDerivationSegments().has(f.wire_field.toLowerCase())).toBe(true);
    }
  });

  it('every INVARIANT-COUPLED field is present and is NOT a raw grant', () => {
    for (const f of REAL_INVARIANT_COUPLED) {
      const row = lookupEditableField(f.entity, f.wire_field);
      expect(row, `${f.entity}/${f.wire_field} missing from the table`).toBeDefined();
      expect(
        row!.field_class,
        `${f.entity}/${f.wire_field} must move with its coupled set via a typed op, never as a raw field grant`,
      ).toBe('invariant_coupled');
    }
  });

  it('no provenance-owned field is reachable through the editable set (the two are disjoint)', () => {
    const editableNode = aiEditableFieldRoots('node');
    const editableEdge = aiEditableFieldRoots('edge');
    for (const f of REAL_PROVENANCE_OWNED) {
      const root = f.wire_field.split('.')[0]!;
      const editable = f.entity === 'node' ? editableNode : editableEdge;
      // A provenance-owned LEAF under an editable ROOT (observed_state.source) is
      // legal in the table and blocked by the sub-key rule; a provenance-owned
      // ROOT must never appear in the editable root set.
      if (!f.wire_field.includes('.')) {
        expect(editable.has(root), `${f.entity} root '${root}' is provenance-owned but appears in the editable roots`).toBe(false);
      }
    }
    expect(aiEditableObservedSubkeys().has('source')).toBe(false);
    expect(aiEditableObservedSubkeys().has('raw_value')).toBe(false);
    expect(aiEditableObservedSubkeys().has('cap')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. DERIVED EQUALITY against the CEE allowlist (the agreement half)
//
// The table is the FUTURE source of truth, so equality is the wrong assertion:
// it GROWS the allowlist by the named genuine grants. The honest pair is
//   (a) SUPERSET — nothing the AI holds today is silently revoked, and
//   (b) an ENUMERATED delta — the growth is exactly the grants that were argued
//       for, never open-ended.
// Together those are equality-with-a-stated-diff, which is what a contract
// change should have to survive.
// ---------------------------------------------------------------------------

describe('editable-fields table — derived agreement with the CEE referee allowlist', () => {
  it('every node root the AI holds TODAY survives — no silent revocation', () => {
    const derived = aiEditableFieldRoots('node');
    const revoked = REAL_CEE_ALLOWED_NODE_ROOTS.filter((r) => !derived.has(r));
    expect(revoked, `roots silently revoked from the AI: ${revoked.join(', ')}`).toEqual([]);
  });

  it('the node delta is EXACTLY the three named node grants', () => {
    const current = new Set<string>(REAL_CEE_ALLOWED_NODE_ROOTS);
    const added = [...aiEditableFieldRoots('node')].filter((r) => !current.has(r)).sort();
    expect(added).toEqual(['impact', 'probability', 'state_space']);
  });

  it('every edge root the AI holds TODAY survives — no silent revocation', () => {
    const derived = aiEditableFieldRoots('edge');
    const revoked = REAL_CEE_ALLOWED_EDGE_ROOTS.filter((r) => !derived.has(r));
    expect(revoked, `roots silently revoked from the AI: ${revoked.join(', ')}`).toEqual([]);
  });

  it('the edge delta is EXACTLY `label` — `confidence` is deferred, so it does NOT widen the allowlist', () => {
    const current = new Set<string>(REAL_CEE_ALLOWED_EDGE_ROOTS);
    const added = [...aiEditableFieldRoots('edge')].filter((r) => !current.has(r)).sort();
    expect(added).toEqual(['label']);
  });

  it('observed_state sub-keys: EVERY current sub-key survives and the delta is exactly `std`', () => {
    // ⚠ NO FILTER HERE, AND THAT IS THE POINT. An earlier version of this test
    // excluded `interventions` with the note "reachable as its own root row" —
    // which made the comparison agree by NARROWING IT rather than by adding the
    // missing row, and the derived accessor genuinely dropped the sub-key. The
    // live `data/interventions/<factor_id>` spelling was rejected as a result:
    // a capability revoked by a guard that read green. That is trap 12d firing
    // inside the change built to encode trap 12d. Compare the WHOLE set.
    const derived = aiEditableObservedSubkeys();
    const revoked = REAL_CEE_ALLOWED_OBSERVED_SUBKEYS.filter((k) => !derived.has(k));
    expect(revoked, `observed sub-keys silently revoked: ${revoked.join(', ')}`).toEqual([]);
    const current = new Set<string>(REAL_CEE_ALLOWED_OBSERVED_SUBKEYS);
    expect([...derived].filter((k) => !current.has(k)).sort()).toEqual(['std']);
  });

  it('`observed_state.interventions` has its OWN row — the bare root does not cover the subtree', () => {
    // Bound by identity (entity + exact wire_field), not by a value predicate:
    // the bare `interventions` root row would satisfy any looser check, and it
    // is precisely what made the gap look covered.
    const subtree = lookupEditableField('node', 'observed_state.interventions');
    expect(subtree, 'the sub-key row is missing — the live option-configure spelling is revoked').toBeDefined();
    expect(subtree!.field_class).toBe('grant');
    const bareRoot = lookupEditableField('node', 'interventions');
    expect(bareRoot, 'the bare root row is also required — the two spellings are both live').toBeDefined();
    expect(subtree).not.toBe(bareRoot);
  });

  it('the four node roots the AI holds with no human setter are recorded, not hidden', () => {
    const aiOnly = fieldsOfClass('ai_only').filter((r) => r.entity === 'node').map((r) => r.wire_field).sort();
    expect(aiOnly).toEqual(['data', 'encoding_map', 'goal_constraints', 'intercept']);
  });
});

// ---------------------------------------------------------------------------
// 4. PIN-SKEW (A6 rider) — a consumer on an older pin fails LOUD, not narrow
// ---------------------------------------------------------------------------

describe('editable-fields table — pin-skew guard', () => {
  it('the digest matches the table contents (any row edit REDs here)', () => {
    expect(computeEditableFieldTableDigest(EDITABLE_FIELD_TABLE)).toBe(EDITABLE_FIELD_TABLE_DIGEST);
  });

  it('requireEditableFieldTableRevision passes at or below the shipped revision', () => {
    expect(() => requireEditableFieldTableRevision(EDITABLE_FIELD_TABLE_REVISION)).not.toThrow();
    expect(() => requireEditableFieldTableRevision(1)).not.toThrow();
  });

  it('a consumer demanding a NEWER revision than the pin carries throws — the silent-narrow case made loud', () => {
    expect(() => requireEditableFieldTableRevision(EDITABLE_FIELD_TABLE_REVISION + 1)).toThrow(
      /editable-field table revision/i,
    );
  });

  it('the thrown message names both revisions so the fix is the re-vendor, not a guess', () => {
    let message = '';
    try {
      requireEditableFieldTableRevision(EDITABLE_FIELD_TABLE_REVISION + 7);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(String(EDITABLE_FIELD_TABLE_REVISION));
    expect(message).toContain(String(EDITABLE_FIELD_TABLE_REVISION + 7));
  });

  it('POSITIVE CONTROL (trap 13): the digest function can SEE a change before its clean result counts', () => {
    const mutated = EDITABLE_FIELD_TABLE.filter((r) => r.wire_field !== 'state_space');
    expect(computeEditableFieldTableDigest(mutated)).not.toBe(EDITABLE_FIELD_TABLE_DIGEST);
    const reclassed = EDITABLE_FIELD_TABLE.map((r) =>
      r.wire_field === 'observed_state.source' ? { ...r, field_class: 'grant' as const } : r,
    );
    expect(computeEditableFieldTableDigest(reclassed)).not.toBe(EDITABLE_FIELD_TABLE_DIGEST);
  });
});

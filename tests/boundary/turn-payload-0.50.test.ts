// ============================================================================
// 0.50.0 — the DIRECT-EDIT structural vocabulary: `structural_add`,
// `structural_add_edge`, `structural_rename`.
//
// WHY THIS FILE EXISTS. 0.48.0 gave the canvas its first REMOVAL verb and
// deliberately stopped there. Creating a factor, drawing an edge and renaming a
// node still had no wire shape, so each was lost on the next reload or routed
// through `direct_graph_edit`, whose `target_id` is a REPRESENTATIVE SINGULAR
// that the contract itself calls "a defect by construction" as a mutation key.
//
// The suite is written in OPPOSITE-DIRECTION TWINS: for every shape that must
// VALIDATE there is a malformed sibling that must REJECT, so neither direction
// can regress silently (a corpus that tests one direction is a guard watching
// one door).
//
// Block F is the one worth reading twice. `structural_rename` carries an
// `expected_label` whose entire justification is that `base_graph_hash` CANNOT
// see a label change. That justification is a claim about a DIFFERENT module, so
// block F PINS IT IN-TEST against the published projection rather than asserting
// it in prose: if `label` ever becomes analysis-affecting, this file REDs and
// tells the next reader that the field's rationale has changed — instead of
// leaving a now-pointless field on the wire that someone deletes for the wrong
// reason, or keeps for a reason that has quietly stopped being true.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SystemEventKind } from '../../src/boundary/enums.js';
import {
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
  refineStructuralRename,
} from '../../src/boundary/turn-payload.js';
import { CANONICAL_GRAPH_HASH_NESTED_PROJECTION } from '../../src/boundary/graph-hash-contract.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';
const HASH = 'sha256:9f2c1b0ae4d37c5a6e8b';

/** The three kinds this release adds, in one place so every block derives from it. */
const NEW_KINDS = ['structural_add', 'structural_add_edge', 'structural_rename'] as const;

/** A system_event turn wrapper — the shape CEE actually validates on ingress. */
function turn(event: unknown) {
  return {
    turn_id: TURN,
    scenario_id: SCEN,
    stage: 'analyse' as const,
    kind: 'system_event' as const,
    event,
  };
}

function wellFormedAdd() {
  return {
    kind: 'structural_add' as const,
    node_id: 'factor_supplier_capacity',
    node_kind: 'factor' as const,
    label: 'Supplier capacity',
    base_graph_hash: HASH,
  };
}

function wellFormedAddEdge() {
  return {
    kind: 'structural_add_edge' as const,
    from: 'factor_supplier_capacity',
    to: 'goal_revenue',
    magnitude: 0.62,
    effect_direction: 'positive' as const,
    base_graph_hash: HASH,
  };
}

function wellFormedRename() {
  return {
    kind: 'structural_rename' as const,
    node_id: 'factor_cost',
    label: 'Unit cost of goods',
    expected_label: 'Cost',
    base_graph_hash: HASH,
  };
}

/** Every new member's well-formed exemplar, keyed by kind, for derived sweeps. */
const WELL_FORMED: Record<(typeof NEW_KINDS)[number], () => Record<string, unknown>> = {
  structural_add: wellFormedAdd,
  structural_add_edge: wellFormedAddEdge,
  structural_rename: wellFormedRename,
};

type KindOption = z.ZodDiscriminatedUnionOption<'kind'>;

function unionOptions(): KindOption[] {
  return SystemEventSchema.options as KindOption[];
}

function unionKinds(): string[] {
  return unionOptions().map((o) => (o.shape.kind as z.ZodLiteral<string>).value);
}

// ---------------------------------------------------------------------------
// A · The members exist and are reachable through the real ingress schema
// ---------------------------------------------------------------------------
describe('0.50.0 direct-edit vocabulary — registration', () => {
  it.each(NEW_KINDS)('%s is a member of the SystemEventKind parity list', (kind) => {
    expect(SystemEventKind.safeParse(kind).success).toBe(true);
  });

  it.each(NEW_KINDS)('%s is a discriminated member of the SystemEventSchema union', (kind) => {
    expect(unionKinds()).toContain(kind);
  });

  it('exports refineStructuralRename for bare-SystemEventSchema consumers', () => {
    expect(typeof refineStructuralRename).toBe('function');
  });

  // ANTI-VACUITY FLOOR. Every block below sweeps NEW_KINDS; if that list were
  // ever emptied or mistyped, those sweeps would pass by iterating nothing.
  it('the sweep list is non-empty and matches the members actually added', () => {
    expect(NEW_KINDS).toHaveLength(3);
    expect(Object.keys(WELL_FORMED).sort()).toEqual([...NEW_KINDS].sort());
  });
});

// ---------------------------------------------------------------------------
// B · TWINS — well-formed validates / malformed rejects
// ---------------------------------------------------------------------------
describe('0.50.0 — accepts what it must (twin: positive)', () => {
  it.each(NEW_KINDS)('accepts a well-formed %s inside a system_event turn', (kind) => {
    const r = OrchestratorTurnPayloadSchema.safeParse(turn(WELL_FORMED[kind]()));
    expect(r.success).toBe(true);
  });

  it('accepts an add whose node_id uses every character NODE_ID_PATTERN allows', () => {
    const ev = { ...wellFormedAdd(), node_id: 'a0_:-' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(true);
  });

  it('accepts a zero-magnitude edge — a stated-but-negligible effect is not an error', () => {
    const ev = { ...wellFormedAddEdge(), magnitude: 0 };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(true);
  });

  it('accepts a self-edge — GraphV3 permits it, so transport must not refuse it', () => {
    const ev = { ...wellFormedAddEdge(), from: 'factor_a', to: 'factor_a' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(true);
  });
});

describe('0.50.0 — rejects what it must (twin: negative)', () => {
  it.each(NEW_KINDS)('%s REJECTS an unknown extra key (every member is strict)', (kind) => {
    const ev = { ...WELL_FORMED[kind](), smuggled: 'nope' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it('structural_add REJECTS a node_id that NodeV3Schema could not persist', () => {
    // Upper case is outside NODE_ID_PATTERN. A new id must be one CEE can write.
    const ev = { ...wellFormedAdd(), node_id: 'Factor_Supplier' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it('structural_add REJECTS a node_kind outside the graph vocabulary', () => {
    const ev = { ...wellFormedAdd(), node_kind: 'sticky_note' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it('structural_add REJECTS an empty label', () => {
    const ev = { ...wellFormedAdd(), label: '' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it('structural_add_edge REJECTS a delimiter-bearing composite endpoint', () => {
    const ev = { ...wellFormedAddEdge(), from: 'factor_a->goal_b' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it('structural_add_edge REJECTS a magnitude outside [0, 1]', () => {
    for (const magnitude of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const ev = { ...wellFormedAddEdge(), magnitude };
      expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
    }
  });

  it('structural_add_edge REJECTS effect_direction "unknown" — magnitude needs a sign', () => {
    const ev = { ...wellFormedAddEdge(), effect_direction: 'unknown' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it('structural_rename REJECTS a missing expected_label — the stale gate is non-optional', () => {
    const { expected_label: _omitted, ...withoutExpected } = wellFormedRename();
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(withoutExpected)).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C · The stale gate, swept across ALL FOUR structural members
//
// Derived rather than hand-listed: the sweep reads the union's own options, so a
// FIFTH structural member added later is covered the day it lands. A
// hand-written list of four would silently stop covering the fifth.
// ---------------------------------------------------------------------------
describe('0.50.0 — base_graph_hash is one shared, non-optional authority', () => {
  const STRUCTURAL: Record<string, () => Record<string, unknown>> = {
    ...WELL_FORMED,
    structural_delete: () => ({
      kind: 'structural_delete' as const,
      removed_node_ids: ['option_a'],
      removed_edges: [],
      base_graph_hash: HASH,
    }),
  };

  it('every union member whose name starts with structural_ is covered by this sweep', () => {
    const structuralKinds = unionKinds().filter((k) => k.startsWith('structural_')).sort();
    expect(structuralKinds).toEqual(Object.keys(STRUCTURAL).sort());
    expect(structuralKinds.length).toBeGreaterThanOrEqual(4);
  });

  it.each(Object.keys(STRUCTURAL))('%s REJECTS an absent base_graph_hash', (kind) => {
    const { base_graph_hash: _omitted, ...withoutHash } = STRUCTURAL[kind]();
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(withoutHash)).success).toBe(false);
  });

  it.each(Object.keys(STRUCTURAL))('%s REJECTS an empty base_graph_hash', (kind) => {
    const ev = { ...STRUCTURAL[kind](), base_graph_hash: '' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it.each(Object.keys(STRUCTURAL))('%s REJECTS a null base_graph_hash', (kind) => {
    const ev = { ...STRUCTURAL[kind](), base_graph_hash: null };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  // The width is CEE's implementation constant, NOT a contract constraint. This
  // pins the deliberate absence of a hex regex so a later "tightening" has to
  // argue with a test rather than slip past review: a 16-hex value and an
  // opaque prefixed value must BOTH be accepted.
  it.each(Object.keys(STRUCTURAL))('%s accepts an opaque hash of any width', (kind) => {
    for (const hash of ['9f2c1b0ae4d37c5a', 'sha256:9f2c1b0ae4d37c5a6e8b', 'x']) {
      const ev = { ...STRUCTURAL[kind](), base_graph_hash: hash };
      expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// D · The no-op rule on structural_rename
// ---------------------------------------------------------------------------
describe('0.50.0 structural_rename — a rename that renames nothing is refused', () => {
  it('REJECTS label === expected_label through the root ingress schema', () => {
    const ev = { ...wellFormedRename(), label: 'Cost', expected_label: 'Cost' };
    const r = OrchestratorTurnPayloadSchema.safeParse(turn(ev));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.path.join('.') === 'event.label')).toBe(true);
  });

  it('applies the same rule to a BARE SystemEventSchema consumer via the export', () => {
    const ev = { ...wellFormedRename(), label: 'Cost', expected_label: 'Cost' };
    const bare = SystemEventSchema.superRefine((e, ctx) => {
      if (e.kind === 'structural_rename') refineStructuralRename(e, ctx);
    });
    expect(bare.safeParse(ev).success).toBe(false);
    // …and the twin: a genuine rename passes the same bare consumer.
    expect(bare.safeParse(wellFormedRename()).success).toBe(true);
  });

  it('a rename differing only in case is a REAL rename, not a no-op', () => {
    const ev = { ...wellFormedRename(), label: 'COST', expected_label: 'Cost' };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E · ADDITIVITY — an existing consumer pinned at 0.48.0 is not broken
//
// Additivity here is a claim about BYTES A 0.48.0 CONSUMER ALREADY SENDS AND
// PARSES. It is proven in both directions: every pre-0.50.0 member still
// validates unchanged (nothing was narrowed), and the 0.48.0-shaped reader is
// reconstructed from the real union so it cannot drift from what 0.48.0 shipped.
// ---------------------------------------------------------------------------
describe('0.50.0 — additive at 0.48.0', () => {
  const PRE_0_50_KINDS = [
    'patch_accepted', 'patch_dismissed', 'direct_graph_edit', 'factor_value_edit',
    'chip_click', 'undo', 'redo', 'selection_change', 'feedback',
    'edge_adjudication', 'prior_range_edit', 'edge_strength_edit', 'structural_delete',
  ] as const;

  it('adds exactly three members and removes none', () => {
    const kinds = unionKinds();
    expect(kinds).toHaveLength(PRE_0_50_KINDS.length + NEW_KINDS.length);
    // Every 0.48.0 member is still present, by name.
    for (const kind of PRE_0_50_KINDS) expect(kinds).toContain(kind);
    // …and the new members are strictly ADDITIONAL, not replacements.
    expect(kinds.filter((k) => !PRE_0_50_KINDS.includes(k as never)).sort())
      .toEqual([...NEW_KINDS].sort());
  });

  it('the 0.48.0 members appear FIRST and in unchanged order', () => {
    // Order is not semantic for a discriminated union, but a reordering would
    // signal that a member was rebuilt rather than appended — worth failing on.
    expect(unionKinds().slice(0, PRE_0_50_KINDS.length)).toEqual([...PRE_0_50_KINDS]);
  });

  it('a 0.48.0-shaped payload still validates BYTE-FOR-BYTE against 0.50.0', () => {
    // structural_delete is the newest 0.48.0 member and the one whose
    // base_graph_hash validator was refactored onto a shared constant in this
    // release. If that refactor changed behaviour, this is where it shows.
    const delete48 = {
      kind: 'structural_delete' as const,
      removed_node_ids: ['option_b', 'factor_demand'],
      removed_edges: [{ from: 'factor_demand', to: 'option_b' }],
      base_graph_hash: HASH,
    };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(delete48)).success).toBe(true);

    const edge42 = {
      kind: 'edge_strength_edit' as const,
      from: 'factor_demand', to: 'goal_revenue',
      magnitude: 0.85, direction_intent: 'preserve' as const,
      expected: { mean: -0.55, effect_direction: 'negative' as const },
      intent: 'set' as const,
    };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(edge42)).success).toBe(true);
  });

  // The faithful simulation of a CEE pinned to 0.48.0: the SAME union with the
  // three new members removed. Derived from the real schema's own options rather
  // than a hand-written twin, so it cannot drift from what 0.48.0 shipped.
  it('a 0.48.0-shaped reader (union minus the three) REJECTS each new turn', () => {
    const priorOptions = unionOptions()
      .filter((o) => !(NEW_KINDS as readonly string[])
        .includes((o.shape.kind as z.ZodLiteral<string>).value));
    expect(priorOptions).toHaveLength(13);

    const priorUnion = z.discriminatedUnion(
      'kind',
      priorOptions as [KindOption, ...KindOption[]],
    );
    const priorRoot = z.object({
      turn_id: z.string(),
      scenario_id: z.string(),
      stage: z.string(),
      kind: z.literal('system_event'),
      event: priorUnion,
    }).strict();

    for (const kind of NEW_KINDS) {
      const payload = turn(WELL_FORMED[kind]());
      const r = priorRoot.safeParse(payload);
      expect(r.success).toBe(false);
      if (!r.success) {
        // No partial value survives: a rejected turn yields NO data at all,
        // which is why an older CEE 422s the whole turn rather than dropping a
        // field. THIS is what makes reader-first non-negotiable.
        expect((r as { data?: unknown }).data).toBeUndefined();
        expect(r.error.issues.map((i) => i.code))
          .toContain(z.ZodIssueCode.invalid_union_discriminator);
      }
      // …and the CURRENT reader accepts the very same bytes.
      expect(OrchestratorTurnPayloadSchema.safeParse(payload).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// F · WHY `expected_label` EXISTS — the precondition, pinned in-test
//
// `structural_add_edge` has no `expected` twin and `structural_rename` does. That
// asymmetry is not taste: it follows from WHICH FIELDS THE ANALYSIS-AFFECTING
// HASH COVERS. A guard whose justification lives in another module's comment is a
// guard that will be deleted the first time someone tidies up, so the
// justification is asserted here against the published projection itself.
// ---------------------------------------------------------------------------
describe('0.50.0 — expected_label is load-bearing because the hash cannot see labels', () => {
  it('`label` is NOT in the canonical node hash projection', () => {
    const nodeFields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields as readonly string[];
    expect(nodeFields).not.toContain('label');
  });

  // POSITIVE CONTROL for the assertion above. A projection that had silently
  // become empty, or a constant that had been renamed to `undefined`, would make
  // the `not.toContain` pass by testing nothing. This proves the list is real and
  // that this test can SEE a field it contains.
  it('POSITIVE CONTROL: the projection is non-trivial and DOES carry `kind`', () => {
    const nodeFields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields as readonly string[];
    expect(nodeFields.length).toBeGreaterThanOrEqual(5);
    expect(nodeFields).toContain('kind');
  });

  it('CONTRAST: every field structural_add_edge sends IS in the edge projection', () => {
    // This is the other half of the asymmetry — an edge add needs no `expected`
    // twin precisely because base_graph_hash already covers every field it
    // touches. If an edge field ever leaves the projection, this REDs and the
    // edge member needs the same treatment the rename member got.
    const edge = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.edge;
    const edgeFields = edge.fields as readonly string[];
    expect(edgeFields).toContain('from');
    expect(edgeFields).toContain('to');
    expect(edgeFields).toContain('effect_direction');
    expect(edge.strength_fields as readonly string[]).toContain('mean');
  });
});

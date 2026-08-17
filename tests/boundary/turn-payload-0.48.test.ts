// ============================================================================
// 0.48.0 — `structural_delete`: a durable, atomic removal event.
//
// WHY THIS FILE EXISTS. A user deletes an option on the canvas and it comes back
// on the next rerun, because no UI→CEE vocabulary has ever had a delete: all
// three closed vocabularies (`SystemEventKind`, `ActionType`, `Intent`) carry
// add and edit verbs only. This member is the transport that makes a removal
// durable.
//
// The suite is written in OPPOSITE-DIRECTION TWINS: for every shape that must
// VALIDATE there is a malformed sibling that must REJECT, so neither direction
// can regress silently (a corpus that tests one direction is a guard watching
// one door).
//
// The last describe block is the DEPLOY-ORDER GUARANTEE, and it is the reason
// the three-repo order (schemas → CEE → UI) is not negotiable.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SystemEventKind } from '../../src/boundary/enums.js';
import {
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
  refineStructuralDelete,
} from '../../src/boundary/turn-payload.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';
const HASH = 'sha256:9f2c1b0ae4d37c5a6e8b';

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

/** A well-formed delete: two nodes and one canonical edge, with the base hash. */
function wellFormed() {
  return {
    kind: 'structural_delete' as const,
    removed_node_ids: ['option_a', 'factor_cost'],
    removed_edges: [{ from: 'factor_cost', to: 'option_a' }],
    base_graph_hash: HASH,
  };
}

function unionKinds(): string[] {
  return (SystemEventSchema.options as z.ZodDiscriminatedUnionOption<'kind'>[])
    .map((o) => (o.shape.kind as z.ZodLiteral<string>).value);
}

// ---------------------------------------------------------------------------
// A · The member exists and is reachable through the real ingress schema
// ---------------------------------------------------------------------------
describe('0.48.0 structural_delete — registration', () => {
  it('is a member of the SystemEventKind parity list', () => {
    expect(SystemEventKind.safeParse('structural_delete').success).toBe(true);
  });

  it('is a discriminated member of the SystemEventSchema union', () => {
    expect(unionKinds()).toContain('structural_delete');
  });

  it('exports refineStructuralDelete for bare-SystemEventSchema consumers', () => {
    expect(typeof refineStructuralDelete).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// B · TWINS — well-formed validates / malformed rejects
// ---------------------------------------------------------------------------
describe('0.48.0 structural_delete — accepts what it must (twin: positive)', () => {
  it('accepts a well-formed delete inside a system_event turn (root schema)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(turn(wellFormed()));
    expect(r.success).toBe(true);
  });

  it('accepts a NODES-ONLY delete (removed_edges empty is legitimate)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_edges: [] }),
    );
    expect(r.success).toBe(true);
  });

  it('accepts an EDGES-ONLY delete (removed_node_ids empty is legitimate)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: [] }),
    );
    expect(r.success).toBe(true);
  });

  it('accepts a large batch — a select-all delete is not capped', () => {
    const many = Array.from({ length: 200 }, (_, i) => `node_${i}`);
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: many }),
    );
    expect(r.success).toBe(true);
  });
});

describe('0.48.0 structural_delete — rejects what it must (twin: negative)', () => {
  it('REJECTS an unknown extra key (the member is .strict())', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), cascade: true }),
    );
    expect(r.success).toBe(false);
  });

  it('REJECTS a missing base_graph_hash — the stale gate is non-optional', () => {
    const { base_graph_hash: _omitted, ...withoutHash } = wellFormed();
    const r = OrchestratorTurnPayloadSchema.safeParse(turn(withoutHash));
    expect(r.success).toBe(false);
  });

  it('REJECTS an empty base_graph_hash', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), base_graph_hash: '' }),
    );
    expect(r.success).toBe(false);
  });

  it('REJECTS a non-string node id (wrong id type)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: [42] }),
    );
    expect(r.success).toBe(false);
  });

  it('REJECTS an empty-string node id', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: [''] }),
    );
    expect(r.success).toBe(false);
  });

  // The derived anti-defect: EdgeV3Schema declares NO `id`, so an edge named by
  // a bare string could only be a client-local id (`reactflow__edge-…`), which
  // this contract twice rules is never a lookup key. The wire refuses it.
  it('REJECTS an edge named by a bare string id — edges have no id, only (from,to)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_edges: ['reactflow__edge-factor_cost-option_a'] }),
    );
    expect(r.success).toBe(false);
  });

  it('REJECTS a delimiter-bearing composite endpoint id ("A→B")', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({
        ...wellFormed(),
        removed_edges: [{ from: 'factor_cost→option_a', to: 'option_a' }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it('REJECTS a whitespace-padded node id — identity bytes are exact', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: [' option_a'] }),
    );
    expect(r.success).toBe(false);
  });

  it('REJECTS an extra key inside a removed_edges entry (the ref is .strict())', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({
        ...wellFormed(),
        removed_edges: [{ from: 'factor_cost', to: 'option_a', edge_id: 'x' }],
      }),
    );
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C · The no-op rule — an empty delete must not reach the wire
// ---------------------------------------------------------------------------
describe('0.48.0 structural_delete — a delete that removes nothing is refused', () => {
  it('REJECTS both arrays empty simultaneously, with a reason naming the no-op', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: [], removed_edges: [] }),
    );
    expect(r.success).toBe(false);
    if (r.success) throw new Error('unreachable');
    const messages = r.error.issues.map((i) => i.message).join(' | ');
    expect(messages).toMatch(/remove(s)? nothing|no-op|at least one/i);
  });

  it('binds the no-op issue to the event, not to some other field', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: [], removed_edges: [] }),
    );
    if (r.success) throw new Error('unreachable');
    const paths = r.error.issues.map((i) => i.path.join('.'));
    expect(paths.some((p) => p.startsWith('event'))).toBe(true);
  });

  // PIN THE PRECONDITION (13b): the SAME payload minus the emptiness must pass,
  // so the rejection above is provably the emptiness rule and not a stray
  // malformity elsewhere in the fixture.
  it('the same payload with one node id present is ACCEPTED (precondition pinned)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), removed_node_ids: ['option_a'], removed_edges: [] }),
    );
    expect(r.success).toBe(true);
  });

  it('refineStructuralDelete applies the same rule for a bare-union consumer', () => {
    const empty = { ...wellFormed(), removed_node_ids: [], removed_edges: [] };
    const issues: z.ZodIssue[] = [];
    const ctx = {
      addIssue: (i: z.ZodIssue) => issues.push(i),
    } as unknown as z.RefinementCtx;
    refineStructuralDelete(empty as never, ctx, ['event']);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.path).toEqual(['event', 'removed_node_ids']);
  });
});

// ---------------------------------------------------------------------------
// D · ADDITIVITY — nothing else moved
// ---------------------------------------------------------------------------
describe('0.48.0 is purely additive to the system-event union', () => {
  const PRE_0_48_KINDS = [
    'patch_accepted',
    'patch_dismissed',
    'direct_graph_edit',
    'factor_value_edit',
    'chip_click',
    'undo',
    'redo',
    'selection_change',
    'feedback',
    'edge_adjudication',
    'prior_range_edit',
    'edge_strength_edit',
  ] as const;

  it('every pre-0.48.0 kind is still a member', () => {
    const kinds = unionKinds();
    for (const k of PRE_0_48_KINDS) expect(kinds).toContain(k);
  });

  it('the union gained exactly one member', () => {
    expect(unionKinds()).toHaveLength(PRE_0_48_KINDS.length + 1);
  });

  it('an unrelated member still parses byte-identically (edge_strength_edit)', () => {
    const r = SystemEventSchema.safeParse({
      kind: 'edge_strength_edit',
      from: 'factor_cost',
      to: 'option_a',
      magnitude: 0.85,
      direction_intent: 'preserve',
      expected: { mean: -0.55, effect_direction: 'negative' },
      intent: 'set',
    });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E · ⭐ THE DEPLOY-ORDER GUARANTEE — 422 is WHOLE-TURN, not field-scoped
//
// This is the test that makes the schemas → CEE → UI order non-negotiable.
// Every member of SystemEventSchema is `.strict()` and the union is a
// `discriminatedUnion` on `kind`, so a reader whose pin predates a member does
// not "ignore an unknown field" — it fails the discriminator and rejects the
// ENTIRE TURN. Hence: UI-alone would 422 every turn containing a delete, while
// CEE-alone is invisible and safe (a reader exists; nothing emits).
// ---------------------------------------------------------------------------
describe('0.48.0 deploy-order guarantee — an unknown member rejects the WHOLE payload', () => {
  it('an unknown event kind fails the ROOT parse, not just the event field', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ kind: 'a_member_from_the_future', whatever: 1 }),
    );
    expect(r.success).toBe(false);
  });

  it('the whole turn is rejected even though every sibling field is valid', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse(
      turn({ kind: 'a_member_from_the_future' }),
    );
    expect(r.success).toBe(false);
    if (r.success) throw new Error('unreachable');
    // No partial value survives: a rejected turn yields NO data at all, which is
    // precisely why an older CEE 422s the turn rather than dropping one field.
    expect((r as { data?: unknown }).data).toBeUndefined();
    const codes = r.error.issues.map((i) => i.code);
    expect(codes).toContain(z.ZodIssueCode.invalid_union_discriminator);
  });

  // The faithful simulation of a CEE pinned to 0.47.0: the SAME union with this
  // member removed. Derived from the real schema's own options rather than a
  // hand-written twin, so it cannot drift from what 0.47.0 actually shipped
  // (proven additive by block D).
  it('a 0.47.0-shaped reader (union minus structural_delete) REJECTS the whole delete turn', () => {
    type KindOption = z.ZodDiscriminatedUnionOption<'kind'>;
    const priorOptions = (SystemEventSchema.options as KindOption[])
      .filter((o) => (o.shape.kind as z.ZodLiteral<string>).value !== 'structural_delete');
    expect(priorOptions).toHaveLength(12);

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

    const r = priorRoot.safeParse(turn(wellFormed()));
    expect(r.success).toBe(false);

    // …and the CURRENT reader accepts the very same bytes. The pair is the
    // deploy order: reader first, emitter second.
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(wellFormed())).success).toBe(true);
  });
});

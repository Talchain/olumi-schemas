// ============================================================================
// 0.29.0 (ROADMAP 1.346) — `factor_value_edit`, the VALUE-CARRYING inspector edit.
//
// The defect this closes: an inspector value edit reached CEE as, at best, a
// value-LESS `direct_graph_edit` notification, so the server never learned WHAT
// the user set the factor to. Live probe 2026-07-28 measured the consequence —
// CEE's `graph_hash` did not move across two inspector edits on two factors,
// while a chat edit on the same factor moved it.
//
// Each accept proves the member parses on a real-shaped payload; each reject
// DISCRIMINATES — it is RED unless the schema actually carries the constraint.
// Reverting the corresponding source edit turns the paired reject RED.
// ============================================================================
import { describe, it, expect } from 'vitest';

import { SystemEventKind } from '../../src/boundary/enums.js';
import {
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
} from '../../src/boundary/turn-payload.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';

const minimal = {
  kind: 'factor_value_edit',
  target_id: 'fac_monthly_eng_cost',
  value: 0.3,
} as const;

describe('factor_value_edit — the value-carrying inspector edit', () => {
  it('is a member of the SystemEventKind parity list', () => {
    expect(SystemEventKind.safeParse('factor_value_edit').success).toBe(true);
  });

  it('accepts the minimal shape: target_id + value', () => {
    expect(SystemEventSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts the maximal shape, wrapped in a system_event turn', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      turn_id: TURN,
      scenario_id: SCEN,
      stage: 'review',
      kind: 'system_event',
      event: {
        ...minimal,
        raw_value: 30000,
        unit: '£',
        field: 'value',
      },
    });
    expect(r.success).toBe(true);
  });

  // ---- rejects that discriminate -------------------------------------------

  it('REJECTS a value-less edit — that is a direct_graph_edit notification, not this', () => {
    const { value: _dropped, ...noValue } = minimal;
    expect(SystemEventSchema.safeParse(noValue).success).toBe(false);
  });

  it('REJECTS a non-finite value (NaN / Infinity must never enter the graph)', () => {
    expect(SystemEventSchema.safeParse({ ...minimal, value: Number.NaN }).success).toBe(false);
    expect(
      SystemEventSchema.safeParse({ ...minimal, value: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
  });

  it('REJECTS an empty target_id — the mutation is id-addressed, never label-matched', () => {
    expect(SystemEventSchema.safeParse({ ...minimal, target_id: '' }).success).toBe(false);
  });

  it('REJECTS an empty unit string', () => {
    expect(SystemEventSchema.safeParse({ ...minimal, unit: '' }).success).toBe(false);
  });

  // THE CAP GUARD. `cap` is deliberately NOT a field: a cap is the factor's
  // SCALE, and changing it rescales every option intervention on that factor.
  // Accepting a client-supplied cap here would let an inspector edit extend the
  // scale with no consent step. This reject is the enforcement — if someone adds
  // `cap` to the member, this test goes RED and the reviewer has to justify it.
  it('REJECTS a client-supplied cap — extending a scale needs the consented flow', () => {
    expect(SystemEventSchema.safeParse({ ...minimal, cap: 999999 }).success).toBe(false);
  });

  it('REJECTS an operator — an inspector edit is always an absolute set', () => {
    expect(SystemEventSchema.safeParse({ ...minimal, operator: 'increase' }).success).toBe(false);
  });

  // THE SKEW GUARD. `field` is a LITERAL, not a string, so the WIRE refuses an
  // unknown field rather than leaving each consumer to decide. With a permissive
  // string, `field: 'baseline'` would parse at every pin >= 0.29.0 and the
  // verdict (refuse / coerce / apply as a value edit) would depend on which
  // version each reader happened to be on — hazard 1, in one field. Widening to
  // a union later is then a loud versioned release, not a silent divergence.
  it('REJECTS an unknown field — the WIRE refuses it, not just one reader', () => {
    expect(SystemEventSchema.safeParse({ ...minimal, field: 'baseline' }).success).toBe(false);
    expect(SystemEventSchema.safeParse({ ...minimal, field: 'raw_value' }).success).toBe(false);
    expect(SystemEventSchema.safeParse({ ...minimal, field: '' }).success).toBe(false);
  });

  it('accepts field:"value" and accepts its absence — the two are equivalent', () => {
    expect(SystemEventSchema.safeParse({ ...minimal, field: 'value' }).success).toBe(true);
    expect(SystemEventSchema.safeParse(minimal).success).toBe(true);
  });

  // ---- the notification member stays unpolluted -----------------------------
  //
  // The design claim that justified a NEW member rather than a value on
  // `direct_graph_edit`: that event's `target_id` is a batch REPRESENTATIVE
  // ("the first changed node id, ascending"), so keying a mutation on it would
  // mutate whichever node sorted first. This pins that it did not silently
  // acquire a value channel.
  it('direct_graph_edit still REFUSES a value — its notification semantics are unchanged', () => {
    const r = SystemEventSchema.safeParse({
      kind: 'direct_graph_edit',
      target_id: 'fac_monthly_eng_cost',
      operation: 'set_factor_value',
      value: 0.3,
    });
    expect(r.success).toBe(false);
  });

  // ---- the sequencing constraint, as a property ----------------------------
  //
  // Every member is `.strict()` and the union discriminates on `kind`, so a
  // consumer pinned BELOW 0.29.0 rejects the WHOLE TURN rather than dropping the
  // unknown member — which is exactly why the UI writer must not ship before
  // CEE's pin includes this. Pinned as the general property (unknown kind =>
  // whole-payload reject) because an old schema object cannot be instantiated
  // from inside this package.
  it('an unknown event kind rejects the whole turn (why reader-first is mandatory)', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      turn_id: TURN,
      scenario_id: SCEN,
      stage: 'review',
      kind: 'system_event',
      event: { kind: 'not_a_real_kind_yet', target_id: 'f1', value: 0.3 },
    });
    expect(r.success).toBe(false);
  });
});

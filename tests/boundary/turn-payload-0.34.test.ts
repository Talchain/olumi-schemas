// ============================================================================
// 0.34.0 (P4 transport — make human judgement reach the server).
//
// Two leaks this closes at the CONTRACT layer (lane evidence:
// PHASE0-EVIDENCE-2026-07-28/lane-p4-transport-2026-08-05.md):
//
//   · `edge_adjudication` — the human settles a CEE multi-pass disagreement on
//     an edge (ContestedEdgeCard → handleResolveContested) and, before this
//     member, the verdict terminated in the client store: NO wire shape
//     existed for it at all.
//   · `prior_range_edit` — the inspector's prior-range edit
//     (useInspectorMutations.setPriorRange) likewise terminated locally.
//
// Each accept proves the member parses on a real-shaped payload; each reject
// DISCRIMINATES — it is RED unless the schema actually carries the constraint.
// Reverting the corresponding source edit turns the paired reject RED.
//
// ⚠ READER-FIRST SEQUENCING (same rule as factor_value_edit, 0.29.0): every
// member of SystemEventSchema is `.strict()` inside a discriminatedUnion — a
// consumer on an older pin REJECTS THE WHOLE TURN on an unknown kind. The UI
// must not emit either member until CEE's pin includes 0.34.0.
// ============================================================================
import { describe, it, expect } from 'vitest';

import { SystemEventKind, EdgeAdjudicationVerdict } from '../../src/boundary/enums.js';
import {
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
} from '../../src/boundary/turn-payload.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';

// Wrap an event in a root system_event payload. The CROSS-FIELD rules
// (verdict/value coupling, min<=max) live at the union-root superRefine —
// members must stay plain ZodObjects because `SystemEventSchema.options` is
// load-bearing (parity tests here + CEE's kind-exhaustiveness test) — and CEE
// validates ingress with the ROOT schema, so the root is the wire.
const wrap = (event: unknown, stage: 'review' | 'frame' = 'review') => ({
  turn_id: TURN,
  scenario_id: SCEN,
  stage,
  kind: 'system_event',
  event,
});

// ── edge_adjudication ────────────────────────────────────────────────────────

const adjudication = {
  kind: 'edge_adjudication',
  from: 'fac_price_rise',
  to: 'out_churn',
  verdict: 'accepted_pass2',
} as const;

describe('edge_adjudication — the contested-edge verdict, on the wire', () => {
  it('is a member of the SystemEventKind parity list', () => {
    expect(SystemEventKind.safeParse('edge_adjudication').success).toBe(true);
  });

  it('exposes the verdict vocabulary as its own enum (UserAction minus pending)', () => {
    for (const v of ['accepted_pass1', 'accepted_pass2', 'overridden', 'dismissed']) {
      expect(EdgeAdjudicationVerdict.safeParse(v).success).toBe(true);
    }
    // `pending` is the UNRESOLVED state, not a verdict — an event carrying it
    // would record "the user adjudicated: nothing", which is not an adjudication.
    expect(EdgeAdjudicationVerdict.safeParse('pending').success).toBe(false);
  });

  it('accepts the minimal shape: from + to + verdict', () => {
    expect(SystemEventSchema.safeParse(adjudication).success).toBe(true);
  });

  it('accepts the maximal overridden shape, wrapped in a system_event turn', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      turn_id: TURN,
      scenario_id: SCEN,
      stage: 'review',
      kind: 'system_event',
      event: {
        kind: 'edge_adjudication',
        from: 'fac_price_rise',
        to: 'out_churn',
        edge_id: 'reactflow__edge-fac_price_rise-out_churn',
        verdict: 'overridden',
        resolved_strength_mean: -0.45,
      },
    });
    expect(r.success).toBe(true);
  });

  it('REJECTS an overridden verdict with NO resolved value — an override asserts a number', () => {
    expect(
      OrchestratorTurnPayloadSchema.safeParse(wrap({ ...adjudication, verdict: 'overridden' }))
        .success,
    ).toBe(false);
  });

  it('REJECTS a dismissed verdict WITH a resolved value — a dismissal asserts none', () => {
    expect(
      OrchestratorTurnPayloadSchema.safeParse(
        wrap({ ...adjudication, verdict: 'dismissed', resolved_strength_mean: 0.3 }),
      ).success,
    ).toBe(false);
  });

  it('the wrapped minimal shape passes the root cross-field rules (positive control)', () => {
    expect(OrchestratorTurnPayloadSchema.safeParse(wrap(adjudication)).success).toBe(true);
  });

  it('REJECTS a non-finite resolved value', () => {
    expect(
      SystemEventSchema.safeParse({
        ...adjudication,
        verdict: 'overridden',
        resolved_strength_mean: Number.NaN,
      }).success,
    ).toBe(false);
  });

  it('REJECTS an unknown verdict — including the unresolved state `pending`', () => {
    expect(SystemEventSchema.safeParse({ ...adjudication, verdict: 'pending' }).success).toBe(false);
    expect(SystemEventSchema.safeParse({ ...adjudication, verdict: 'accepted' }).success).toBe(false);
  });

  it('REJECTS empty node ids — the adjudication binds to its edge by IDENTITY', () => {
    expect(SystemEventSchema.safeParse({ ...adjudication, from: '' }).success).toBe(false);
    expect(SystemEventSchema.safeParse({ ...adjudication, to: '' }).success).toBe(false);
  });

  it('REJECTS a client-supplied provenance field — the event kind IS the provenance claim', () => {
    // The server stamps `user_set` when persisting; a wire field the client
    // could mis-set would add nothing the server may trust.
    expect(
      SystemEventSchema.safeParse({ ...adjudication, provenance: 'user_set' }).success,
    ).toBe(false);
  });
});

// ── prior_range_edit ─────────────────────────────────────────────────────────

const priorEdit = {
  kind: 'prior_range_edit',
  target_id: 'fac_adoption_rate',
  range_min: 0.2,
  range_max: 0.6,
} as const;

describe('prior_range_edit — the user-set prior range, on the wire', () => {
  it('is a member of the SystemEventKind parity list', () => {
    expect(SystemEventKind.safeParse('prior_range_edit').success).toBe(true);
  });

  it('accepts the minimal shape: target_id + range_min + range_max', () => {
    expect(SystemEventSchema.safeParse(priorEdit).success).toBe(true);
  });

  it('accepts a stated distribution, wrapped in a system_event turn', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      turn_id: TURN,
      scenario_id: SCEN,
      stage: 'frame',
      kind: 'system_event',
      event: { ...priorEdit, distribution: 'beta' },
    });
    expect(r.success).toBe(true);
  });

  it('REJECTS an inverted range — min must not exceed max', () => {
    expect(
      OrchestratorTurnPayloadSchema.safeParse(
        wrap({ ...priorEdit, range_min: 0.9, range_max: 0.1 }, 'frame'),
      ).success,
    ).toBe(false);
  });

  it('accepts a POINT range (min === max) — a collapsed range is a legitimate statement', () => {
    expect(
      OrchestratorTurnPayloadSchema.safeParse(
        wrap({ ...priorEdit, range_min: 0.4, range_max: 0.4 }, 'frame'),
      ).success,
    ).toBe(true);
  });

  it('REJECTS non-finite bounds', () => {
    expect(
      SystemEventSchema.safeParse({ ...priorEdit, range_min: Number.NEGATIVE_INFINITY }).success,
    ).toBe(false);
    expect(
      SystemEventSchema.safeParse({ ...priorEdit, range_max: Number.NaN }).success,
    ).toBe(false);
  });

  it('REJECTS an empty target_id — id-addressed, never label-matched', () => {
    expect(SystemEventSchema.safeParse({ ...priorEdit, target_id: '' }).success).toBe(false);
  });

  it('REJECTS an empty distribution string', () => {
    expect(SystemEventSchema.safeParse({ ...priorEdit, distribution: '' }).success).toBe(false);
  });

  it('REJECTS a missing bound — half a range is not a range', () => {
    const { range_max: _dropped, ...noMax } = priorEdit;
    expect(SystemEventSchema.safeParse(noMax).success).toBe(false);
  });
});

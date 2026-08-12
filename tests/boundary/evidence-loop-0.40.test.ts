// ============================================================================
// 0.40.0 (PR4 evidence loop — apply an ATTRIBUTED panel value to the model).
//
// Design of record: olumi-docs/PHASE0-EVIDENCE-2026-07-28/
// pr4-two-person-witness-2026-08-12/EVIDENCE-LOOP-DERIVATION.md (Q5/Q6).
// The slice's honesty invariant this file pins at the CONTRACT layer:
// "an applied value names its author" — by PARTICIPANT ID, never a display
// name (the R-2 redaction constraint: a display name persisted into the
// graph would sit beyond the redaction routine's reach).
//
// Three additions, all additive, nothing required, nothing renamed:
//   · `observed_state.elicited_from` — {round_id, participant_id}, optional.
//   · `factor_value_edit.applied_from` — same ref, optional, on the
//     value-carrying turn-payload member.
//   · `panel_elicited` joins the (newly DECLARED-in-contract) known
//     `observed_state.source` vocabulary — see
//     evidence-loop-0.40-vocabulary.test.ts.
//
// BEHAVIOURAL FILE: imports only exports that exist at 0.39.0, so at the
// pristine tip it runs and FAILS on behaviour (RED-first witnesses):
//   · applied_from on a factor_value_edit is REJECTED at pristine (.strict())
//     — the "accepts" cases below are the red signatures;
//   · an INVALID elicited_from is ACCEPTED at pristine (.passthrough() means
//     unknown keys ride unvalidated) — the "rejects" cases below are red.
// ============================================================================
import { describe, it, expect } from 'vitest';

import { ObservedStateSchema } from '../../src/graph.js';
import {
  OrchestratorTurnPayloadSchema,
  SystemEventSchema,
} from '../../src/boundary/turn-payload.js';

const UUID_TURN = '11111111-1111-4111-8111-111111111111';
const UUID_SCENARIO = '22222222-2222-4222-8222-222222222222';
const UUID_ROUND = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UUID_PARTICIPANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const REF = { round_id: UUID_ROUND, participant_id: UUID_PARTICIPANT };

function factorValueEditTurn(event: Record<string, unknown>) {
  return {
    turn_id: UUID_TURN,
    scenario_id: UUID_SCENARIO,
    stage: 'frame',
    kind: 'system_event',
    event: { kind: 'factor_value_edit', target_id: 'fixture_factor_1', value: 0.3, ...event },
  };
}

describe('0.40.0 — observed_state.elicited_from (graph seam)', () => {
  it('accepts a valid {round_id, participant_id} attribution and RETAINS it in the parse output', () => {
    const parsed = ObservedStateSchema.parse({ value: 0.42, elicited_from: REF });
    expect(parsed.elicited_from).toStrictEqual(REF);
  });

  it('accepts the reserved AuthoredBy literals — ONE authorship axis, no twin vocabulary (2.682)', () => {
    for (const participant_id of ['owner', 'assistant'] as const) {
      const res = ObservedStateSchema.safeParse({
        value: 0.42,
        elicited_from: { round_id: UUID_ROUND, participant_id },
      });
      expect(res.success).toBe(true);
    }
  });

  it('an observed_state WITHOUT elicited_from still parses — absence is legitimate (additive, nothing required)', () => {
    const res = ObservedStateSchema.safeParse({ value: 0.42 });
    expect(res.success).toBe(true);
    expect(res.success && 'elicited_from' in res.data).toBe(false);
  });

  it('REJECTS an elicited_from whose participant_id is neither a reserved literal nor a UUID (a display name is the named PII hazard)', () => {
    const res = ObservedStateSchema.safeParse({
      value: 0.42,
      elicited_from: { round_id: UUID_ROUND, participant_id: 'Alice Example' },
    });
    expect(res.success).toBe(false);
  });

  it('REJECTS an elicited_from with a non-UUID round_id', () => {
    const res = ObservedStateSchema.safeParse({
      value: 0.42,
      elicited_from: { round_id: 'round-7', participant_id: UUID_PARTICIPANT },
    });
    expect(res.success).toBe(false);
  });

  it('REJECTS an elicited_from smuggling a display_name key — ids only, labels resolve at render (R-2 redaction rule pinned in the type system)', () => {
    const res = ObservedStateSchema.safeParse({
      value: 0.42,
      elicited_from: { ...REF, display_name: 'Alice Example' },
    });
    expect(res.success).toBe(false);
  });

  it('REJECTS an elicited_from missing participant_id — an attribution that names nobody is not an attribution', () => {
    const res = ObservedStateSchema.safeParse({
      value: 0.42,
      elicited_from: { round_id: UUID_ROUND },
    });
    expect(res.success).toBe(false);
  });
});

describe('0.40.0 — factor_value_edit.applied_from (turn-payload seam)', () => {
  it('accepts a factor_value_edit carrying applied_from, at the ROOT payload (the wire CEE validates)', () => {
    const res = OrchestratorTurnPayloadSchema.safeParse(
      factorValueEditTurn({ applied_from: REF }),
    );
    expect(res.success).toBe(true);
  });

  it('retains applied_from in the parse output (no silent strip)', () => {
    const parsed = OrchestratorTurnPayloadSchema.parse(
      factorValueEditTurn({ applied_from: REF }),
    );
    if (parsed.kind !== 'system_event' || parsed.event.kind !== 'factor_value_edit') {
      throw new Error('discriminant mismatch — fixture is wrong');
    }
    expect(parsed.event.applied_from).toStrictEqual(REF);
  });

  it('accepts applied_from at the bare SystemEventSchema too (consumers that parse the event alone)', () => {
    const res = SystemEventSchema.safeParse({
      kind: 'factor_value_edit',
      target_id: 'fixture_factor_1',
      value: 0.3,
      applied_from: REF,
    });
    expect(res.success).toBe(true);
  });

  it('a factor_value_edit WITHOUT applied_from still parses byte-identically — the 0.29.0 shape is untouched', () => {
    const turn = factorValueEditTurn({ raw_value: 30_000, unit: '£', field: 'value' });
    const parsed = OrchestratorTurnPayloadSchema.parse(turn);
    expect(parsed).toStrictEqual(turn);
  });

  it('REJECTS an applied_from naming a participant by display name rather than id', () => {
    const res = OrchestratorTurnPayloadSchema.safeParse(
      factorValueEditTurn({
        applied_from: { round_id: UUID_ROUND, participant_id: 'Alice Example' },
      }),
    );
    expect(res.success).toBe(false);
  });

  it('REJECTS an applied_from carrying extra keys (e.g. a smuggled value claim) — the ref is identity-only, CEE re-derives everything else from its own store', () => {
    const res = OrchestratorTurnPayloadSchema.safeParse(
      factorValueEditTurn({ applied_from: { ...REF, value: 0.9 } }),
    );
    expect(res.success).toBe(false);
  });

  it('REJECTS a misspelt applied_From — .strict() still bites on the member itself', () => {
    const res = OrchestratorTurnPayloadSchema.safeParse(
      factorValueEditTurn({ applied_From: REF }),
    );
    expect(res.success).toBe(false);
  });
});

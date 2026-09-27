// ============================================================================
// 0.60.0 — ONE release, three additive optional members (DL #70 5855499810 / 5856196763):
//   · ConstraintVerdictSchema.per_limit  — one typed verdict per ratified limit (B5; MG shape 5855493847, AIQ meaning
//     5855511541). Replaces the unpublished `estimate_only_constraint_ids` (now `state: 'estimate_only'`).
//   · ConstraintVerdictSchema.joint      — the run-level joint verdict (AIQ B5 rule 2).
//   · edge_strength_edit.band            — the band the user chose on the canvas pill (A6, Canonical 5856186322).
// RED-first: before 0.60.0 each schema is `.strict()`, so a payload carrying any of these was REJECTED.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { ConstraintVerdictSchema, RunAnalysisResultSchema } from '../../src/orchestrator/handler-results.js';
import { OrchestratorTurnPayloadSchema } from '../../src/boundary/turn-payload.js';

const verdict = { may_name_leading_option: false, constraint_verdict_state: 'unevaluated' } as const;
const fact = (constraint_verdict: unknown) => ({
  scenario_id: '0dc3e4c3-2672-4fd8-a55d-2f44390030af',
  leading_option_id: null,
  summary: 'Ran analysis on your current scenario.',
  constraint_verdict,
});
const ok = (v: unknown) => ConstraintVerdictSchema.safeParse(v).success;

describe('0.60.0 ConstraintVerdictSchema.per_limit — one meaning per state', () => {
  // Paul's 0e19bb82 (AIQ exit row): churn estimate_only, spend unscored → joint withheld.
  const paul = {
    ...verdict,
    per_limit: [
      { constraint_id: 'agent-lane:monthly_churn:<=', state: 'estimate_only', reason: 'baseline_is_estimate' },
      { constraint_id: 'agent-lane:six_month_decision_spend:<=', state: 'unscored', reason: 'CONSTRAINT_NOT_CONVERTIBLE' },
    ],
    joint: { state: 'withheld', withheld_reason: 'limit_unscored', constraint_ids: ['agent-lane:six_month_decision_spend:<='] },
  };

  it('RED: a verdict carrying per_limit + joint parses, on its own and inside the persisted run fact', () => {
    expect(ConstraintVerdictSchema.parse(paul)).toEqual(paul);
    expect(RunAnalysisResultSchema.parse(fact(paul)).constraint_verdict).toEqual(paul);
  });

  it('absent stays absent — "not recorded" (every fact before 0.60.0), never defaulted', () => {
    const parsed = ConstraintVerdictSchema.parse(verdict);
    expect('per_limit' in parsed).toBe(false);
    expect('joint' in parsed).toBe(false);
  });

  it("'scored' carries NO reason; every other state names one (AIQ invariant)", () => {
    const row = (state: string, reason?: string) => ({ ...verdict, per_limit: [{ constraint_id: 'c', state, ...(reason === undefined ? {} : { reason }) }] });
    expect(ok(row('scored'))).toBe(true);
    expect(ok(row('scored', 'threshold_unframed'))).toBe(false);
    expect(ok(row('unscored'))).toBe(false);
    expect(ok(row('estimate_only'))).toBe(false);
    expect(ok(row('unscored', 'target_unanchored'))).toBe(true);
  });

  it('reason is a string CODE, so a new code parses on this pin (hazard 1); the state vocabulary is closed', () => {
    expect(ok({ ...verdict, per_limit: [{ constraint_id: 'c', state: 'unscored', reason: 'some_future_code' }] })).toBe(true);
    expect(ok({ ...verdict, per_limit: [{ constraint_id: 'c', state: 'met' }] })).toBe(false);
    expect(ok({ ...verdict, per_limit: [{ constraint_id: '', state: 'scored' }] })).toBe(false);
  });

  it('NO partial-precondition flag: frame_checked is refused (AIQ 5855511541 — a frame flag alone certified a false "met")', () => {
    expect(ok({ ...verdict, per_limit: [{ constraint_id: 'c', state: 'scored', frame_checked: true }] })).toBe(false);
  });

  it('the unpublished estimate_only_constraint_ids is gone (folded into state), and the verdict is still .strict()', () => {
    expect(ok({ ...verdict, estimate_only_constraint_ids: ['c'] })).toBe(false);
    expect(ok({ ...verdict, constraints: ['x'] })).toBe(false);
  });
});

describe('0.60.0 ConstraintVerdictSchema.joint — withheld names its reason; nothing else carries one', () => {
  it.each([
    [{ state: 'scored' }, true],
    [{ state: 'estimate_only' }, true],
    [{ state: 'withheld', withheld_reason: 'limit_unscored', constraint_ids: ['c'] }, true],
    [{ state: 'withheld' }, false],
    [{ state: 'scored', withheld_reason: 'limit_unscored' }, false],
    [{ state: 'scored', constraint_ids: ['c'] }, false],
    [{ state: 'met' }, false],
  ] as const)('%j → %s', (joint, expected) => {
    expect(ok({ ...verdict, joint })).toBe(expected);
  });
});

describe('0.60.0 edge_strength_edit.band — the band the user chose', () => {
  const wrap = (event: unknown) => ({
    turn_id: '11111111-1111-4111-8111-111111111111',
    scenario_id: '22222222-2222-4222-8222-222222222222',
    stage: 'analyse',
    kind: 'system_event',
    event,
  });
  const set = {
    kind: 'edge_strength_edit', from: 'fac_price', to: 'out_retention', magnitude: 0.55,
    direction_intent: 'preserve', expected: { mean: -0.4, effect_direction: 'negative' }, intent: 'set',
  } as const;

  it('RED: a pill choice carries its band, in the contract\'s ONE band vocabulary', () => {
    const withBand = { ...set, band: 'strong' };
    expect(OrchestratorTurnPayloadSchema.parse(wrap(withBand))).toStrictEqual(wrap(withBand));
  });
  it('absent = an exact figure (every event before 0.60.0) — still parses, stays absent', () => {
    const parsed = OrchestratorTurnPayloadSchema.parse(wrap(set)) as { event: Record<string, unknown> };
    expect('band' in parsed.event).toBe(false);
  });
  it('a band confirm is legal (AIQ N2: it sets std from the band, so the hash moves)', () => {
    const confirm = { ...set, magnitude: 0.4, intent: 'confirm_current', band: 'strong' };
    expect(OrchestratorTurnPayloadSchema.safeParse(wrap(confirm)).success).toBe(true);
  });
  it("a word outside the band vocabulary is refused — CEE's 'weak' spelling is the canvas's 'slight' on the wire", () => {
    expect(OrchestratorTurnPayloadSchema.safeParse(wrap({ ...set, band: 'weak' })).success).toBe(false);
    expect(OrchestratorTurnPayloadSchema.safeParse(wrap({ ...set, band: 'very strong' })).success).toBe(false);
    expect(OrchestratorTurnPayloadSchema.safeParse(wrap({ ...set, band: 'slight' })).success).toBe(true);
  });
});

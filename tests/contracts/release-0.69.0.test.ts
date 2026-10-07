// ============================================================================
// 0.69.0 — MG (F1 semantic model): goal period / horizon / stated figures, option status, count noun, full label.
//   Spec: programme-docs `output/mg-0ebb952a/SEMANTIC-MODEL-SPEC.md` (§1 GOAL, §3 OPTION, §5 LINK SIZE, §5b NAMING),
//   branch `mg/semantic-model-spec`. Train slot: DL #85 5930039919 (request 5930016876). F1 plan: DL 5929994142.
//   DL 5930070811: NO migrations — every field optional with a read-time default; old saved models still open.
//
// RED-first: before 0.69.0 NodeV3 passes every one of these keys through UNVALIDATED (passthrough), so a goal period
// of "fortnight", a horizon carrying both a date and a month count, an option status of "maybe", or a count noun
// holding a quantity ("100 conversations") all parse.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS,
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
} from '../../src/boundary/graph-hash-contract.js';
import { OrchestratorTurnPayloadSchema, SystemEventSchema } from '../../src/boundary/turn-payload.js';
import { OptionParticipationEntrySchema } from '../../src/orchestrator/handler-results.js';
import { RunInputOptionNotSentSchema } from '../../src/orchestrator/run-input-snapshot.js';
import { SystemEventKind } from '../../src/boundary/enums.js';
import {
  CountNounSchema,
  GoalHorizonSchema,
  GoalPeriod,
  GoalStatedAsSchema,
  GraphV3Schema,
  NodeV3Schema,
  OptionStatus,
} from '../../src/graph.js';

const goal = (extra: Record<string, unknown> = {}) => ({ id: 'goal_revenue', kind: 'goal', label: 'Quarterly revenue', ...extra });
const option = (extra: Record<string, unknown> = {}) => ({ id: 'opt_carry_on', kind: 'option', label: 'Carry on as now', ...extra });
const factor = (extra: Record<string, unknown> = {}) => ({ id: 'fac_deals', kind: 'factor', label: 'Deals closed', ...extra });
// Paul's sprint test (1 Oct): "£100k a quarter" given against a monthly goal — G1 keeps it verbatim, never drops it.
const STATED = { value: 100000, unit: 'GBP', period: 'quarter', quote: 'we do about £100k a quarter today' };

describe('0.69.0 · goal_period / goal_horizon / goal_stated_as (spec §1)', () => {
  it.each(GoalPeriod.options)('RED: goal_period %s parses and is carried verbatim', (period) => {
    expect((NodeV3Schema.parse(goal({ goal_period: period })) as { goal_period?: string }).goal_period).toBe(period);
  });

  it.each([{ deadline: '2027-03-31' }, { months: 6 }, { months: 1 }, { months: 120 }])('RED: horizon %j parses', (h) => {
    expect((NodeV3Schema.parse(goal({ goal_horizon: h })) as { goal_horizon?: unknown }).goal_horizon).toStrictEqual(h);
  });

  it('RED: every figure the user gave is kept with its own unit and period', () => {
    const parsed = NodeV3Schema.parse(goal({ goal_period: 'month', goal_stated_as: [STATED] })) as { goal_stated_as?: unknown };
    expect(parsed.goal_stated_as).toStrictEqual([STATED]);
  });

  it.each([
    ['a period outside the closed set', { goal_period: 'fortnight' }],
    ['a period in the wrong case', { goal_period: 'Month' }],
    ['a horizon with both arms', { goal_horizon: { deadline: '2027-03-31', months: 6 } }],
    ['a horizon with neither arm', { goal_horizon: {} }],
    ['a horizon date that is not a date', { goal_horizon: { deadline: 'March' } }],
    ['a horizon of 0 months', { goal_horizon: { months: 0 } }],
    ['a fractional horizon', { goal_horizon: { months: 1.5 } }],
    ['a horizon past 10 years', { goal_horizon: { months: 121 } }],
    ['a stated figure with no quote', { goal_stated_as: [{ ...STATED, quote: '' }] }],
    ['a stated figure with no period', { goal_stated_as: [{ value: 1, unit: 'GBP', quote: 'q' }] }],
    ['a stated figure that is not finite', { goal_stated_as: [{ ...STATED, value: Number.POSITIVE_INFINITY }] }],
    ['a stated figure carrying an author (a record of what was SAID, never a target)', { goal_stated_as: [{ ...STATED, author: 'user' }] }],
    ['more than 20 stated figures', { goal_stated_as: Array.from({ length: 21 }, () => STATED) }],
    ['an empty stated-figure list (absence is the only "none recorded")', { goal_stated_as: [] }],
  ])('REFUSED: %s', (_name, extra) => {
    expect(NodeV3Schema.safeParse(goal(extra)).success).toBe(false);
  });

  it('the horizon and stated-figure schemas refuse on their own (consumers that import them directly)', () => {
    expect(GoalHorizonSchema.safeParse({ months: 6, note: 'x' }).success).toBe(false);
    expect(GoalStatedAsSchema.safeParse({ ...STATED, period: 'fortnight' }).success).toBe(false);
  });
});

describe('0.69.0 · option_status (spec §3)', () => {
  it.each(OptionStatus.options)('RED: option_status %s parses — the baseline may be marked too (O2)', (status) => {
    const parsed = NodeV3Schema.parse(option({ is_baseline: true, option_status: status })) as { option_status?: string };
    expect(parsed.option_status).toBe(status);
  });

  it.each(['maybe', 'excluded', 'Removed', ''])('REFUSED: %j', (status) => {
    expect(NodeV3Schema.safeParse(option({ option_status: status })).success).toBe(false);
  });
});

describe('0.69.0 · count_noun (spec §5 S1/S2)', () => {
  it.each(['deals', 'conversations', 'sales calls', 'customers'])('RED: %j is a count noun', (noun) => {
    expect((NodeV3Schema.parse(factor({ count_noun: noun })) as { count_noun?: string }).count_noun).toBe(noun);
  });

  it.each([
    ['a quantity riding in the noun (#2443: "100 conversations" is per hundred, never a unit)', '100 conversations'],
    ['a digit anywhere', 'top10 deals'],
    ['leading space', ' deals'],
    ['trailing space', 'deals '],
    ['empty', ''],
    ['over 40 characters', 'd'.repeat(41)],
  ])('REFUSED: %s', (_name, noun) => {
    expect(CountNounSchema.safeParse(noun).success).toBe(false);
    expect(NodeV3Schema.safeParse(factor({ count_noun: noun })).success).toBe(false);
  });
});

describe('0.69.0 · full_label (spec §5b N1–N3)', () => {
  it('RED: the full drafted name rides beside the short label, verbatim', () => {
    const full = 'Number of qualified sales conversations booked per month';
    const parsed = NodeV3Schema.parse(factor({ label: 'Sales conversations', full_label: full })) as { full_label?: string };
    expect(parsed.full_label).toBe(full);
  });

  it.each(['', 'x'.repeat(501)])('REFUSED: length %#', (full) => {
    expect(NodeV3Schema.safeParse(factor({ full_label: full })).success).toBe(false);
  });
});

describe('0.69.0 · NO migration: every saved model from before 0.69.0 still opens (DL 5930070811)', () => {
  it('CONTROL: a node with none of the new keys parses unchanged, and no key is fabricated', () => {
    for (const n of [goal(), option(), factor()]) {
      const parsed = NodeV3Schema.parse(n) as Record<string, unknown>;
      for (const key of ['goal_period', 'goal_horizon', 'goal_stated_as', 'option_status', 'count_noun', 'full_label']) {
        expect(key in parsed).toBe(false);
      }
    }
  });

  it('CONTROL: a pre-0.69.0 graph (goal period inside the unit string, no status, label-only names) parses', () => {
    const graph = {
      nodes: [
        goal({ goal_threshold_raw: 55000, goal_threshold_unit: 'GBP per month', goal_direction: '>=' }),
        option({ is_baseline: true }),
        factor({ description: 'Deals the team closes each month' }),
      ],
      edges: [{ from: 'fac_deals', to: 'goal_revenue', strength: { mean: 0.4, std: 0.1 }, exists_probability: 0.9 }],
    };
    expect(GraphV3Schema.safeParse(graph).success).toBe(true);
  });
});

describe('0.69.0 changes NO analysis hash input', () => {
  it('the analysis projection holds none of the new keys, and 0.69.0 does not bump its version', () => {
    // 0.82.0 event_risk raises the version to 6; 0.69.0 itself added no hash inputs.
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBeGreaterThanOrEqual(5);
    const nested = CANONICAL_GRAPH_HASH_NESTED_PROJECTION as unknown as Record<string, Record<string, unknown>>;
    const all = Object.values(nested).flatMap((v) => Object.values(v).flatMap((f) => (Array.isArray(f) ? f : [])));
    expect(all).toContain('analysis_participation'); // positive control: the field an option's exclusion moves IS hashed
    for (const key of ['goal_period', 'goal_horizon', 'goal_stated_as', 'option_status', 'count_noun', 'full_label']) {
      expect(all).not.toContain(key);
    }
    expect(CANONICAL_GRAPH_HASH_GRAPHV3_FIELDS as readonly string[]).toEqual(['nodes', 'edges']);
  });
});

describe('0.69.0 · option_status_edit — the ONE op behind the UI control and the Agent (spec §3, §7; F1 T6)', () => {
  const EVENT = { kind: 'option_status_edit', option_node_id: 'opt_carry_on', expected_status: 'feasible', status: 'removed', base_graph_hash: 'h'.repeat(64) };

  it.each(OptionStatus.options)('RED: status %s parses, id-addressed, with the stale gate', (status) => {
    expect(SystemEventSchema.parse({ ...EVENT, status })).toStrictEqual({ ...EVENT, status });
  });
  it('REFUSED (CODEX 5930825929): no expected_status — infeasible ↔ removed moves no hash, so the assertion is required', () => {
    const { expected_status: _e, ...bare } = EVENT;
    expect(SystemEventSchema.safeParse(bare).success).toBe(false);
  });
  it('REFUSED at the payload root: a status equal to expected_status is a no-op; CONTROL a real change passes', () => {
    expect(OrchestratorTurnPayloadSchema.safeParse(turn({ ...EVENT, expected_status: 'removed', status: 'removed' })).success).toBe(false);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn({ ...EVENT, expected_status: 'infeasible', status: 'removed' })).success).toBe(true);
  });

  it('RED: the kind joins the system-event vocabulary (enum and union in step)', () => {
    expect(SystemEventKind.options).toContain('option_status_edit');
  });

  it.each([
    ['a client-sent participation (the server derives it)', { ...EVENT, analysis_participation: 'retained_excluded' }],
    ['a label instead of an id', { kind: 'option_status_edit', option_label: 'Carry on as now', status: 'removed', base_graph_hash: 'h'.repeat(64) }],
    ['no stale gate', { kind: 'option_status_edit', option_node_id: 'opt_carry_on', status: 'removed' }],
    ['a status outside the closed set', { ...EVENT, status: 'paused' }],
    ['no status (no default)', { kind: 'option_status_edit', option_node_id: 'opt_carry_on', base_graph_hash: 'h'.repeat(64) }],
  ])('REFUSED: %s', (_name, bad) => {
    expect(SystemEventSchema.safeParse(bad).success).toBe(false);
  });
});

describe('0.69.0 · a Run says which options the USER took out, and why (spec O1; F1 T6)', () => {
  it.each(['excluded_infeasible', 'excluded_removed'])('RED: participation state %s parses', (state) => {
    expect(OptionParticipationEntrySchema.safeParse({ option_id: 'opt_carry_on', state }).success).toBe(true);
  });
  it('REFUSED: a user exclusion never names unanalysable options (that is a provisional keep only)', () => {
    expect(OptionParticipationEntrySchema.safeParse({ option_id: 'o', state: 'excluded_removed', unanalysable_user_option_ids: ['x'] }).success).toBe(false);
  });
  it.each(['infeasible', 'removed'])('RED: a Run input records an option not sent because it is %s', (reason) => {
    expect(RunInputOptionNotSentSchema.safeParse({ option_id: 'opt_carry_on', label: 'Carry on as now', reason }).success).toBe(true);
  });
  it('REFUSED: a reason outside the closed set', () => {
    expect(RunInputOptionNotSentSchema.safeParse({ option_id: 'o', reason: 'hidden' }).success).toBe(false);
  });
});

describe('0.69.0 · set_goal = goal_target_edit with its period, horizon and stated figures (spec §1 G1; F1 T5)', () => {
  const EV = { kind: 'goal_target_edit', goal_node_id: 'goal_revenue', constraint_type: 'at_least', raw_value: 33333, unit: '£', base_graph_hash: 'h'.repeat(64) };
  it('RED: the target travels with its period, horizon and the figure as the user said it, each with its expected value', () => {
    const full = { ...EV, goal_period: 'month', goal_horizon: { deadline: '2027-03-31' }, stated_as: [STATED],
      expected_goal_period: null, expected_goal_horizon: null, expected_stated_as: null };
    expect(SystemEventSchema.parse(full)).toStrictEqual(full);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(full)).success).toBe(true);
  });
  it.each([
    ['goal_period without expected_goal_period', { goal_period: 'month' }],
    ['goal_horizon without expected_goal_horizon', { goal_horizon: { months: 6 } }],
    ['stated_as without expected_stated_as', { stated_as: [STATED] }],
    ['an expected value with no field sent', { expected_goal_period: 'month' }],
  ])('REFUSED at the payload root (CODEX 5930825929, hash-blind metadata): %s', (_name, extra) => {
    expect(OrchestratorTurnPayloadSchema.safeParse(turn({ ...EV, ...extra })).success).toBe(false);
  });
  it('CONTROL: a 0.68.0-shaped goal_target_edit (none of them) still parses unchanged', () => {
    expect(SystemEventSchema.parse(EV)).toStrictEqual(EV);
  });
  it.each([
    ['a period outside the closed set', { goal_period: 'fortnight' }],
    ['a two-arm horizon', { goal_horizon: { deadline: '2027-03-31', months: 6 } }],
    ['an empty stated list', { stated_as: [] }],
    ['a stated figure with no quote', { stated_as: [{ ...STATED, quote: '' }] }],
  ])('REFUSED: %s', (_name, extra) => {
    expect(SystemEventSchema.safeParse({ ...EV, ...extra }).success).toBe(false);
  });
});

function turn(event: unknown) {
  return { kind: 'system_event', turn_id: '0938f068-2b83-4a77-9b47-def252ac03f0', scenario_id: '0938f068-2b83-4a77-9b47-def252ac03f1', stage: 'frame', event };
}

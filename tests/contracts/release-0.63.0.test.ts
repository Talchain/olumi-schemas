// ============================================================================
// 0.63.0 — the stored, Run-bound GOAL CERTAINTY (DL #72 5882763151: Canonical owns the stored-Run schema after the 0.62
//   consumer; MG owns the producer, CEE #2270 `GoalCertaintyDecision`; Runtime/Canvas consume the same typed decision).
//   Proposal: Canonical #72 5883126969.
//
//   · RunAnalysisResultSchema.goal_certainty?: GoalCertaintyDecision[] — CEE-owned, written by run_analysis beside
//     graph_hash_at_run (as constraint_verdict.per_limit), so a decision is only ever read with the Run it was computed on.
//   · An EARNED certainty carries nothing else; an UNEARNED one names the unsized path and its sentence; a break-even is
//     product (fraction) or sum (margin), never both.
//
// RED-first: before 0.63.0 `RunAnalysisResultSchema` is `.strict()`, so a Run carrying `goal_certainty` is REFUSED whole
// (CEE could not store it) and the decision schema does not exist.
// ============================================================================
import { describe, expect, it } from 'vitest';

import * as orchestrator from '../../src/orchestrator/index.js';

const S = orchestrator as unknown as Record<string, { safeParse: (v: unknown) => { success: boolean }; parse: (v: unknown) => unknown } | undefined>;
const Decision = () => S.GoalCertaintyDecisionSchema!;
const RunResult = () => S.RunAnalysisResultSchema!;

const earned = { option_id: 'o-hold', probability_of_goal: 1, earned: true } as const;
const unearnedProduct = {
  option_id: 'o-raise', probability_of_goal: 1, earned: false,
  unsized_path: { from: 'price', enters_goal_through: 'subs' },
  break_even: { kind: 'product', projected_if_held: 90300, threshold: 85000, operand_id: 'subs', fraction: 0.0587, operand_count: 88 },
  say: 'Every option clears £85,000 in this model, but that rests on a link nobody has sized: if about 88 of your 1,500 subscribers left, it would not.',
} as const;
const unearnedSum = {
  option_id: 'o-cut', probability_of_goal: 0, earned: false,
  unsized_path: { from: 'spend', enters_goal_through: 'costs' },
  break_even: { kind: 'sum', projected_if_held: 120000, threshold: 100000, operand_id: 'costs', margin: 20000 },
  say: 'No option reaches the target in this model; a £20,000 change it has not sized would change that.',
} as const;
/** CEE #2270's mismatch branch, truthfully: the goal has a parent outside its identity's operands — no path is claimed. */
const unearnedStructural = {
  option_id: 'o-raise', probability_of_goal: 1, earned: false,
  structural_gap: { kind: 'extra_goal_parent', node_id: 'annual_contracts', moved_factor_id: 'price' },
  no_break_even: 'extra_goal_parent',
  say: "Can't yet say how likely: the goal also depends on annual contracts, which the model's calculation doesn't include.",
} as const;
const unearnedNoBreakEven = {
  option_id: 'o-x', probability_of_goal: 1, earned: false,
  unsized_path: { from: 'ai_use', enters_goal_through: 'quality' },
  no_break_even: 'not_an_identity',
  say: "Can't yet say how likely: it depends on how much AI use changes quality, which isn't sized.",
} as const;

describe('0.63.0 · GoalCertaintyDecisionSchema', () => {
  it('RED: the decision schema is exported', () => {
    expect(Decision()).toBeDefined();
  });

  it('the no-break-even vocabulary is exactly the producer\'s seven reasons (CEE #2270 @ 8dd6343b)', () => {
    for (const why of ['not_an_identity', 'identity_not_evaluated', 'level_from_inputs', 'addends', 'no_exact_figure']) {
      expect(Decision().safeParse({ ...unearnedNoBreakEven, no_break_even: why }).success, why).toBe(true);
    }
    // The two structural reasons travel with their gap, never with a claimed path (PR Review 5883666597).
    for (const why of ['extra_goal_parent', 'operand_not_parent'] as const) {
      const d = { ...unearnedStructural, structural_gap: { ...unearnedStructural.structural_gap, kind: why }, no_break_even: why };
      expect(Decision().safeParse(d).success, why).toBe(true);
    }
  });

  it.each([['earned', earned], ['unearned product', unearnedProduct], ['unearned sum', unearnedSum], ['unearned, no break-even', unearnedNoBreakEven],
    ['unearned, structural gap (no path claimed)', unearnedStructural]])(
    'RED: %s parses', (_n, v) => {
      expect(Decision().safeParse(v).success).toBe(true);
    });

  it('refuses what would say a certainty wrongly', () => {
    const bad: Array<[string, unknown]> = [
      ['earned with a path', { ...earned, unsized_path: unearnedProduct.unsized_path }],
      ['earned with a sentence', { ...earned, say: 'x' }],
      ['earned with a break-even', { ...earned, break_even: unearnedSum.break_even }],
      ['unearned with neither a path nor a structural gap', { ...unearnedNoBreakEven, unsized_path: undefined }],
      ['unearned without its sentence', { ...unearnedNoBreakEven, say: undefined }],
      ['a probability that is not 0 or 1', { ...earned, probability_of_goal: 0.97 }],
      ['product without its fraction', { ...unearnedProduct, break_even: { ...unearnedProduct.break_even, fraction: undefined } }],
      ['sum without its margin', { ...unearnedSum, break_even: { ...unearnedSum.break_even, margin: undefined } }],
      ['product carrying a margin', { ...unearnedProduct, break_even: { ...unearnedProduct.break_even, margin: 5 } }],
      ['sum carrying a fraction or a count', { ...unearnedSum, break_even: { ...unearnedSum.break_even, operand_count: 3 } }],
      ['an unknown member', { ...earned, confidence: 'high' }],
      ['an over-long sentence', { ...unearnedNoBreakEven, say: 'x'.repeat(401) }],
      // AIQ 5883228443: an unearned certainty says WHY there is no break-even, and never both.
      ['unearned with neither a break-even nor a reason', { ...unearnedNoBreakEven, no_break_even: undefined }],
      ['unearned with both a break-even and a reason', { ...unearnedProduct, no_break_even: 'addends' }],
      ['an off-vocabulary reason', { ...unearnedNoBreakEven, no_break_even: 'unknown' }],
      ['earned with a reason', { ...earned, no_break_even: 'addends' }],
      // PR Review 5883666597: a factor/parent pair no graph path connects is NEVER stored as a path.
      ['a structural-gap reason beside a claimed path', { ...unearnedNoBreakEven, no_break_even: 'extra_goal_parent' }],
      ['operand_not_parent beside a claimed path', { ...unearnedNoBreakEven, no_break_even: 'operand_not_parent' }],
      ['both a path and a structural gap', { ...unearnedStructural, unsized_path: { from: 'price', enters_goal_through: 'annual_contracts' } }],
      ['a structural gap whose kind is not its reason', { ...unearnedStructural, no_break_even: 'operand_not_parent' }],
      ['a structural gap with a break-even', { ...unearnedStructural, no_break_even: undefined, break_even: unearnedSum.break_even }],
      ['earned with a structural gap', { ...earned, structural_gap: unearnedStructural.structural_gap }],
    ];
    for (const [name, v] of bad) expect(Decision().safeParse(v).success, name).toBe(false);
  });
});

describe('0.63.0 · RunAnalysisResultSchema.goal_certainty — stored on the Run it was computed for', () => {
  const run = { scenario_id: '0938f068-2b83-4a77-9b47-def252ac03f0', leading_option_id: 'o-hold', summary: 's',
    graph_hash_at_run: 'a'.repeat(64), computed_at: '2026-09-29T04:00:00.000Z' };

  it('RED: a Run carrying decisions parses and keeps them', () => {
    const parsed = RunResult().parse({ ...run, goal_certainty: [earned, unearnedProduct] }) as { goal_certainty?: unknown[] };
    expect(parsed.goal_certainty).toHaveLength(2);
  });

  it('GUARD: a malformed decision on the Run is refused (a certainty said wrongly never reaches a stored Run)', () => {
    expect(RunResult().safeParse({ ...run, goal_certainty: [{ ...earned, say: 'certain!' }] }).success).toBe(false);
  });

  it('a completed Run with no option at exactly 0 or 1 records [] (absent is reserved for "not recorded")', () => {
    const parsed = RunResult().parse({ ...run, goal_certainty: [] }) as { goal_certainty?: unknown[] };
    expect(parsed.goal_certainty).toEqual([]);
  });

  it('CONTROL: a Run with NO goal_certainty still parses (every older Run; absent = not recorded, never "earned")', () => {
    const parsed = RunResult().parse(run) as { goal_certainty?: unknown };
    expect(parsed.goal_certainty).toBeUndefined();
  });
});

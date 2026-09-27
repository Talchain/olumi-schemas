// 0.60.0 — `ConstraintVerdictSchema.estimate_only_constraint_ids`: the ratified limits a verdict left unverified ONLY
// because the leading option sets their target at a level that earns no authorship credit (CEE rule (d), AI Quality
// #70 5844226031 / 5854466559). RED-first: before this member existed the verdict is `.strict()`, so a fact carrying it was REJECTED —
// and without it no reader can tell rule (d) ("checked only against an assumed figure") from a limit that was genuinely
// not scored ("could not be checked"). Served case: MG eng-hiring-4 (#70 5851920084, traced by AIQ 5851938306).
import { describe, it, expect } from 'vitest';
import { ConstraintVerdictSchema, RunAnalysisResultSchema } from '../../src/orchestrator/handler-results.js';

const verdict = { may_name_leading_option: false, constraint_verdict_state: 'unevaluated' } as const;
const fact = (constraint_verdict: unknown) => ({
  scenario_id: '0dc3e4c3-2672-4fd8-a55d-2f44390030af',
  leading_option_id: null,
  summary: 'Ran analysis on your current scenario.',
  constraint_verdict,
});

describe('ConstraintVerdictSchema.estimate_only_constraint_ids (0.60.0)', () => {
  it('RED: a verdict carrying the rule-(d) ids parses, on its own and inside the persisted run fact', () => {
    const v = { ...verdict, estimate_only_constraint_ids: ['agent-lane:annual_salary_spend:<='] };
    expect(ConstraintVerdictSchema.parse(v)).toEqual(v);
    expect(RunAnalysisResultSchema.parse(fact(v)).constraint_verdict).toEqual(v);
  });

  it('absent still parses and stays absent — "not recorded" (every fact before 0.60.0), never defaulted to []', () => {
    const parsed = ConstraintVerdictSchema.parse(verdict);
    expect('estimate_only_constraint_ids' in parsed).toBe(false);
  });

  it('[] parses — recorded, and no limit rests on an estimate', () => {
    expect(ConstraintVerdictSchema.parse({ ...verdict, estimate_only_constraint_ids: [] }).estimate_only_constraint_ids).toEqual([]);
  });

  it('ids only: an empty string or a non-string member is refused', () => {
    expect(ConstraintVerdictSchema.safeParse({ ...verdict, estimate_only_constraint_ids: [''] }).success).toBe(false);
    expect(ConstraintVerdictSchema.safeParse({ ...verdict, estimate_only_constraint_ids: [3] }).success).toBe(false);
    expect(ConstraintVerdictSchema.safeParse({ ...verdict, estimate_only_constraint_ids: 'x' }).success).toBe(false);
  });

  it('CONTRAST: the verdict is still .strict() — an undeclared sibling is refused', () => {
    expect(ConstraintVerdictSchema.safeParse({ ...verdict, constraints: ['x'] }).success).toBe(false);
  });
});

// 0.83.0 — the revision of the SAME persisted snapshot sent to analysis.
// READER FIRST: every parser must serve 0.83 before any producer stamps it.
// ORCHESTRATOR_INTERNAL; absent = legacy/unknown, never revision zero.
import { describe, expect, it } from 'vitest';

import { HandlerFactSchema, RunAnalysisResultSchema } from '../../src/orchestrator/index.js';

const legacy = {
  scenario_id: '00000000-0000-4000-8000-000000000001',
  leading_option_id: null,
  summary: 'Analysis completed.',
};
const fact = (result: Record<string, unknown>) => ({
  fact_type: 'run_analysis', fact_version: 1, noop: false, result,
});

describe('0.83.0 · evaluated_scenario_revision on the persisted Run', () => {
  it('accepts absent (legacy) without injecting a revision', () => {
    const parsed = RunAnalysisResultSchema.parse(legacy);
    expect(parsed).toStrictEqual(legacy);
    expect(parsed).not.toHaveProperty('evaluated_scenario_revision');
    expect(HandlerFactSchema.parse(fact(legacy))).toStrictEqual(fact(legacy));
  });

  it.each([0, 7])('parses and round-trips revision %s', (revision) => {
    const result = { ...legacy, evaluated_scenario_revision: revision };
    expect(RunAnalysisResultSchema.parse(result)).toStrictEqual(result);
    const persisted = JSON.parse(JSON.stringify(fact(result)));
    expect(HandlerFactSchema.parse(persisted)).toStrictEqual(fact(result));
  });

  it.each([
    ['negative', -1], ['fractional', 1.5], ['string', '7'], ['null', null],
  ])('rejects a %s revision', (_name, revision) => {
    const control = { ...legacy, evaluated_scenario_revision: 7 };
    expect(RunAnalysisResultSchema.parse(control)).toStrictEqual(control);
    expect(HandlerFactSchema.parse(fact(control))).toStrictEqual(fact(control));
    const result = { ...control, evaluated_scenario_revision: revision };
    expect(RunAnalysisResultSchema.safeParse(result).success).toBe(false);
    expect(HandlerFactSchema.safeParse(fact(result)).success).toBe(false);
  });

  it('strict control: an UNKNOWN sibling key is still rejected', () => {
    const control = { ...legacy, evaluated_scenario_revision: 7 };
    expect(RunAnalysisResultSchema.parse(control)).toStrictEqual(control);
    const result = { ...control, unknown_revision_sibling: 7 };
    expect(RunAnalysisResultSchema.safeParse(result).success).toBe(false);
    expect(HandlerFactSchema.safeParse(fact(result)).success).toBe(false);
  });
});

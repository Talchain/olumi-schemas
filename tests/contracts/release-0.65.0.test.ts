// ============================================================================
// 0.65.0 — which options were LEFT OUT of the ordinary comparison, and why, stored on the Run.
//   Ask: Runtime #72 5888380144 (the Run result is .strict(): a fact carrying `option_participation` would be refused at the
//   write). Contract: DL 5887489508 / 5887510885 (Olumi's proposed option is excluded; kept only provisionally, with the
//   leader withheld, when excluding it leaves < 2 analysable user-owned options). Carrier name: Canvas 5887560895.
//
// RED-first: before 0.65.0 a Run result carrying `option_participation` is REFUSED by the strict object.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { OptionParticipationEntrySchema, RunAnalysisResultSchema } from '../../src/orchestrator/index.js';

const ok = (r: unknown) => OptionParticipationEntrySchema.safeParse(r).success;

describe('0.65.0 · option_participation on the Run result', () => {
  it('RED: an excluded Olumi proposal parses', () => {
    expect(ok({ option_id: 'opt_54', state: 'excluded_olumi_proposed' })).toBe(true);
  });

  it('RED: a provisional keep names the user option(s) the Run could not analyse', () => {
    expect(ok({ option_id: 'opt_54', state: 'kept_olumi_provisional', unanalysable_user_option_ids: ['opt_hire'] })).toBe(true);
  });

  it('REFUSED: a provisional keep that names no unanalysable user option (it would hide WHY Olumi\'s option stayed)', () => {
    expect(ok({ option_id: 'opt_54', state: 'kept_olumi_provisional' })).toBe(false);
    expect(ok({ option_id: 'opt_54', state: 'kept_olumi_provisional', unanalysable_user_option_ids: [] })).toBe(false);
  });

  it('REFUSED: an exclusion that claims unanalysable user options (only a provisional keep does)', () => {
    expect(ok({ option_id: 'opt_54', state: 'excluded_olumi_proposed', unanalysable_user_option_ids: ['opt_hire'] })).toBe(false);
  });

  it('REFUSED: any other state, an empty id, or an undeclared key', () => {
    expect(ok({ option_id: 'opt_54', state: 'excluded' })).toBe(false);
    expect(ok({ option_id: '', state: 'excluded_olumi_proposed' })).toBe(false);
    expect(ok({ option_id: 'opt_54', state: 'excluded_olumi_proposed', label: 'Moderate rise' })).toBe(false);
  });

  const run = { scenario_id: '0938f068-2b83-4a77-9b47-def252ac03f0', leading_option_id: 'o-hold', summary: 's',
    graph_hash_at_run: 'a'.repeat(64), computed_at: '2026-09-29T10:40:00.000Z' };

  it('RED: a Run carrying option_participation parses and keeps it', () => {
    const parsed = RunAnalysisResultSchema.parse({ ...run,
      option_participation: [{ option_id: 'opt_54', state: 'excluded_olumi_proposed' }] }) as { option_participation?: unknown[] };
    expect(parsed.option_participation).toHaveLength(1);
  });

  it('a completed Run with no option outside the ordinary comparison records [] (absent is reserved for "not recorded")', () => {
    const parsed = RunAnalysisResultSchema.parse({ ...run, option_participation: [] }) as { option_participation?: unknown[] };
    expect(parsed.option_participation).toEqual([]);
  });

  it('GUARD: a malformed entry on the Run is refused whole', () => {
    expect(RunAnalysisResultSchema.safeParse({ ...run,
      option_participation: [{ option_id: 'opt_54', state: 'kept_olumi_provisional' }] }).success).toBe(false);
  });

  it('CONTROL: a Run with NO option_participation still parses (every older Run; absent = not recorded)', () => {
    const parsed = RunAnalysisResultSchema.parse(run) as { option_participation?: unknown };
    expect(parsed.option_participation).toBeUndefined();
  });
});

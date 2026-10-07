// ============================================================================
// 0.81.0 — Compare carries each Run's OWN displayed chance of meeting the goal
// (DL #87 6035414740). Figures only: no direction, noise verdict or leader.
// A pre-0.81 delta remains legal; each rejection mutates ONE field of an
// accepted control below, so unrelated invalidity cannot make it pass.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  RunDeltaGoalChanceRounding,
  RunDeltaGoalChanceSideSchema,
  RunDeltaGoalChanceDeltaSchema,
  RunDeltaSchema,
  refineRunDelta,
} from '../../src/boundary/run-delta.js';
import * as boundary from '../../src/boundary/index.js';
import { maximalRunDelta, maximalRunDeltaPriorWithheld } from '../../src/fixtures/index.js';

type Rec = Record<string, unknown>;
const SIDES = [
  { kind: 'point', pct: 47, rounding: 'whole' },
  { kind: 'range', low_pct: 10, high_pct: 20, low_rounding: 'nearest_5', high_rounding: 'whole' },
  { kind: 'withheld' },
  { kind: 'not_recorded' },
] as const;
const ENDS = ['prior', 'current'] as const;
const row = (extra: Rec = {}) => ({ option_id: 'opt_a', prior: SIDES[0], current: SIDES[0], ...extra });
const delta = (rows: Rec[]) => ({ ...maximalRunDeltaPriorWithheld, goal_chances: rows });

/** Both control and mutant cross the same refined boundary. */
function rejects(control: Rec, mutant: Rec): void {
  expect(RunDeltaSchema.parse(control)).toStrictEqual(control);
  expect(RunDeltaSchema.safeParse(mutant).success).toBe(false);
}

describe('0.81.0 · goal chances preserve each side and the published vocabulary', () => {
  it('pins the four kind literals and two rounding literals BY HAND', () => {
    expect(RunDeltaGoalChanceSideSchema.options.map((s) => s.shape.kind.value)).toStrictEqual([
      'point', 'range', 'withheld', 'not_recorded',
    ]);
    expect(RunDeltaGoalChanceRounding.options).toStrictEqual(['whole', 'nearest_5']);
  });

  it('exports the same schemas from the boundary barrel', () => {
    expect(boundary.RunDeltaGoalChanceRounding).toBe(RunDeltaGoalChanceRounding);
    expect(boundary.RunDeltaGoalChanceSideSchema).toBe(RunDeltaGoalChanceSideSchema);
    expect(boundary.RunDeltaGoalChanceDeltaSchema).toBe(RunDeltaGoalChanceDeltaSchema);
  });

  for (const end of ENDS) {
    it.each(['whole', 'nearest_5'])('accepts point rounding %s on ' + end, (rounding) => {
      const entry = row({ [end]: { ...SIDES[0], rounding } });
      expect(RunDeltaSchema.parse(delta([entry]))).toStrictEqual(delta([entry]));
    });

    it.each(SIDES)('accepts $kind on ' + end + ' verbatim, independently of leader/win-share licences', (side) => {
      const entry = row({ [end]: side });
      expect(RunDeltaGoalChanceSideSchema.parse(side)).toStrictEqual(side);
      expect(RunDeltaGoalChanceDeltaSchema.parse(entry)).toStrictEqual(entry);
      expect(RunDeltaSchema.parse(delta([entry]))).toStrictEqual(delta([entry]));
    });
  }

  it('accepts absent goal_chances: a 0.80 payload parses without injecting the field', () => {
    const { goal_chances: _drop, ...older } = maximalRunDelta;
    expect(RunDeltaSchema.parse(older)).toStrictEqual(older);
    expect(RunDeltaSchema.parse(older)).not.toHaveProperty('goal_chances');
  });

  it('accepts an empty array, distinctly from absence', () => {
    expect(RunDeltaSchema.parse(delta([]))).toStrictEqual(delta([]));
  });

  it('keeps producer/model option order, even when chances descend', () => {
    const rows = [row({ option_id: 'opt_z', prior: { ...SIDES[0], pct: 90 } }), row()];
    expect(RunDeltaSchema.parse(delta(rows)).goal_chances?.map((r) => r.option_id)).toEqual(['opt_z', 'opt_a']);
  });

  it('the maximal delta carries all four kinds and survives the refined boundary', () => {
    expect(RunDeltaSchema.parse(maximalRunDelta)).toStrictEqual(maximalRunDelta);
    expect(maximalRunDelta.goal_chances.flatMap((r) => [r.prior.kind, r.current.kind])).toEqual([
      'point', 'range', 'withheld', 'not_recorded',
    ]);
  });
});

describe('0.81.0 · single-field mutants are refused against accepted controls', () => {
  for (const end of ENDS) {
    it.each(SIDES)('refuses an unknown key on $kind at ' + end + ' (every union member is strict)', (side) => {
      rejects(delta([row({ [end]: side })]), delta([row({ [end]: { ...side, note: 'x' } })]));
    });

    it.each([101, -1, 47.5])('refuses point pct %s on ' + end, (pct) => {
      rejects(delta([row()]), delta([row({ [end]: { ...SIDES[0], pct } })]));
    });

    for (const field of ['low_pct', 'high_pct'] as const) {
      it.each([101, -1, 47.5])('refuses range ' + field + ' %s on ' + end, (pct) => {
        const side = { ...SIDES[1], low_pct: 0, high_pct: 100 };
        rejects(delta([row({ [end]: side })]), delta([row({ [end]: { ...side, [field]: pct } })]));
      });
    }

    it('refuses low_pct > high_pct on ' + end + ' with the range issue path', () => {
      const control = delta([row({ [end]: SIDES[1] })]);
      const mutant = delta([row({ [end]: { ...SIDES[1], low_pct: 21 } })]);
      rejects(control, mutant);
      const result = RunDeltaSchema.safeParse(mutant);
      expect(result.success ? [] : result.error.issues.map((i) => i.path)).toContainEqual([
        'goal_chances', 0, end, 'low_pct',
      ]);
    });

    it('refuses an unknown kind on ' + end, () => {
      rejects(delta([row({ [end]: SIDES[2] })]), delta([row({ [end]: { kind: 'unknown' } })]));
    });

    it('refuses rounding outside the enum on ' + end, () => {
      rejects(delta([row()]), delta([row({ [end]: { ...SIDES[0], rounding: 'nearest_10' } })]));
    });

    for (const field of ['low_rounding', 'high_rounding'] as const) {
      it('refuses range ' + field + ' outside the enum on ' + end, () => {
        rejects(delta([row({ [end]: SIDES[1] })]), delta([row({ [end]: { ...SIDES[1], [field]: 'nearest_10' } })]));
      });
    }
  }

  it.each(['note', 'noise_verdict', 'direction'])('refuses %s on an entry', (field) => {
    rejects(delta([row()]), delta([row({ [field]: 'signal' })]));
  });

  it('refuses an empty option_id', () => {
    rejects(delta([row()]), delta([row({ option_id: '' })]));
  });

  it('refuses a duplicate option_id with the duplicate issue path', () => {
    const control = delta([row(), row({ option_id: 'opt_b' })]);
    const mutant = delta([row(), row({ option_id: 'opt_a' })]);
    rejects(control, mutant);
    const result = RunDeltaSchema.safeParse(mutant);
    expect(result.success ? [] : result.error.issues.map((i) => i.path)).toContainEqual([
      'goal_chances', 1, 'option_id',
    ]);
  });

  it('honours the 100-entry bound', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row({ option_id: `opt_${i}` }));
    rejects(delta(rows), delta([...rows, row({ option_id: 'opt_100' })]));
  });

  it.each([0, 100])('accepts percent boundary %s and equal range ends', (pct) => {
    const entry = row({ prior: { ...SIDES[0], pct }, current: { ...SIDES[1], low_pct: pct, high_pct: pct } });
    expect(RunDeltaSchema.parse(delta([entry]))).toStrictEqual(delta([entry]));
  });

  it.each(['range', 'duplicate'])('the exported refinement puts the %s rule under pathPrefix', (rule) => {
    const schema = RunDeltaSchema._def.schema.superRefine((data, ctx) => refineRunDelta(data, ctx, ['nested']));
    const control = delta([row({ prior: SIDES[1] }), row({ option_id: 'opt_b' })]);
    const mutant = rule === 'range'
      ? delta([row({ prior: { ...SIDES[1], low_pct: 21 } }), row({ option_id: 'opt_b' })])
      : delta([row({ prior: SIDES[1] }), row()]);
    expect(schema.parse(control)).toStrictEqual(control);
    const result = schema.safeParse(mutant);
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path)).toEqual([
      rule === 'range' ? ['nested', 'goal_chances', 0, 'prior', 'low_pct'] : ['nested', 'goal_chances', 1, 'option_id'],
    ]);
  });
});

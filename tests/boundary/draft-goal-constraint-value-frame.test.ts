/**
 * 0.38.0 — `DraftGoalConstraint.value_frame` frame attestation (ROADMAP
 * 2.266 schemas-train half; reinforced by 2.298's reviewer rowable).
 *
 * WHY. `goal_constraints[].value` carries the SAME unattested level-vs-delta
 * frame problem as `goal_threshold` did before 0.31.0: ISL evaluates
 * constraints against change-from-baseline samples, CEE mints constraint
 * values as absolute levels, and nobody converts — the frame-blind
 * constraint check is how the auto-materialised `auto_goal_threshold`
 * constraint shipped `goal_fit 0.0054` where the honest answer was ~0.55
 * (witness-2258, ~100x consequence). Two honesty gates are suppressed
 * pending exactly this attestation:
 *   - PLoT's auto-synthesis 'level' refusal (src/routes/v2/run.ts @
 *     `c03e36fe`): "goal_constraints carry no frame field. PLoT cannot
 *     convert it ... and will not guess."
 *   - ISL's frameless `GoalConstraint` (src/models/robustness_v2.py @
 *     `c25836f7`): constraint_id?/node_id/operator/value/label?, with
 *     `extra: 'ignore'` — even a smuggled frame marker is silently dropped.
 *
 * THE FIELD IS THE PRECONDITION FOR REINSTATING THOSE GATES, NOT THE
 * DELIVERY: producers must stamp it (CEE, as a code constant — the same
 * discipline as `goal_threshold_frame`, never LLM-derivable), PLoT must
 * forward it, and ISL must declare + convert, each in its own train.
 *
 * DERIVE-DON'T-MIRROR: the field reuses the canonical `GoalThresholdFrame`
 * enum (src/graph.ts, 0.31.0) rather than minting a second identical
 * vocabulary — one frame vocabulary, two attestation sites. The identity
 * pin below REDs if a refactor replaces the shared instance with a copy.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { DraftGoalConstraintSchema } from '../../src/boundary/blocks.js';
import { GoalThresholdFrame } from '../../src/graph.js';

const VALID_CONSTRAINT = {
  constraint_id: 'constraint_revenue_min',
  node_id: 'out_revenue',
  operator: '>=' as const,
  value: 100000,
  label: 'Revenue target',
};

describe('DraftGoalConstraint.value_frame — frame attestation (2.266)', () => {
  it.each(['level', 'delta'] as const)('accepts value_frame = %s', (value_frame) => {
    const result = DraftGoalConstraintSchema.safeParse({ ...VALID_CONSTRAINT, value_frame });
    expect(result.success, JSON.stringify(!result.success ? result.error.issues : null)).toBe(true);
  });

  it('accepts an absent value_frame (pre-0.38 wire; absence = UNATTESTED, consumers fail closed)', () => {
    expect(DraftGoalConstraintSchema.safeParse(VALID_CONSTRAINT).success).toBe(true);
  });

  it('rejects out-of-vocabulary frames (declared key, closed domain)', () => {
    // Before 0.38.0 a frame key rode `.passthrough()` untyped, so any string
    // "attested" successfully — an attestation channel that cannot refuse
    // garbage attests nothing. Declaring the key closes the domain.
    for (const bad of ['uplift', 'change', 'LEVEL', '', 1, null]) {
      expect(
        DraftGoalConstraintSchema.safeParse({ ...VALID_CONSTRAINT, value_frame: bad }).success,
        `value_frame=${JSON.stringify(bad)} must be rejected`,
      ).toBe(false);
    }
  });

  it('never defaults: an absent value_frame stays absent in the parse output', () => {
    // Unattested must remain visibly unattested — a defaulted 'level' would
    // manufacture an attestation nobody made (the exact fabrication class
    // 2.258/2.266 exist to kill).
    const parsed = DraftGoalConstraintSchema.parse(VALID_CONSTRAINT);
    expect('value_frame' in parsed).toBe(false);
  });

  it('value_frame IS the canonical GoalThresholdFrame instance (derive-don\'t-mirror pin)', () => {
    const field = DraftGoalConstraintSchema.shape.value_frame;
    const unwrapped = (field as z.ZodOptional<typeof GoalThresholdFrame>).unwrap();
    // Identity, not just value equality: a second z.enum(['level','delta'])
    // would pass a value comparison and still be a hand-maintained twin that
    // can drift the day one of them gains a member. `toBe` pins the instance.
    expect(unwrapped).toBe(GoalThresholdFrame);
    expect(unwrapped.options).toEqual(['level', 'delta']);
  });
});

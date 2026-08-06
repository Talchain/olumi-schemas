/**
 * 0.38.0 — `exercise_kind` gains `opportunity_cost` and
 * `implementation_intentions` (DSK selector design 2026-08-06, slice E1).
 *
 * WHY. DSK protocols P-004 (opportunity cost) and P-006 (implementation
 * intentions) currently CANNOT BE EMITTED: the enum has no member for
 * either, so CEE's strict parse drops any candidate block naming them.
 * These are pure additive vocabulary members — the contract precondition
 * for slices O1/S1, both of which remain Paul-gated product rulings. No
 * machinery for either slice ships here.
 *
 * DELIBERATELY LEFT OUT (stated so the next lane does not "helpfully" add
 * them): S1's `ActionType` member `'confirm_decision'` and its
 * `HandlerFactSchema` arm. The HandlerFact arm is shaped machinery whose
 * result object could change with Paul's ruling, and this repo's only
 * precedent for reserving an ActionType member ahead of the wire carrying
 * it (`what_changed`, PR #17, 22 Jul) was explicitly Paul-approved in the
 * commit title. S1 has no ruling yet, so its members wait for it.
 */
import { describe, it, expect } from 'vitest';
import { ExerciseBlockSchema } from '../../src/boundary/blocks.js';

const VALID_EXERCISE = {
  block_id: '88888888-8888-4888-8888-888888888888',
  signal_id: 'exercise:opportunity_cost:gh',
  created_at: '2026-08-06T09:00:00.000Z',
  source_handler: 'decision_review_enricher',
  freshness: 'fresh',
  type: 'exercise',
  exercise_kind: 'pre_mortem',
  counter_case: 'What else could these resources achieve?',
  target_refs: [],
} as const;

describe('exercise_kind — 0.38.0 members (E1)', () => {
  it.each(['opportunity_cost', 'implementation_intentions'])(
    'accepts exercise_kind = %s',
    (exercise_kind) => {
      const result = ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, exercise_kind });
      expect(result.success, JSON.stringify(!result.success ? result.error.issues : null)).toBe(true);
    },
  );

  it('still rejects unknown kinds (the enum stayed an enum, not a string)', () => {
    for (const bad of ['red_team', 'opportunity_costs', 'Implementation_Intentions', '']) {
      expect(
        ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, exercise_kind: bad }).success,
        `exercise_kind=${JSON.stringify(bad)} must be rejected`,
      ).toBe(false);
    }
  });

  it('the full vocabulary is exactly the six members (exact-set pin, lockstep mirror)', () => {
    // The what_changed precedent: an exact-set pin updated in lockstep is the
    // point — an unlisted addition (or a silent removal) goes RED here with
    // the delta named. Appended members only; nothing moves.
    expect(ExerciseBlockSchema.shape.exercise_kind.options).toEqual([
      'pre_mortem',
      'outside_view',
      'devils_advocacy',
      'consider_opposite',
      'opportunity_cost',
      'implementation_intentions',
    ]);
  });
});

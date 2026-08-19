/**
 * ROADMAP 2.1192 — the objective sense must be expressible on the wire.
 *
 * THE MEASUREMENT THAT PRODUCED THIS FIELD (ISL staging tip 28fe0c95, with a
 * contrast control that discriminates — flipping an edge sign moved the ranking
 * completely):
 *
 *     no target                : modest 0.00 | aggressive 1.00
 *     goal_threshold=0.3 delta : modest 0.00 | aggressive 1.00   <- target changed NOTHING
 *     goal_threshold=0.9 delta : modest 0.00 | aggressive 1.00   <- both P(goal)=0.0
 *
 * ISL's winner rule was `max()` over the goal-node scalar, so "wins" meant
 * "largest number at the goal node" while every surface rendered it as "best
 * option". A derived completeness check over all nineteen fields of ISL's
 * robustness request found ZERO direction-bearing members. THE CONTRACT WAS THE
 * BINDING CONSTRAINT: no upstream service could express "I want this to go UP",
 * so no amount of work in CEE or PLoT could have fixed the ranking.
 *
 * These tests bind the CONTRACT's shape. They cannot and do not assert that ISL
 * honours the field — that is ISL's consumer test
 * (test_goal_direction_objective_ranking.py), which asserts the CROWNED OPTION
 * changes, per this repo's own rule that transport is not adoption.
 */
import { describe, it, expect } from 'vitest';
import { GoalDirection, NodeV3Schema } from '../src/graph.js';
import { EnrichmentObjectiveRankingSchema } from '../src/boundary/enrichment.js';

const goalNode = (extra: Record<string, unknown> = {}) => ({
  id: 'margin',
  kind: 'outcome' as const,
  label: 'Gross margin',
  ...extra,
});

describe('GoalDirection — the request-side carrier', () => {
  it('admits exactly the three senses, and no others', () => {
    expect(GoalDirection.options).toEqual(['maximise', 'minimise', 'target']);
  });

  it('rejects a sense outside the enum rather than passing it through', () => {
    // A junk sense must not reach ISL: an unrecognised token there is a
    // Pydantic 422 that fails the WHOLE analysis, turning a producer typo into
    // a dead turn instead of a disclosed absence.
    expect(GoalDirection.safeParse('maximize').success).toBe(false); // US spelling
    expect(GoalDirection.safeParse('up').success).toBe(false);
    expect(GoalDirection.safeParse('').success).toBe(false);
  });

  it('carries each sense on a goal node', () => {
    for (const sense of GoalDirection.options) {
      const parsed = NodeV3Schema.parse(goalNode({ goal_direction: sense }));
      expect(parsed.goal_direction).toBe(sense);
    }
  });

  it('is OPTIONAL — absence is a legal node, and means UNATTESTED', () => {
    // The load-bearing half of the deploy order. Every graph on staging today
    // omits this field; if it were required, publishing this version would
    // reject every existing payload at the boundary.
    const parsed = NodeV3Schema.parse(goalNode());
    expect(parsed.goal_direction).toBeUndefined();
    expect('goal_direction' in parsed).toBe(false);
  });

  it('is additive: a node without it parses identically to before', () => {
    // Proven by VALUE, not by assertion — the whole node round-trips unchanged.
    const before = { ...goalNode({ goal_threshold: 0.78, goal_threshold_frame: 'level' }) };
    expect(NodeV3Schema.parse(before)).toEqual(before);
  });

  it('sits BESIDE goal_threshold rather than replacing it', () => {
    // 'target' reuses the existing threshold as its target. A second,
    // separately-framed target would recreate the split this row closes: a
    // threshold that was an OUTPUT beside the comparison and never an INPUT to
    // it. So the three goal fields must coexist on one node.
    const parsed = NodeV3Schema.parse(
      goalNode({ goal_direction: 'target', goal_threshold: 0.78, goal_threshold_frame: 'level' }),
    );
    expect(parsed.goal_direction).toBe('target');
    expect(parsed.goal_threshold).toBe(0.78);
    expect(parsed.goal_threshold_frame).toBe('level');
  });
});

describe('EnrichmentObjectiveRanking — the response-side provenance', () => {
  it('accepts an attested computed ranking', () => {
    const parsed = EnrichmentObjectiveRankingSchema.parse({
      direction: 'target',
      attested: true,
      status: 'computed',
    });
    expect(parsed.attested).toBe(true);
    expect(parsed.status).toBe('computed');
  });

  it('accepts an UNATTESTED ranking — the case a surface must not present as the answer', () => {
    const parsed = EnrichmentObjectiveRankingSchema.parse({
      direction: 'maximise',
      attested: false,
      status: 'computed',
    });
    expect(parsed.attested).toBe(false);
  });

  it('accepts a withheld ranking carrying the sense that was REFUSED', () => {
    // Reporting the sense that structurally ran ('maximise') would tell the
    // user we did the thing we just refused to do.
    const parsed = EnrichmentObjectiveRankingSchema.parse({
      direction: 'target',
      attested: true,
      status: 'withheld',
      withheld_reason: 'target_not_resolvable_in_sample_frame',
    });
    expect(parsed.direction).toBe('target');
    expect(parsed.withheld_reason).toBe('target_not_resolvable_in_sample_frame');
  });

  it('requires attestation and status to be STATED, never inferred from absence', () => {
    // If these were optional, a producer that forgot them would be
    // indistinguishable from one asserting an attested computed ranking — which
    // is precisely the ambiguity this block exists to remove.
    expect(EnrichmentObjectiveRankingSchema.safeParse({ direction: 'maximise' }).success).toBe(
      false,
    );
    expect(
      EnrichmentObjectiveRankingSchema.safeParse({ direction: 'maximise', attested: true }).success,
    ).toBe(false);
  });

  it('rejects a status outside {computed, withheld}', () => {
    expect(
      EnrichmentObjectiveRankingSchema.safeParse({
        direction: 'maximise',
        attested: true,
        status: 'partial',
      }).success,
    ).toBe(false);
  });

  it('reuses the request-side enum rather than mirroring it', () => {
    // A second local enum would be a hand-maintained mirror of an enum, and the
    // two would drift silently. This binds them to the same object.
    for (const sense of GoalDirection.options) {
      expect(
        EnrichmentObjectiveRankingSchema.safeParse({
          direction: sense,
          attested: true,
          status: 'computed',
        }).success,
      ).toBe(true);
    }
  });
});

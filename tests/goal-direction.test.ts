import { describe, it, expect } from 'vitest';
import { GoalDirection, NodeV3Schema } from '../src/graph.js';
import { EnrichmentObjectiveRankingSchema } from '../src/boundary/enrichment.js';
import { CANONICAL_GRAPH_HASH_NESTED_PROJECTION, CANONICAL_GRAPH_HASH_PROJECTION_VERSION } from '../src/boundary/graph-hash-contract.js';

const computed = () => ({
  direction: 'minimise', attested: true, status: 'computed',
  ranked_options: [
    { option_id: 'low', rank: 1, win_probability: .8 },
    { option_id: 'high', rank: 2, win_probability: .2 },
  ],
});
const withheld = () => ({
  attested: false, status: 'withheld', withheld_reason: 'objective_not_stated',
  ranked_options: [],
});

describe('objective request authority', () => {
  it('retains exactly the three existing directions on the selected goal node', () => {
    expect(GoalDirection.options).toEqual(['maximise', 'minimise', 'target']);
    for (const direction of GoalDirection.options) {
      const node = { id: 'goal', kind: 'outcome', label: 'Goal', goal_direction: direction };
      expect(NodeV3Schema.parse(node)).toEqual(node);
    }
  });
  it('preserves absence rather than inventing maximise, and rejects unsupported directions', () => {
    const node = { id: 'goal', kind: 'outcome', label: 'Goal' };
    expect(NodeV3Schema.parse(node)).toEqual(node);
    for (const direction of ['maximize', 'up', '', null]) {
      expect(NodeV3Schema.safeParse({ ...node, goal_direction: direction }).success).toBe(false);
    }
  });
  it('includes objective direction and target frame in the canonical hash vocabulary', () => {
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields).toContain('goal_direction');
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields).toContain('goal_threshold_frame');
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(2);
  });
});

describe('producer comparison authority', () => {
  it('round-trips an attested ordered comparison without changing shares', () => {
    for (const direction of GoalDirection.options) {
      const value = { ...computed(), direction };
      expect(EnrichmentObjectiveRankingSchema.parse(value)).toEqual(value);
    }
  });
  it('accepts equal-share dense ties without inventing a unique first place', () => {
    const value = { ...computed(), ranked_options: [
      { option_id: 'a', rank: 1, win_probability: .4 },
      { option_id: 'b', rank: 1, win_probability: .4 },
      { option_id: 'c', rank: 2, win_probability: .2 },
    ] };
    expect(EnrichmentObjectiveRankingSchema.parse(value)).toEqual(value);
  });
  it('accepts the Python producer Unicode code-point tie order without sorting rows', () => {
    const value = { ...computed(), ranked_options: [
      { option_id: '\uFFFD', rank: 1, win_probability: .5 },
      { option_id: '\u{10000}', rank: 1, win_probability: .5 },
    ] };
    // JavaScript UTF-16 '<' reverses this valid Python string order.
    expect(value.ranked_options[1].option_id < value.ranked_options[0].option_id).toBe(true);
    expect(EnrichmentObjectiveRankingSchema.parse(value)).toEqual(value);
    expect(EnrichmentObjectiveRankingSchema.safeParse({
      ...value, ranked_options: [...value.ranked_options].reverse(),
    }).success).toBe(false);
  });
  it('keeps genuinely unknown objective absent in a withheld result', () => {
    expect(EnrichmentObjectiveRankingSchema.parse(withheld())).toEqual(withheld());
    const target = { ...withheld(), direction: 'target', attested: true, withheld_reason: 'unresolved_target_frame' };
    expect(EnrichmentObjectiveRankingSchema.parse(target)).toEqual(target);
  });
  it.each([
    ['unattested', { ...computed(), attested: false }],
    ['missing objective', { ...computed(), direction: undefined }],
    ['missing comparison', { ...computed(), ranked_options: undefined }],
    ['empty comparison', { ...computed(), ranked_options: [] }],
    ['zero informative draws', { ...computed(), ranked_options: [{ option_id: 'a', rank: 1, win_probability: 0 }] }],
    ['contradictory withholding', { ...computed(), withheld_reason: 'cannot_rank' }],
    ['withheld ranking leak', { ...withheld(), ranked_options: computed().ranked_options }],
    ['withheld without reason', { ...withheld(), withheld_reason: undefined }],
    ['duplicate identities', { ...computed(), ranked_options: [{ option_id: 'a', rank: 1, win_probability: .5 }, { option_id: 'a', rank: 1, win_probability: .5 }] }],
    ['reverse share order', { ...computed(), ranked_options: [...computed().ranked_options].reverse() }],
    ['false tie rank', { ...computed(), ranked_options: [{ option_id: 'a', rank: 1, win_probability: .5 }, { option_id: 'b', rank: 2, win_probability: .5 }] }],
    ['unstable tie order', { ...computed(), ranked_options: [{ option_id: 'b', rank: 1, win_probability: .5 }, { option_id: 'a', rank: 1, win_probability: .5 }] }],
    ['non-dense rank', { ...computed(), ranked_options: [{ option_id: 'a', rank: 1, win_probability: .8 }, { option_id: 'b', rank: 3, win_probability: .2 }] }],
    ['excess credit', { ...computed(), ranked_options: [{ option_id: 'a', rank: 1, win_probability: .8 }, { option_id: 'b', rank: 2, win_probability: .6 }] }],
  ])('rejects %s', (_name, value) => {
    expect(EnrichmentObjectiveRankingSchema.safeParse(value).success).toBe(false);
  });
  it('permits an informative fraction below one without renormalising it', () => {
    const value = { ...computed(), ranked_options: [{ option_id: 'a', rank: 1, win_probability: .7 }] };
    expect(EnrichmentObjectiveRankingSchema.parse(value).ranked_options[0].win_probability).toBe(.7);
  });
  it('unrelated metadata cannot change the ordered scientific values', () => {
    const value = computed();
    const parsed = EnrichmentObjectiveRankingSchema.parse({ ...value, description: 'Display-only note' });
    expect(parsed.ranked_options).toEqual(value.ranked_options);
  });
});

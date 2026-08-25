// ============================================================================
// 0.42.0 — `edge_strength_edit`: the strict, value-carrying contract for an
// inspector edge-strength edit that must reach CEE's canonical persisted graph.
//
// This file proves the contract only. It does not claim that UI emits it or
// that CEE consumes it; those are deliberately ordered consumer PRs. Each
// rejection discriminates a specific safety property, and the final section
// replays every 0.41.0 system-event exemplar byte-identically so the new union
// member cannot narrow or mutate an existing kind unnoticed.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  EdgeStrengthDirectionIntent,
  EdgeStrengthEditIntent,
  SystemEventKind,
} from '../../src/boundary/enums.js';
import {
  OrchestratorTurnPayloadSchema,
  SystemEventSchema,
} from '../../src/boundary/turn-payload.js';
import type { SystemEvent } from '../../src/boundary/turn-payload.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCENARIO = '22222222-2222-4222-8222-222222222222';

const wrap = (event: unknown) => ({
  turn_id: TURN,
  scenario_id: SCENARIO,
  stage: 'analyse',
  kind: 'system_event',
  event,
});

const preserveNegativeSet = {
  kind: 'edge_strength_edit',
  from: 'fac_price',
  to: 'out_retention',
  magnitude: 0.85,
  direction_intent: 'preserve',
  expected: { mean: -0.55, effect_direction: 'negative' },
  intent: 'set',
} as const satisfies Extract<SystemEvent, { kind: 'edge_strength_edit' }>;

describe('edge_strength_edit — closed vocabulary and positive wire shapes', () => {
  it('is a SystemEventKind and exports both closed intent vocabularies', () => {
    expect(SystemEventKind.safeParse('edge_strength_edit').success).toBe(true);
    expect(EdgeStrengthDirectionIntent.options).toStrictEqual([
      'preserve',
      'positive',
      'negative',
    ]);
    expect(EdgeStrengthEditIntent.options).toStrictEqual(['set', 'confirm_current']);
  });

  it('accepts a preserve-direction strength change on a negative canonical edge', () => {
    const parsed = OrchestratorTurnPayloadSchema.parse(wrap(preserveNegativeSet));
    expect(parsed).toStrictEqual(wrap(preserveNegativeSet));
  });

  it.each([
    {
      label: 'positive is chosen explicitly against a negative base',
      event: { ...preserveNegativeSet, direction_intent: 'positive' as const },
    },
    {
      label: 'negative is chosen explicitly against a positive base',
      event: {
        ...preserveNegativeSet,
        direction_intent: 'negative' as const,
        expected: { mean: 0.55, effect_direction: 'positive' as const },
      },
    },
    {
      label: 'zero retains a separately stated negative direction',
      event: {
        ...preserveNegativeSet,
        magnitude: 0,
        expected: { mean: 0, effect_direction: 'negative' as const },
      },
    },
    {
      label: 'zero may also carry an explicit positive direction choice',
      event: {
        ...preserveNegativeSet,
        magnitude: 0,
        direction_intent: 'positive' as const,
        expected: { mean: 0, effect_direction: 'negative' as const },
      },
    },
  ])('accepts set intent when $label', ({ event }) => {
    expect(OrchestratorTurnPayloadSchema.safeParse(wrap(event)).success).toBe(true);
  });

  it.each([
    { mean: -0.85, effect_direction: 'negative' as const, magnitude: 0.85 },
    { mean: 0.85, effect_direction: 'positive' as const, magnitude: 0.85 },
    { mean: 0, effect_direction: 'negative' as const, magnitude: 0 },
    { mean: 0, effect_direction: 'positive' as const, magnitude: 0 },
  ])(
    'accepts exact-current confirmation for mean=$mean / direction=$effect_direction',
    ({ mean, effect_direction, magnitude }) => {
      const event = {
        ...preserveNegativeSet,
        magnitude,
        expected: { mean, effect_direction },
        intent: 'confirm_current' as const,
      };
      const parsed = OrchestratorTurnPayloadSchema.parse(wrap(event));
      expect(parsed).toStrictEqual(wrap(event));
    },
  );
});

describe('edge_strength_edit — strict authority and stale-base guards', () => {
  it('rejects confirm_current when magnitude is not EXACTLY abs(expected.mean)', () => {
    const event = {
      ...preserveNegativeSet,
      magnitude: 0.8500000000000001,
      expected: { mean: -0.85, effect_direction: 'negative' as const },
      intent: 'confirm_current' as const,
    };
    const result = OrchestratorTurnPayloadSchema.safeParse(wrap(event));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        'event',
        'magnitude',
      ]);
    }
  });

  it.each(['positive', 'negative'] as const)(
    'rejects confirm_current with explicit %s direction — confirmation must preserve',
    (direction_intent) => {
      const event = {
        ...preserveNegativeSet,
        magnitude: 0.55,
        direction_intent,
        intent: 'confirm_current' as const,
      };
      expect(OrchestratorTurnPayloadSchema.safeParse(wrap(event)).success).toBe(false);
    },
  );

  it.each([
    { mean: 0.4, effect_direction: 'negative' as const },
    { mean: -0.4, effect_direction: 'positive' as const },
  ])(
    'rejects a contradictory non-zero expected base ($mean / $effect_direction)',
    (expected) => {
      expect(
        OrchestratorTurnPayloadSchema.safeParse(
          wrap({ ...preserveNegativeSet, expected }),
        ).success,
      ).toBe(false);
    },
  );

  it.each([
    ['magnitude below zero', { magnitude: -0.01 }],
    ['magnitude above one', { magnitude: 1.01 }],
    ['magnitude NaN', { magnitude: Number.NaN }],
    ['magnitude infinite', { magnitude: Number.POSITIVE_INFINITY }],
    ['expected mean below minus one', { expected: { mean: -1.01, effect_direction: 'negative' } }],
    ['expected mean above one', { expected: { mean: 1.01, effect_direction: 'positive' } }],
    ['expected mean NaN', { expected: { mean: Number.NaN, effect_direction: 'positive' } }],
  ] as const)('rejects %s', (_label, replacement) => {
    expect(
      SystemEventSchema.safeParse({ ...preserveNegativeSet, ...replacement }).success,
    ).toBe(false);
  });

  it('accepts opaque canonical endpoint ids without silently imposing the root graph regex', () => {
    expect(
      SystemEventSchema.safeParse({
        ...preserveNegativeSet,
        from: 'FAC.Price/V2',
        to: 'Outcome.Retention',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['empty from', { from: '' }],
    ['whitespace from', { from: '   ' }],
    ['leading-whitespace from', { from: ' fac_price' }],
    ['trailing-whitespace to', { to: 'out_retention ' }],
    ['delimiter-bearing composite from', { from: 'fac_price→out_retention' }],
    ['ASCII-delimiter-bearing composite to', { to: 'fac_price->out_retention' }],
    ['empty to', { to: '' }],
  ] as const)('rejects %s — endpoint identity bytes must be exact and unambiguous', (_label, patch) => {
    expect(SystemEventSchema.safeParse({ ...preserveNegativeSet, ...patch }).success).toBe(false);
  });

  it.each([
    ['unknown direction intent', { direction_intent: 'reverse' }],
    ['unknown edit intent', { intent: 'preview' }],
    ['unknown expected direction', { expected: { mean: 0.55, effect_direction: 'unknown' } }],
  ] as const)('rejects %s', (_label, patch) => {
    expect(SystemEventSchema.safeParse({ ...preserveNegativeSet, ...patch }).success).toBe(false);
  });

  it.each([
    ['client provenance', { provenance: 'user_set' }],
    ['client source', { source: 'user_specified' }],
    ['client std', { std: 0.1 }],
    ['client operator', { operator: 'increase' }],
    ['client graph', { graph: { nodes: [], edges: [] } }],
    ['client/UI edge id', { edge_id: 'reactflow__edge-fac_price-out_retention' }],
  ] as const)('rejects %s — the client carries intent, not server authority', (_label, extra) => {
    expect(SystemEventSchema.safeParse({ ...preserveNegativeSet, ...extra }).success).toBe(false);
  });

  it('rejects unknown fields inside expected too', () => {
    expect(
      SystemEventSchema.safeParse({
        ...preserveNegativeSet,
        expected: { ...preserveNegativeSet.expected, provenance: 'ai_inferred' },
      }).success,
    ).toBe(false);
  });

  it.each(['from', 'to', 'magnitude', 'direction_intent', 'expected', 'intent'] as const)(
    'rejects a missing required field: %s',
    (field) => {
      const event: Record<string, unknown> = { ...preserveNegativeSet };
      delete event[field];
      expect(SystemEventSchema.safeParse(event).success).toBe(false);
    },
  );

  it('direct_graph_edit remains value-less and cannot impersonate this mutation', () => {
    expect(
      SystemEventSchema.safeParse({
        kind: 'direct_graph_edit',
        target_id: 'fac_price',
        operation: 'adjust_edge_strength',
        magnitude: 0.85,
        direction_intent: 'preserve',
        expected: { mean: -0.55, effect_direction: 'negative' },
        intent: 'set',
      }).success,
    ).toBe(false);
  });
});

// Mechanically captured from the built pristine 0.41.0 dist at
// 81692c67a3e0e998c084d14895e494c5ec79b294:
//   MAXIMAL_FIXTURES.filter(family starts boundary/SystemEventSchema#)
// This is intentionally the complete old-kind corpus, not a hand-selected
// happy path. It pins old parse output as bytes while permitting exactly one
// new union member.
const EVENTS_0_41: ReadonlyArray<{ family: string; fixture: Record<string, unknown> }> = [
  {
    family: 'boundary/SystemEventSchema#patch_accepted',
    fixture: { kind: 'patch_accepted', patch_id: 'fixture_patch_1' },
  },
  {
    family: 'boundary/SystemEventSchema#patch_dismissed',
    fixture: { kind: 'patch_dismissed', patch_id: 'fixture_patch_1' },
  },
  {
    family: 'boundary/SystemEventSchema#direct_graph_edit',
    fixture: {
      kind: 'direct_graph_edit',
      target_id: 'fixture_factor_market_demand',
      operation: 'set_factor_value',
      changed_node_ids: ['fixture_factor_market_demand', 'fixture_option_alpha'],
      changed_edge_ids: ['fixture_edge_demand_revenue'],
      operations: ['set_factor_value', 'adjust_edge_strength'],
      fields_changed: ['value', 'strength'],
      summary: 'FIXTURE batched canvas edit: 2 nodes, 1 edge.',
    },
  },
  {
    family: 'boundary/SystemEventSchema#factor_value_edit',
    fixture: {
      kind: 'factor_value_edit',
      target_id: 'fixture_factor_market_demand',
      value: 0.3,
      raw_value: 30000,
      unit: '£',
      field: 'value',
      applied_from: {
        round_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        participant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        evidence_event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      },
    },
  },
  {
    family: 'boundary/SystemEventSchema#chip_click',
    fixture: { kind: 'chip_click', chip_id: 'fixture_chip_1' },
  },
  { family: 'boundary/SystemEventSchema#undo', fixture: { kind: 'undo' } },
  { family: 'boundary/SystemEventSchema#redo', fixture: { kind: 'redo' } },
  {
    family: 'boundary/SystemEventSchema#selection_change',
    fixture: {
      kind: 'selection_change',
      selected: [
        {
          id: 'fixture_factor_market_demand',
          kind: 'factor',
          label: 'FIXTURE_market_demand',
        },
      ],
      cleared: false,
    },
  },
  {
    family: 'boundary/SystemEventSchema#feedback',
    fixture: {
      kind: 'feedback',
      rating: 'up',
      comment: 'FIXTURE synthetic feedback comment.',
      target: { id: TURN, kind: 'turn' },
    },
  },
  {
    family: 'boundary/SystemEventSchema#edge_adjudication',
    fixture: {
      kind: 'edge_adjudication',
      from: 'fixture_factor_market_demand',
      to: 'fixture_option_alpha',
      edge_id: 'fixture_edge_demand_revenue',
      verdict: 'overridden',
      resolved_strength_mean: -0.45,
    },
  },
  {
    family: 'boundary/SystemEventSchema#prior_range_edit',
    fixture: {
      kind: 'prior_range_edit',
      target_id: 'fixture_factor_market_demand',
      range_min: 0.2,
      range_max: 0.6,
      distribution: 'beta',
    },
  },
];

/**
 * Kinds added to `SystemEventKind` SINCE the 0.41.0 corpus above, newest last.
 *
 * The corpus itself is a HISTORIC RECORD of what 0.41.0 accepted and is
 * append-only — it must never be edited to stay current. This list is the
 * derived present-tense half: every additive member train appends exactly one
 * entry, so the assertion below keeps failing loud on the next addition instead
 * of the corpus being quietly rewritten to match.
 *   · 0.42.0 — edge_strength_edit
 *   · 0.48.0 — structural_delete
 *   · 0.50.0 — structural_add, structural_add_edge, structural_rename
 *
 * ⚠ 0.50.0 is the first train to append MORE THAN ONE entry, so the "exactly
 * one entry" phrasing above is now "one entry per member". The invariant the
 * assertion enforces is unchanged: the 0.41.0 corpus is never edited, and every
 * new member must be declared here to stay green.
 */
const KINDS_ADDED_SINCE_0_41 = [
  'edge_strength_edit',
  'structural_delete',
  'structural_add',
  'structural_add_edge',
  'structural_rename',
] as const;

describe('0.42.0 compatibility — every 0.41.0 system-event kind is byte-compatible', () => {
  it('the captured corpus is exhaustive and only the recorded kinds were added since', () => {
    const oldKinds = EVENTS_0_41.map(({ fixture }) => fixture.kind as string).sort();
    expect(EVENTS_0_41).toHaveLength(11);
    expect(new Set(oldKinds).size).toBe(EVENTS_0_41.length);

    const currentKinds = [...SystemEventKind.options].sort();
    expect(currentKinds).toStrictEqual([...oldKinds, ...KINDS_ADDED_SINCE_0_41].sort());
  });

  it.each(EVENTS_0_41.map((row) => [row.family, row.fixture] as const))(
    '%s parses byte-identically both bare and at the root wire boundary',
    (_family, fixture) => {
      expect(SystemEventSchema.parse(fixture)).toStrictEqual(fixture);
      expect(OrchestratorTurnPayloadSchema.parse(wrap(fixture))).toStrictEqual(wrap(fixture));
    },
  );

  it('positive control: the corpus exercises strict old members, not a pass-everything parser', () => {
    for (const { fixture } of EVENTS_0_41) {
      expect(SystemEventSchema.safeParse({ ...fixture, FIXTURE_unknown: true }).success).toBe(false);
    }
  });
});

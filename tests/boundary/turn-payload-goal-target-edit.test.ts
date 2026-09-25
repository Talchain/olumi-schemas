// ============================================================================
// `goal_target_edit` (0.59.0) — the structured, id-addressed edit of a goal's
// success target.
//
// WHY THIS FILE EXISTS. The Canvas "success target" control already lets a user
// state what their goal must reach, but it has no wire verb of its own: the UI
// sends a MESSAGE turn carrying a typed `add_constraint` chip plus a generated
// English sentence whose only job is to attest "this is an absolute level". A
// structured gesture that travels as prose is a gesture whose meaning depends on
// a sentence parser. This member is the typed carrier: identity, direction,
// magnitude, unit and a stale gate — and nothing the server derives.
//
// ⚠ FILE NAME. Feature-named, like `turn-payload-option-intervention-edit`.
// The release number (0.59.0) is an allocation re-derived at merge time — it
// was 0.58.0 until #66 took that number, and 0.57.0 is claimed by open PRs, and a number in a file name is a
// reservation no tooling enforces. The feature name survives a re-allocation.
//
// Written in OPPOSITE-DIRECTION TWINS, the idiom the 0.50.0,
// option_intervention_edit and 0.55.0 suites established: for every shape that
// must VALIDATE there is a malformed sibling that must REJECT.
//
// Block F is the one worth reading twice. The stale gate is justified by a claim
// about a DIFFERENT module — that the goal target's fields are INSIDE the
// analysis-affecting projection — so it is pinned against the published
// projection rather than asserted in prose.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { SystemEventKind } from '../../src/boundary/enums.js';
import {
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
} from '../../src/boundary/turn-payload.js';
import {
  CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS,
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
} from '../../src/boundary/graph-hash-contract.js';
import { GoalThresholdFrame } from '../../src/graph.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';
const HASH = '9f2c1b0ae4d37c5a';

const KIND = 'goal_target_edit';

/**
 * Every kind that existed BEFORE this member, in union order. A HISTORIC
 * RECORD, append-only in the other direction: it is what this release
 * inherited, and it must never be edited to stay current. Block H selects the
 * pre-release reader BY NAME from this list (and asserts position, not total
 * length), so a member appended after this one needs no edit here.
 */
const PRE_GOAL_TARGET_EDIT_KINDS = [
  'patch_accepted',
  'patch_dismissed',
  'direct_graph_edit',
  'factor_value_edit',
  'chip_click',
  'undo',
  'redo',
  'selection_change',
  'feedback',
  'edge_adjudication',
  'prior_range_edit',
  'edge_strength_edit',
  'structural_delete',
  'structural_add',
  'structural_add_edge',
  'structural_rename',
  'option_intervention_edit',
  'finding_dissent',
] as const;

/** A system_event turn wrapper — the shape CEE actually validates on ingress. */
function turn(event: unknown) {
  return {
    turn_id: TURN,
    scenario_id: SCEN,
    stage: 'analyse' as const,
    kind: 'system_event' as const,
    event,
  };
}

function atLeast() {
  return {
    kind: KIND,
    goal_node_id: 'goal_annual_revenue',
    constraint_type: 'at_least' as const,
    raw_value: 400000,
    unit: '£',
    base_graph_hash: HASH,
  };
}

function atMost() {
  return {
    kind: KIND,
    goal_node_id: 'goal_customer_churn',
    constraint_type: 'at_most' as const,
    raw_value: 5,
    unit: '%',
    base_graph_hash: HASH,
  };
}

type KindOption = z.ZodDiscriminatedUnionOption<'kind'>;

function unionOptions(): KindOption[] {
  return SystemEventSchema.options as KindOption[];
}

function unionKinds(): string[] {
  return unionOptions().map((o) => (o.shape.kind as z.ZodLiteral<string>).value);
}

// ---------------------------------------------------------------------------
describe('A — the kind exists in the vocabulary and reaches the union', () => {
  it('is a member of SystemEventKind', () => {
    expect(SystemEventKind.options).toContain(KIND);
  });

  it('a well-formed at_least edit validates bare AND inside the root turn payload', () => {
    const bare = SystemEventSchema.safeParse(atLeast());
    expect(bare.success).toBe(true);
    // Byte-identical round trip: nothing is defaulted, coerced or stripped.
    if (bare.success) expect(bare.data).toStrictEqual(atLeast());
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(atLeast())).success).toBe(true);
  });

  it('a well-formed at_most edit validates bare AND inside the root turn payload', () => {
    const bare = SystemEventSchema.safeParse(atMost());
    expect(bare.success).toBe(true);
    if (bare.success) expect(bare.data).toStrictEqual(atMost());
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(atMost())).success).toBe(true);
  });

  it('is discriminated on kind — near-miss names are refused, not coerced', () => {
    for (const rogue of ['goal_target_set', 'goal_threshold_edit', 'goal_direction_edit']) {
      expect(SystemEventSchema.safeParse({ ...atLeast(), kind: rogue }).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe('B — strict: server-derived and unknown keys are refused, never dropped', () => {
  // Each of these is something the SERVER derives. A client that sends one is
  // either confused about authority or trying to bypass it, and a consumer that
  // silently discarded it would look identical to one that honoured it.
  const extras: Array<[string, Record<string, unknown>]> = [
    ['cap', { cap: 500000 }],
    ['goal_threshold_cap', { goal_threshold_cap: 500000 }],
    ['goal_threshold', { goal_threshold: 0.8 }],
    ['value (model scale)', { value: 0.8 }],
    ['goal_threshold_frame', { goal_threshold_frame: 'level' }],
    ['value_frame', { value_frame: 'level' }],
    ['provenance', { provenance: 'explicit' }],
    ['cap_provenance', { goal_threshold_cap_provenance: 'metric_scale' }],
    ['label', { label: 'Annual revenue' }],
    ['operator', { operator: '>=' }],
    ['an arbitrary unknown key', { FIXTURE_unknown: true }],
  ];
  it.each(extras)('refuses an extra `%s`', (_name, extra) => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), ...extra }).success).toBe(false);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn({ ...atLeast(), ...extra })).success)
      .toBe(false);
  });

  it('accepts exactly six fields, so the refusals above are about the EXTRA key', () => {
    expect(Object.keys(atLeast()).sort()).toEqual(
      ['base_graph_hash', 'constraint_type', 'goal_node_id', 'kind', 'raw_value', 'unit'].sort(),
    );
    expect(SystemEventSchema.safeParse(atLeast()).success).toBe(true);
  });

  const required: Array<[string]> = [
    ['goal_node_id'], ['constraint_type'], ['raw_value'], ['unit'], ['base_graph_hash'],
  ];
  it.each(required)('requires `%s` — every field is REQUIRED, none is defaulted', (key) => {
    const ev = { ...atLeast() } as Record<string, unknown>;
    delete ev[key];
    expect(SystemEventSchema.safeParse(ev).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('C — direction is a closed two-value vocabulary with NO default', () => {
  const bad: Array<[string, unknown]> = [
    ['an unknown literal', 'exactly'],
    ['an operator symbol', '>='],
    ['an objective sense (goal_direction is a DIFFERENT concept)', 'maximise'],
    ['a case variant', 'AT_LEAST'],
    ['empty', ''],
    ['null', null],
  ];
  it.each(bad)('refuses constraint_type that is %s', (_name, value) => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), constraint_type: value }).success)
      .toBe(false);
  });

  it('accepts both members of the vocabulary, and only those', () => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), constraint_type: 'at_least' }).success)
      .toBe(true);
    expect(SystemEventSchema.safeParse({ ...atLeast(), constraint_type: 'at_most' }).success)
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('D — raw_value is a finite, NON-NEGATIVE absolute level in user units', () => {
  const negative: Array<[string, number]> = [
    ['just below zero', -0.000001],
    ['negative', -400000],
  ];
  it.each(negative)('refuses raw_value that is %s', (_name, raw_value) => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), raw_value }).success).toBe(false);
    expect(SystemEventSchema.safeParse({ ...atMost(), raw_value }).success).toBe(false);
  });

  const nonFinite: Array<[string, number]> = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ];
  it.each(nonFinite)('refuses raw_value that is %s', (_name, raw_value) => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), raw_value }).success).toBe(false);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn({ ...atLeast(), raw_value })).success)
      .toBe(false);
  });

  it('refuses a numeric STRING — no coercion on a graph-writing edit', () => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), raw_value: '400000' }).success).toBe(false);
  });

  const positive: Array<[string, number]> = [
    ['the smallest positive fraction', 0.000001],
    ['a percentage as typed', 60],
    ['a currency magnitude', 400000],
    ['a user-unit value far above 1 (NOT the model scale)', 2500000],
  ];
  it.each(positive)('accepts raw_value that is %s', (_name, raw_value) => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), raw_value }).success).toBe(true);
  });

  // Zero is a meaningful `at_most` level ("at most 0 defects"; Codex, #63
  // 5821693599). The CONTRACT admits it for both directions; the SERVER refuses
  // `at_least` 0 with an honest no-write refusal, as add_constraint does today.
  it('accepts raw_value 0 — "at most 0 defects" is a real target', () => {
    expect(SystemEventSchema.safeParse({ ...atMost(), raw_value: 0 }).success).toBe(true);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn({ ...atMost(), raw_value: 0 })).success)
      .toBe(true);
    expect(SystemEventSchema.safeParse({ ...atLeast(), raw_value: 0 }).success).toBe(true);
  });

  it('round-trips raw_value 0 byte-identically (JSON has no -0)', () => {
    const parsed = SystemEventSchema.parse({ ...atMost(), raw_value: 0 });
    expect(JSON.stringify(parsed)).toBe(JSON.stringify({ ...atMost(), raw_value: 0 }));
  });
});

// ---------------------------------------------------------------------------
describe('E — identity and unit', () => {
  const badIds: Array<[string, string]> = [
    ['empty', ''],
    ['blank', '   '],
    ['leading whitespace', ' goal_annual_revenue'],
    ['trailing whitespace', 'goal_annual_revenue '],
    ['arrow composite', 'factor_price→goal_annual_revenue'],
    ['ascii-arrow composite', 'factor_price->goal_annual_revenue'],
  ];
  it.each(badIds)('refuses a goal_node_id that is %s', (_name, id) => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), goal_node_id: id }).success).toBe(false);
  });

  it('accepts an ordinary long canonical id — CEE owns the id convention', () => {
    const long = 'goal_' + 'a'.repeat(180);
    expect(SystemEventSchema.safeParse({ ...atLeast(), goal_node_id: long }).success).toBe(true);
  });

  it('refuses an empty unit — a unitless level is ambiguous against a capped goal', () => {
    expect(SystemEventSchema.safeParse({ ...atLeast(), unit: '' }).success).toBe(false);
  });

  it('refuses a whitespace-only unit — it is as unitless as an empty one', () => {
    for (const unit of [' ', '   ', '\t', '\n']) {
      expect(SystemEventSchema.safeParse({ ...atLeast(), unit }).success, JSON.stringify(unit)).toBe(false);
    }
  });

  it('accepts any non-empty unit symbol — the server validates it against the goal', () => {
    for (const unit of ['£', '%', 'customers', 'hours']) {
      expect(SystemEventSchema.safeParse({ ...atLeast(), unit }).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
describe('F — the stale gate is non-optional, and its coverage is PINNED', () => {
  const missing: Array<[string, string | null | undefined]> = [
    ['absent', undefined],
    ['null', null],
    ['empty', ''],
  ];
  it.each(missing)('refuses a base_graph_hash that is %s', (_name, hash) => {
    const ev = { ...atLeast() } as Record<string, unknown>;
    if (hash === undefined) delete ev.base_graph_hash;
    else ev.base_graph_hash = hash;
    expect(SystemEventSchema.safeParse(ev).success).toBe(false);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(ev)).success).toBe(false);
  });

  it('does not constrain the digest shape — CEE owns the width', () => {
    // Same ruling as the 0.48.0/0.50.0/option_intervention_edit members:
    // `CanonicalBaseGraphHashSchema` is exactly `z.string().min(1)`.
    for (const h of ['9f2c1b0ae4d37c5a', 'sha256:9f2c1b0ae4d37c5a6e8b', 'x']) {
      expect(SystemEventSchema.safeParse({ ...atLeast(), base_graph_hash: h }).success).toBe(true);
    }
  });

  // The gate is meaningful ONLY because every field this edit writes is inside
  // the analysis-affecting projection. If any leaves it, a concurrent change to
  // the target would stop moving the hash and this gate would be decorative —
  // so the claim is pinned here, not left in a comment.
  it('goal_threshold, goal_threshold_raw and goal_threshold_cap are node projection fields', () => {
    const fields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields as readonly string[];
    expect(fields).toContain('goal_threshold');
    expect(fields).toContain('goal_threshold_raw');
    expect(fields).toContain('goal_threshold_cap');
  });

  it('goal_constraints — where an at_most edit lands — is an analysis-state hash field', () => {
    expect(CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS as readonly string[])
      .toContain('goal_constraints');
  });

  it('contrast: `label` is NOT in the projection, which is why no `expected` twin is needed here', () => {
    // structural_rename needs expected_label because the hash cannot see a label
    // change. This member writes no label, so the hash alone covers it.
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields).not.toContain('label');
  });
});

// ---------------------------------------------------------------------------
describe('G — the "absolute level" declaration binds to an existing frame literal', () => {
  it('`level` is a member of the canonical GoalThresholdFrame vocabulary', () => {
    // The member's describe() declares raw_value an absolute LEVEL, which is what
    // licenses the server to stamp `value_frame: 'level'` on the constraint row
    // and `goal_threshold_frame: 'level'` on the node. Pinned so a rename of the
    // frame vocabulary fails here rather than orphaning the declaration.
    expect(GoalThresholdFrame.options).toContain('level');
  });
});

// ---------------------------------------------------------------------------
describe('H — additive: every existing member is untouched, and the deploy order holds', () => {
  it('adds exactly one member, appended LAST, and removes none', () => {
    const kinds = unionKinds();
    expect(kinds.slice(0, PRE_GOAL_TARGET_EDIT_KINDS.length))
      .toEqual([...PRE_GOAL_TARGET_EDIT_KINDS]);
    expect(kinds[PRE_GOAL_TARGET_EDIT_KINDS.length]).toBe(KIND);
  });

  it('the enum and the union agree, in both directions', () => {
    expect([...SystemEventKind.options].sort()).toEqual([...unionKinds()].sort());
  });

  it('a pre-release reader (the union minus this member) REJECTS the whole turn', () => {
    // Reconstructed from the REAL union so it cannot drift from what shipped.
    const priorOptions = unionOptions()
      .filter((o) => (o.shape.kind as z.ZodLiteral<string>).value !== KIND)
      .filter((o) => (PRE_GOAL_TARGET_EDIT_KINDS as readonly string[])
        .includes((o.shape.kind as z.ZodLiteral<string>).value));
    expect(priorOptions).toHaveLength(PRE_GOAL_TARGET_EDIT_KINDS.length);

    const priorReader = z.discriminatedUnion(
      'kind',
      priorOptions as [KindOption, ...KindOption[]],
    );
    expect(priorReader.safeParse(atLeast()).success).toBe(false);
    expect(priorReader.safeParse(atMost()).success).toBe(false);
    // …and it still accepts everything it did before.
    expect(priorReader.safeParse({ kind: 'undo' }).success).toBe(true);
    // …while the CURRENT reader accepts the very same bytes: reader first, emitter second.
    expect(SystemEventSchema.safeParse(atLeast()).success).toBe(true);
  });
});

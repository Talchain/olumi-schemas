// ============================================================================
// `option_intervention_edit` — the per-cell option→factor effect carrier.
//
// WHY THIS FILE EXISTS. The Model tab's option-effect editor is fully built and
// deliberately withheld: its authority is declared `'disabled'` and the section
// renders a notice instead of a control, because no wire verb can carry the
// value. This member is that verb. A local edit does reach the server through
// whole-graph registration on a later replacement event, but there is no
// per-edit, identity-exact, durably acknowledged write — which is what an
// acknowledgement, a changed-input rerun and a reload each need.
//
// ⚠ FILE NAME. Every sibling in this directory is version-named. This one is
// feature-named because the PR carries NO package-version bump: naming it
// `turn-payload-0.5X` would reserve a number the integration owner has not
// allocated, and two open PRs already propose one. Rename it at allocation.
//
// Written in OPPOSITE-DIRECTION TWINS, like the 0.50.0 suite: for every shape
// that must VALIDATE there is a malformed sibling that must REJECT. A corpus
// that tests one direction is a guard watching one door.
//
// Block F is the one worth reading twice. This member deliberately has NO
// `expected` twin, and the justification is a claim about a DIFFERENT module —
// that an intervention value is INSIDE the analysis-affecting projection, so
// `base_graph_hash` already sees a concurrent write to the same cell. Block F
// pins that against the published projection rather than asserting it in prose:
// if `interventions` ever leaves the projection, this file REDs and tells the
// next reader the field's rationale has changed, instead of leaving a stale gate
// that someone keeps for a reason that quietly stopped being true.
// ============================================================================
import { describe, it, expect } from 'vitest';

import { SystemEventKind } from '../../src/boundary/enums.js';
import {
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
} from '../../src/boundary/turn-payload.js';
import { CANONICAL_GRAPH_HASH_NESTED_PROJECTION } from '../../src/boundary/graph-hash-contract.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';
const HASH = 'sha256:9f2c1b0ae4d37c5a6e8b';

const KIND = 'option_intervention_edit';

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

function wellFormed() {
  return {
    kind: KIND,
    option_id: 'option_open_leeds_next_quarter',
    factor_id: 'factor_capital_expenditure',
    value: 0.6,
    base_graph_hash: HASH,
  };
}

describe('A — the kind exists in the vocabulary and reaches the union', () => {
  it('is a member of SystemEventKind', () => {
    expect(SystemEventKind.options).toContain(KIND);
  });

  it('validates as a bare system event AND inside the root turn payload', () => {
    expect(SystemEventSchema.safeParse(wellFormed()).success).toBe(true);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(wellFormed())).success).toBe(true);
  });

  it('is discriminated on kind — a payload naming a kind that does not exist is refused', () => {
    const rogue = { ...wellFormed(), kind: 'option_intervention_set' };
    expect(SystemEventSchema.safeParse(rogue).success).toBe(false);
  });
});

describe('B — strict: an unknown key is refused, never silently dropped', () => {
  // The hazard this closes is the estate's dominant one: a consumer that accepts
  // and discards a field looks identical to one that honours it.
  const extras: Array<[string, Record<string, unknown>]> = [
    ['unit', { unit: '£' }],
    ['raw_value', { raw_value: 120000 }],
    ['source', { source: 'user' }],
    ['expected_value', { expected_value: 0.4 }],
  ];
  it.each(extras)('refuses an extra `%s`', (_name, extra) => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), ...extra }).success).toBe(false);
  });

  it('accepts the exact four fields, so the refusals above are about the EXTRA key', () => {
    expect(Object.keys(wellFormed()).sort()).toEqual(
      ['base_graph_hash', 'factor_id', 'kind', 'option_id', 'value'].sort(),
    );
    expect(SystemEventSchema.safeParse(wellFormed()).success).toBe(true);
  });
});

describe('C — identity: exact canonical ids, never labels and never composites', () => {
  const bad: Array<[string, string]> = [
    ['empty', ''],
    ['blank', '   '],
    ['leading whitespace', ' factor_capital_expenditure'],
    ['trailing whitespace', 'factor_capital_expenditure '],
    ['arrow composite', 'option_open_leeds→factor_capex'],
    ['ascii-arrow composite', 'option_open_leeds->factor_capex'],
  ];

  it.each(bad)('refuses an option_id that is %s', (_name, id) => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), option_id: id }).success).toBe(false);
  });

  it.each(bad)('refuses a factor_id that is %s', (_name, id) => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), factor_id: id }).success).toBe(false);
  });

  const idKeys: Array<[string]> = [['option_id'], ['factor_id']];
  it.each(idKeys)('requires %s to be present', (key) => {
    const ev = { ...wellFormed() } as Record<string, unknown>;
    delete ev[key];
    expect(SystemEventSchema.safeParse(ev).success).toBe(false);
  });

  // The two ids are the same id space (CEE's persisted node ids), so a long
  // open-string id must pass. Narrowing to a regex here would refuse ids the
  // server itself minted.
  it('accepts an ordinary long canonical id on both halves', () => {
    const long = 'node_' + 'a'.repeat(180);
    expect(
      SystemEventSchema.safeParse({ ...wellFormed(), option_id: long, factor_id: long }).success,
    ).toBe(true);
  });
});

describe('D — the value is on the MODEL scale, and the bound is the producer’s', () => {
  const inBand: Array<[number]> = [[0], [0.5], [1]];
  it.each(inBand)('accepts %s, including both boundaries', (value) => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), value }).success).toBe(true);
  });

  const outOfBand: Array<[string, number]> = [
    ['just below zero', -0.000001],
    ['negative', -0.6],
    ['just above one', 1.000001],
    ['a user-unit magnitude', 120000],
    ['a percentage as typed', 60],
  ];
  it.each(outOfBand)('refuses %s', (_name, value) => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), value }).success).toBe(false);
  });

  const nonFinite: Array<[string, number]> = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ];
  it.each(nonFinite)('refuses %s — a non-finite effect is not a value', (_name, value) => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), value }).success).toBe(false);
  });

  it('refuses a numeric STRING — no coercion on an identity-bearing mutation', () => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), value: '0.6' }).success).toBe(false);
  });

  it('requires the value: an edit with no number is a notification, not this event', () => {
    const ev = { ...wellFormed() } as Record<string, unknown>;
    delete ev.value;
    expect(SystemEventSchema.safeParse(ev).success).toBe(false);
  });
});

describe('E — the stale gate is non-optional', () => {
  const missing: Array<[string, string | null | undefined]> = [
    ['absent', undefined],
    ['null', null],
    ['empty', ''],
  ];
  it.each(missing)('refuses a base_graph_hash that is %s', (_name, hash) => {
    const ev = { ...wellFormed() } as Record<string, unknown>;
    if (hash === undefined) delete ev.base_graph_hash;
    else ev.base_graph_hash = hash;
    expect(SystemEventSchema.safeParse(ev).success).toBe(false);
  });

  it('does not constrain the digest shape — CEE owns the width', () => {
    // Binding this to a 64-hex identity hash would yield a gate that can never
    // match, because the value CEE puts on the wire is the 16-char truncated
    // ANALYSIS-AFFECTING hash. The contract states the semantics; CEE owns the
    // digest. Same ruling as the three 0.50.0 members.
    expect(
      SystemEventSchema.safeParse({ ...wellFormed(), base_graph_hash: '9f2c1b0ae4d37c5a' }).success,
    ).toBe(true);
  });
});

describe('F — WHY THERE IS NO `expected` TWIN, pinned against the published projection', () => {
  // `structural_rename` carries `expected_label` because the analysis-affecting
  // hash CANNOT see a label change — `projectNode` omits `label` deliberately, so
  // two concurrent renames produce no hash divergence and the second silently
  // clobbers the first.
  //
  // This member needs no such twin, and the reason is not a preference: an
  // intervention value IS inside the projection, so a concurrent write to the
  // same cell moves `base_graph_hash` and the gate fires. That is a claim about
  // a different module, so it is pinned here rather than asserted in prose.
  it('interventions are inside the canonical hash projection, on BOTH carriers', () => {
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.interventions_field).toBe('interventions');
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.option.interventions_field).toBe('interventions');
  });

  it('and `label` is NOT — the contrast that makes the asymmetry a derivation, not a habit', () => {
    // If this ever starts to fail, `structural_rename`'s expected_label has become
    // redundant; if the block above fails, THIS member has become unsafe without
    // an expected twin. The pair states which way round the finding is.
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields).not.toContain('label');
  });
});

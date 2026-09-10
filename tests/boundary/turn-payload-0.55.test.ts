// ============================================================================
// 0.55.0 — `finding_dissent`: the first wire shape for a human's STATED REASON.
//
// WHY THIS FILE EXISTS. On the Reasoning tab a user can disagree with a finding
// and type why. That text terminates in the browser (`commitDispute` →
// `recordDissent` → `localStorage.setItem`). Olumi's premise is a living shared
// model of the team's REASONING with humans as the authors, and the one thing
// that could not reach the shared model was a human's stated reason. The union
// already had a channel for a structured verdict with NO WORDS
// (`edge_adjudication`) and a channel whose words are deliberately DISCARDED at
// the fact row (`feedback` → `comment_present: boolean`, CEE ruling R-004).
// There was nowhere for a stated reason to land.
//
// Written in OPPOSITE-DIRECTION TWINS, the idiom the 0.50.0 and
// option_intervention_edit suites established: for every shape that must
// VALIDATE there is a malformed sibling that must REJECT. A corpus that tests
// one direction is a guard watching one door.
//
// Block E is the one worth reading twice. This member's whole value is that the
// words survive VERBATIM — R-004's widening is "persist the text", not "persist
// something like the text". So block E pins that the parser returns the exact
// bytes it was given: no trim, no collapse, no normalisation. A contract that
// quietly tidies a user's sentence has already broken the promise the widening
// was granted for.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { SystemEventKind } from '../../src/boundary/enums.js';
import {
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
} from '../../src/boundary/turn-payload.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';

const KIND = 'finding_dissent';

/**
 * The maximum this member accepts, DERIVED not chosen: it is the bound on
 * `feedback.comment`, the only other user-free-text field on this union and the
 * exact field R-004 is written about. Restating the sibling's number keeps one
 * PII-bearing bound in the union rather than two.
 */
const MAX_STATEMENT = 2000;

/**
 * Every kind that existed BEFORE this member, in union order. A HISTORIC
 * RECORD, append-only in the other direction: it is what 0.55.0 inherited, and
 * rewriting it to stay current is the failure mode `turn-payload-0.48.test.ts`
 * names in terms. A member added after this one declares itself in a
 * `KINDS_ADDED_SINCE_0_55` list, never here.
 */
const PRE_0_55_KINDS = [
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

function wellFormed() {
  return {
    kind: KIND,
    finding_id: 'rec_leeds_capex_dominates',
    analysis_id: '01J8ZQ3M4N5P6R7S8T9V0W1X2Y',
    statement: 'Capex is committed under the existing lease, so it cannot swing this.',
  };
}

/** The union's own option type — the idiom turn-payload-0.50.test.ts established. */
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

  it('validates as a bare system event AND inside the root turn payload', () => {
    expect(SystemEventSchema.safeParse(wellFormed()).success).toBe(true);
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(wellFormed())).success).toBe(true);
  });

  it('is discriminated on kind — a near-miss kind name is refused, not coerced', () => {
    // Bound by IDENTITY: these are the names a later lane is most likely to
    // reach for, and each must fail rather than resolve to this member.
    for (const rogue of ['finding_disagreement', 'disagreement_stated', 'finding_dissent_v2']) {
      expect(SystemEventSchema.safeParse({ ...wellFormed(), kind: rogue }).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe('B — strict: an unknown key is refused, never silently dropped', () => {
  // The hazard this closes is the estate's dominant one: a consumer that
  // accepts and discards a field is indistinguishable from one that honours it.
  const extras: Array<[string, Record<string, unknown>]> = [
    // The two the contract rules out BY NAME. `edge_adjudication` states the
    // rule for the whole family: "the event KIND is the provenance claim ... a
    // client-supplied constant would add nothing the server could trust". CEE
    // stamps these server-side, so a wire key of either name must not parse —
    // otherwise a client can assert who authored a sentence.
    ['authored_by', { authored_by: 'user' }],
    ['provenance', { provenance: 'user_set' }],
    // A stale gate would be WRONG here (see block F) — so it must not parse
    // either, or a later reader will populate it and expect a refusal.
    ['base_graph_hash', { base_graph_hash: 'sha256:9f2c1b0ae4d37c5a6e8b' }],
    // The Disagreement ENTITY's vocabulary. This member is NOT that object, and
    // a key that smuggles its shape in must fail loud rather than half-arrive.
    ['disagreement_id', { disagreement_id: SCEN }],
    ['position', { position: { kind: 'doubt' } }],
    // Free-text twins that would quietly widen the PII surface R-004 licensed.
    ['comment', { comment: 'a second free-text field' }],
    ['finding_text', { finding_text: 'the finding as rendered' }],
  ];

  it.each(extras)('rejects an unknown `%s` key', (_name, extra) => {
    const res = SystemEventSchema.safeParse({ ...wellFormed(), ...extra });
    expect(res.success).toBe(false);
  });

  it('the root payload refuses the same keys at path event.*', () => {
    const res = OrchestratorTurnPayloadSchema.safeParse(
      turn({ ...wellFormed(), authored_by: 'user' }),
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'event')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
describe('C — `statement`: the words are REQUIRED and must be real words', () => {
  it('accepts a stated reason', () => {
    expect(SystemEventSchema.safeParse(wellFormed()).success).toBe(true);
  });

  it('REJECTS a missing statement — a dissent with no reason is this member with its point removed', () => {
    const { statement: _drop, ...withoutStatement } = wellFormed();
    expect(SystemEventSchema.safeParse(withoutStatement).success).toBe(false);
  });

  it('REJECTS an empty statement', () => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), statement: '' }).success).toBe(false);
  });

  it.each([' ', '   ', '\t', '\n', ' \t\n '])(
    'REJECTS a whitespace-only statement (%j) — `.min(1)` alone would admit it',
    (blank) => {
      expect(SystemEventSchema.safeParse({ ...wellFormed(), statement: blank }).success).toBe(false);
    },
  );

  it('REJECTS a non-string statement rather than coercing it', () => {
    for (const bad of [null, 42, true, ['words'], { statement: 'words' }]) {
      expect(SystemEventSchema.safeParse({ ...wellFormed(), statement: bad }).success).toBe(false);
    }
  });

  it(`accepts exactly ${MAX_STATEMENT} characters and refuses ${MAX_STATEMENT + 1}`, () => {
    const at = 'x'.repeat(MAX_STATEMENT);
    const over = 'x'.repeat(MAX_STATEMENT + 1);
    expect(SystemEventSchema.safeParse({ ...wellFormed(), statement: at }).success).toBe(true);
    expect(SystemEventSchema.safeParse({ ...wellFormed(), statement: over }).success).toBe(false);
  });

  it('the bound EQUALS `feedback.comment`\'s, derived from both schemas at run time', () => {
    // The member's comment claims the bound is DERIVED from the sibling rather
    // than chosen. A claim like that is a hand-maintained mirror unless
    // something fails loud on drift — so this derives BOTH sides by probing the
    // real schemas at the boundary, and REDs if either moves.
    //
    // Probed rather than read out of `_def`: a zod-internals read would drift on
    // a zod bump, whereas a parse either accepts a string of length N or does
    // not, at any zod version.
    const feedbackAt = (len: number) => SystemEventSchema.safeParse({
      kind: 'feedback',
      rating: 'up',
      comment: 'x'.repeat(len),
      target: { id: TURN, kind: 'turn' },
    }).success;
    const dissentAt = (len: number) => SystemEventSchema.safeParse({
      ...wellFormed(),
      statement: 'x'.repeat(len),
    }).success;

    // Positive control (trap 13): both fields must be visible at all before an
    // equality between their edges says anything.
    expect(feedbackAt(1)).toBe(true);
    expect(dissentAt(1)).toBe(true);

    for (const len of [MAX_STATEMENT, MAX_STATEMENT + 1]) {
      expect(dissentAt(len)).toBe(feedbackAt(len));
    }
  });
});

// ---------------------------------------------------------------------------
describe('D — identity: BOTH halves are required, because either alone dangles', () => {
  it('REJECTS a missing finding_id', () => {
    const { finding_id: _drop, ...without } = wellFormed();
    expect(SystemEventSchema.safeParse(without).success).toBe(false);
  });

  it('REJECTS a missing analysis_id — a per-run finding id alone is not an address', () => {
    const { analysis_id: _drop, ...without } = wellFormed();
    expect(SystemEventSchema.safeParse(without).success).toBe(false);
  });

  it.each([
    ['finding_id', ''],
    ['analysis_id', ''],
  ])('REJECTS an empty %s', (field, value) => {
    expect(SystemEventSchema.safeParse({ ...wellFormed(), [field]: value }).success).toBe(false);
  });

  it('does not narrow either id to a UUID or ULID shape', () => {
    // Derived from `analysis_fact.analysis_id`, which is a free string BY
    // DESIGN: "a regex here would be this package asserting a producer's id
    // convention it does not own". The same reasoning binds both ids here — a
    // recommendation id is CEE's to mint, not this package's to constrain.
    const opaque = {
      ...wellFormed(),
      finding_id: 'REC/2026-09-11#4',
      analysis_id: 'analysis-run-77',
    };
    expect(SystemEventSchema.safeParse(opaque).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('E — VERBATIM: the parser returns the exact bytes it was given', () => {
  // R-004's widening is "persist the text", not "persist something like the
  // text". A contract that trims, collapses or normalises has already broken
  // the promise the widening was granted for — and it would do so invisibly,
  // because every consumer would still see a well-formed sentence.
  const samples = [
    '  leading and trailing spaces are the user\'s  ',
    'line one\nline two',
    'they said "it cannot swing this" — I disagree',
    'régression, naïve, £30,000, 78%',
    'tabs\tbetween\twords',
  ];

  it.each(samples)('preserves %j exactly', (statement) => {
    const res = SystemEventSchema.safeParse({ ...wellFormed(), statement });
    expect(res.success).toBe(true);
    if (res.success && res.data.kind === KIND) {
      expect(res.data.statement).toBe(statement);
    }
  });

  it('preserves the statement through the ROOT payload too, not just the bare event', () => {
    const statement = '  verbatim through the wrapper  ';
    const res = OrchestratorTurnPayloadSchema.safeParse(turn({ ...wellFormed(), statement }));
    expect(res.success).toBe(true);
    if (res.success && res.data.kind === 'system_event' && res.data.event.kind === KIND) {
      expect(res.data.event.statement).toBe(statement);
    }
  });
});

// ---------------------------------------------------------------------------
describe('F — additive at 0.54.0: every existing member is untouched', () => {
  it('adds exactly one member and removes none', () => {
    const kinds = unionKinds();
    expect(kinds).toHaveLength(PRE_0_55_KINDS.length + 1);
    for (const kind of PRE_0_55_KINDS) expect(kinds).toContain(kind);
    expect(kinds.filter((k) => !(PRE_0_55_KINDS as readonly string[]).includes(k)))
      .toEqual([KIND]);
  });

  it('the 0.54.0 members appear FIRST and in unchanged ORDER', () => {
    // Order is load-bearing: `SystemEventSchema.options` is consumed by the
    // parity tests here AND by CEE's derived kind-exhaustiveness test.
    expect(unionKinds().slice(0, PRE_0_55_KINDS.length)).toEqual([...PRE_0_55_KINDS]);
  });

  it('the enum and the union agree, in both directions', () => {
    expect([...SystemEventKind.options].sort()).toEqual([...unionKinds()].sort());
  });

  it('`feedback` — the R-004 sibling — parses byte-identically, comment and all', () => {
    // The member whose ruling this release widens. If widening it had cost the
    // existing channel anything, this is where it would show.
    const feedback = {
      kind: 'feedback' as const,
      rating: 'down' as const,
      comment: 'the leader claim does not follow',
      target: { id: TURN, kind: 'turn' as const },
    };
    const res = SystemEventSchema.safeParse(feedback);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toEqual(feedback);
  });

  it('`edge_adjudication` — the words-free sibling — is unchanged, refinement included', () => {
    const overridden = {
      kind: 'edge_adjudication' as const,
      from: 'factor_a',
      to: 'factor_b',
      verdict: 'overridden' as const,
      resolved_strength_mean: -0.4,
    };
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(overridden)).success).toBe(true);
    // …and its cross-field rule still bites: overridden REQUIRES the value.
    const { resolved_strength_mean: _drop, ...noValue } = overridden;
    expect(OrchestratorTurnPayloadSchema.safeParse(turn(noValue)).success).toBe(false);
  });

  it('a 0.54.0-shaped reader (the union minus this member) REJECTS the new turn', () => {
    // The deploy-order guard. Reconstructed from the REAL union rather than a
    // hand-written twin, so it cannot drift from what 0.54.0 shipped.
    const priorOptions = unionOptions()
      .filter((o) => (o.shape.kind as z.ZodLiteral<string>).value !== KIND);
    expect(priorOptions).toHaveLength(PRE_0_55_KINDS.length);

    const priorReader = z.discriminatedUnion(
      'kind',
      priorOptions as [KindOption, ...KindOption[]],
    );
    expect(priorReader.safeParse(wellFormed()).success).toBe(false);
    // …and it still accepts everything it did before.
    expect(priorReader.safeParse({ kind: 'undo' }).success).toBe(true);
  });
});

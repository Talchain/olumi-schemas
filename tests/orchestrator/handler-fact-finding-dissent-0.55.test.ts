// ============================================================================
// 0.55.0 — `finding_dissent`, the fourth human-judgement receipt and the FIRST
// that persists the user's WORDS.
//
// WHY THIS FILE EXISTS AT ALL. PR #58 added the WIRE member
// (boundary/turn-payload.ts::FindingDissentEvent) and that is necessary but NOT
// sufficient: `HandlerFactSchema` is a CLOSED discriminated union and CEE
// validates every judgement fact against it BEFORE committing
// (olumi-assistants-service src/orchestrator-v5/system-events/dispatch.ts:715).
// That check is FAIL-CLOSED (dispatch.ts:716) — an unparseable fact refuses the
// WHOLE commit rather than degrading to an empty ack. So the wire member alone
// would not lose the user's reasoning quietly; it would refuse the commit and
// surface as a typed 500 while every other part of the change looked complete.
// The union-membership test below is the one that pins that.
//
// ⭐ THE AUTHORISATION. R-004 (dispatch.ts:396) says a fact records
// `comment_present`, NEVER the comment text, and that `FeedbackResultSchema`
// being `.strict()` makes a future text field "a deliberate reviewed widening,
// not a quiet leak". Paul Slee ruled on 2026-09-11 that a user's stated
// reasoning MAY be persisted; `statement` is that widening. Its LIMIT is
// pinned by a test here: R-004 is not reversed, and `feedback` must still
// refuse a verbatim comment.
// ============================================================================
import { describe, it, expect } from 'vitest';

import {
  FindingDissentHandlerFactSchema,
  FeedbackHandlerFactSchema,
  HandlerFactSchema,
} from '../../src/orchestrator/handler-fact.js';
import { SystemEventSchema } from '../../src/boundary/turn-payload.js';
import { MAX_STATED_REASON } from '../../src/boundary/turn-payload.js';

const dissentFact = {
  fact_type: 'finding_dissent',
  fact_version: 1,
  noop: false,
  result: {
    finding_id: 'rec_margin_floor_01',
    analysis_id: 'an_2026_09_11_a',
    statement: 'Our Q3 renewals are annual, so churn cannot move that fast.',
    provenance: 'user_set',
  },
} as const;

/** The same dissent as it rides the WIRE — used for the bound-equality probe. */
const wireDissent = () => ({
  kind: 'finding_dissent' as const,
  finding_id: dissentFact.result.finding_id,
  analysis_id: dissentFact.result.analysis_id,
  statement: dissentFact.result.statement,
});

const withResult = (patch: Record<string, unknown>) => ({
  ...dissentFact,
  result: { ...dissentFact.result, ...patch },
});

describe('finding_dissent fact — a human\'s stated reason, persisted', () => {
  it('parses a well-formed dissent', () => {
    expect(FindingDissentHandlerFactSchema.safeParse(dissentFact).success).toBe(true);
  });

  it('IS A MEMBER OF THE HandlerFactSchema UNION — the gap this file closes', () => {
    // Bound by IDENTITY, not by "some member accepted it": assert the union
    // resolves the value to THIS discriminator. A value predicate another member
    // could satisfy would pass on the wrong object (trap 19).
    const parsed = HandlerFactSchema.safeParse(dissentFact);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.fact_type).toBe('finding_dissent');
  });

  it('REJECTS an unrecognised key — the result is .strict()', () => {
    expect(FindingDissentHandlerFactSchema.safeParse(
      withResult({ finding_text: 'a client-echoed copy of the finding' }),
    ).success).toBe(false);
  });

  it('REJECTS an unrecognised key at the FACT level too', () => {
    expect(FindingDissentHandlerFactSchema.safeParse(
      { ...dissentFact, turn_id: 'trn_1' },
    ).success).toBe(false);
  });
});

describe('finding_dissent — the statement is the artefact, so it is guarded', () => {
  // Positive control (trap 13) shared by every rejection below: the well-formed
  // twin must be VISIBLE as valid, or "rejected" merely means the union does
  // not know this fact_type at all and the assertions prove nothing.
  const control = () => expect(HandlerFactSchema.safeParse(dissentFact).success).toBe(true);

  it('REJECTS a whitespace-only statement rather than tidying it', () => {
    control();
    expect(FindingDissentHandlerFactSchema.safeParse(withResult({ statement: '   \n\t ' })).success)
      .toBe(false);
  });

  it('REJECTS an empty statement', () => {
    control();
    expect(FindingDissentHandlerFactSchema.safeParse(withResult({ statement: '' })).success)
      .toBe(false);
  });

  it('REJECTS a missing statement', () => {
    control();
    const { statement: _dropped, ...noStatement } = dissentFact.result;
    expect(FindingDissentHandlerFactSchema.safeParse({ ...dissentFact, result: noStatement }).success)
      .toBe(false);
  });

  it(`accepts exactly ${MAX_STATED_REASON} characters and refuses ${MAX_STATED_REASON + 1}`, () => {
    expect(FindingDissentHandlerFactSchema.safeParse(
      withResult({ statement: 'x'.repeat(MAX_STATED_REASON) }),
    ).success).toBe(true);
    expect(FindingDissentHandlerFactSchema.safeParse(
      withResult({ statement: 'x'.repeat(MAX_STATED_REASON + 1) }),
    ).success).toBe(false);
  });

  it('the FACT bound EQUALS the WIRE bound, derived from both schemas at run time', () => {
    // The result's comment claims the bound is IMPORTED from the wire member
    // rather than chosen. Equal-by-construction stops being true the moment
    // someone hardcodes a number on either side, so this probes BOTH REAL
    // SCHEMAS and REDs on drift.
    //
    // Probed rather than read out of `_def`, matching turn-payload-0.55's own
    // reasoning: a zod-internals read would drift on a zod bump, whereas a parse
    // either accepts a string of length N or does not, at any zod version.
    const wireAt = (len: number) => SystemEventSchema.safeParse({
      ...wireDissent(),
      statement: 'x'.repeat(len),
    }).success;
    const factAt = (len: number) => HandlerFactSchema.safeParse(
      withResult({ statement: 'x'.repeat(len) }),
    ).success;

    // Positive control (trap 13): both sides must be visible at all before an
    // equality between their edges says anything. Without this, two schemas
    // that reject EVERYTHING would agree perfectly.
    expect(wireAt(1)).toBe(true);
    expect(factAt(1)).toBe(true);

    // And a discrimination (trap 20): keep one probe whose expected answer
    // DIFFERS, so a blind instrument cannot fake agreement.
    expect(wireAt(MAX_STATED_REASON + 1)).toBe(false);

    for (const len of [MAX_STATED_REASON, MAX_STATED_REASON + 1]) {
      expect(factAt(len)).toBe(wireAt(len));
    }
  });
});

describe('finding_dissent — identity is the PAIR (run, finding)', () => {
  it('REQUIRES finding_id', () => {
    const { finding_id: _dropped, ...rest } = dissentFact.result;
    expect(FindingDissentHandlerFactSchema.safeParse({ ...dissentFact, result: rest }).success)
      .toBe(false);
  });

  it('REQUIRES analysis_id — it is the other half of the address, not context', () => {
    // A recommendation id is per-run. Without the run, a dissent could be shown
    // beside a later analysis, which would be a claim the user never made.
    const { analysis_id: _dropped, ...rest } = dissentFact.result;
    expect(FindingDissentHandlerFactSchema.safeParse({ ...dissentFact, result: rest }).success)
      .toBe(false);
  });

  it('REJECTS empty ids', () => {
    expect(FindingDissentHandlerFactSchema.safeParse(withResult({ finding_id: '' })).success)
      .toBe(false);
    expect(FindingDissentHandlerFactSchema.safeParse(withResult({ analysis_id: '' })).success)
      .toBe(false);
  });
});

describe('finding_dissent — provenance is SERVER-stamped', () => {
  it('REQUIRES provenance', () => {
    const { provenance: _dropped, ...rest } = dissentFact.result;
    expect(FindingDissentHandlerFactSchema.safeParse({ ...dissentFact, result: rest }).success)
      .toBe(false);
  });

  it('REFUSES any provenance other than user_set', () => {
    expect(FindingDissentHandlerFactSchema.safeParse(withResult({ provenance: 'model_set' })).success)
      .toBe(false);
  });
});

describe('R-004 IS NOT REVERSED — the widening is scoped to a stated reason', () => {
  // The point of these two: a later reader must not read `finding_dissent` as a
  // general licence to persist free text. The permission is scoped, and the
  // scope is pinned by execution rather than by a comment.
  const feedbackFact = {
    fact_type: 'feedback',
    fact_version: 1,
    noop: false,
    result: {
      target_id: '33333333-3333-4333-8333-333333333333',
      target_kind: 'turn',
      rating: 'up',
      comment_present: false,
    },
  } as const;

  it('feedback STILL refuses a verbatim comment — presence only, per R-004', () => {
    // Positive control: the unmodified feedback fact must parse, or this
    // rejection would be about a broken fixture rather than about R-004.
    expect(FeedbackHandlerFactSchema.safeParse(feedbackFact).success).toBe(true);
    expect(FeedbackHandlerFactSchema.safeParse({
      ...feedbackFact,
      result: { ...feedbackFact.result, comment: 'my boss Jane hated this' },
    }).success).toBe(false);
  });

  it('finding_dissent has NO comment_present field — the words are the record', () => {
    // The two members are complements, not variants of one rule: feedback keeps
    // presence and discards the words; dissent keeps the words because presence
    // alone would destroy the entire content.
    expect(FindingDissentHandlerFactSchema.safeParse(
      withResult({ comment_present: true }),
    ).success).toBe(false);
  });
});

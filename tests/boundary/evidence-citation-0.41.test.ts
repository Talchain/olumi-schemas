// ============================================================================
// 0.41.0 — the canonical-mutation hop's contract half: an apply may CITE the
// evidence that motivated it.
//
// ONE optional member on ONE existing shape. `RoundParticipantRefSchema` is the
// SHARED attribution ref, so `evidence_event_id` reaches both ends of the hop at
// once: the owner's citation on `factor_value_edit.applied_from`, and the
// server-stamped record on `observed_state.elicited_from`. This file pins that
// it really does reach both — a member that only worked at one end would leave
// the other silently un-citable.
//
// WHAT THIS FILE IS FOR, stated as the honesty invariant one layer up from
// 0.40.0's: 0.40.0 pinned "an applied value names its AUTHOR". This pins "an
// applied value may name the EVIDENCE that moved it" — and, just as importantly,
// that it names it by ID, so the words and the person stay resolvable at render
// and never persist into `scenarios.graph` beyond the R-2 redaction routine.
// ============================================================================

import { describe, it, expect } from 'vitest';

import { ObservedStateSchema } from '../../src/graph.js';
import { RoundParticipantRefSchema } from '../../src/boundary/collab.js';

const UUID_ROUND = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UUID_PARTICIPANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_PARTICIPANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** The 0.40.0 shape, unchanged. Its continued validity IS the compat claim. */
const REF_0_40 = { round_id: UUID_ROUND, participant_id: UUID_PARTICIPANT_A };
const REF_CITING = { ...REF_0_40, evidence_event_id: UUID_EVENT };

describe('0.41.0 — evidence_event_id is accepted on the shared attribution ref', () => {
  it('parses a citation, and round-trips the id unchanged', () => {
    const parsed = RoundParticipantRefSchema.parse(REF_CITING);
    // Bound to the exact id, not to "it parsed": a schema that silently
    // dropped the member would still parse and would still be wrong.
    expect(parsed.evidence_event_id).toBe(UUID_EVENT);
  });

  it('reaches the PERSISTED end (observed_state.elicited_from)', () => {
    const parsed = ObservedStateSchema.parse({ value: 0.42, elicited_from: REF_CITING });
    expect(parsed.elicited_from?.evidence_event_id).toBe(UUID_EVENT);
  });

  /**
   * ⭐ THE ASYMMETRIC CASE — the heart of the acceptance, and the one a
   * well-meaning "tidy-up" would break by adding an author-equality check.
   * Applying A's value BECAUSE B challenged it must parse.
   */
  it('permits evidence authored by SOMEONE OTHER than the cited participant', () => {
    const graceValueAdaChallenge = {
      round_id: UUID_ROUND,
      participant_id: UUID_PARTICIPANT_A,
      evidence_event_id: UUID_EVENT,
    };
    expect(() => RoundParticipantRefSchema.parse(graceValueAdaChallenge)).not.toThrow();
    // And the contract must not carry the evidence author at all — resolving
    // who wrote it is a render-time round lookup, never a persisted name.
    expect(Object.keys(RoundParticipantRefSchema.parse(graceValueAdaChallenge))).not.toContain(
      'authored_by',
    );
    expect(UUID_PARTICIPANT_B).not.toBe(UUID_PARTICIPANT_A); // the fixture is genuinely two people
  });
});

describe('0.41.0 — additivity: the 0.40.0 shape is untouched', () => {
  it('still parses with NO citation, and reports absence as absence', () => {
    const parsed = RoundParticipantRefSchema.parse(REF_0_40);
    expect(parsed.evidence_event_id).toBeUndefined();
    // ⚠ Absence must not be repaired into a default. A substituted id would
    // manufacture a citation nobody made.
    expect('evidence_event_id' in parsed).toBe(false);
  });

  it('still parses on the persisted end with no citation', () => {
    const parsed = ObservedStateSchema.parse({ value: 0.42, elicited_from: REF_0_40 });
    expect(parsed.elicited_from?.evidence_event_id).toBeUndefined();
  });
});

/**
 * NEGATIVE FIXTURES — mandatory in this repo, and each one pins a DIFFERENT
 * failure. A single "rejects bad input" case would pass on the wrong reason.
 */
describe('0.41.0 — what the citation refuses', () => {
  it('refuses a non-UUID id (an opaque string is not an event reference)', () => {
    expect(() =>
      RoundParticipantRefSchema.parse({ ...REF_0_40, evidence_event_id: 'evt-1' }),
    ).toThrow();
  });

  it('refuses a null id — absence is expressed by ABSENCE, not by a null', () => {
    expect(() =>
      RoundParticipantRefSchema.parse({ ...REF_0_40, evidence_event_id: null }),
    ).toThrow();
  });

  /**
   * The `.strict()` guarantee the block above depends on, re-asserted at this
   * version: widening the shape must not have opened it. Without this, adding
   * an optional member could have been the change that let a display name in.
   */
  it('still refuses an unknown key — the shape did not become permissive', () => {
    expect(() =>
      RoundParticipantRefSchema.parse({ ...REF_CITING, display_name: 'Grace' }),
    ).toThrow();
  });

  it('still refuses the evidence BODY — ids only, never the words', () => {
    expect(() =>
      RoundParticipantRefSchema.parse({
        ...REF_CITING,
        evidence_body: 'Q3 cohort held at 12% after the last rise.',
      }),
    ).toThrow();
  });
});

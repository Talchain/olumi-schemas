// ============================================================================
// 0.40.0 (PR4 evidence loop) — the DECLARED observed_state.source vocabulary
// and the shared RoundParticipantRefSchema.
//
// SEPARATE FILE from evidence-loop-0.40.test.ts deliberately: this one
// imports the NEW exports, so at the pristine tip it REDs at collect
// ("does not provide an export named …") while the behavioural file REDs on
// behaviour. Together they are the RED-first witness pair.
//
// WHY THE VOCABULARY IS AN EXPORT AND NOT THE FIELD'S TYPE. At 0.39.0 the
// source union lived in the CONSUMERS, twice, as hand-maintained mirrors of
// each other: CEE `src/schemas/cee-v3.ts` ObservedStateV3.source (a closed
// 7-member z.enum, self-described "the narrowest validator in the chain")
// and the UI's `src/canvas/domain/valueProvenance.ts` SOURCE_CLASSES
// (11 literals) — CEE's own comment names the UI file as "the acknowledged
// cross-repo source of this list". 0.40.0 moves the list into the contract
// so both mirrors can become derivations at their re-vendor PRs. The WIRE
// field stays `z.string()`: narrowing it would be breaking (not a MINOR),
// and a vocabulary that gates the wire refuses any literal it is missing —
// the trap-12d failure. The enum is a consumer-side vocabulary, never a
// wire gate, and the last test here pins that distinction so no later lane
// quietly narrows the field in a patch.
// ============================================================================
import { describe, it, expect } from 'vitest';

import {
  ObservedStateSchema,
  KnownObservedStateSource,
  OBSERVED_STATE_SOURCE_LITERALS,
} from '../../src/graph.js';
import { AuthoredBySchema, RoundParticipantRefSchema } from '../../src/boundary/collab.js';
import * as rootIndex from '../../src/index.js';
import * as boundaryIndex from '../../src/boundary/index.js';

const UUID_ROUND = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UUID_PARTICIPANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('0.40.0 — the known observed_state.source vocabulary', () => {
  it('is EXACTLY the union of the two consumer lists at the pinned tips, plus panel_elicited — token-exact, order-independent', () => {
    // UI SOURCE_CLASSES (11, DecisionGuideAI src/canvas/domain/valueProvenance.ts
    // @ f04e756d) ∪ CEE ObservedStateV3.source (7, olumi-assistants-service
    // src/schemas/cee-v3.ts @ 335a9380 — a strict subset of the UI's list)
    // ∪ {panel_elicited} (minted 0.40.0). Derivation recorded in
    // SCHEMAS-0.40.0.md and in the CHANGELOG entry.
    expect([...KnownObservedStateSource.options].sort()).toStrictEqual(
      [
        'brief_extraction',
        'explicit',
        'cee_inference',
        'inferred',
        'cee_repair',
        'user_override',
        'user_confirmed',
        'user',
        'user_edited',
        'user_calibration',
        'user_assumption',
        'panel_elicited',
      ].sort(),
    );
  });

  it('the literal tuple and the enum are the SAME list (derived, not mirrored)', () => {
    expect(KnownObservedStateSource.options).toStrictEqual([...OBSERVED_STATE_SOURCE_LITERALS]);
  });

  it('panel_elicited is a member and parses through the enum', () => {
    expect(KnownObservedStateSource.safeParse('panel_elicited').success).toBe(true);
  });

  it('the WIRE field observed_state.source deliberately REMAINS a free string — an unlisted literal still parses (the enum is a consumer vocabulary, never a wire gate)', () => {
    const res = ObservedStateSchema.safeParse({
      value: 0.42,
      source: 'some_future_unlisted_source',
    });
    expect(res.success).toBe(true);
  });

  it('POSITIVE CONTROL for the previous case: the enum itself CAN refuse (the wire-stays-open result is not a vacuous instrument)', () => {
    expect(KnownObservedStateSource.safeParse('some_future_unlisted_source').success).toBe(false);
  });
});

describe('0.40.0 — RoundParticipantRefSchema (the shared attribution ref)', () => {
  it('accepts {round_id: uuid, participant_id: uuid} and both reserved AuthoredBy literals', () => {
    expect(
      RoundParticipantRefSchema.safeParse({
        round_id: UUID_ROUND,
        participant_id: UUID_PARTICIPANT,
      }).success,
    ).toBe(true);
    for (const participant_id of ['owner', 'assistant'] as const) {
      expect(
        RoundParticipantRefSchema.safeParse({ round_id: UUID_ROUND, participant_id }).success,
      ).toBe(true);
    }
  });

  it('participant_id consumes AuthoredBySchema BY OBJECT IDENTITY — one authorship axis, not a lookalike twin (the trap-21 concept split)', () => {
    expect(RoundParticipantRefSchema.shape.participant_id).toBe(AuthoredBySchema);
  });

  it('is .strict(): a display_name key is refused — ids only, per the R-2 redaction constraint', () => {
    expect(
      RoundParticipantRefSchema.safeParse({
        round_id: UUID_ROUND,
        participant_id: UUID_PARTICIPANT,
        display_name: 'Alice Example',
      }).success,
    ).toBe(false);
  });

  it('both fields are REQUIRED — a ref that names half an identity is refused', () => {
    expect(RoundParticipantRefSchema.safeParse({ round_id: UUID_ROUND }).success).toBe(false);
    expect(
      RoundParticipantRefSchema.safeParse({ participant_id: UUID_PARTICIPANT }).success,
    ).toBe(false);
  });

  it('is exported from BOTH entry points that embed it (root embeds it via ObservedStateSchema; boundary via the turn payload) — same object, no twin', () => {
    expect(rootIndex.RoundParticipantRefSchema).toBe(RoundParticipantRefSchema);
    expect(boundaryIndex.RoundParticipantRefSchema).toBe(RoundParticipantRefSchema);
  });
});

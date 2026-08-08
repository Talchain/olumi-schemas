/**
 * 0.39.0 car 4 — collaborative elicitation + disagreement types (ROADMAP
 * 2.686 U-S0 / 2.968 build-list item 1; COLLAB-UNIFIED-BUILD-PLAN-2026-08-07
 * §1 Verdict 2 + §3 U-S0 item 6; COLLAB-ELICITATION-DESIGN-2026-08-07 §4).
 *
 * Ratified rulings encoded AS PARSE RULES (Paul, 8 Aug — the 3-ruling
 * package):
 *   - composed disagreement typing: WHY axis (structure/evidence/goals/
 *     risk_tolerance) × position vocabulary (Gen-1 census kinds + doubt +
 *     attributed value + preference);
 *   - `doubt` is FIRST-CLASS and VALUELESS — a doubt position carrying a
 *     value fails to parse (the analysis-fact doctrine);
 *   - spread-not-consensus / preserve difference: no aggregate, recommended,
 *     or winner member exists anywhere in the family, and strict parents
 *     REJECT one smuggled in;
 *   - one authorship axis (2.682 co-design): `authored_by` =
 *     'owner' | 'assistant' | <participant uuid>.
 *
 * RED-first at pristine 371e18c8: fails at collect (src/boundary/collab.js
 * does not exist).
 */
import { describe, it, expect } from 'vitest';
import {
  AuthoredBySchema,
  DisagreementType,
  DisagreementStatus,
  DisagreementPositionSchema,
  DisagreementSchema,
  ElicitationRoundSchema,
  ElicitationRoundStatus,
  ElicitationEventSchema,
  ElicitationEventKind,
  ElicitationBeliefSchema,
  ElicitationProvenanceSchema,
} from '../../src/boundary/collab.js';

const PARTICIPANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TS = '2026-08-08T12:00:00.000Z';

const VALID_PROVENANCE = {
  authored_by: PARTICIPANT_ID,
  method: 'elicited_nl',
  expression_raw: 'pretty likely',
  elicitation_version: 'certainty_terms_v1',
} as const;

const VALID_ROUND = {
  round_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  scenario_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  graph_version_ref: 'mv_01234',
  target_manifest: [{ kind: 'factor', id: 'fac_alpha' }],
  context_note: 'Q3 pricing decision — state your belief independently.',
  status: 'open',
  created_by: 'owner',
  created_at: TS,
} as const;

const VALID_BELIEF_EVENT = {
  event_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  round_id: VALID_ROUND.round_id,
  participant_id: PARTICIPANT_ID,
  event_version: 'elicitation_event_v1',
  kind: 'belief_submitted',
  target: { kind: 'factor', id: 'fac_alpha' },
  belief: { value: 0.7, expression_raw: 'pretty likely', confidence: 0.6 },
  provenance: VALID_PROVENANCE,
  created_at: TS,
} as const;

const VALID_DISAGREEMENT = {
  disagreement_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  scenario_id: VALID_ROUND.scenario_id,
  round_id: VALID_ROUND.round_id,
  graph_version_ref: 'mv_01234',
  type: 'evidence',
  subject: { kind: 'factor', id: 'fac_alpha' },
  parties: [
    {
      authored_by: PARTICIPANT_ID,
      position: { kind: 'attributed_value', value: 0.3, expression_raw: 'quite unlikely' },
    },
    {
      authored_by: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      position: { kind: 'attributed_value', value: 0.75, expression_raw: 'quite likely' },
    },
  ],
  status: 'open',
  provenance: {
    authored_by: 'assistant',
    method: 'derived',
    elicitation_version: 'divergence_screen_v1',
  },
  created_at: TS,
} as const;

describe('AuthoredBySchema — one authorship axis (2.682 co-design)', () => {
  it('accepts owner, assistant, and a participant uuid', () => {
    expect(AuthoredBySchema.parse('owner')).toBe('owner');
    expect(AuthoredBySchema.parse('assistant')).toBe('assistant');
    expect(AuthoredBySchema.parse(PARTICIPANT_ID)).toBe(PARTICIPANT_ID);
  });

  it('rejects an arbitrary non-uuid string (no third vocabulary can smuggle in)', () => {
    expect(AuthoredBySchema.safeParse('the_team').success).toBe(false);
    expect(AuthoredBySchema.safeParse('').success).toBe(false);
  });
});

describe('Disagreement vocabulary (Verdict 2 — composed, orthogonal axes)', () => {
  it('the WHY axis is exactly the G2 four', () => {
    expect(DisagreementType.options).toStrictEqual([
      'structure',
      'evidence',
      'goals',
      'risk_tolerance',
    ]);
  });

  it('status includes accepted_as_difference as a first-class terminal state', () => {
    expect(DisagreementStatus.options).toStrictEqual([
      'open',
      'being_resolved',
      'resolved',
      'accepted_as_difference',
    ]);
  });
});

describe('DisagreementPositionSchema — census kinds + doubt first-class', () => {
  it.each(['exists', 'absent', 'reversed'] as const)(
    'parses the Gen-1 census structural claim: %s',
    (kind) => {
      expect(DisagreementPositionSchema.parse({ kind })).toStrictEqual({ kind });
    },
  );

  it('parses an attributed value with VERBATIM expression_raw', () => {
    const pos = { kind: 'attributed_value', value: 0.3, expression_raw: 'quite unlikely' };
    expect(DisagreementPositionSchema.parse(pos)).toStrictEqual(pos);
  });

  it('parses a stated preference', () => {
    const pos = { kind: 'preference', statement: 'I would not accept a 20% downside risk.' };
    expect(DisagreementPositionSchema.parse(pos)).toStrictEqual(pos);
  });

  it('parses doubt — dissent WITHOUT a counter-position', () => {
    expect(DisagreementPositionSchema.parse({ kind: 'doubt' })).toStrictEqual({ kind: 'doubt' });
  });

  it('DOUBT IS VALUELESS BY CONSTRUCTION: a doubt carrying a value fails to parse', () => {
    expect(
      DisagreementPositionSchema.safeParse({ kind: 'doubt', value: 0.5 }).success,
    ).toBe(false);
    expect(
      DisagreementPositionSchema.safeParse({ kind: 'doubt', expression_raw: 'no' }).success,
    ).toBe(false);
  });

  it('an attributed value without its verbatim expression fails to parse (never normalised away)', () => {
    expect(
      DisagreementPositionSchema.safeParse({ kind: 'attributed_value', value: 0.3 }).success,
    ).toBe(false);
  });
});

describe('DisagreementSchema (the 2.146 list-of-positions-with-provenance)', () => {
  it('parses the two-party evidence disagreement', () => {
    expect(DisagreementSchema.parse(VALID_DISAGREEMENT)).toStrictEqual(VALID_DISAGREEMENT);
  });

  it('PRESERVE DIFFERENCE: rejects recommended/winner/consensus members (spread, never a verdict)', () => {
    for (const forbidden of [
      { recommended: 'opt_a' },
      { winner: PARTICIPANT_ID },
      { consensus_value: 0.5 },
      { aggregate: { mean: 0.52 } },
    ]) {
      expect(
        DisagreementSchema.safeParse({ ...VALID_DISAGREEMENT, ...forbidden }).success,
      ).toBe(false);
    }
  });

  it('rejects an empty parties list (a contest IS a list of positions)', () => {
    expect(
      DisagreementSchema.safeParse({ ...VALID_DISAGREEMENT, parties: [] }).success,
    ).toBe(false);
  });

  it('a party position may be doubt alongside an attributed value (composed grammar)', () => {
    const withDoubt = {
      ...VALID_DISAGREEMENT,
      parties: [
        ...VALID_DISAGREEMENT.parties,
        { authored_by: 'owner', position: { kind: 'doubt' } },
      ],
    };
    expect(DisagreementSchema.parse(withDoubt)).toStrictEqual(withDoubt);
  });

  it('round_id is optional (a disagreement can enter via facilitation, not only a round)', () => {
    const { round_id: _dropped, ...rest } = VALID_DISAGREEMENT;
    expect(DisagreementSchema.parse(rest)).toStrictEqual(rest);
  });

  it('edge subjects bind by canonical from+to identity (the 0.34.0 edge_adjudication rule)', () => {
    const edgeSubject = {
      ...VALID_DISAGREEMENT,
      type: 'structure',
      subject: { kind: 'edge', from: 'fac_alpha', to: 'out_beta' },
      parties: [
        { authored_by: PARTICIPANT_ID, position: { kind: 'reversed' } },
        { authored_by: 'owner', position: { kind: 'exists' } },
      ],
    };
    expect(DisagreementSchema.parse(edgeSubject)).toStrictEqual(edgeSubject);
    expect(
      DisagreementSchema.safeParse({
        ...edgeSubject,
        subject: { kind: 'edge', id: 'reactflow__edge-1' },
      }).success,
    ).toBe(false);
  });
});

describe('ElicitationRoundSchema (U-S0 item 1)', () => {
  it('parses a valid open round', () => {
    expect(ElicitationRoundSchema.parse(VALID_ROUND)).toStrictEqual(VALID_ROUND);
  });

  it('status vocabulary is the G2 §4.1 lifecycle', () => {
    expect(ElicitationRoundStatus.options).toStrictEqual([
      'draft',
      'open',
      'closed',
      'adjudicating',
      'recorded',
    ]);
  });

  it('rejects an empty target manifest (a round elicits ABOUT something)', () => {
    expect(
      ElicitationRoundSchema.safeParse({ ...VALID_ROUND, target_manifest: [] }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict — blindness-adjacent surfaces fail closed)', () => {
    expect(
      ElicitationRoundSchema.safeParse({ ...VALID_ROUND, sibling_answers: [] }).success,
    ).toBe(false);
  });
});

describe('ElicitationEventSchema (append-only event grammar)', () => {
  it('parses belief_submitted with the belief payload', () => {
    expect(ElicitationEventSchema.parse(VALID_BELIEF_EVENT)).toStrictEqual(VALID_BELIEF_EVENT);
  });

  it('parses belief_revised (a mind-change is an APPEND, same shape)', () => {
    const revised = { ...VALID_BELIEF_EVENT, kind: 'belief_revised' };
    expect(ElicitationEventSchema.parse(revised)).toStrictEqual(revised);
  });

  it('kind vocabulary is the G2 §4.1 set', () => {
    expect(ElicitationEventKind.options).toStrictEqual([
      'belief_submitted',
      'belief_revised',
      'declined',
      'clarification_requested',
    ]);
  });

  it('a belief_submitted WITHOUT a belief fails to parse', () => {
    const { belief: _dropped, ...rest } = VALID_BELIEF_EVENT;
    expect(ElicitationEventSchema.safeParse(rest).success).toBe(false);
  });

  it('DECLINED IS VALUELESS BY CONSTRUCTION: a declined event carrying a belief fails to parse', () => {
    expect(
      ElicitationEventSchema.safeParse({
        ...VALID_BELIEF_EVENT,
        kind: 'declined',
      }).success,
    ).toBe(false);
    const { belief: _dropped, ...withoutBelief } = VALID_BELIEF_EVENT;
    const declined = { ...withoutBelief, kind: 'declined' };
    expect(ElicitationEventSchema.parse(declined)).toStrictEqual(declined);
  });

  it('clarification_requested carries no belief either (an unresolved ambiguity is a non-answer, never a guessed answer)', () => {
    const { belief: _dropped, ...withoutBelief } = VALID_BELIEF_EVENT;
    const clarification = { ...withoutBelief, kind: 'clarification_requested' };
    expect(ElicitationEventSchema.parse(clarification)).toStrictEqual(clarification);
    expect(
      ElicitationEventSchema.safeParse({ ...VALID_BELIEF_EVENT, kind: 'clarification_requested' }).success,
    ).toBe(false);
  });

  it('NEIL GATE STRUCTURAL: elicited_range is NOT DECLARED — a belief carrying one fails to parse (populating an unruled semantics is fabrication-adjacent)', () => {
    expect(
      ElicitationBeliefSchema.safeParse({
        value: 0.7,
        expression_raw: 'pretty likely',
        confidence: 0.6,
        elicited_range: [0.5, 0.9],
      }).success,
    ).toBe(false);
  });

  it('NO AGGREGATION SEAM ON THE WIRE: internal_combined rejects everywhere it could ride', () => {
    expect(
      ElicitationEventSchema.safeParse({
        ...VALID_BELIEF_EVENT,
        internal_combined: 0.5,
      }).success,
    ).toBe(false);
  });

  it('provenance methods are the G2 §4.2 vocabulary and elicitation_version is REQUIRED', () => {
    expect(
      ElicitationProvenanceSchema.safeParse({
        authored_by: PARTICIPANT_ID,
        method: 'elicited_nl',
      }).success,
    ).toBe(false);
    expect(
      ElicitationProvenanceSchema.safeParse({
        ...VALID_PROVENANCE,
        method: 'guessed',
      }).success,
    ).toBe(false);
  });
});

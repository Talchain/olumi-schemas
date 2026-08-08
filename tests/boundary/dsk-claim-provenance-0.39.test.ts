/**
 * 0.39.0 car 1 — DSK CLAIM provenance on CoachingBlock + ReviewCardBlock
 * (ROADMAP 2.964).
 *
 * The atomic strict triple doctrine is 0.37.0's own (`DskProtocolProvenanceSchema`,
 * blocks.ts — CEE #830: an id must never travel without the title and strength
 * that make it checkable against `data/dsk/v1.json`). This car applies the same
 * doctrine to CLAIM provenance: `{claim_id, claim_title, evidence_strength}`
 * atomic, plus an optional `protocol_id` INSIDE the object (so a protocol claim
 * still cannot travel without its claim anchor).
 *
 * RED-first at pristine 371e18c8: this file fails at collect (no such exports).
 */
import { describe, it, expect } from 'vitest';
import {
  CoachingBlockSchema,
  ReviewCardBlockSchema,
  DskProtocolProvenanceSchema,
} from '../../src/boundary/blocks.js';
import {
  DskClaimProvenanceSchema,
  DskEvidenceStrength,
} from '../../src/boundary/blocks.js';
import {
  maximalCoachingBlock,
  maximalReviewCardBlock,
} from '../../src/fixtures/index.js';

const VALID_TRIPLE = {
  claim_id: 'DSK-B-003',
  claim_title: 'Anchoring on first numbers',
  evidence_strength: 'strong',
} as const;

const VALID_TRIPLE_T_ARM = {
  claim_id: 'DSK-T-002',
  claim_title: 'Premortem technique claim',
  evidence_strength: 'mixed',
  protocol_id: 'DSK-P-002',
} as const;

// A 0.38.0-shape coaching block (no dsk_claim_provenance) — used both as the
// absent-optional control and as the base for presence cases.
const BASE_COACHING = {
  block_id: '55555555-5555-4555-8555-555555555555',
  signal_id: 'fixture_signal_coaching_1',
  created_at: '2026-08-08T09:00:00.000Z',
  source_handler: 'coaching_pass',
  freshness: 'fresh',
  type: 'coaching',
  coaching_kind: 'calibration_prompt',
  title: 'Synthetic coaching title',
  body: 'Synthetic coaching body.',
  source: 'decision_review',
  target_refs: [],
  priority_rank: 1,
} as const;

const BASE_REVIEW_CARD = {
  block_id: '44444444-4444-4444-8444-444444444444',
  signal_id: 'fixture_signal_review_1',
  created_at: '2026-08-08T09:00:00.000Z',
  source_handler: 'decision_review_enricher',
  graph_hash_at_generation: 'hash_1',
  freshness: 'fresh',
  type: 'review_card',
  card_kind: 'bias',
  title: 'Synthetic review card title',
  body: 'Synthetic review card body.',
  severity: 'warning',
  target_refs: [],
  priority_rank: 1,
} as const;

describe('DskClaimProvenanceSchema (0.39.0 car 1)', () => {
  it('parses the minimal atomic triple (B arm, no protocol_id)', () => {
    expect(DskClaimProvenanceSchema.parse(VALID_TRIPLE)).toStrictEqual(VALID_TRIPLE);
  });

  it('parses the T arm with optional protocol_id', () => {
    expect(DskClaimProvenanceSchema.parse(VALID_TRIPLE_T_ARM)).toStrictEqual(VALID_TRIPLE_T_ARM);
  });

  it('rejects a protocol id in the claim_id slot (arm confusion: DSK-P- must not masquerade as a claim)', () => {
    expect(
      DskClaimProvenanceSchema.safeParse({ ...VALID_TRIPLE, claim_id: 'DSK-P-001' }).success,
    ).toBe(false);
  });

  it('rejects trigger/other bundle arms in claim_id (DSK-TR-, DSK-F-, DSK-G-)', () => {
    for (const bad of ['DSK-TR-001', 'DSK-F-001', 'DSK-G-001']) {
      expect(DskClaimProvenanceSchema.safeParse({ ...VALID_TRIPLE, claim_id: bad }).success).toBe(false);
    }
  });

  it('rejects a claim id in the protocol_id slot', () => {
    expect(
      DskClaimProvenanceSchema.safeParse({ ...VALID_TRIPLE, protocol_id: 'DSK-B-003' }).success,
    ).toBe(false);
  });

  it('ATOMICITY: rejects the triple with claim_title missing', () => {
    const { claim_title: _dropped, ...rest } = VALID_TRIPLE;
    expect(DskClaimProvenanceSchema.safeParse(rest).success).toBe(false);
  });

  it('ATOMICITY: rejects the triple with evidence_strength missing', () => {
    const { evidence_strength: _dropped, ...rest } = VALID_TRIPLE;
    expect(DskClaimProvenanceSchema.safeParse(rest).success).toBe(false);
  });

  it('ATOMICITY: rejects an empty claim_title', () => {
    expect(
      DskClaimProvenanceSchema.safeParse({ ...VALID_TRIPLE, claim_title: '' }).success,
    ).toBe(false);
  });

  it('rejects an out-of-vocabulary evidence_strength', () => {
    expect(
      DskClaimProvenanceSchema.safeParse({ ...VALID_TRIPLE, evidence_strength: 'overwhelming' }).success,
    ).toBe(false);
  });

  it('is strict: rejects unknown keys inside the triple', () => {
    expect(
      DskClaimProvenanceSchema.safeParse({ ...VALID_TRIPLE, grounding: 'attested' }).success,
    ).toBe(false);
  });

  it('shares the evidence_strength vocabulary with DskProtocolProvenanceSchema BY IDENTITY (derive, don\'t mirror)', () => {
    const claimStrength = DskClaimProvenanceSchema.shape.evidence_strength;
    const protocolStrength = DskProtocolProvenanceSchema.shape.evidence_strength;
    expect(claimStrength).toBe(DskEvidenceStrength);
    expect(protocolStrength).toBe(DskEvidenceStrength);
  });
});

describe('CoachingBlock.dsk_claim_provenance (0.39.0 car 1)', () => {
  it('a 0.38.0-shape block (no field) still parses byte-identically', () => {
    expect(CoachingBlockSchema.parse(BASE_COACHING)).toStrictEqual(BASE_COACHING);
  });

  it('parses with the atomic triple attached', () => {
    const block = { ...BASE_COACHING, dsk_claim_provenance: VALID_TRIPLE_T_ARM };
    expect(CoachingBlockSchema.parse(block)).toStrictEqual(block);
  });

  it('rejects FLAT sibling dsk fields (the CEE #830 shape the atomic object exists to forbid)', () => {
    expect(
      CoachingBlockSchema.safeParse({ ...BASE_COACHING, dsk_claim_id: 'DSK-B-003' }).success,
    ).toBe(false);
    expect(
      CoachingBlockSchema.safeParse({
        ...BASE_COACHING,
        dsk_claim_id: 'DSK-B-003',
        dsk_claim_title: 'Anchoring',
        dsk_evidence_strength: 'strong',
      }).success,
    ).toBe(false);
  });

  it('rejects a broken triple on the block (atomicity holds through the parent)', () => {
    expect(
      CoachingBlockSchema.safeParse({
        ...BASE_COACHING,
        dsk_claim_provenance: { claim_id: 'DSK-B-003' },
      }).success,
    ).toBe(false);
  });

  it('still rejects arbitrary unknown keys (strict parent unchanged)', () => {
    expect(
      CoachingBlockSchema.safeParse({ ...BASE_COACHING, FIXTURE_unknown: true }).success,
    ).toBe(false);
  });

  it('the maximal fixture populates the field (maximality — the drift shape this repo watches)', () => {
    expect(maximalCoachingBlock).toHaveProperty('dsk_claim_provenance');
    expect(CoachingBlockSchema.parse(maximalCoachingBlock)).toStrictEqual(maximalCoachingBlock);
  });
});

describe('ReviewCardBlock.dsk_claim_provenance (0.39.0 car 1)', () => {
  it('a 0.38.0-shape block (no field) still parses byte-identically', () => {
    expect(ReviewCardBlockSchema.parse(BASE_REVIEW_CARD)).toStrictEqual(BASE_REVIEW_CARD);
  });

  it('parses with the atomic triple attached', () => {
    const block = { ...BASE_REVIEW_CARD, dsk_claim_provenance: VALID_TRIPLE };
    expect(ReviewCardBlockSchema.parse(block)).toStrictEqual(block);
  });

  it('rejects flat sibling dsk fields', () => {
    expect(
      ReviewCardBlockSchema.safeParse({ ...BASE_REVIEW_CARD, dsk_claim_id: 'DSK-B-003' }).success,
    ).toBe(false);
  });

  it('the maximal fixture populates the field', () => {
    expect(maximalReviewCardBlock).toHaveProperty('dsk_claim_provenance');
    expect(ReviewCardBlockSchema.parse(maximalReviewCardBlock)).toStrictEqual(maximalReviewCardBlock);
  });
});

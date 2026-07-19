/**
 * 0.19.0 — wave-2 producer fields (UI-TO-ORCHESTRATOR-2026-07-19 Q3 ranked
 * asks + the two schema asks + ask #20).
 *
 * Mutation-check property of this file (why these tests bite on revert):
 *   - For the STRICT schemas (blocks, envelope, action), the positive parses
 *     below carry the new keys — reverting the field declarations makes
 *     `.strict()` reject them, so every positive test goes RED.
 *   - For the PASSTHROUGH schemas (stability band, cee error recovery), the
 *     NEGATIVE tests bite: reverting the typing makes a malformed band ride
 *     through as an untyped sibling, so every "rejects" test goes RED.
 */

import { describe, it, expect } from 'vitest';
import {
  CoachingBlockSchema,
  ReviewCardBlockSchema,
  EvidenceBlockSchema,
  ExerciseBlockSchema,
  GuidanceCategory,
  OlumiResponseSchema,
  ActionSchema,
  DecisionClassificationSchema,
  EnrichmentEdgeEValueSchema,
  EnrichmentEdgeEValueStabilitySchema,
  Stage,
} from '../../src/boundary/index.js';
import { CeeTypedErrorSchema, CeeErrorRecoverySchema } from '../../src/index.js';
import {
  maximalCoachingBlock,
  maximalReviewCardBlock,
  maximalEvidenceBlock,
  maximalExerciseBlock,
  maximalOlumiResponse,
  maximalEnrichmentEdgeEValueStability,
} from '../../src/fixtures/index.js';

// ---------------------------------------------------------------------------
// Ask 1 (UI-SEM-085) — category + priority on every guidance block
// ---------------------------------------------------------------------------

describe('guidance category + priority (0.19.0, ask 1)', () => {
  it('GuidanceCategory is exactly the four canonical values', () => {
    expect(GuidanceCategory.options).toEqual([
      'must_fix',
      'should_fix',
      'could_fix',
      'technique',
    ]);
  });

  const cases = [
    ['coaching', CoachingBlockSchema, maximalCoachingBlock],
    ['review_card', ReviewCardBlockSchema, maximalReviewCardBlock],
    ['evidence', EvidenceBlockSchema, maximalEvidenceBlock],
    ['exercise', ExerciseBlockSchema, maximalExerciseBlock],
  ] as const;

  for (const [name, schema, fixture] of cases) {
    it(`${name}: accepts category + priority (strict — this test is the revert pin)`, () => {
      const parsed = schema.safeParse(fixture);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.category).toBeDefined();
        expect(typeof parsed.data.priority).toBe('number');
      }
    });

    it(`${name}: both fields stay OPTIONAL (pre-0.19.0 payloads still parse)`, () => {
      const { category: _c, priority: _p, ...without } = fixture as Record<string, unknown>;
      expect(schema.safeParse(without).success).toBe(true);
    });

    it(`${name}: rejects a non-canonical category`, () => {
      expect(schema.safeParse({ ...fixture, category: 'urgent' }).success).toBe(false);
    });

    it(`${name}: rejects priority outside [0, 100]`, () => {
      expect(schema.safeParse({ ...fixture, priority: 101 }).success).toBe(false);
      expect(schema.safeParse({ ...fixture, priority: -1 }).success).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Asks 4 + 5 — framing_question + decision_classification on the envelope
// ---------------------------------------------------------------------------

describe('envelope framing_question + decision_classification (0.19.0, asks 4 + 5)', () => {
  it('accepts both on a full envelope (strict — revert pin)', () => {
    const parsed = OlumiResponseSchema.safeParse(maximalOlumiResponse);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.framing_question).toBeDefined();
      expect(parsed.data.decision_classification).toBeDefined();
    }
  });

  it('both stay OPTIONAL (pre-0.19.0 envelopes still parse)', () => {
    const {
      framing_question: _f,
      decision_classification: _d,
      ...without
    } = maximalOlumiResponse as Record<string, unknown>;
    expect(OlumiResponseSchema.safeParse(without).success).toBe(true);
  });

  it('rejects an empty framing_question (min 1)', () => {
    expect(
      OlumiResponseSchema.safeParse({ ...maximalOlumiResponse, framing_question: '' }).success,
    ).toBe(false);
  });

  it('rejects an over-long framing_question (max 240)', () => {
    expect(
      OlumiResponseSchema.safeParse({
        ...maximalOlumiResponse,
        framing_question: 'x'.repeat(241),
      }).success,
    ).toBe(false);
  });

  it('decision_classification: every dimension optional, partial is honest', () => {
    expect(DecisionClassificationSchema.safeParse({}).success).toBe(true);
    expect(DecisionClassificationSchema.safeParse({ stakes: 'high' }).success).toBe(true);
  });

  it('decision_classification: rejects non-canonical codes + unknown keys (strict)', () => {
    expect(DecisionClassificationSchema.safeParse({ stakes: 'huge' }).success).toBe(false);
    expect(DecisionClassificationSchema.safeParse({ reversibility: 'maybe' }).success).toBe(false);
    expect(DecisionClassificationSchema.safeParse({ risk: 'yolo' }).success).toBe(false);
    expect(DecisionClassificationSchema.safeParse({ urgency: 'high' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ask 6 (UI-SEM-020) — the canonical stage_indicator vocabulary, pinned
// ---------------------------------------------------------------------------

describe('stage_indicator canonical vocabulary (0.19.0, ask 6)', () => {
  it('is exactly frame | analyse | decide | review — consumers derive, never re-declare', () => {
    expect(Stage.options).toEqual(['frame', 'analyse', 'decide', 'review']);
  });

  it("'analyse' (British spelling) is canonical; 'analyze' is not", () => {
    expect(Stage.safeParse('analyse').success).toBe(true);
    expect(Stage.safeParse('analyze').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ask 7 — typed recovery on the CEE error envelope
// ---------------------------------------------------------------------------

describe('cee error recovery_suggestion + recovery (0.19.0, ask 7)', () => {
  const base = { error: 'CEE_INTERNAL_ERROR', message: 'boom', retryable: false };

  it('accepts the pinned flat field and the structured object', () => {
    const parsed = CeeTypedErrorSchema.safeParse({
      ...base,
      recovery_suggestion: 'Try a shorter brief.',
      recovery: { hints: ['Shorten it.'], suggestion: 'Try a shorter brief.' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // The typed field survives parse as a TYPED key, not a passthrough
      // sibling — this is the assertion that goes red if the typing reverts.
      expect(parsed.data.recovery_suggestion).toBe('Try a shorter brief.');
      expect(parsed.data.recovery?.suggestion).toBe('Try a shorter brief.');
    }
  });

  it('both stay OPTIONAL (envelopes without recovery still parse)', () => {
    expect(CeeTypedErrorSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a malformed recovery object (bites on typing revert)', () => {
    expect(
      CeeTypedErrorSchema.safeParse({ ...base, recovery: { hints: 'not-an-array', suggestion: 1 } })
        .success,
    ).toBe(false);
    expect(CeeErrorRecoverySchema.safeParse({ hints: [], suggestion: 42 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ask 8 — edge_e_values[].stability, the canonical shared band type
// ---------------------------------------------------------------------------

describe('edge_e_values[].stability (0.19.0, ask 8)', () => {
  const edgeWith = (stability: unknown) => ({
    edge_id: 'a::b',
    from_id: 'a',
    to_id: 'b',
    e_value: 1.4,
    flip_direction: 'increase',
    current_mean: 0.5,
    flip_mean: 0.7,
    stability,
  });

  it('accepts a well-formed band (positive control)', () => {
    expect(EnrichmentEdgeEValueSchema.safeParse(edgeWith(maximalEnrichmentEdgeEValueStability)).success).toBe(true);
  });

  it('accepts an absent band (nothing computed)', () => {
    const { stability: _s, ...without } = edgeWith({});
    expect(EnrichmentEdgeEValueSchema.safeParse(without).success).toBe(true);
  });

  it('accepts an n_seeds_flipped:0 band with omitted endpoints (PLoT F12 positive control)', () => {
    expect(
      EnrichmentEdgeEValueStabilitySchema.safeParse({
        n_seeds: 10,
        n_seeds_flipped: 0,
        seed_flip_means: new Array(10).fill(null),
      }).success,
    ).toBe(true);
  });

  // Every case below rode SILENTLY through the 0.18.0 passthrough parent —
  // these are the F12 malformed-band cases, now failing at the shared schema.
  const valid = maximalEnrichmentEdgeEValueStability;
  const malformed: Array<[string, Record<string, unknown>]> = [
    ['reversed band (band_min > band_max)', { ...valid, band_min: 0.9, band_max: 0.1 }],
    ['median outside [min, max]', { ...valid, band_median: 0.95 }],
    ['negative count', { ...valid, n_seeds: -1 }],
    ['non-integer count', { ...valid, n_seeds: 10.5 }],
    [
      'n_seeds_flipped > n_seeds',
      { ...valid, n_seeds: 3, n_seeds_flipped: 5, seed_flip_means: [0.2, 0.5, 0.8] },
    ],
    ['seed_flip_means length mismatch', { ...valid, seed_flip_means: [0.2, 0.5] }],
    ['negative band_width', { ...valid, band_width: -0.1 }],
    ['non-finite endpoint', { ...valid, band_median: Number.NaN }],
    ['missing counts', { band_min: 0.2, band_median: 0.5, band_max: 0.8 }],
  ];

  for (const [name, band] of malformed) {
    it(`rejects: ${name}`, () => {
      expect(EnrichmentEdgeEValueStabilitySchema.safeParse(band).success).toBe(false);
      expect(EnrichmentEdgeEValueSchema.safeParse(edgeWith(band)).success).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Ask 20 — Action.detail (short label + full text behind it)
// ---------------------------------------------------------------------------

describe('Action.detail (0.19.0, ask 20)', () => {
  const base = { id: 'a1', label: 'Apply this change', message: 'Yes, apply it.' };

  it('accepts detail (strict — revert pin)', () => {
    const parsed = ActionSchema.safeParse({
      ...base,
      detail: "Remove the link from 'A' to 'B' and add option 'C'.",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.detail).toBeDefined();
  });

  it('stays OPTIONAL (pre-0.19.0 actions still parse)', () => {
    expect(ActionSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty detail (min 1 — absence is omission, never "")', () => {
    expect(ActionSchema.safeParse({ ...base, detail: '' }).success).toBe(false);
  });
});

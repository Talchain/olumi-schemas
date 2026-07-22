/**
 * 0.20.0 — the four schemas-blocked items of 2026-07-20:
 *   1. `analysis_readiness` joins ActionType (chip intent — the meta-decision
 *      intake fix, META-DECISION-DIAGNOSIS-2026-07-20 §5 P0 / INTAKE-FIX F1).
 *   2. `signal_code` on every guidance block (ROADMAP 1.120, UI-SEM-085).
 *   3. `signal` short per-item line on every guidance block (same residual).
 *   4. `framing_quality` on the envelope (ROADMAP 1.120, UI-SEM-079).
 *
 * Mutation-check property of this file (why these tests bite on revert):
 *   - The enum pin is exact (`toEqual` on `.options`): reverting the addition
 *     OR removing any of the nine pre-existing values goes RED — removal
 *     would be a BREAKING change, and the pin is what says so.
 *   - For the STRICT schemas (blocks, envelope), the positive parses carry
 *     the new keys — reverting the field declarations makes `.strict()`
 *     reject them, so every positive test goes RED.
 */

import { describe, it, expect } from 'vitest';
import {
  ActionType,
  ActionSchema,
  OrchestratorTurnPayloadSchema,
  CoachingBlockSchema,
  ReviewCardBlockSchema,
  EvidenceBlockSchema,
  ExerciseBlockSchema,
  OlumiResponseSchema,
  FramingQuality,
} from '../../src/boundary/index.js';
import {
  maximalCoachingBlock,
  maximalReviewCardBlock,
  maximalEvidenceBlock,
  maximalExerciseBlock,
  maximalOlumiResponse,
} from '../../src/fixtures/index.js';

// ---------------------------------------------------------------------------
// Item 1 — `analysis_readiness` joins ActionType
// ---------------------------------------------------------------------------

describe('ActionType analysis_readiness (0.20.0, item 1)', () => {
  it('the enum is exactly the nine pre-0.20.0 values plus analysis_readiness and (0.21.0) what_changed (removal = breaking)', () => {
    // 0.21.0 (F2 CHANGE B) appended `what_changed` — additive. This exact-set
    // pin is the mirror that says removing any value is a BREAKING change; a
    // new additive value is expected to update this list in lockstep with the
    // enum (that lockstep is the point — an unlisted addition goes RED here).
    expect(ActionType.options).toEqual([
      'run_analysis',
      'set_factor_value',
      'add_constraint',
      'adjust_edge_strength',
      'explain_result',
      'explain_results',
      'explain_from_structure',
      'compare_options',
      'what_would_flip',
      'analysis_readiness',
      'what_changed',
    ]);
  });

  it('parses the new literal and still rejects unknowns', () => {
    expect(ActionType.parse('analysis_readiness')).toBe('analysis_readiness');
    expect(ActionType.safeParse('analysis_ready').success).toBe(false);
    expect(ActionType.safeParse('prepare_analysis').success).toBe(false);
    expect(ActionType.safeParse('').success).toBe(false);
  });

  it('chip.action_type accepts it on the turn-payload ingress (the seam that 422d)', () => {
    // This is the exact wire shape CEE's B1 validates fail-closed — the
    // reason the readiness routing arm could not be built until this value
    // existed (INTAKE-FIX-LANE-2026-07-20 F1).
    const payload = {
      kind: 'message' as const,
      turn_id: '11111111-1111-4111-8111-111111111111',
      scenario_id: '22222222-2222-4222-8222-222222222222',
      stage: 'frame' as const,
      message: 'What should I check before running the first analysis?',
      turn_class: 'frame' as const,
      source: 'chip_click' as const,
      chip: { action_type: 'analysis_readiness' as const },
    };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('ActionSchema.action_type accepts it (suggested-action linkage)', () => {
    expect(
      ActionSchema.safeParse({
        id: 'a1',
        label: 'Prepare first analysis',
        message: 'What should I check before running the first analysis?',
        action_type: 'analysis_readiness',
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Items 2 + 3 — signal_code + signal on every guidance block
// ---------------------------------------------------------------------------

describe('guidance signal_code + signal (0.20.0, items 2 + 3)', () => {
  const cases = [
    ['coaching', CoachingBlockSchema, maximalCoachingBlock],
    ['review_card', ReviewCardBlockSchema, maximalReviewCardBlock],
    ['evidence', EvidenceBlockSchema, maximalEvidenceBlock],
    ['exercise', ExerciseBlockSchema, maximalExerciseBlock],
  ] as const;

  for (const [name, schema, fixture] of cases) {
    it(`${name}: accepts signal_code + signal (strict — this test is the revert pin)`, () => {
      const parsed = schema.safeParse(fixture);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.signal_code).toBeDefined();
        expect(parsed.data.signal).toBeDefined();
      }
    });

    it(`${name}: both fields stay OPTIONAL (pre-0.20.0 payloads still parse)`, () => {
      const { signal_code: _c, signal: _s, ...without } = fixture as Record<string, unknown>;
      expect(schema.safeParse(without).success).toBe(true);
    });

    it(`${name}: signal_code and signal_id are DISTINCT fields (class vs dedupe identity)`, () => {
      // Guards the exact UI-SEM-085 confusion: the UI substituted block.type
      // for signal_code. The two fields coexist and neither implies the other.
      const parsed = schema.safeParse(fixture);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.signal_id).toBeDefined();
        expect(parsed.data.signal_code).not.toBe(parsed.data.signal_id);
      }
    });

    it(`${name}: rejects an empty signal_code (min 1 — absence is omission, never "")`, () => {
      expect(schema.safeParse({ ...fixture, signal_code: '' }).success).toBe(false);
    });

    it(`${name}: rejects an empty or over-long signal (1–140, a caption not a narrative)`, () => {
      expect(schema.safeParse({ ...fixture, signal: '' }).success).toBe(false);
      expect(schema.safeParse({ ...fixture, signal: 'x'.repeat(141) }).success).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Item 4 — framing_quality on the envelope
// ---------------------------------------------------------------------------

describe('envelope framing_quality (0.20.0, item 4)', () => {
  it('FramingQuality is exactly ready | thin | conflict', () => {
    expect(FramingQuality.options).toEqual(['ready', 'thin', 'conflict']);
  });

  it('accepts it on a full envelope (strict — revert pin)', () => {
    const parsed = OlumiResponseSchema.safeParse(maximalOlumiResponse);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.framing_quality).toBe('ready');
    }
  });

  it('accepts every canonical member', () => {
    for (const value of ['ready', 'thin', 'conflict'] as const) {
      expect(
        OlumiResponseSchema.safeParse({ ...maximalOlumiResponse, framing_quality: value })
          .success,
      ).toBe(true);
    }
  });

  it('stays OPTIONAL (pre-0.20.0 envelopes still parse)', () => {
    const { framing_quality: _f, ...without } = maximalOlumiResponse as Record<string, unknown>;
    expect(OlumiResponseSchema.safeParse(without).success).toBe(true);
  });

  it("rejects 'blocked' — the UI's retired heuristic state is NOT producer vocabulary", () => {
    expect(
      OlumiResponseSchema.safeParse({ ...maximalOlumiResponse, framing_quality: 'blocked' })
        .success,
    ).toBe(false);
  });

  it('rejects unknown and empty values', () => {
    expect(
      OlumiResponseSchema.safeParse({ ...maximalOlumiResponse, framing_quality: 'great' })
        .success,
    ).toBe(false);
    expect(
      OlumiResponseSchema.safeParse({ ...maximalOlumiResponse, framing_quality: '' }).success,
    ).toBe(false);
  });
});

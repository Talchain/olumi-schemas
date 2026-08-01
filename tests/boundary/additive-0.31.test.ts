/**
 * 0.31.0 — the five additive changes, pinned.
 *
 * Every field below is OPTIONAL and every one of them exists because a
 * consumer was guessing at something a producer already knew. The tests are
 * therefore shaped around three questions, not one:
 *
 *   1. does ABSENCE still parse (the additive guarantee — no producer breaks
 *      on the day this ships),
 *   2. does a BAD value fail (the field is a real constraint, not decoration),
 *   3. does absence stay ABSENT after parsing (no `.default()` crept in — the
 *      absence-semantics census's single most valuable catch, because a
 *      default makes absence permanently unobservable while every other test
 *      keeps passing).
 *
 * Question 3 is the one that is easy to omit and expensive to lose.
 */

import { describe, it, expect } from 'vitest';
import {
  NodeV3Schema,
  ObservedStateSchema,
  GoalThresholdFrame,
  DeclaredScale,
  DECLARED_SCALE_BOUNDS,
} from '../../src/graph.js';
import { CoachingBlockSchema } from '../../src/boundary/blocks.js';
import {
  EnrichmentFlipThresholdSchema,
  EnrichmentCritiqueSchema,
  CEE_UI_ENRICHMENT_KEEP_LIST,
} from '../../src/boundary/enrichment.js';

// ---------------------------------------------------------------------------
// Shared minimal valid instances. Deliberately MINIMAL, not maximal: a
// maximal fixture would carry every new field and could not demonstrate that
// absence parses.
// ---------------------------------------------------------------------------

const baseNode = {
  id: 'factor_demand',
  kind: 'factor',
  label: 'Market demand',
} as const;

const baseCoachingBlock = {
  block_id: '55555555-5555-4555-8555-555555555555',
  signal_id: 'signal_1',
  created_at: '2026-08-01T00:00:00.000Z',
  source_handler: 'coaching_pass',
  freshness: 'fresh',
  type: 'coaching',
  coaching_kind: 'bias_signal',
  title: 'A coaching title',
  body: 'A coaching body.',
  source: 'decision_review',
  target_refs: [],
  priority_rank: 1,
} as const;

const baseFlipRow = {
  factor_id: 'factor_demand',
  factor_label: 'Market demand',
  current_value: 55,
  flip_value: null,
  flip_reason: 'no_effect_within_bounds',
} as const;

// ===========================================================================
// 1. goal_threshold_frame — ROADMAP 2.258
// ===========================================================================

describe('0.31.0 · NodeV3Schema.goal_threshold_frame (ROADMAP 2.258)', () => {
  it('ABSENCE parses — every pre-0.31.0 node is still valid', () => {
    const parsed = NodeV3Schema.parse({ ...baseNode, goal_threshold: 0.8 });
    expect(parsed.goal_threshold).toBe(0.8);
  });

  it('absence stays ABSENT after parsing (no default fabricates a frame)', () => {
    // If this ever gains a `.default()`, a consumer can no longer tell "CEE
    // attested LEVEL" from "nobody said" — and the fail-closed rule this
    // field exists to enable becomes unimplementable.
    const parsed = NodeV3Schema.parse({ ...baseNode, goal_threshold: 0.8 });
    expect(Object.prototype.hasOwnProperty.call(parsed, 'goal_threshold_frame')).toBe(false);
    expect(parsed.goal_threshold_frame).toBeUndefined();
  });

  it.each(['level', 'delta'] as const)('accepts %s and preserves it', (frame) => {
    const parsed = NodeV3Schema.parse({
      ...baseNode,
      goal_threshold: 0.8,
      goal_threshold_frame: frame,
    });
    expect(parsed.goal_threshold_frame).toBe(frame);
  });

  it('REJECTS an off-vocabulary frame — the whole point is that a mismatch is loud', () => {
    // 'absolute' is the kind of plausible synonym a producer might invent.
    // The node schema is .passthrough(), so this proves the DECLARED key is
    // genuinely validated rather than waved through as an unknown key.
    const bad = NodeV3Schema.safeParse({
      ...baseNode,
      goal_threshold: 0.8,
      goal_threshold_frame: 'absolute',
    });
    expect(bad.success).toBe(false);
  });

  it('an UNDECLARED sibling key still passes through (2.215 provenance stays additive)', () => {
    // The design commits to carrying provenance as a future SIBLING key
    // rather than by widening this field into an object. That promise is only
    // worth anything if the node really is open to new keys.
    const parsed = NodeV3Schema.parse({
      ...baseNode,
      goal_threshold: 0.8,
      goal_threshold_frame: 'level',
      goal_threshold_frame_provenance: 'code_constant',
    });
    expect((parsed as Record<string, unknown>).goal_threshold_frame_provenance)
      .toBe('code_constant');
  });

  it('the vocabulary is exactly level|delta', () => {
    expect([...GoalThresholdFrame.options].sort()).toEqual(['delta', 'level']);
  });

  it('is a DECLARED key on the schema, not an unknown key riding passthrough', () => {
    // NodeV3Schema is .passthrough(), so an object carrying
    // `goal_threshold_frame: 'level'` parses and preserves the value EVEN IF
    // the field were never declared. That makes every positive assertion
    // above mutation-blind on its own: delete the field from the schema and
    // they all still pass. This structural check and the rejection test are
    // the only two things that can tell "declared and validated" from
    // "unknown key waved through".
    expect(Object.keys(NodeV3Schema._def.shape())).toContain('goal_threshold_frame');
  });
});

// ===========================================================================
// 2. declared_scale — ROADMAP 2.193
// ===========================================================================

describe('0.31.0 · ObservedStateSchema.declared_scale (ROADMAP 2.193)', () => {
  it('ABSENCE parses — every stored graph predates this field', () => {
    const parsed = ObservedStateSchema.parse({ value: 42.5 });
    expect(parsed.value).toBe(42.5);
  });

  it('absence stays ABSENT after parsing (no default guesses a scale)', () => {
    // A `.default('unit_interval')` here would be the exact unsound guess the
    // #766 review proved cannot be made — applied by the validator, invisibly,
    // to every pre-existing graph.
    const parsed = ObservedStateSchema.parse({ value: 42.5 });
    expect(Object.prototype.hasOwnProperty.call(parsed, 'declared_scale')).toBe(false);
  });

  it.each(['unit_interval', 'ratio', 'raw_count'] as const)(
    'accepts %s and preserves it',
    (scale) => {
      const parsed = ObservedStateSchema.parse({ value: 0.5, declared_scale: scale });
      expect(parsed.declared_scale).toBe(scale);
    },
  );

  it('REJECTS an off-vocabulary scale', () => {
    const bad = ObservedStateSchema.safeParse({ value: 0.5, declared_scale: 'percentage' });
    expect(bad.success).toBe(false);
  });

  it('is a DECLARED key on the schema, not an unknown key riding passthrough', () => {
    // Same reasoning as goal_threshold_frame: ObservedStateSchema is
    // .passthrough(), so only this check and the rejection test discriminate.
    expect(Object.keys(ObservedStateSchema._def.shape())).toContain('declared_scale');
  });

  it('does NOT enforce the bound itself — declaring the scale is not validating the value', () => {
    // 1.5 on a declared unit_interval is the live ROADMAP 2.159 defect, and
    // it still parses HERE by design: the contract's job is to carry the
    // declaration, and the AUTHORITY that refuses the value is CEE's. Pinned
    // so nobody reads this release as having closed 2.159 at the schema.
    const parsed = ObservedStateSchema.parse({ value: 1.5, declared_scale: 'unit_interval' });
    expect(parsed.value).toBe(1.5);
  });
});

describe('0.31.0 · DECLARED_SCALE_BOUNDS is DERIVED from the vocabulary', () => {
  it('is TOTAL over the enum — no member can lack a bound', () => {
    // This is the anti-mirror pin. The bounds table and the enum are two
    // hand-written lists; the day someone adds a scale member and forgets the
    // bound, a consumer deriving a min/max hint would silently get
    // `undefined` and fall back to no bound at all. Total-and-injective in
    // both directions, the same shape the population registry's wire_labels
    // rule uses.
    expect(Object.keys(DECLARED_SCALE_BOUNDS).sort())
      .toEqual([...DeclaredScale.options].sort());
  });

  it('unit_interval is the only bounded-above scale', () => {
    expect(DECLARED_SCALE_BOUNDS.unit_interval).toEqual({ min: 0, max: 1 });
    expect(DECLARED_SCALE_BOUNDS.ratio.max).toBeNull();
    expect(DECLARED_SCALE_BOUNDS.raw_count.max).toBeNull();
  });

  it('null means UNBOUNDED, and is distinguishable from a missing entry', () => {
    // `null` and `undefined` must not be conflated: null is "no bound exists
    // on this side", undefined would be "this table forgot you". Checked on
    // BOTH ends — `min` is nullable in the type even though no member uses it
    // today, so a future unbounded-below scale needs no breaking change.
    for (const scale of DeclaredScale.options) {
      expect(DECLARED_SCALE_BOUNDS[scale]).toBeDefined();
      expect(DECLARED_SCALE_BOUNDS[scale].max).not.toBeUndefined();
      expect(DECLARED_SCALE_BOUNDS[scale].min).not.toBeUndefined();
    }
  });

  it('every member asserts the MULTIPLIER convention — min 0, including ratio', () => {
    // The nullable `min` type does not weaken the claim the VALUES make: this
    // table says every declared scale is non-negative, which for `ratio`
    // presupposes the multiplier convention (1.0 = parity) rather than signed
    // returns. Pinned so a producer emitting -0.2 as a `ratio` is a contract
    // violation someone can point at, not an ambiguity.
    for (const scale of DeclaredScale.options) {
      expect(DECLARED_SCALE_BOUNDS[scale].min).toBe(0);
    }
  });
});

// ===========================================================================
// 3. action_prompt — ROADMAP 2.225
// ===========================================================================

describe('0.31.0 · CoachingBlockSchema.action_prompt (ROADMAP 2.225)', () => {
  it('ABSENCE parses — today s coaching blocks are unchanged', () => {
    const parsed = CoachingBlockSchema.parse(baseCoachingBlock);
    expect(parsed.type).toBe('coaching');
  });

  it('absence stays ABSENT after parsing (no default invents a turn)', () => {
    // A default here would be the composed-fallback failure mode written into
    // the contract itself.
    const parsed = CoachingBlockSchema.parse(baseCoachingBlock);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'action_prompt')).toBe(false);
  });

  it('carries the producer text VERBATIM', () => {
    const prompt = 'Help me add a second option to weigh against this one.';
    const parsed = CoachingBlockSchema.parse({ ...baseCoachingBlock, action_prompt: prompt });
    expect(parsed.action_prompt).toBe(prompt);
  });

  it('REJECTS an empty prompt — a chip that sends nothing is worse than no chip', () => {
    const bad = CoachingBlockSchema.safeParse({ ...baseCoachingBlock, action_prompt: '' });
    expect(bad.success).toBe(false);
  });

  it('REJECTS a prompt over the 300-char bound, and accepts one exactly at it', () => {
    const atBound = 'x'.repeat(300);
    expect(
      CoachingBlockSchema.safeParse({ ...baseCoachingBlock, action_prompt: atBound }).success,
    ).toBe(true);
    expect(
      CoachingBlockSchema.safeParse({
        ...baseCoachingBlock,
        action_prompt: 'x'.repeat(301),
      }).success,
    ).toBe(false);
  });

  it('the block stays .strict() — a misspelled key cannot ride along', () => {
    // Positive control for the assertions above: they only mean something
    // because unknown keys are rejected here. If this block were passthrough,
    // `action_promt: '...'` would "work" and nobody would notice.
    const bad = CoachingBlockSchema.safeParse({
      ...baseCoachingBlock,
      action_promt: 'typo',
    });
    expect(bad.success).toBe(false);
  });
});

// ===========================================================================
// 4/5. flip-threshold row — no_flip_in_range + the direction relaxation
// ===========================================================================

describe('0.31.0 · EnrichmentFlipThresholdSchema.direction is now OPTIONAL (PLoT #300)', () => {
  it('a row with NO direction parses — this is the relaxation, and it RED-ed before 0.31.0', () => {
    // On 0.30.0 `direction` was `z.string()` (required), so this exact object
    // failed to parse. That is why PLoT #300 must emit a 'none' placeholder.
    const parsed = EnrichmentFlipThresholdSchema.parse(baseFlipRow);
    expect(parsed.factor_id).toBe('factor_demand');
    expect(parsed.direction).toBeUndefined();
  });

  it('the `none` PLACEHOLDER still parses — no producer breaks on release day', () => {
    // The deprecation is consumer-paced. If this ever fails, the placeholder
    // was retired unilaterally and PLoT would start failing validation.
    const parsed = EnrichmentFlipThresholdSchema.parse({ ...baseFlipRow, direction: 'none' });
    expect(parsed.direction).toBe('none');
  });

  it('a real direction is unaffected', () => {
    const parsed = EnrichmentFlipThresholdSchema.parse({
      ...baseFlipRow,
      flip_value: 48.2,
      direction: 'decrease',
    });
    expect(parsed.direction).toBe('decrease');
  });

  it('direction remains a STRING when present — the vocabulary stays producer-owned', () => {
    const bad = EnrichmentFlipThresholdSchema.safeParse({ ...baseFlipRow, direction: 3 });
    expect(bad.success).toBe(false);
  });
});

describe('0.31.0 · EnrichmentFlipThresholdSchema.no_flip_in_range (ROADMAP 2.228)', () => {
  it('ABSENCE parses and stays ABSENT (absence means NOT ATTESTED, not false)', () => {
    const parsed = EnrichmentFlipThresholdSchema.parse(baseFlipRow);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'no_flip_in_range')).toBe(false);
    // The tri-state is the whole design: if a `.default(false)` ever lands,
    // "the producer has not re-vendored" becomes indistinguishable from "the
    // producer attested there IS a flip", and a consumer reading `!== true`
    // would start asserting flips that were never computed.
    expect(parsed.no_flip_in_range).toBeUndefined();
  });

  it.each([true, false])('accepts %s and preserves it', (value) => {
    const parsed = EnrichmentFlipThresholdSchema.parse({
      ...baseFlipRow,
      no_flip_in_range: value,
    });
    expect(parsed.no_flip_in_range).toBe(value);
  });

  it('is a DECLARED key on the schema, not an unknown key riding passthrough', () => {
    // EnrichmentFlipThresholdSchema is .passthrough() too.
    expect(Object.keys(EnrichmentFlipThresholdSchema._def.shape()))
      .toContain('no_flip_in_range');
  });

  it('REJECTS a non-boolean — no string sentinels sneaking back in', () => {
    // The field exists to END string-matching. A truthy string here would
    // reintroduce exactly the open vocabulary it replaces.
    expect(
      EnrichmentFlipThresholdSchema.safeParse({ ...baseFlipRow, no_flip_in_range: 'yes' }).success,
    ).toBe(false);
  });

  it('flip_reason stays OPEN — the boolean replaces MATCHING it, not the field', () => {
    // 2.228 added a new token to this vocabulary. The boolean is what lets
    // consumers stop tracking it; the string itself stays human-readable and
    // unconstrained, which is why it must NOT have been narrowed to an enum.
    const parsed = EnrichmentFlipThresholdSchema.parse({
      ...baseFlipRow,
      flip_reason: 'a_token_no_consumer_has_ever_seen',
      no_flip_in_range: true,
    });
    expect(parsed.flip_reason).toBe('a_token_no_consumer_has_ever_seen');
  });
});

// ===========================================================================
// 2b. critiques transport — the keep-list entry (M3 step 1)
// ===========================================================================

describe('0.31.0 · critiques joins the CEE→UI keep-list (M3 step 1)', () => {
  it('is keep-listed', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toContain('critiques');
  });

  it('the SHAPE was already typed before 0.31.0 — only the projection changed', () => {
    // Stated as a test so the CHANGELOG claim is checkable: this release adds
    // NO critique field. If someone later "completes" the typing here, this
    // pin is where the scope creep surfaces.
    //
    // ⚠ The first version of this test asserted `CEE_UI_ENRICHMENT_KEEP_LIST`
    // contained 'critiques' — a duplicate of the test directly above, and
    // VACUOUS as a guard on the shape, because the keep-list cannot change
    // when a field is added to the critique object. It could never have fired
    // for the reason it named. Pinning the actual shape instead.
    expect(Object.keys(EnrichmentCritiqueSchema._def.shape()).sort()).toEqual([
      'affected_node_ids',
      'affected_option_ids',
      'blocks_analysis',
      'code',
      'id',
      'message',
      'severity',
      'source',
      'suggestion',
      'user_message',
    ]);
  });

  it('carries BOTH message and user_message — the projection duty is real', () => {
    // The two exist so a producer can keep internal wording separate from
    // display-safe copy. This pin is what makes "CEE must project, not
    // forward whole" a checkable statement rather than a comment: if
    // `message` ever disappeared, the duty would silently evaporate.
    const shape = EnrichmentCritiqueSchema._def.shape();
    expect(shape.message).toBeDefined();
    expect(shape.user_message).toBeDefined();
  });
});

/**
 * Phase 3A — Analysis tab data contract v1.3 block schemas.
 *
 * Tests validate the four new block types (ReviewCardBlock,
 * CoachingBlock, EvidenceBlock, ExerciseBlock) and the shared schemas
 * (ActionIntent, TargetRefKind, TargetRefSchema, Phase3BlockFreshness,
 * Phase3BlockSeverity) against the frozen v1.3 contract committed at
 * `Docs/v5/v5-analysis-tab-data-contract-v1_3.md` in the CEE repo
 * (PR #177).
 *
 * Coverage:
 *   - valid happy-path fixtures for each block
 *   - invalid shapes per required field
 *   - strict-mode rejection of unknown fields
 *   - copy-length enforcement (title=80, body=300, action_label=40)
 *   - union exhaustiveness for ActionIntent, TargetRefKind, Phase3BlockFreshness,
 *     Phase3BlockSeverity, card_kind, coaching_kind, exercise_kind
 *   - discriminated-union routing via BlockSchema
 *   - existing FactBlock/GraphPatchBlock untouched (Phase 3 metadata not applied)
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  ActionIntent,
  TargetRefKind,
  TargetRefSchema,
  Phase3BlockFreshness,
  Phase3BlockSeverity,
  ReviewCardBlockSchema,
  CoachingBlockSchema,
  EvidenceBlockSchema,
  ExerciseBlockSchema,
  BlockSchema,
  GraphPatchBlockSchema,
} from '../../src/boundary/blocks.js';

// ============================================================================
// Shared schema fixtures + helpers
// ============================================================================

const VALID_TARGET_REF = {
  id: 'fac_delivery_risk',
  label: 'Delivery risk',
  kind: 'factor' as const,
};

function validCommonMetadata(overrides: Partial<{
  block_id: string;
  signal_id: string;
  created_at: string;
  source_handler: string;
  graph_hash_at_generation: string;
  freshness: 'fresh' | 'stale' | 'pending' | 'failed';
}> = {}) {
  // block_id must be a real UUID (contract §0 + review correction).
  // created_at must be ISO 8601 with timezone offset.
  return {
    block_id: randomUUID(),
    signal_id: 'sig_review_001',
    created_at: '2026-05-15T16:00:00.000Z',
    source_handler: 'decision_review',
    graph_hash_at_generation: 'gh_abcd1234ef56',
    freshness: 'fresh' as const,
    ...overrides,
  };
}

const VALID_REVIEW_CARD = {
  ...validCommonMetadata(),
  type: 'review_card' as const,
  card_kind: 'narrative' as const,
  title: 'Leading option holds under most plausible scenarios',
  body: 'Hiring two senior engineers locally remains ahead across the scenarios that flipped the result last time. The analysis is robust.',
  severity: 'info' as const,
  target_refs: [VALID_TARGET_REF],
  priority_rank: 1,
};

const VALID_COACHING = {
  ...validCommonMetadata({ source_handler: 'draft_graph' }),
  type: 'coaching' as const,
  coaching_kind: 'widening' as const,
  title: 'Consider an alternative staffing option',
  body: 'Your model has two options. Adding a contingency hire path could surface trade-offs you have not yet weighed.',
  source: 'draft_graph' as const,
  target_refs: [{ id: 'opt_hire_locally', label: 'Hire locally', kind: 'option' as const }],
  priority_rank: 2,
};

const VALID_EVIDENCE = {
  ...validCommonMetadata({ source_handler: 'rank_evidence_sources' }),
  type: 'evidence' as const,
  factor_label: 'Delivery risk',
  factor_ref: { id: 'fac_delivery_risk', label: 'Delivery risk', kind: 'factor' as const },
  target_refs: [VALID_TARGET_REF],
  current_confidence: 'low' as const,
  evidence_gap: 'Historical on-time delivery data for the team is missing.',
  suggested_technique: 'Pull on-time delivery rate from the last two release cycles.',
  impact_if_gathered: 'Would lift confidence in the leading option by an estimated band.',
  priority_rank: 1,
  severity: 'warning' as const,
};

const VALID_EXERCISE = {
  ...validCommonMetadata({
    source_handler: 'run_exercise',
    graph_hash_at_generation: undefined,
  }),
  type: 'exercise' as const,
  exercise_kind: 'pre_mortem' as const,
  failure_scenario: 'The team mis-estimated delivery risk because they anchored on the last release.',
  warning_signs: [
    'Velocity drops below baseline two sprints in a row.',
    'Senior engineer departs before the launch milestone.',
  ],
  mitigation: 'Set up weekly delivery-risk reviews with the team lead.',
  target_refs: [VALID_TARGET_REF],
};

// ============================================================================
// §0.4 — ActionIntent strict union
// ============================================================================

describe('ActionIntent (§0.4)', () => {
  const VALID_INTENTS = [
    'explain_driver',
    'explain_result',
    'what_would_flip',
    'rerun_analysis',
    'gather_evidence',
    'create_decision_brief',
    'add_option',
    'add_risk',
    'confirm_factor',
    'edit_factor',
    'compare_options',
    'run_pre_mortem',
    'run_outside_view',
    'run_devils_advocacy',
    'start_guided_chat',
  ];

  it.each(VALID_INTENTS)('accepts canonical intent: %s', (intent) => {
    expect(ActionIntent.safeParse(intent).success).toBe(true);
  });

  it('exposes exactly 15 canonical intents', () => {
    expect(ActionIntent.options).toHaveLength(15);
  });

  it('rejects freeform strings', () => {
    expect(ActionIntent.safeParse('explain_the_thing').success).toBe(false);
    expect(ActionIntent.safeParse('').success).toBe(false);
  });

  it('rejects renamed variants (action_intent is singular per v1.3 — no plural form)', () => {
    expect(ActionIntent.safeParse('explain_drivers').success).toBe(false);
    expect(ActionIntent.safeParse('compare_option').success).toBe(false);
  });
});

// ============================================================================
// §0.1 — TargetRefSchema + TargetRefKind
// ============================================================================

describe('TargetRefKind (§0.1)', () => {
  const VALID_KINDS = [
    'factor',
    'option',
    'edge',
    'goal',
    'risk',
    'constraint',
    'outcome',
  ];

  it.each(VALID_KINDS)('accepts canonical kind: %s', (kind) => {
    expect(TargetRefKind.safeParse(kind).success).toBe(true);
  });

  it('exposes exactly 7 kinds (v1.3 added `outcome`)', () => {
    expect(TargetRefKind.options).toHaveLength(7);
    expect(TargetRefKind.options).toContain('outcome');
  });

  it('rejects unknown kinds and string escape hatches', () => {
    expect(TargetRefKind.safeParse('node').success).toBe(false);
    expect(TargetRefKind.safeParse('any_string').success).toBe(false);
  });
});

describe('TargetRefSchema (§0.1)', () => {
  it('accepts a valid {id, label, kind} ref', () => {
    expect(TargetRefSchema.safeParse(VALID_TARGET_REF).success).toBe(true);
  });

  it('requires non-empty id and label', () => {
    expect(TargetRefSchema.safeParse({ id: '', label: 'x', kind: 'factor' }).success).toBe(false);
    expect(TargetRefSchema.safeParse({ id: 'x', label: '', kind: 'factor' }).success).toBe(false);
  });

  it('rejects unknown kind', () => {
    expect(TargetRefSchema.safeParse({ id: 'x', label: 'X', kind: 'node' }).success).toBe(false);
  });

  it('rejects extra fields (.strict)', () => {
    expect(
      TargetRefSchema.safeParse({ ...VALID_TARGET_REF, extra: 'nope' }).success,
    ).toBe(false);
  });
});

// ============================================================================
// §0 — Common freshness + severity unions
// ============================================================================

describe('Phase3BlockFreshness (§0)', () => {
  it.each(['fresh', 'stale', 'pending', 'failed'])('accepts: %s', (v) => {
    expect(Phase3BlockFreshness.safeParse(v).success).toBe(true);
  });

  it('rejects analysis-ready freshness values that do NOT appear in §0', () => {
    // The analysis-ready freshness on `analysis_ready` uses
    // 'unknown' | 'none' — Phase 3 blocks must NOT use those.
    expect(Phase3BlockFreshness.safeParse('unknown').success).toBe(false);
    expect(Phase3BlockFreshness.safeParse('none').success).toBe(false);
  });

  it('exposes exactly 4 values', () => {
    expect(Phase3BlockFreshness.options).toHaveLength(4);
  });
});

describe('Phase3BlockSeverity (§1.1 / §1.3)', () => {
  it.each(['info', 'warning', 'critical'])('accepts: %s', (v) => {
    expect(Phase3BlockSeverity.safeParse(v).success).toBe(true);
  });

  it('rejects the existing system Severity values that do NOT match Phase 3 product tier', () => {
    // The existing boundary Severity is 'info' | 'warn' | 'error' for
    // ErrorBlock / system telemetry. Phase 3 blocks use 'warning' and
    // 'critical' — distinct values.
    expect(Phase3BlockSeverity.safeParse('warn').success).toBe(false);
    expect(Phase3BlockSeverity.safeParse('error').success).toBe(false);
  });
});

// ============================================================================
// §1.1 — ReviewCardBlockSchema
// ============================================================================

describe('ReviewCardBlockSchema (§1.1)', () => {
  it('accepts a fully populated valid review card', () => {
    expect(ReviewCardBlockSchema.safeParse(VALID_REVIEW_CARD).success).toBe(true);
  });

  it('accepts when optional action_intent + action_label are present', () => {
    const withAction = {
      ...VALID_REVIEW_CARD,
      action_intent: 'explain_result' as const,
      action_label: 'Walk me through it',
    };
    expect(ReviewCardBlockSchema.safeParse(withAction).success).toBe(true);
  });

  it.each(['narrative', 'bias', 'flip_threshold', 'evidence_priority', 'pre_mortem', 'assumption', 'robustness', 'scenario_context'])(
    'accepts card_kind = %s',
    (card_kind) => {
      expect(
        ReviewCardBlockSchema.safeParse({ ...VALID_REVIEW_CARD, card_kind }).success,
      ).toBe(true);
    },
  );

  it('rejects unknown card_kind', () => {
    expect(
      ReviewCardBlockSchema.safeParse({ ...VALID_REVIEW_CARD, card_kind: 'sensitivity_priority' }).success,
    ).toBe(false);
  });

  it('requires graph_hash_at_generation (analysis-derived block per §0)', () => {
    const { graph_hash_at_generation: _omit, ...withoutHash } = VALID_REVIEW_CARD;
    void _omit;
    expect(ReviewCardBlockSchema.safeParse(withoutHash).success).toBe(false);
  });

  it('requires signal_id', () => {
    const { signal_id: _omit, ...withoutSignal } = VALID_REVIEW_CARD;
    void _omit;
    expect(ReviewCardBlockSchema.safeParse(withoutSignal).success).toBe(false);
  });

  it('requires priority_rank (hero-eligible per §1.1)', () => {
    const { priority_rank: _omit, ...withoutRank } = VALID_REVIEW_CARD;
    void _omit;
    expect(ReviewCardBlockSchema.safeParse(withoutRank).success).toBe(false);
  });

  it('requires priority_rank to be numeric (not a string per v1.3)', () => {
    expect(
      ReviewCardBlockSchema.safeParse({
        ...VALID_REVIEW_CARD,
        priority_rank: 'high' as unknown as number,
      }).success,
    ).toBe(false);
  });

  it('enforces title max length 80 (§0.2)', () => {
    const tooLong = {
      ...VALID_REVIEW_CARD,
      title: 'a'.repeat(81),
    };
    expect(ReviewCardBlockSchema.safeParse(tooLong).success).toBe(false);
    const exact = { ...VALID_REVIEW_CARD, title: 'a'.repeat(80) };
    expect(ReviewCardBlockSchema.safeParse(exact).success).toBe(true);
  });

  it('enforces body max length 300 (§0.2)', () => {
    const tooLong = { ...VALID_REVIEW_CARD, body: 'a'.repeat(301) };
    expect(ReviewCardBlockSchema.safeParse(tooLong).success).toBe(false);
    const exact = { ...VALID_REVIEW_CARD, body: 'a'.repeat(300) };
    expect(ReviewCardBlockSchema.safeParse(exact).success).toBe(true);
  });

  it('enforces action_label max length 40 (§0.2)', () => {
    const tooLong = {
      ...VALID_REVIEW_CARD,
      action_intent: 'explain_result' as const,
      action_label: 'a'.repeat(41),
    };
    expect(ReviewCardBlockSchema.safeParse(tooLong).success).toBe(false);
    const exact = {
      ...VALID_REVIEW_CARD,
      action_intent: 'explain_result' as const,
      action_label: 'a'.repeat(40),
    };
    expect(ReviewCardBlockSchema.safeParse(exact).success).toBe(true);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(
      ReviewCardBlockSchema.safeParse({ ...VALID_REVIEW_CARD, sneaky_extra: 1 }).success,
    ).toBe(false);
  });

  it('rejects empty target_refs item id/label', () => {
    expect(
      ReviewCardBlockSchema.safeParse({
        ...VALID_REVIEW_CARD,
        target_refs: [{ id: '', label: 'X', kind: 'factor' }],
      }).success,
    ).toBe(false);
  });

  it('rejects freshness values outside the Phase 3 union', () => {
    expect(
      ReviewCardBlockSchema.safeParse({ ...VALID_REVIEW_CARD, freshness: 'unknown' }).success,
    ).toBe(false);
  });
});

// ============================================================================
// §1.2 — CoachingBlockSchema
// ============================================================================

describe('CoachingBlockSchema (§1.2)', () => {
  it('accepts a fully populated valid coaching block', () => {
    expect(CoachingBlockSchema.safeParse(VALID_COACHING).success).toBe(true);
  });

  it('accepts when graph_hash_at_generation is omitted (OPTIONAL per §1.2)', () => {
    const { graph_hash_at_generation: _omit, ...withoutHash } = VALID_COACHING;
    void _omit;
    expect(CoachingBlockSchema.safeParse(withoutHash).success).toBe(true);
  });

  it.each(['orientation', 'widening', 'bias_signal', 'strengthen', 'assumption_check', 'calibration_prompt'])(
    'accepts coaching_kind = %s',
    (coaching_kind) => {
      expect(
        CoachingBlockSchema.safeParse({ ...VALID_COACHING, coaching_kind }).success,
      ).toBe(true);
    },
  );

  it.each(['draft_graph', 'decision_review', 'deterministic_signal'])(
    'accepts source = %s',
    (source) => {
      expect(CoachingBlockSchema.safeParse({ ...VALID_COACHING, source }).success).toBe(true);
    },
  );

  it('rejects unknown source', () => {
    expect(
      CoachingBlockSchema.safeParse({ ...VALID_COACHING, source: 'sonnet_routing' }).success,
    ).toBe(false);
  });

  it('requires signal_id', () => {
    const { signal_id: _omit, ...withoutSignal } = VALID_COACHING;
    void _omit;
    expect(CoachingBlockSchema.safeParse(withoutSignal).success).toBe(false);
  });

  it('requires priority_rank (hero-eligible per §1.2)', () => {
    const { priority_rank: _omit, ...withoutRank } = VALID_COACHING;
    void _omit;
    expect(CoachingBlockSchema.safeParse(withoutRank).success).toBe(false);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(
      CoachingBlockSchema.safeParse({ ...VALID_COACHING, mystery_field: true }).success,
    ).toBe(false);
  });
});

// ============================================================================
// §1.3 — EvidenceBlockSchema
// ============================================================================

describe('EvidenceBlockSchema (§1.3)', () => {
  it('accepts a fully populated valid evidence block', () => {
    expect(EvidenceBlockSchema.safeParse(VALID_EVIDENCE).success).toBe(true);
  });

  it('factor_ref kind is the literal "factor" only', () => {
    expect(
      EvidenceBlockSchema.safeParse({
        ...VALID_EVIDENCE,
        factor_ref: { id: 'opt_x', label: 'Opt X', kind: 'option' as unknown as 'factor' },
      }).success,
    ).toBe(false);
  });

  it.each(['high', 'medium', 'low'])('accepts current_confidence = %s', (current_confidence) => {
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, current_confidence }).success,
    ).toBe(true);
  });

  it('rejects unknown current_confidence', () => {
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, current_confidence: 'very_low' }).success,
    ).toBe(false);
  });

  it('requires graph_hash_at_generation (analysis-derived per §0/§1.3)', () => {
    const { graph_hash_at_generation: _omit, ...withoutHash } = VALID_EVIDENCE;
    void _omit;
    expect(EvidenceBlockSchema.safeParse(withoutHash).success).toBe(false);
  });

  it('requires factor_label and factor_ref both present', () => {
    const { factor_label: _l, ...withoutLabel } = VALID_EVIDENCE;
    void _l;
    expect(EvidenceBlockSchema.safeParse(withoutLabel).success).toBe(false);
    const { factor_ref: _r, ...withoutRef } = VALID_EVIDENCE;
    void _r;
    expect(EvidenceBlockSchema.safeParse(withoutRef).success).toBe(false);
  });

  it('requires evidence_gap, suggested_technique, impact_if_gathered non-empty', () => {
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, evidence_gap: '' }).success,
    ).toBe(false);
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, suggested_technique: '' }).success,
    ).toBe(false);
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, impact_if_gathered: '' }).success,
    ).toBe(false);
  });

  it('requires severity from Phase3BlockSeverity, not system Severity', () => {
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, severity: 'warn' }).success,
    ).toBe(false);
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, severity: 'warning' }).success,
    ).toBe(true);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, mystery_field: 1 }).success,
    ).toBe(false);
  });
});

// ============================================================================
// §1.4 — ExerciseBlockSchema
// ============================================================================

describe('ExerciseBlockSchema (§1.4)', () => {
  it('accepts a fully populated pre_mortem exercise', () => {
    expect(ExerciseBlockSchema.safeParse(VALID_EXERCISE).success).toBe(true);
  });

  it.each(['pre_mortem', 'outside_view', 'devils_advocacy', 'consider_opposite'])(
    'accepts exercise_kind = %s',
    (exercise_kind) => {
      expect(
        ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, exercise_kind }).success,
      ).toBe(true);
    },
  );

  it('rejects unknown exercise_kind', () => {
    expect(
      ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, exercise_kind: 'red_team' }).success,
    ).toBe(false);
  });

  it('accepts when all optional shape fields are omitted (only required fields present)', () => {
    const minimal = {
      ...validCommonMetadata({
        source_handler: 'run_exercise',
        graph_hash_at_generation: undefined,
      }),
      type: 'exercise' as const,
      exercise_kind: 'consider_opposite' as const,
      target_refs: [VALID_TARGET_REF],
    };
    expect(ExerciseBlockSchema.safeParse(minimal).success).toBe(true);
  });

  it('does NOT permit priority_rank (ExerciseBlock is not hero-eligible)', () => {
    expect(
      ExerciseBlockSchema.safeParse({
        ...VALID_EXERCISE,
        priority_rank: 1,
      }).success,
    ).toBe(false);
  });

  it('target_element_ref accepts any TargetRefKind including outcome (§0.1 v1.3)', () => {
    expect(
      ExerciseBlockSchema.safeParse({
        ...VALID_EXERCISE,
        target_element_ref: { id: 'out_x', label: 'Outcome X', kind: 'outcome' },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(
      ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, mystery_field: 'x' }).success,
    ).toBe(false);
  });
});

// ============================================================================
// Discriminated-union routing
// ============================================================================

describe('BlockSchema discriminated union — Phase 3 routing', () => {
  it.each([
    ['review_card', VALID_REVIEW_CARD],
    ['coaching', VALID_COACHING],
    ['evidence', VALID_EVIDENCE],
    ['exercise', VALID_EXERCISE],
  ])('routes type=%s through BlockSchema', (_type, fixture) => {
    expect(BlockSchema.safeParse(fixture).success).toBe(true);
  });

  // Review correction — broader drift guard. Every pre-existing block
  // type must still route via the BlockSchema union after Phase 3
  // additions. Catches discriminator collisions, accidental union
  // restructuring, and consumer regressions.
  const PRE_EXISTING_FIXTURES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['text', { type: 'text', content: 'hello' }],
    [
      'error',
      {
        type: 'error',
        error_code: 'INTERNAL_ERROR',
        severity: 'error',
        details: { failure_origin: 'handler' },
      },
    ],
    [
      'analysis_result',
      {
        type: 'analysis_result',
        summary: 'A is currently ahead',
        leading_option_id: 'opt_a',
        win_probabilities: { opt_a: 0.62, opt_b: 0.38 },
      },
    ],
    [
      'graph_patch',
      {
        type: 'graph_patch',
        status: 'applied',
        operation: 'set_factor_value',
        target_id: 'fac_x',
        before: null,
        after: { value: 0.5 },
      },
    ],
    [
      'explanation',
      {
        type: 'explanation',
        narrative: 'The leading option wins because…',
        referenced_option_ids: ['opt_a'],
      },
    ],
    [
      'comparison',
      {
        type: 'comparison',
        options: [
          { option_id: 'opt_a', label: 'A', win_probability: 0.62 },
          { option_id: 'opt_b', label: 'B', win_probability: 0.38 },
        ],
      },
    ],
    [
      'flip_analysis',
      {
        type: 'flip_analysis',
        narrative: 'A would flip to B at delivery risk = 0.7',
        flip_scenarios: [
          {
            factor_id: 'fac_delivery_risk',
            current_value: 0.4,
            flip_threshold: 0.7,
            from_option_id: 'opt_a',
            to_option_id: 'opt_b',
            fragile: true,
          },
        ],
      },
    ],
    [
      'draft_graph',
      {
        type: 'draft_graph',
        nodes: [],
        edges: [],
        node_count: 0,
        edge_count: 0,
      },
    ],
  ];

  it.each(PRE_EXISTING_FIXTURES)(
    'routes pre-existing block type=%s through BlockSchema unchanged',
    (_type, fixture) => {
      expect(BlockSchema.safeParse(fixture).success).toBe(true);
    },
  );

  it('rejects an unknown block type discriminator', () => {
    expect(
      BlockSchema.safeParse({ ...VALID_REVIEW_CARD, type: 'not_a_block_type' }).success,
    ).toBe(false);
  });
});

// ============================================================================
// Review correction — strict format enforcement on common metadata (§0)
// ============================================================================

describe('common metadata formats (§0) — UUID + ISO 8601 enforcement', () => {
  it('rejects block_id that is not a valid UUID', () => {
    expect(
      ReviewCardBlockSchema.safeParse({
        ...VALID_REVIEW_CARD,
        block_id: 'blk_abc123',
      }).success,
    ).toBe(false);
  });

  it('rejects empty-string block_id', () => {
    expect(
      ReviewCardBlockSchema.safeParse({ ...VALID_REVIEW_CARD, block_id: '' }).success,
    ).toBe(false);
  });

  it('accepts a real RFC 4122 UUID for block_id', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(
      ReviewCardBlockSchema.safeParse({ ...VALID_REVIEW_CARD, block_id: uuid }).success,
    ).toBe(true);
  });

  it.each([
    ['not-a-date'],
    ['2026-05-15'], // date-only, no time
    ['2026/05/15T16:00:00Z'], // wrong separator
    ['16:00:00Z'], // time-only
    [''],
  ])('rejects created_at = "%s" (not ISO 8601)', (createdAt) => {
    expect(
      ReviewCardBlockSchema.safeParse({
        ...VALID_REVIEW_CARD,
        created_at: createdAt,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['2026-05-15T16:00:00Z'],
    ['2026-05-15T16:00:00.000Z'],
    ['2026-05-15T16:00:00+01:00'],
  ])('accepts created_at = "%s" (valid ISO 8601 with offset)', (createdAt) => {
    expect(
      ReviewCardBlockSchema.safeParse({
        ...VALID_REVIEW_CARD,
        created_at: createdAt,
      }).success,
    ).toBe(true);
  });

  it('format checks apply uniformly to all four Phase 3 block types', () => {
    expect(
      CoachingBlockSchema.safeParse({ ...VALID_COACHING, block_id: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, block_id: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(
      ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, block_id: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(
      CoachingBlockSchema.safeParse({ ...VALID_COACHING, created_at: 'not-a-date' }).success,
    ).toBe(false);
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, created_at: 'not-a-date' }).success,
    ).toBe(false);
    expect(
      ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, created_at: 'not-a-date' }).success,
    ).toBe(false);
  });
});

// ============================================================================
// Review correction — EvidenceBlock factor_ref ↔ target_refs consistency (§1.3)
// ============================================================================

describe('EvidenceBlock factor_ref consistency rule (§1.3)', () => {
  // Round-3 review correction: the exported `EvidenceBlockSchema` IS
  // the full v1.3 contract validator (consistency rule included). The
  // bare ZodObject used to construct the discriminated union lives
  // off-export as `EvidenceBlockObjectSchema` and is not visible to
  // package consumers. PR 2 composer code can't bypass §1.3 via the
  // natural import name.

  it('rejects via EvidenceBlockSchema when factor_ref.id does not match the primary factor entry', () => {
    const mismatched = {
      ...VALID_EVIDENCE,
      factor_ref: {
        id: 'fac_other',
        label: VALID_EVIDENCE.factor_ref.label,
        kind: 'factor' as const,
      },
    };
    expect(EvidenceBlockSchema.safeParse(mismatched).success).toBe(false);
    // And via the union for wire-level parity:
    expect(BlockSchema.safeParse(mismatched).success).toBe(false);
  });

  it('rejects when factor_ref.label does not match the primary factor entry', () => {
    const mismatched = {
      ...VALID_EVIDENCE,
      factor_ref: {
        id: VALID_EVIDENCE.factor_ref.id,
        label: 'Some other label',
        kind: 'factor' as const,
      },
    };
    expect(EvidenceBlockSchema.safeParse(mismatched).success).toBe(false);
    expect(BlockSchema.safeParse(mismatched).success).toBe(false);
  });

  it('rejects when target_refs contains no entry of kind="factor"', () => {
    const noFactor = {
      ...VALID_EVIDENCE,
      target_refs: [{ id: 'opt_x', label: 'Option X', kind: 'option' as const }],
    };
    expect(EvidenceBlockSchema.safeParse(noFactor).success).toBe(false);
    expect(BlockSchema.safeParse(noFactor).success).toBe(false);
  });

  it('accepts when factor_ref matches the FIRST factor entry, even if non-factors come earlier', () => {
    // "Primary factor entry" = first entry with kind='factor', not
    // target_refs[0] unconditionally. A leading option entry is fine.
    const withLeadingOption = {
      ...VALID_EVIDENCE,
      target_refs: [
        { id: 'opt_x', label: 'Option X', kind: 'option' as const },
        { ...VALID_TARGET_REF }, // the actual factor matching factor_ref
      ],
    };
    expect(EvidenceBlockSchema.safeParse(withLeadingOption).success).toBe(true);
    expect(BlockSchema.safeParse(withLeadingOption).success).toBe(true);
  });

  it('rejects when target_refs has multiple factors and the FIRST factor does not match factor_ref', () => {
    const firstFactorWrong = {
      ...VALID_EVIDENCE,
      target_refs: [
        { id: 'fac_wrong', label: 'Wrong factor', kind: 'factor' as const },
        { ...VALID_TARGET_REF },
      ],
    };
    expect(EvidenceBlockSchema.safeParse(firstFactorWrong).success).toBe(false);
    expect(BlockSchema.safeParse(firstFactorWrong).success).toBe(false);
  });

  it('the exported EvidenceBlockSchema accepts a fully-valid EvidenceBlock', () => {
    expect(EvidenceBlockSchema.safeParse(VALID_EVIDENCE).success).toBe(true);
    expect(BlockSchema.safeParse(VALID_EVIDENCE).success).toBe(true);
  });
});

// ============================================================================
// Round-4 review correction — block-level action_intent rejection (wiring guard)
// ============================================================================

describe('block-level action_intent rejection (wiring guard)', () => {
  // Direct `ActionIntent` enum tests above pin the union. These cases
  // catch wiring mistakes where a block schema accidentally accepts a
  // freeform string in `action_intent` (e.g. by referencing `z.string()`
  // instead of the shared enum).
  it('ReviewCardBlock rejects an invalid action_intent', () => {
    expect(
      ReviewCardBlockSchema.safeParse({
        ...VALID_REVIEW_CARD,
        action_intent: 'explain_the_thing',
        action_label: 'Walk me through it',
      }).success,
    ).toBe(false);
  });

  it('CoachingBlock rejects an invalid action_intent', () => {
    expect(
      CoachingBlockSchema.safeParse({
        ...VALID_COACHING,
        action_intent: 'explain_the_thing',
        action_label: 'Walk me through it',
      }).success,
    ).toBe(false);
  });

  it('EvidenceBlock rejects an invalid action_intent', () => {
    expect(
      EvidenceBlockSchema.safeParse({
        ...VALID_EVIDENCE,
        action_intent: 'explain_the_thing',
        action_label: 'Walk me through it',
      }).success,
    ).toBe(false);
  });

  it('ExerciseBlock does NOT permit an action_intent field (no such field per §1.4)', () => {
    expect(
      ExerciseBlockSchema.safeParse({
        ...VALID_EXERCISE,
        action_intent: 'run_pre_mortem' as const,
      }).success,
    ).toBe(false);
  });
});

// ============================================================================
// Round-4 review correction — empty target_refs policy
// ============================================================================

describe('empty target_refs policy', () => {
  // The contract §0.1 declares `target_refs: Array<{...}>` without
  // `.min(1)`. Empty arrays are accepted for ReviewCard, Coaching, and
  // Exercise. EvidenceBlock rejects empty (the §1.3 consistency rule
  // requires a primary factor entry to match `factor_ref`).
  it('ReviewCardBlock accepts empty target_refs', () => {
    expect(
      ReviewCardBlockSchema.safeParse({ ...VALID_REVIEW_CARD, target_refs: [] }).success,
    ).toBe(true);
  });

  it('CoachingBlock accepts empty target_refs', () => {
    expect(
      CoachingBlockSchema.safeParse({ ...VALID_COACHING, target_refs: [] }).success,
    ).toBe(true);
  });

  it('ExerciseBlock accepts empty target_refs', () => {
    expect(
      ExerciseBlockSchema.safeParse({ ...VALID_EXERCISE, target_refs: [] }).success,
    ).toBe(true);
  });

  it('EvidenceBlock rejects empty target_refs (§1.3 consistency rule needs a primary factor entry)', () => {
    expect(
      EvidenceBlockSchema.safeParse({ ...VALID_EVIDENCE, target_refs: [] }).success,
    ).toBe(false);
  });
});

// ============================================================================
// Round-4 review correction — required common-metadata coverage (table test)
// ============================================================================

describe('required common-metadata fields (§0) — block × field table', () => {
  // Drift guard: every Phase 3 block must reject the omission of any of
  // the five universally-required common-metadata fields. The
  // conditional `graph_hash_at_generation` (required on ReviewCard +
  // Evidence only) is covered separately in §1.1 / §1.3 sections above.
  const FIXTURES: ReadonlyArray<readonly [string, Record<string, unknown>, (input: unknown) => { success: boolean }]> = [
    ['ReviewCardBlock', VALID_REVIEW_CARD, (i) => ReviewCardBlockSchema.safeParse(i)],
    ['CoachingBlock', VALID_COACHING, (i) => CoachingBlockSchema.safeParse(i)],
    ['EvidenceBlock', VALID_EVIDENCE, (i) => EvidenceBlockSchema.safeParse(i)],
    ['ExerciseBlock', VALID_EXERCISE, (i) => ExerciseBlockSchema.safeParse(i)],
  ];
  const REQUIRED_FIELDS = [
    'block_id',
    'signal_id',
    'created_at',
    'source_handler',
    'freshness',
  ] as const;

  for (const [blockName, fixture, safeParse] of FIXTURES) {
    for (const field of REQUIRED_FIELDS) {
      it(`${blockName} rejects when ${field} is omitted`, () => {
        const { [field]: _omitted, ...withoutField } = fixture as Record<string, unknown>;
        void _omitted;
        expect(safeParse(withoutField).success).toBe(false);
      });
    }
  }
});

// ============================================================================
// FactBlock / GraphPatchBlock untouched — drift guard per §1.5 / §1.6
// ============================================================================

describe('Existing FactBlock / GraphPatchBlock unchanged (§1.5 / §1.6)', () => {
  it('GraphPatchBlock has not been forced into the Phase 3 metadata shape', () => {
    // Phase 3 common metadata (block_id, signal_id, created_at,
    // source_handler, freshness) is NOT applied to GraphPatchBlock.
    // Passing a GraphPatchBlock-shaped object that does NOT carry the
    // Phase 3 metadata must still parse cleanly via the existing
    // discriminated union.
    const validPatch = {
      type: 'graph_patch' as const,
      status: 'applied' as const,
      operation: 'set_factor_value' as const,
      target_id: 'fac_x',
      before: null,
      after: { value: 0.5 },
    };
    const parsed = GraphPatchBlockSchema.safeParse(validPatch);
    expect(parsed.success).toBe(true);
  });

  it('GraphPatchBlock rejects Phase 3 metadata fields (strict drift guard)', () => {
    // Belt-and-braces: if a future composer accidentally tries to stamp
    // a Phase 3 block_id onto a GraphPatch, .strict() catches it.
    expect(
      GraphPatchBlockSchema.safeParse({
        type: 'graph_patch',
        status: 'applied',
        operation: 'set_factor_value',
        target_id: 'fac_x',
        before: null,
        after: { value: 0.5 },
        block_id: 'blk_abc',
      }).success,
    ).toBe(false);
  });
});

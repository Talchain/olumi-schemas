/**
 * HeldProposalBlock (0.15.0) — durable fix for ROADMAP 1.43.
 *
 * Tests validate the new `held_proposal` block kind, its two supporting
 * enums (HeldProposalMutationClass, HeldProposalReasonCode), and its
 * routing through the BlockSchema discriminated union, against the wire
 * shape this block replaces (`type:"error"` / `error_code:"INTERNAL_ERROR"`,
 * evidenced at acceptance-evidence/gm-live-flip/journey/T2-gm-propose-response.json
 * in the platform monorepo layout).
 *
 * Coverage:
 *   - valid happy-path fixture (both mutation_class values)
 *   - required-field rejection (proposal_id, summary, mutation_class,
 *     reason_code, confirm_action_id)
 *   - decline_action_id optionality
 *   - strict-mode rejection of unknown fields
 *   - enum exhaustiveness / rejection of invented members
 *   - discriminated-union routing via BlockSchema
 *   - existing block kinds (error, draft_graph) untouched by this addition
 */
import { describe, it, expect } from 'vitest';
import {
  BlockSchema,
  ErrorBlockSchema,
  HeldProposalBlockSchema,
  HeldProposalMutationClass,
  HeldProposalReasonCode,
} from '../../src/boundary/blocks.js';

const VALID_HELD_PROPOSAL = {
  type: 'held_proposal' as const,
  proposal_id: 'gmh_9b1e2c3a7f4d',
  summary:
    'Add a factor called Customer Referral Momentum with a positive link to Qualified Pipeline Volume.',
  mutation_class: 'structural' as const,
  reason_code: 'STRUCTURAL_APPLY_HELD' as const,
  confirm_action_id: 'gmh_ac450866c1b7',
};

describe('HeldProposalBlockSchema', () => {
  it('accepts a valid structural held proposal (no decline_action_id)', () => {
    expect(HeldProposalBlockSchema.parse(VALID_HELD_PROPOSAL)).toEqual(VALID_HELD_PROPOSAL);
  });

  it('accepts a valid tunable held proposal', () => {
    const b = {
      ...VALID_HELD_PROPOSAL,
      mutation_class: 'tunable' as const,
      reason_code: 'TUNABLE_APPLY_HELD' as const,
    };
    expect(HeldProposalBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts an optional decline_action_id', () => {
    const b = { ...VALID_HELD_PROPOSAL, decline_action_id: 'gmh_decline_9b1e2c3a7f4d' };
    expect(HeldProposalBlockSchema.parse(b)).toEqual(b);
  });

  it('rejects a missing proposal_id', () => {
    const { proposal_id: _p, ...rest } = VALID_HELD_PROPOSAL;
    expect(HeldProposalBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty proposal_id', () => {
    expect(
      HeldProposalBlockSchema.safeParse({ ...VALID_HELD_PROPOSAL, proposal_id: '' }).success,
    ).toBe(false);
  });

  it('rejects a missing summary', () => {
    const { summary: _s, ...rest } = VALID_HELD_PROPOSAL;
    expect(HeldProposalBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty summary', () => {
    expect(
      HeldProposalBlockSchema.safeParse({ ...VALID_HELD_PROPOSAL, summary: '' }).success,
    ).toBe(false);
  });

  it('rejects a missing mutation_class', () => {
    const { mutation_class: _m, ...rest } = VALID_HELD_PROPOSAL;
    expect(HeldProposalBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an invented mutation_class (e.g. non_mutating — held never carries it)', () => {
    expect(
      HeldProposalBlockSchema.safeParse({ ...VALID_HELD_PROPOSAL, mutation_class: 'non_mutating' })
        .success,
    ).toBe(false);
  });

  it('rejects a missing reason_code', () => {
    const { reason_code: _r, ...rest } = VALID_HELD_PROPOSAL;
    expect(HeldProposalBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an invented reason_code', () => {
    expect(
      HeldProposalBlockSchema.safeParse({ ...VALID_HELD_PROPOSAL, reason_code: 'NOT_A_CODE' })
        .success,
    ).toBe(false);
  });

  it('rejects a missing confirm_action_id', () => {
    const { confirm_action_id: _c, ...rest } = VALID_HELD_PROPOSAL;
    expect(HeldProposalBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty confirm_action_id', () => {
    expect(
      HeldProposalBlockSchema.safeParse({ ...VALID_HELD_PROPOSAL, confirm_action_id: '' }).success,
    ).toBe(false);
  });

  it('rejects an empty decline_action_id when present', () => {
    expect(
      HeldProposalBlockSchema.safeParse({ ...VALID_HELD_PROPOSAL, decline_action_id: '' }).success,
    ).toBe(false);
  });

  it('rejects unknown fields (strict) — e.g. raw candidate/operation internals', () => {
    const r = HeldProposalBlockSchema.safeParse({
      ...VALID_HELD_PROPOSAL,
      operations: [{ kind: 'add_node' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects the wrong type literal', () => {
    expect(
      HeldProposalBlockSchema.safeParse({ ...VALID_HELD_PROPOSAL, type: 'error' }).success,
    ).toBe(false);
  });
});

describe('HeldProposalMutationClass', () => {
  it('has exactly the two held-reachable classes', () => {
    expect([...HeldProposalMutationClass.options].sort()).toEqual(['structural', 'tunable']);
  });
});

describe('HeldProposalReasonCode', () => {
  it('covers the held-reachable CEE reason-code vocabulary', () => {
    expect([...HeldProposalReasonCode.options].sort()).toEqual(
      [
        'ADD_OPTION_APPLY_UNWIRED',
        'CLASSIFY_FAILED',
        'CURRENT_GRAPH_UNREADABLE',
        'FRAME_UNAVAILABLE',
        'OPTION_TOP_LEVEL_OPTIONS_DIVERGENCE',
        'REMOVE_UNCONFIRMED',
        'STRUCTURAL_APPLY_HELD',
        'TUNABLE_APPLY_HELD',
      ].sort(),
    );
  });
});

describe('Block discriminated union — held_proposal routing', () => {
  it('routes a held_proposal block through BlockSchema', () => {
    expect(BlockSchema.parse(VALID_HELD_PROPOSAL)).toEqual(VALID_HELD_PROPOSAL);
  });

  it('leaves the existing error block kind unaffected (interim GM wire shape, still valid)', () => {
    // The evidenced interim shape (acceptance-evidence/gm-live-flip/journey/
    // T2-gm-propose-response.json) that held_proposal is the durable
    // replacement for — must still parse unchanged.
    const interimGmHeldErrorBlock = {
      type: 'error' as const,
      error_code: 'INTERNAL_ERROR' as const,
      severity: 'warn' as const,
      details: {
        source: 'graph_management',
        verdict: 'held',
        mutation_class: 'structural',
        blocker_code: 'STRUCTURAL_APPLY_HELD',
        blocker_readable: 'Structural mutation held: §6 structural-vs-tunable doctrine is pending sign-off.',
        candidate_id: '6fbadc75-1288-4c17-884f-57346ec32783',
        base_hash_match: true,
      },
    };
    expect(BlockSchema.parse(interimGmHeldErrorBlock)).toEqual(interimGmHeldErrorBlock);
    expect(ErrorBlockSchema.parse(interimGmHeldErrorBlock)).toEqual(interimGmHeldErrorBlock);
  });

  it('rejects a held_proposal missing its discriminant fields, same as any other kind', () => {
    const r = BlockSchema.safeParse({ type: 'held_proposal' });
    expect(r.success).toBe(false);
  });
});

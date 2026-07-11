// Verifies the v0.11.0 exports surface as consumers actually receive it.
// Imports from the built dist (root + boundary subpath) — not from src — to
// catch drift between source and the published package.json `exports` field.
//
// This file requires `pnpm build` to have run before `pnpm test`. The package
// `prepublishOnly` hook enforces this for npm publish; CI must run build
// before test for this assertion to hold.
import { describe, it, expect } from 'vitest';

import * as rootDist from '../dist/index.js';
import * as boundaryDist from '../dist/boundary/index.js';

describe('package exports — root entry (dist/index.js)', () => {
  it('exposes coaching schemas', () => {
    expect(rootDist.CoachingSchema).toBeDefined();
    expect(rootDist.BiasType).toBeDefined();
    expect(rootDist.BiasSignalSchema).toBeDefined();
    expect(rootDist.WideningLogSchema).toBeDefined();
    expect(rootDist.StrengthenItemSchema).toBeDefined();
    expect(rootDist.StrengthenItemActionType).toBeDefined();
    expect(rootDist.BriefCompleteness).toBeDefined();
  });

  it('exposes causal-claims schemas', () => {
    expect(rootDist.CausalClaimSchema).toBeDefined();
    expect(rootDist.CausalClaimsArraySchema).toBeDefined();
    expect(rootDist.StrengthBand).toBeDefined();
    expect(rootDist.DirectEffectClaimSchema).toBeDefined();
    expect(rootDist.MediationOnlyClaimSchema).toBeDefined();
    expect(rootDist.NoDirectEffectClaimSchema).toBeDefined();
    expect(rootDist.UnmeasuredConfounderClaimSchema).toBeDefined();
  });

  it('exposes TopologyPlanSchema', () => {
    expect(rootDist.TopologyPlanSchema).toBeDefined();
  });

  it('the exported CoachingSchema validates a fully-populated coaching object', () => {
    const parsed = rootDist.CoachingSchema.parse({
      summary: 'x',
      strengthen_items: [],
      widening_log: {
        elements_added: [],
        elements_considered_but_excluded: [],
        brief_completeness: 'thin',
      },
      bias_signals: [],
    });
    expect(parsed.summary).toBe('x');
  });
});

describe('package exports — boundary subpath (dist/boundary/index.js)', () => {
  it('exposes coaching schemas at the boundary entry', () => {
    expect(boundaryDist.CoachingSchema).toBeDefined();
    expect(boundaryDist.BiasType).toBeDefined();
    expect(boundaryDist.WideningLogSchema).toBeDefined();
    expect(boundaryDist.StrengthenItemSchema).toBeDefined();
  });

  it('exposes causal-claims schemas at the boundary entry', () => {
    expect(boundaryDist.CausalClaimSchema).toBeDefined();
    expect(boundaryDist.CausalClaimsArraySchema).toBeDefined();
    expect(boundaryDist.StrengthBand).toBeDefined();
  });

  it('exposes TopologyPlanSchema at the boundary entry', () => {
    expect(boundaryDist.TopologyPlanSchema).toBeDefined();
  });

  it('boundary subpath CoachingSchema is the same Zod schema instance as root', () => {
    // Both paths re-export from the same coaching.js module — referential
    // identity confirms there is no accidental divergence (e.g. a duplicate
    // schema with the same name but different shape).
    expect(boundaryDist.CoachingSchema).toBe(rootDist.CoachingSchema);
    expect(boundaryDist.CausalClaimSchema).toBe(rootDist.CausalClaimSchema);
    expect(boundaryDist.BiasType).toBe(rootDist.BiasType);
    expect(boundaryDist.StrengthBand).toBe(rootDist.StrengthBand);
    expect(boundaryDist.TopologyPlanSchema).toBe(rootDist.TopologyPlanSchema);
  });

  // Round-3 review correction — Phase 3 schemas must be reachable through
  // the boundary subpath surface that consumers actually import from.
  it('exposes Phase 3 block schemas (v1.3 contract) at the boundary entry', () => {
    expect(boundaryDist.ReviewCardBlockSchema).toBeDefined();
    expect(boundaryDist.CoachingBlockSchema).toBeDefined();
    expect(boundaryDist.EvidenceBlockSchema).toBeDefined();
    expect(boundaryDist.ExerciseBlockSchema).toBeDefined();
  });

  it('exposes Phase 3 shared schemas at the boundary entry', () => {
    expect(boundaryDist.ActionIntent).toBeDefined();
    expect(boundaryDist.TargetRefKind).toBeDefined();
    expect(boundaryDist.TargetRefSchema).toBeDefined();
    expect(boundaryDist.Phase3BlockFreshness).toBeDefined();
    expect(boundaryDist.Phase3BlockSeverity).toBeDefined();
  });

  // 0.15.0 — ROADMAP 1.43 durable held-proposal block type.
  it('exposes HeldProposalBlockSchema + its enums at the boundary entry', () => {
    expect(boundaryDist.HeldProposalBlockSchema).toBeDefined();
    expect(boundaryDist.HeldProposalMutationClass).toBeDefined();
    expect(boundaryDist.HeldProposalReasonCode).toBeDefined();
  });

  // 0.15.0 — ROADMAP 1.42 reasoning sidecar formalisation. OlumiResponseSchema
  // itself already had boundary-entry coverage (olumi-response.test.ts);
  // this just confirms the schema instance carries the new optional field.
  it('OlumiResponseSchema (boundary entry) accepts the new optional reasoning field', () => {
    const base = {
      response_version: 2 as const,
      assistant_text: 'x',
      blocks: [],
      suggested_actions: [],
      insights: [],
      stage_indicator: 'frame' as const,
    };
    const parsed = boundaryDist.OlumiResponseSchema.safeParse({ ...base, reasoning: 'verbatim thinking text' });
    expect(parsed.success).toBe(true);
  });

  // 0.15.0 — seamlessness R4 keystone.
  it('exposes UiDirectiveBlockSchema + its enum at the boundary entry', () => {
    expect(boundaryDist.UiDirectiveBlockSchema).toBeDefined();
    expect(boundaryDist.UiDirectiveVerb).toBeDefined();
  });

  // 0.15.0 — selection_change system event + selected_elements message field.
  it('exposes SelectedElementRefSchema + accepts selection_change at the boundary entry', () => {
    expect(boundaryDist.SelectedElementRefSchema).toBeDefined();
    const event = { kind: 'selection_change' as const, selected: [] };
    expect(boundaryDist.SystemEventSchema.safeParse(event).success).toBe(true);
  });

  // 0.15.0 — MessageTurnPayloadSchema accepts the new optional selected_elements.
  it('MessageTurnPayloadSchema (boundary entry) accepts the new optional selected_elements field', () => {
    const base = {
      turn_id: '11111111-1111-4111-8111-111111111111',
      scenario_id: '22222222-2222-4222-8222-222222222222',
      stage: 'frame' as const,
      kind: 'message' as const,
      message: 'x',
      turn_class: 'frame' as const,
      source: 'composer' as const,
    };
    const parsed = boundaryDist.MessageTurnPayloadSchema.safeParse({
      ...base,
      selected_elements: [{ id: 'fac_1', kind: 'factor' }],
    });
    expect(parsed.success).toBe(true);
  });

  // 0.15.0 — ROADMAP 3.1 decision record (standalone, not wired into OlumiResponse).
  it('exposes DecisionRecordSchema + its component schemas at the boundary entry', () => {
    expect(boundaryDist.DecisionRecordSchema).toBeDefined();
    expect(boundaryDist.DecisionRecordDecisionSchema).toBeDefined();
    expect(boundaryDist.DecisionRecordAnalysisSummarySchema).toBeDefined();
    expect(boundaryDist.DecisionRecordPredictionSchema).toBeDefined();
    expect(boundaryDist.DecisionRecordOutcomeSchema).toBeDefined();
    expect(boundaryDist.DecisionRecordOutcomeResult).toBeDefined();
  });

  // 0.16.0 — confidence provenance enum (calibration pack honesty §2).
  it('exposes DecisionRecordConfidenceSource at the boundary entry', () => {
    expect(boundaryDist.DecisionRecordConfidenceSource).toBeDefined();
  });

  it('does NOT expose the internal EvidenceBlockObjectSchema helper (boundary subpath)', () => {
    // The bare ZodObject is an implementation detail used to construct
    // `z.discriminatedUnion`. Consumers must import `EvidenceBlockSchema`
    // (with the §1.3 consistency rule) or `BlockSchema` (union with the
    // rule applied at union level).
    expect(
      (boundaryDist as Record<string, unknown>).EvidenceBlockObjectSchema,
    ).toBeUndefined();
  });

  it('does NOT expose the internal EvidenceBlockObjectSchema helper (root entry)', () => {
    // Round-4 drift guard — confirm both export surfaces hide the
    // internal helper. A future accidental re-export from `src/index.ts`
    // would surface this symbol at the root dist and reintroduce the
    // round-3 footgun.
    expect(
      (rootDist as Record<string, unknown>).EvidenceBlockObjectSchema,
    ).toBeUndefined();
  });

  it('the exported EvidenceBlockSchema enforces the §1.3 consistency rule', () => {
    // Smoke-test the rename — `EvidenceBlockSchema` (natural import name)
    // must fail on a factor_ref / target_refs mismatch. This is the
    // round-3 footgun-prevention assertion.
    const mismatched = {
      block_id: '550e8400-e29b-41d4-a716-446655440000',
      signal_id: 'sig_e_001',
      created_at: '2026-05-15T16:00:00Z',
      source_handler: 'rank_evidence_sources',
      graph_hash_at_generation: 'gh_xyz',
      freshness: 'fresh' as const,
      type: 'evidence' as const,
      factor_label: 'Delivery risk',
      factor_ref: { id: 'fac_other', label: 'Delivery risk', kind: 'factor' as const },
      target_refs: [{ id: 'fac_delivery_risk', label: 'Delivery risk', kind: 'factor' as const }],
      current_confidence: 'low' as const,
      evidence_gap: 'g',
      suggested_technique: 's',
      impact_if_gathered: 'i',
      priority_rank: 1,
      severity: 'warning' as const,
    };
    const parsed = boundaryDist.EvidenceBlockSchema.safeParse(mismatched);
    expect(parsed.success).toBe(false);
  });

  it('the exported BlockSchema enforces the §1.3 consistency rule via the union refine', () => {
    const mismatched = {
      block_id: '550e8400-e29b-41d4-a716-446655440001',
      signal_id: 'sig_e_002',
      created_at: '2026-05-15T16:00:00Z',
      source_handler: 'rank_evidence_sources',
      graph_hash_at_generation: 'gh_xyz',
      freshness: 'fresh' as const,
      type: 'evidence' as const,
      factor_label: 'Delivery risk',
      factor_ref: { id: 'fac_other', label: 'Delivery risk', kind: 'factor' as const },
      target_refs: [{ id: 'fac_delivery_risk', label: 'Delivery risk', kind: 'factor' as const }],
      current_confidence: 'low' as const,
      evidence_gap: 'g',
      suggested_technique: 's',
      impact_if_gathered: 'i',
      priority_rank: 1,
      severity: 'warning' as const,
    };
    expect(boundaryDist.BlockSchema.safeParse(mismatched).success).toBe(false);
  });
});

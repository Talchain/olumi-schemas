import { describe, expect, it } from 'vitest';

import {
  AnalysisParticipationWithheldSchema,
  AnalysisResultBlockSchema,
  OlumiResponseSchema,
} from '../../src/boundary/index.js';
import { RunAnalysisResultSchema } from '../../src/orchestrator/handler-results.js';

// ============================================================================
// 0.56.0 — the participation guard's withheld counts, typed.
//
// The field exists because CEE #1602's only machine-readable binding was a
// REGEX over a user-facing sentence, and the consumer refused it: a regex
// binding fails silently and OPEN, so its failure mode is identical to the
// failure mode the disclosure exists to close. These tests pin the three
// things a consumer is entitled to rely on — the SHAPE, the ABSENCE SEMANTICS,
// and the PLACEMENT — and the placement pin is the one that would otherwise be
// re-litigated by someone tidying the field into the analysis block.
// ============================================================================

const baseResponse = {
  response_version: 2 as const,
  assistant_text: 'This analysis ran on a reduced model.',
  blocks: [],
  suggested_actions: [],
  insights: [],
  stage_indicator: 'analyse' as const,
};

// DELIBERATELY DIFFERENT INTEGERS. A {2, 2} fixture cannot distinguish a
// consumer that reads the right field from one that reads the wrong slot.
const WITHHELD = { excluded_node_count: 2, pruned_edge_count: 3 };

describe('AnalysisParticipationWithheldSchema — the shape', () => {
  it('accepts two non-negative integer counts and returns them unchanged', () => {
    const parsed = AnalysisParticipationWithheldSchema.safeParse(WITHHELD);
    expect(parsed.success).toBe(true);
    // Bound BY NAME, never by value: asserting `2` alone would pass if the two
    // members were swapped at the schema.
    expect(parsed.success && parsed.data.excluded_node_count).toBe(2);
    expect(parsed.success && parsed.data.pruned_edge_count).toBe(3);
  });

  it('accepts {0, 0} — a present carrier attesting the guard withheld nothing', () => {
    const parsed = AnalysisParticipationWithheldSchema.safeParse({
      excluded_node_count: 0,
      pruned_edge_count: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it('requires BOTH counts — a carrier with one is not a claim', () => {
    expect(
      AnalysisParticipationWithheldSchema.safeParse({ excluded_node_count: 2 }).success,
    ).toBe(false);
    expect(
      AnalysisParticipationWithheldSchema.safeParse({ pruned_edge_count: 3 }).success,
    ).toBe(false);
  });

  it('is strict — an unknown member cannot ride along', () => {
    expect(
      AnalysisParticipationWithheldSchema.safeParse({
        ...WITHHELD,
        excluded_node_ids: ['fac_a', 'fac_b'],
      }).success,
    ).toBe(false);
  });

  it.each([
    ['negative nodes', { excluded_node_count: -1, pruned_edge_count: 0 }],
    ['negative edges', { excluded_node_count: 0, pruned_edge_count: -1 }],
    ['fractional nodes', { excluded_node_count: 1.5, pruned_edge_count: 0 }],
    ['fractional edges', { excluded_node_count: 0, pruned_edge_count: 1.5 }],
    ['NaN', { excluded_node_count: Number.NaN, pruned_edge_count: 0 }],
    ['Infinity', { excluded_node_count: Number.POSITIVE_INFINITY, pruned_edge_count: 0 }],
    ['string', { excluded_node_count: '2', pruned_edge_count: 3 }],
    ['null', { excluded_node_count: null, pruned_edge_count: 3 }],
  ])('rejects %s', (_label, payload) => {
    expect(AnalysisParticipationWithheldSchema.safeParse(payload).success).toBe(false);
  });

  it('does NOT cross-validate edges against nodes — that rule is CEE doctrine', () => {
    // CEE's guard cannot emit this combination. The contract deliberately does
    // not encode that: mirroring it here would create a rule that must change
    // in two repos at once and would reject counts a legitimately-newer CEE
    // emits. If this test ever goes red, someone has added the mirror.
    expect(
      AnalysisParticipationWithheldSchema.safeParse({
        excluded_node_count: 0,
        pruned_edge_count: 4,
      }).success,
    ).toBe(true);
  });
});

describe('OlumiResponse.analysis_participation_withheld — absence semantics', () => {
  it('is optional: a response without it parses', () => {
    expect(OlumiResponseSchema.safeParse(baseResponse).success).toBe(true);
  });

  it('⭐ ABSENT and {0, 0} are DIFFERENT wire states, and both survive parsing', () => {
    const absent = OlumiResponseSchema.safeParse(baseResponse);
    const zeroed = OlumiResponseSchema.safeParse({
      ...baseResponse,
      analysis_participation_withheld: { excluded_node_count: 0, pruned_edge_count: 0 },
    });
    expect(absent.success).toBe(true);
    expect(zeroed.success).toBe(true);
    // The load-bearing assertion. If anyone ever gives this field a `.default()`,
    // the key appears on the absent arm and this goes red — which is exactly
    // the silent absence-semantics change the census gate exists to catch.
    expect(absent.success && 'analysis_participation_withheld' in absent.data).toBe(false);
    expect(zeroed.success && 'analysis_participation_withheld' in zeroed.data).toBe(true);
  });

  it('carries both counts through the envelope unchanged, bound by name', () => {
    const parsed = OlumiResponseSchema.safeParse({
      ...baseResponse,
      analysis_participation_withheld: WITHHELD,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.analysis_participation_withheld).toStrictEqual({
      excluded_node_count: 2,
      pruned_edge_count: 3,
    });
  });

  it('rejects a malformed carrier rather than dropping it', () => {
    expect(
      OlumiResponseSchema.safeParse({
        ...baseResponse,
        analysis_participation_withheld: { excluded_node_count: -1, pruned_edge_count: 0 },
      }).success,
    ).toBe(false);
  });
});

describe('placement — the reason this is a top-level key', () => {
  it('⭐ is a DECLARED top-level key of OlumiResponseSchema', () => {
    // The UI derives KNOWN_OLUMI_TOP_LEVEL_KEYS from `OlumiResponseSchema.shape`
    // (responseParser.ts, measured at UI staging aab14fc8), so declaring it here
    // is what promotes it out of the `__additive__` sidecar on re-vendor. No
    // hand-maintained list anywhere has to be told.
    expect(Object.keys(OlumiResponseSchema.shape)).toContain(
      'analysis_participation_withheld',
    );
  });

  it('⛔ is NOT declared on the strict AnalysisResultBlockSchema', () => {
    // `analysis_result` is in the UI's LEGACY_SCHEMA_KNOWN_BLOCK_TYPES and is
    // therefore strict-validated. An unknown key inside it is a whole-turn
    // `schema_mismatch` for every consumer that has not re-vendored — and all
    // three consumers pinned 0.55.0 when this shipped. Moving the field there
    // would break every run_analysis turn that had an exclusion, so this
    // assertion is the guard on that move.
    expect(Object.keys(AnalysisResultBlockSchema.shape)).not.toContain(
      'analysis_participation_withheld',
    );
    expect(
      AnalysisResultBlockSchema.safeParse({
        type: 'analysis_result',
        summary: 's',
        leading_option_id: null,
        analysis_participation_withheld: WITHHELD,
      }).success,
    ).toBe(false);
  });
});

describe('the persistence carrier cannot drift from the wire member', () => {
  it('⭐ RunAnalysisResultSchema uses the SAME schema OBJECT, not a copy', () => {
    // Identity, not shape equality. Two structurally-identical copies would
    // satisfy a shape comparison and then drift the first time one is edited —
    // this estate's dominant defect. Only object identity forbids that.
    expect(RunAnalysisResultSchema.shape.analysis_participation_withheld.unwrap()).toBe(
      AnalysisParticipationWithheldSchema,
    );
  });

  it('is optional on the fact: a row persisted before 0.56.0 still parses', () => {
    const parsed = RunAnalysisResultSchema.safeParse({
      scenario_id: '00000000-0000-4000-8000-000000000000',
      leading_option_id: null,
      summary: 'legacy fact',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'analysis_participation_withheld' in parsed.data).toBe(false);
  });

  it('carries the counts on the fact, bound by name', () => {
    const parsed = RunAnalysisResultSchema.safeParse({
      scenario_id: '00000000-0000-4000-8000-000000000000',
      leading_option_id: null,
      summary: 'reduced-model fact',
      analysis_participation_withheld: WITHHELD,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.analysis_participation_withheld?.excluded_node_count).toBe(2);
    expect(parsed.success && parsed.data.analysis_participation_withheld?.pruned_edge_count).toBe(3);
  });
});

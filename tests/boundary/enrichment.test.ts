/**
 * Analysis enrichment envelope (v0.14.0).
 *
 * Coverage:
 *   1. REAL staging capture parses — the 40-key PLoT /v2/run envelope that
 *      CEE persisted byte-for-byte (fixtures/enrichment/
 *      plot-to-cee.run-analysis.staging.json, mirrored from the CEE repo).
 *   2. Post-doctrine-B vocabulary parses (code-derived fixture): goal_fit_basis,
 *      CONSTRAINT_GOALFIT_MODELLED_BASIS, constraints_status 'unavailable',
 *      display_verdict/reason, zero_reason, evpi_status.
 *   3. Additive guarantee: unknown keys pass through unchanged; the empty
 *      object parses; the CEE→UI keep-list projection parses.
 *   4. The envelope REJECTS malformed known keys (the silent-drift class it
 *      exists to catch).
 *   5. Keep-list constant matches CEE's compose.ts list (drift pin — the
 *      source-of-truth assertion for the cross-repo contract tests).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AnalysisEnrichmentSchema,
  CEE_UI_ENRICHMENT_KEEP_LIST,
  parseAnalysisEnrichment,
  isAnalysisEnrichment,
  EnrichmentInferenceWarningSchema,
  EnrichmentFlipThresholdSchema,
  EnrichmentOptionComparisonEntrySchema,
  EnrichmentConstraintMarginSchema,
  EnrichmentScaleProvenanceSchema,
  EnrichmentConstraintResultSchema,
  EnrichmentRobustnessEdgeSchema,
} from '../../src/boundary/enrichment.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', 'fixtures', 'enrichment');

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));
}

describe('AnalysisEnrichmentSchema — real staging capture (PLoT→CEE seam)', () => {
  const fixture = loadFixture('plot-to-cee.run-analysis.staging.json');
  const enrichment = fixture.enrichment as Record<string, unknown>;

  it('parses the 40-key staging-captured envelope', () => {
    const result = AnalysisEnrichmentSchema.safeParse(enrichment);
    if (!result.success) {
      throw new Error(`staging capture failed to parse: ${result.error.message}`);
    }
    expect(result.success).toBe(true);
  });

  it('preserves every key of the capture (no silent drops)', () => {
    const parsed = AnalysisEnrichmentSchema.parse(enrichment);
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(enrichment).sort());
  });

  it('round-trips typed fields byte-equal (no coercion)', () => {
    const parsed = AnalysisEnrichmentSchema.parse(enrichment);
    expect(parsed.factor_sensitivity).toEqual(enrichment.factor_sensitivity);
    expect(parsed.option_comparison).toEqual(enrichment.option_comparison);
    expect(parsed.robustness).toEqual(enrichment.robustness);
    expect(parsed.flip_thresholds).toEqual(enrichment.flip_thresholds);
    expect(parsed.m1_coaching).toEqual(enrichment.m1_coaching);
    expect(parsed.critiques).toEqual(enrichment.critiques);
  });

  it('tolerates the LEGACY confidence_source vocabulary on persisted facts', () => {
    // The 2025-12 capture emits confidence_source: 'isl' | 'graph'; current
    // staging emits 'plot_unified_from_*'. Both must parse — a closed enum
    // here would reject real persisted facts.
    const fs = (enrichment.factor_sensitivity as Array<Record<string, unknown>>);
    expect(fs.some((f) => f.confidence_source === 'isl')).toBe(true);
    expect(AnalysisEnrichmentSchema.safeParse(enrichment).success).toBe(true);
  });

  it('accepts honest flip_value: null with flip_reason', () => {
    const ft = (enrichment.flip_thresholds as Array<Record<string, unknown>>)[0];
    expect(ft.flip_value).toBeNull();
    expect(EnrichmentFlipThresholdSchema.safeParse(ft).success).toBe(true);
  });
});

describe('AnalysisEnrichmentSchema — doctrine-B vocabulary (PRs #202-#205, code-derived)', () => {
  const fixture = loadFixture('plot-to-cee.doctrine-b.code-derived.json');
  const enrichment = fixture.enrichment as Record<string, unknown>;
  const suppressed = fixture.enrichment_suppressed_variant as Record<string, unknown>;

  it('parses the delivered-with-goal_fit_basis envelope', () => {
    const result = AnalysisEnrichmentSchema.safeParse(enrichment);
    if (!result.success) {
      throw new Error(`doctrine-B fixture failed to parse: ${result.error.message}`);
    }
    const oc = result.data.option_comparison![0];
    expect(oc.goal_fit_basis?.scored_from).toBe('modelled_outcome_distribution');
    expect(oc.goal_fit_basis?.node_ids).toEqual(['goal_q3_delivery']);
  });

  it('parses CONSTRAINT_GOALFIT_MODELLED_BASIS info warning', () => {
    const parsed = AnalysisEnrichmentSchema.parse(enrichment);
    const w = parsed.inference_warnings!.find(
      (x) => x.code === 'CONSTRAINT_GOALFIT_MODELLED_BASIS',
    );
    expect(w).toBeDefined();
    expect(w!.severity).toBe('info');
  });

  it('parses display_verdict + display_verdict_reason (lane W5)', () => {
    const parsed = AnalysisEnrichmentSchema.parse(enrichment);
    expect(parsed.robustness?.display_verdict).toBe('moderate');
    expect(typeof parsed.robustness?.display_verdict_reason).toBe('string');
  });

  it('parses zero_reason + evpi_status below_resolution without a fabricated 0', () => {
    const parsed = AnalysisEnrichmentSchema.parse(enrichment);
    const pinned = parsed.factor_sensitivity!.find((f) => f.factor_id === 'fac_pinned')!;
    expect(pinned.zero_reason).toBe('intervention_override');
    expect(pinned.evpi_status).toBe('below_resolution');
    expect(pinned.evpi_percentage_points).toBeUndefined();
  });

  it('parses the suppressed-unreliable variant (constraints_status unavailable, PR #205)', () => {
    const result = AnalysisEnrichmentSchema.safeParse(suppressed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraints_status).toBe('unavailable');
      expect(result.data.constraint_results).toBeUndefined();
      const oc = result.data.option_comparison![0];
      expect(oc.probability_of_joint_goal).toBeUndefined();
      expect(oc.constraint_probabilities).toBeUndefined();
    }
  });
});

describe('AnalysisEnrichmentSchema — additive guarantee', () => {
  it('parses the empty object (blocked/failed analyses, thin content)', () => {
    expect(AnalysisEnrichmentSchema.safeParse({}).success).toBe(true);
  });

  it('passes unknown top-level keys through unchanged', () => {
    const input = {
      some_future_field: { anything: [1, 2, 3] },
      option_comparison_status: 'computed',
    };
    const parsed = AnalysisEnrichmentSchema.parse(input);
    expect(parsed.some_future_field).toEqual({ anything: [1, 2, 3] });
  });

  it('passes unknown nested keys through unchanged (entry-level passthrough)', () => {
    const entry = {
      option_id: 'opt_a',
      win_probability: 0.5,
      future_per_option_field: 'kept',
    };
    const parsed = EnrichmentOptionComparisonEntrySchema.parse(entry);
    expect((parsed as Record<string, unknown>).future_per_option_field).toBe('kept');
  });

  it('parses the CEE→UI keep-list projection of the real capture', () => {
    const fixture = loadFixture('plot-to-cee.run-analysis.staging.json');
    const enrichment = fixture.enrichment as Record<string, unknown>;
    // Reproduce CEE's toSafeTransportEnrichment shape: shallow keep-list pick.
    // (The deep internal-key strip is a CEE behaviour; key-set is what matters
    // for schema coverage here.)
    const projected: Record<string, unknown> = {};
    for (const key of CEE_UI_ENRICHMENT_KEEP_LIST) {
      if (enrichment[key] !== undefined) projected[key] = enrichment[key];
    }
    expect(Object.keys(projected).length).toBeGreaterThan(0);
    expect(AnalysisEnrichmentSchema.safeParse(projected).success).toBe(true);
  });

  it('helpers: parseAnalysisEnrichment + isAnalysisEnrichment never throw', () => {
    expect(parseAnalysisEnrichment(undefined).success).toBe(false);
    expect(parseAnalysisEnrichment(null).success).toBe(false);
    expect(parseAnalysisEnrichment('nope').success).toBe(false);
    expect(parseAnalysisEnrichment({}).success).toBe(true);
    expect(isAnalysisEnrichment({})).toBe(true);
    expect(isAnalysisEnrichment([])).toBe(false);
  });
});

describe('AnalysisEnrichmentSchema — rejects malformed known keys (the drift class)', () => {
  it('rejects factor_sensitivity as an object instead of an array', () => {
    const result = AnalysisEnrichmentSchema.safeParse({
      factor_sensitivity: { factor_id: 'fac_x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a factor_sensitivity entry without factor_id', () => {
    const result = AnalysisEnrichmentSchema.safeParse({
      factor_sensitivity: [{ factor_label: 'X', influence_score: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an inference warning without code/severity', () => {
    expect(
      EnrichmentInferenceWarningSchema.safeParse({ message: 'hi' }).success,
    ).toBe(false);
    expect(
      EnrichmentInferenceWarningSchema.safeParse({
        code: 'X', message: 'hi', severity: 'fatal',
      }).success,
    ).toBe(false);
  });

  it('rejects confidence_tier outside the producer vocabulary', () => {
    expect(
      AnalysisEnrichmentSchema.safeParse({ confidence_tier: 'excellent' }).success,
    ).toBe(false);
  });

  it('rejects option_comparison_status outside the PerFeatureStatus vocabulary', () => {
    expect(
      AnalysisEnrichmentSchema.safeParse({ option_comparison_status: 'done' }).success,
    ).toBe(false);
  });

  it('rejects a flip threshold missing flip_reason', () => {
    expect(
      EnrichmentFlipThresholdSchema.safeParse({
        factor_id: 'f', factor_label: 'F', current_value: 1,
        flip_value: null, direction: 'decrease',
      }).success,
    ).toBe(false);
  });
});

describe('F6 (schemas #16) — constraint margins + scale/decision-grade provenance', () => {
  // A captured PLoT-shaped margin: £24000 over a cost cap, understated because
  // the option's intervention clamped in the operator-compatible direction.
  const capturedMargin = {
    constraint_id: 'c_cost_cap',
    failure_margin_median: 24000,
    near_miss_fraction: 0.15,
    margin_precision: 'lower_bound',
  };

  it('accepts the captured PLoT constraint-margin shape', () => {
    const result = EnrichmentConstraintMarginSchema.safeParse(capturedMargin);
    if (!result.success) {
      throw new Error(`captured margin failed to parse: ${result.error.message}`);
    }
    expect(result.data.failure_margin_median).toBe(24000);
    expect(result.data.margin_precision).toBe('lower_bound');
  });

  it('accepts a margin carrying only the required constraint_id (missing ≠ zero)', () => {
    const result = EnrichmentConstraintMarginSchema.safeParse({ constraint_id: 'c_x' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.failure_margin_median).toBeUndefined();
      expect(result.data.near_miss_fraction).toBeUndefined();
    }
  });

  it('accepts an option-comparison entry carrying constraint_margins + constraints_decision_grade', () => {
    const entry = {
      option_id: 'opt_a',
      constraint_margins: [capturedMargin],
      constraints_decision_grade: true,
    };
    const result = EnrichmentOptionComparisonEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraint_margins?.[0].constraint_id).toBe('c_cost_cap');
      expect(result.data.constraints_decision_grade).toBe(true);
    }
  });

  it('accepts a scale_provenance object with every field, and the diverged-range case', () => {
    const unified = EnrichmentScaleProvenanceSchema.safeParse({
      source: 'plot_constraint_normaliser',
      range_unified: true,
      threshold_clamped: 'high',
      decision_grade: true,
    });
    expect(unified.success).toBe(true);
    const diverged = EnrichmentScaleProvenanceSchema.safeParse({
      source: 'plot_constraint_normaliser',
      range_unified: false,
      decision_grade: false,
    });
    expect(diverged.success).toBe(true);
  });

  it('accepts a constraint result carrying scale_provenance', () => {
    const result = EnrichmentConstraintResultSchema.safeParse({
      constraint_id: 'c_cost_cap',
      node_id: 'fac_cost',
      operator: '<=',
      value: 50000,
      probability: 0.4,
      scale_provenance: { source: 'plot', range_unified: true, decision_grade: true },
    });
    expect(result.success).toBe(true);
  });

  // --- REJECT: the malformed-known-key drift class the envelope exists to catch
  it('rejects a negative failure_margin_median (a breach distance cannot be negative)', () => {
    expect(
      EnrichmentConstraintMarginSchema.safeParse({
        constraint_id: 'c_x',
        failure_margin_median: -1,
      }).success,
    ).toBe(false);
  });

  it('rejects margin_precision outside the producer vocabulary', () => {
    expect(
      EnrichmentConstraintMarginSchema.safeParse({
        constraint_id: 'c_x',
        margin_precision: 'invented',
      }).success,
    ).toBe(false);
  });

  it('rejects near_miss_fraction outside [0,1]', () => {
    expect(
      EnrichmentConstraintMarginSchema.safeParse({
        constraint_id: 'c_x',
        near_miss_fraction: 1.5,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-boolean decision_grade on scale_provenance', () => {
    expect(
      EnrichmentScaleProvenanceSchema.safeParse({
        source: 'plot',
        range_unified: true,
        decision_grade: 'yes',
      }).success,
    ).toBe(false);
  });

  it('rejects threshold_clamped outside low|high', () => {
    expect(
      EnrichmentScaleProvenanceSchema.safeParse({
        source: 'plot',
        range_unified: true,
        threshold_clamped: 'middle',
        decision_grade: true,
      }).success,
    ).toBe(false);
  });

  it('freezes the fail-closed ABSENCE RULE verbatim on the trust markers', () => {
    const RULE =
      'Absence of this marker means NOT decision-grade (fail-closed). ' +
      'Consumers MUST NOT treat a missing marker as trustworthy.';
    const ocShape = EnrichmentOptionComparisonEntrySchema._def.shape();
    expect(ocShape.constraints_decision_grade.description).toBe(RULE);
    const spShape = EnrichmentScaleProvenanceSchema._def.shape();
    expect(spShape.decision_grade.description).toBe(RULE);
    const crShape = EnrichmentConstraintResultSchema._def.shape();
    expect(crShape.scale_provenance.description).toBe(RULE);
  });
});

describe('CEE_UI_ENRICHMENT_KEEP_LIST — drift pin', () => {
  it('matches the CEE compose.ts P0B keep-list exactly (18 keys)', () => {
    // Mirrored from olumi-assistants-service
    // src/orchestrator-v5/compose.ts P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP.
    // The CEE-side contract test asserts the same list against its own
    // constant; if CEE changes the list, BOTH tests must move in the same
    // PR pair. 0.19.0 adds `decision_brief` (wave-2 ask 3) — the paired
    // CEE change lands in the CEE re-vendor PR of the same wave.
    // 0.30.0 adds the VOI family (V7-C slice 1a); the paired CEE change is
    // the 0.30.0 re-vendor PR.
    // 0.31.0 adds `critiques` (M3 step 1); the paired CEE change is the
    // 0.31.0 re-vendor PR, which adds it to
    // P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP. UNTIL THAT LANDS THE TWO LISTS ARE
    // DELIBERATELY OUT OF STEP, and the CEE-side parity test is what reports
    // it — that RED is the intended signal, not a regression here.
    // 0.44.0 adds `conditional_winners` (ROADMAP 2.177); the paired CEE change
    // is the 0.44.0 re-vendor PR, which adds it to
    // P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP and rules it `projected` in the
    // withheld-claim registry. Same deliberate out-of-step window as 0.31.0.
    expect([...CEE_UI_ENRICHMENT_KEEP_LIST].sort()).toEqual([
      'conditional_probabilities',
      'conditional_winners',
      'confidence_tier',
      'correlation_model',
      'critiques',
      'decision_brief',
      'decision_evpi',
      'decision_review',
      'edge_e_values',
      'factor_evppi',
      'factor_sensitivity',
      'flip_thresholds',
      'inference_warnings',
      'option_comparison',
      'option_comparison_status',
      'p_win_sensitivity',
      'results',
      'robustness',
    ]);
  });

  // 0.30.0 — the additive assertion, stated as its own claim rather than left
  // to a reader diffing two sorted literals. HAZARD 1 (skew) is exactly this:
  // a consumer on an older pin silently drops what it does not know, so the
  // ONLY safe shape for a keep-list change is pure addition. This test fails
  // if any pre-0.30.0 key was renamed, reordered out, or dropped, and it
  // states the delta as a set so a future bump cannot smuggle a removal
  // through a re-sorted literal.
  // 0.31.0 restructures this test into a PER-RELEASE LEDGER. The 0.30.0 form
  // hard-coded one release's delta, so the next additive release could only be
  // recorded by editing the previous release's claim away — which is how an
  // additive ledger quietly becomes a snapshot that proves nothing about
  // history. Appending a row per release keeps EVERY release's additive claim
  // independently asserted, and the reconstruction check below is what makes
  // the ledger fail loud if a key is ever dropped or renamed rather than added.
  const PRE_0_30_0 = [
    'option_comparison',
    'factor_sensitivity',
    'results',
    'robustness',
    'decision_review',
    'option_comparison_status',
    'conditional_probabilities',
    'edge_e_values',
    'inference_warnings',
    'confidence_tier',
    'flip_thresholds',
    'decision_brief',
  ] as const;
  const ADDED_0_30_0 = [
    'correlation_model',
    'decision_evpi',
    'factor_evppi',
    'p_win_sensitivity',
  ] as const;
  // 0.31.0 — critiques transport (M3 step 1).
  const ADDED_0_31_0 = ['critiques'] as const;
  // 0.44.0 — conditional_winners (ROADMAP 2.177).
  const ADDED_0_44_0 = ['conditional_winners'] as const;

  /**
   * The ledger, one row per release. 0.44.0 turns the per-release assertion
   * below into a DERIVED walk over this array.
   *
   * WHY. The 0.31.0 form hard-coded one release's delta as
   * "everything not in the 0.30.0 set", which is only true while 0.31.0 is the
   * LAST release — the next additive release makes that filter pick up its keys
   * too, so the only way to keep it green was to edit the previous release's
   * claim away. That is precisely the failure the 0.31.0 comment above warns
   * about ("an additive ledger quietly becomes a snapshot that proves nothing
   * about history"), and it fired on schedule here. Walking the ledger keeps
   * every release's claim independently asserted and makes the next release an
   * APPENDED ROW rather than an edit to history.
   */
  const KEEP_LIST_LEDGER = [
    { release: 'pre-0.30.0', added: PRE_0_30_0 },
    { release: '0.30.0', added: ADDED_0_30_0 },
    { release: '0.31.0', added: ADDED_0_31_0 },
    { release: '0.44.0', added: ADDED_0_44_0 },
  ] as const;

  it('every release is PURELY ADDITIVE (no key ever changed or lost)', () => {
    const current = new Set<string>(CEE_UI_ENRICHMENT_KEEP_LIST);
    const ledgerKeys = KEEP_LIST_LEDGER.flatMap((row) => [...row.added]);
    for (const key of ledgerKeys) {
      expect(current.has(key), `a later release must not drop ${key}`).toBe(true);
    }
    // The reconstruction check: the ledger must account for the WHOLE list.
    // Without this, a key added without a ledger row would sail through the
    // loop above, and a removal disguised as a re-sort would too.
    expect([...current].sort()).toEqual(ledgerKeys.slice().sort());
  });

  it.each(KEEP_LIST_LEDGER.map((row, index) => [index, row.release] as const))(
    'ledger row %i (%s) adds exactly what it claims, and nothing earlier is lost',
    (index) => {
      const throughRelease = KEEP_LIST_LEDGER.slice(0, index + 1).flatMap((row) => [
        ...row.added,
      ]);
      const addedLater = new Set<string>(
        KEEP_LIST_LEDGER.slice(index + 1).flatMap((row) => [...row.added]),
      );
      // The live list with every LATER release's additions removed must be
      // exactly the cumulative ledger through this release. Reconstructing from
      // the live constant (not from the ledger alone) is what keeps this a real
      // check rather than the ledger agreeing with itself.
      const liveThroughRelease = [...CEE_UI_ENRICHMENT_KEEP_LIST].filter(
        (key) => !addedLater.has(key),
      );
      expect(liveThroughRelease.sort()).toEqual(throughRelease.slice().sort());
    },
  );

  it('every keep-list key is a typed field on the envelope', () => {
    const shape = AnalysisEnrichmentSchema._def.shape();
    for (const key of CEE_UI_ENRICHMENT_KEEP_LIST) {
      expect(Object.prototype.hasOwnProperty.call(shape, key), `missing ${key}`).toBe(true);
    }
  });
});

// ============================================================================
// 0.28.0 — robustness edge `switch_probability` is OPTIONAL.
//
// WHY THIS EXISTS. `z.number()` REQUIRED offered a producer only two dishonest
// options when no measurement exists, and PLoT took one of them: ISL emits
// `robust_edges` as bare "from->to" STRINGS, so `normalizeRobustEdge`
// hardcoded `switch_probability: 1` — absent data rendered as the MAXIMUM of an
// INVERTED scale (higher = more fragile; `classifyEdgeSeverity` >0.7 →
// 'critical', and the doctrine-013 `visible` gate, both derive from it).
// plot-lite-service#278 implemented the honest omission, MEASURED that every
// /v2/run response then failed its own egress contract
// (`enrichment_contract_ok: false` + a user-visible ENRICHMENT_CONTRACT_MISMATCH
// on the wire), and reverted rather than trade a wrong number for a standing
// false alarm. This block is the schema side of that unblock.
//
// The required-ness was never a live invariant: PLoT's own published
// `NormalizedEdgeInfoV3.switch_probability?: number` is optional,
// `normalizeFragileEdge` already omits, and
// `EnrichmentM1CoachingSchema.top_fragile_edge.switch_probability` in this very
// file is optional. It was a latent disagreement that only bit when a producer
// became honest.
//
// The three arms below are deliberately distinct claims:
//   UNBLOCK  — omission now parses (this is what was RED before 0.28.0);
//   POSITIVE — a present value still round-trips, and a measured 0 is NOT
//              confused with absence (the two states must stay separable);
//   NEGATIVE — optional did NOT become unvalidated: null, NaN, strings and
//              other non-numbers are still rejected, at the bare schema AND
//              through the envelope a consumer actually parses.
// ============================================================================
describe('EnrichmentRobustnessEdgeSchema.switch_probability — optional, absent ≠ 0 (0.28.0)', () => {
  const baseEdge = {
    edge_id: 'fac_demand->goal_revenue',
    from_id: 'fac_demand',
    to_id: 'goal_revenue',
  } as const;

  /** The bytes a consumer actually parses: the whole enrichment envelope. */
  function envelopeWith(edges: {
    fragile?: Record<string, unknown>[];
    robust?: Record<string, unknown>[];
  }) {
    return {
      robustness: {
        ...(edges.fragile ? { fragile_edges: edges.fragile } : {}),
        ...(edges.robust ? { robust_edges: edges.robust } : {}),
      },
    };
  }

  // ---------------------------------------------------------------- UNBLOCK
  it('THE UNBLOCK: an edge that OMITS switch_probability parses', () => {
    const result = EnrichmentRobustnessEdgeSchema.safeParse(baseEdge);
    if (!result.success) {
      throw new Error(`omission must parse: ${result.error.message}`);
    }
    expect(result.success).toBe(true);
  });

  it('THE UNBLOCK at the boundary: robust_edges AND fragile_edges carrying no switch_probability parse through the envelope', () => {
    // ONE schema types both arrays, so the unblock must hold on both. The
    // robust arm is the live PLoT case (ISL sends bare strings); the fragile
    // arm is the LATENT skew that existed before this change — PLoT's
    // normalizeFragileEdge already omits, so a legacy string-format fragile
    // edge would have tripped the identical guard.
    const result = AnalysisEnrichmentSchema.safeParse(
      envelopeWith({ fragile: [{ ...baseEdge }], robust: [{ ...baseEdge, edge_id: 'a->b' }] }),
    );
    if (!result.success) {
      throw new Error(`envelope omission must parse: ${result.error.message}`);
    }
    const robustness = result.data.robustness as Record<string, unknown>;
    expect((robustness.fragile_edges as unknown[])).toHaveLength(1);
    expect((robustness.robust_edges as unknown[])).toHaveLength(1);
  });

  it('absence survives parsing AS ABSENCE — no default is injected', () => {
    // The defect this unblocks is "a consumer reads absence as a number".
    // Parsing must not do that job for it: the key must not exist on the way
    // out, so a `'switch_probability' in edge` reader stays correct.
    const parsed = EnrichmentRobustnessEdgeSchema.parse(baseEdge);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'switch_probability')).toBe(false);
    expect(parsed.switch_probability).toBeUndefined();
  });

  // --------------------------------------------------------------- POSITIVE
  it('POSITIVE: a measured value round-trips verbatim through the envelope', () => {
    const parsed = AnalysisEnrichmentSchema.parse(
      envelopeWith({ fragile: [{ ...baseEdge, switch_probability: 0.42, severity: 'warning' }] }),
    );
    const edge = (parsed.robustness as Record<string, unknown[]>)
      .fragile_edges[0] as Record<string, unknown>;
    expect(edge.switch_probability).toBe(0.42);
    expect(edge.severity).toBe('warning');
  });

  it('POSITIVE CONTROL: a measured ZERO is a measurement and stays distinguishable from absence', () => {
    // The whole point of the optionality. If these two collapsed into one
    // state the relaxation would have made things worse, not better.
    const measuredZero = EnrichmentRobustnessEdgeSchema.parse({
      ...baseEdge,
      switch_probability: 0,
    });
    const absent = EnrichmentRobustnessEdgeSchema.parse(baseEdge);
    expect(measuredZero.switch_probability).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(measuredZero, 'switch_probability')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(absent, 'switch_probability')).toBe(false);
  });

  // --------------------------------------------------------------- NEGATIVE
  // An optional field must not become an UNVALIDATED field. Each case is a
  // shape this estate has actually produced or could produce on the wire.
  const rejected: Array<[string, unknown]> = [
    ['an explicit null (optional is NOT nullable — PLoT writes `?? null` on sibling stat fields)', null],
    ['NaN (the shape a `0/0` or a parsed-empty-string produces)', Number.NaN],
    ['a numeric STRING (the shape a JSON producer emits when it stringifies)', '0.42'],
    ['a boolean', true],
    ['an object', { value: 0.42 }],
  ];

  for (const [label, value] of rejected) {
    it(`NEGATIVE: still rejects ${label}`, () => {
      expect(
        EnrichmentRobustnessEdgeSchema.safeParse({ ...baseEdge, switch_probability: value }).success,
        `bare schema accepted ${JSON.stringify(value)}`,
      ).toBe(false);
      // ...and at the boundary the consumer parses, on BOTH arrays.
      expect(
        AnalysisEnrichmentSchema.safeParse(
          envelopeWith({ fragile: [{ ...baseEdge, switch_probability: value }] }),
        ).success,
        `fragile_edges accepted ${JSON.stringify(value)}`,
      ).toBe(false);
      expect(
        AnalysisEnrichmentSchema.safeParse(
          envelopeWith({ robust: [{ ...baseEdge, switch_probability: value }] }),
        ).success,
        `robust_edges accepted ${JSON.stringify(value)}`,
      ).toBe(false);
    });
  }

  it('VACUITY GUARD: the negative arm above is not passing because the envelope shape is wrong', () => {
    // Trap 13 — an absence/rejection assertion must first prove it can see a
    // PRESENCE. The exact same envelope builder, with a legal value, passes on
    // both arrays. Without this, a typo in `envelopeWith` would make every
    // rejection above vacuous.
    expect(
      AnalysisEnrichmentSchema.safeParse(
        envelopeWith({ fragile: [{ ...baseEdge, switch_probability: 0.42 }] }),
      ).success,
    ).toBe(true);
    expect(
      AnalysisEnrichmentSchema.safeParse(
        envelopeWith({ robust: [{ ...baseEdge, switch_probability: 0.42 }] }),
      ).success,
    ).toBe(true);
  });

  it('the identity fields stay REQUIRED — relaxing the measurement did not relax the edge identity', () => {
    // Scope pin. `edge_id`/`from_id`/`to_id` are derivable from the edge id by
    // the producer in EVERY arm (parseEdgeId), so "absent because not computed"
    // is not a real state for them and they are deliberately untouched.
    expect(EnrichmentRobustnessEdgeSchema.safeParse({ from_id: 'a', to_id: 'b' }).success).toBe(false);
    expect(EnrichmentRobustnessEdgeSchema.safeParse({ edge_id: '', from_id: 'a', to_id: 'b' }).success).toBe(false);
    expect(EnrichmentRobustnessEdgeSchema.safeParse({ edge_id: 'a->b', to_id: 'b' }).success).toBe(false);
  });

  // ---------------------------------------------------- DOCUMENTATION DUTY
  it('the absence semantics travel WITH the field (.describe(), not a comment)', () => {
    // An optional field that means "not computed" must SAY so where a consumer
    // can read it. A JSDoc comment is stripped at the boundary; a Zod
    // `.description` ships in dist/ AND lands in the published
    // json-schema/ document. (On who actually reads json-schema/ today — not
    // ISL, despite what this repo used to claim — see the header of
    // tests/json-schema.test.ts.)
    const shape = EnrichmentRobustnessEdgeSchema._def.shape();
    const description = shape.switch_probability.description ?? '';
    expect(description).toContain('Absence means NOT COMPUTED');
    expect(description).toContain('never 0 and never 1');
    expect(description).toContain('measured 0 is a real measurement');
    expect(description).toContain('Higher means MORE fragile');
    expect(description).toContain('never coalesce');
  });
});

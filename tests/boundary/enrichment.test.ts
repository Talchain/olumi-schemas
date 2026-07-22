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
  it('matches the CEE compose.ts P0B keep-list exactly (12 keys)', () => {
    // Mirrored from olumi-assistants-service
    // src/orchestrator-v5/compose.ts P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP.
    // The CEE-side contract test asserts the same list against its own
    // constant; if CEE changes the list, BOTH tests must move in the same
    // PR pair. 0.19.0 adds `decision_brief` (wave-2 ask 3) — the paired
    // CEE change lands in the CEE re-vendor PR of the same wave.
    expect([...CEE_UI_ENRICHMENT_KEEP_LIST].sort()).toEqual([
      'conditional_probabilities',
      'confidence_tier',
      'decision_brief',
      'decision_review',
      'edge_e_values',
      'factor_sensitivity',
      'flip_thresholds',
      'inference_warnings',
      'option_comparison',
      'option_comparison_status',
      'results',
      'robustness',
    ]);
  });

  it('every keep-list key is a typed field on the envelope', () => {
    const shape = AnalysisEnrichmentSchema._def.shape();
    for (const key of CEE_UI_ENRICHMENT_KEEP_LIST) {
      expect(Object.prototype.hasOwnProperty.call(shape, key), `missing ${key}`).toBe(true);
    }
  });
});

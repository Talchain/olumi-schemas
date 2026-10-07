// ============================================================================
// 0.80.0 — PLoT's dominant factor and its tipping-point status reach the browser (science census 6 Oct 2026, §2d C3/C5,
// §4 rank 4).
//
// PLoT emits `dominant_factor`, `flip_thresholds_status` and `flip_thresholds_status_reason` on every /v2/run. CEE's
// keep-list (element-for-element equal to CEE_UI_ENRICHMENT_KEEP_LIST, drift-bolted) dropped all three one hop before
// the browser, so the DGAI readers that already exist for them (the Reasoning tab's "<factor> dominates the model"
// insight, the tornado's status note, the tipping-point gate) could never fire on the V5 path.
//
// RED-first on 0.79.0: none of the three is on the list, so the projection drops them; and `AnalysisEnrichmentSchema`
// is `.passthrough()` with no member for them, so a MALFORMED value parses. Both halves are pinned below.
//
// Out of scope here, deliberately: `driver_order`, `factor_stability`, `edge_sensitivity` (no mounted reader on the V5
// path) and `constraint_results` (already typed; no reader; first-option-derived, so it cannot label per-option cards).
// The control row below keeps `driver_order` OFF the list so this release cannot be read as transporting it.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { AnalysisEnrichmentSchema, CEE_UI_ENRICHMENT_KEEP_LIST } from '../../src/boundary/enrichment.js';

const NEW_KEYS = ['dominant_factor', 'flip_thresholds_status', 'flip_thresholds_status_reason'] as const;

/** PLoT's producer shapes (`engine-v3.ts` RunResponseV3), as a /v2/run carries them. */
const PLOT_ENVELOPE: Record<string, unknown> = {
  factor_sensitivity: [{ factor_id: 'fac_customer_demand', factor_label: 'Customer demand', influence_score: 0.8 }],
  dominant_factor: { factor_id: 'fac_customer_demand', factor_label: 'Customer demand' },
  flip_thresholds: [],
  flip_thresholds_status: 'partial_no_effect',
  flip_thresholds_status_reason: 'timeout',
  driver_order: { basis: 'graph', ranked_factor_ids: ['fac_customer_demand'] },
};

/** The keep-list projection CEE applies (compose.ts `toSafeTransportEnrichment`, minus its deep internal-key strip). */
function project(envelope: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CEE_UI_ENRICHMENT_KEEP_LIST) {
    if (envelope[key] !== undefined) out[key] = envelope[key];
  }
  return out;
}

describe('0.80.0 · the three keys are on the CEE→UI keep-list', () => {
  it.each(NEW_KEYS)('RED: %s is keep-listed', (key) => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toContain(key);
  });

  it('RED: the projection carries all three VERBATIM, bound to the factor id and the status word', () => {
    const shipped = project(PLOT_ENVELOPE);
    expect(shipped.dominant_factor).toEqual({ factor_id: 'fac_customer_demand', factor_label: 'Customer demand' });
    expect(shipped.flip_thresholds_status).toBe('partial_no_effect');
    expect(shipped.flip_thresholds_status_reason).toBe('timeout');
  });

  it('CONTROL: driver_order stays OFF the list — it has no mounted reader, and this release does not claim it', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).not.toContain('driver_order');
    expect(project(PLOT_ENVELOPE)).not.toHaveProperty('driver_order');
  });

  it('the projected envelope parses against AnalysisEnrichmentSchema', () => {
    const parsed = AnalysisEnrichmentSchema.safeParse(project(PLOT_ENVELOPE));
    expect(parsed.success).toBe(true);
  });
});

describe('0.80.0 · dominant_factor is typed: a malformed one is refused, a well-formed one survives whole', () => {
  it('a well-formed dominant_factor parses, and an extra producer member is kept (passthrough)', () => {
    const parsed = AnalysisEnrichmentSchema.parse({
      dominant_factor: { factor_id: 'fac_customer_demand', factor_label: 'Customer demand', share: 0.8 },
    });
    expect(parsed.dominant_factor).toEqual({
      factor_id: 'fac_customer_demand',
      factor_label: 'Customer demand',
      share: 0.8,
    });
  });

  it.each([
    ['a missing label', { factor_id: 'fac_customer_demand' }],
    ['a non-string id', { factor_id: 7, factor_label: 'Customer demand' }],
    ['a bare string', 'fac_customer_demand'],
    ['an array', ['fac_customer_demand', 'Customer demand']],
  ])('RED: a dominant_factor that is %s is refused', (_name, value) => {
    expect(AnalysisEnrichmentSchema.safeParse({ dominant_factor: value }).success).toBe(false);
  });

  it('absence parses: the key is optional, and absent means "no factor was found dominant"', () => {
    expect(AnalysisEnrichmentSchema.safeParse({}).success).toBe(true);
    expect(AnalysisEnrichmentSchema.shape.dominant_factor.description).toMatch(/Never substitute rank 1/);
  });
});

describe('0.80.0 · the tipping-point status pair is typed as bare strings (consumers narrow)', () => {
  it.each(['computed', 'all_no_effect', 'partial_no_effect', 'unresolved', 'unavailable', 'a_sixth_word'])(
    'flip_thresholds_status "%s" parses: an unknown word is the CONSUMER\'s to narrow, not an envelope refusal',
    (status) => {
      expect(AnalysisEnrichmentSchema.safeParse({ flip_thresholds_status: status }).success).toBe(true);
    },
  );

  it.each([
    ['flip_thresholds_status', 3],
    ['flip_thresholds_status', { status: 'computed' }],
    ['flip_thresholds_status_reason', false],
    ['flip_thresholds_status_reason', ['unresolved']],
  ])('RED: a non-string %s (%j) is refused', (key, value) => {
    expect(AnalysisEnrichmentSchema.safeParse({ [key]: value }).success).toBe(false);
  });
});

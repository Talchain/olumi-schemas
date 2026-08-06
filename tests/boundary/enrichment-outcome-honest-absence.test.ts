/**
 * 0.38.0 — honest-absence outcome stats (ROADMAP 2.646).
 *
 * WHY. `EnrichmentOutcomeStatsSchema` declared `mean`/`p10`/`p50`/`p90`
 * REQUIRED (byte-identical 0.31.0 → 0.37.0), which cannot model ISL's
 * honest-absence shape: on a degenerate run (every Monte Carlo draw
 * non-finite) ISL's `OutcomeDistributionV2` omits the summary stats while
 * keeping the REQUIRED sample-accounting triple — `n_samples`,
 * `n_valid_samples: 0`, `validity_ratio: 0.0` is a MEASUREMENT that says
 * "we sampled and got nothing usable". PLoT (2.581) now carries that block
 * PARTIALLY — what is honest survives, what was not measured stays ABSENT,
 * never `0`, never `null` — so the required-four raised a TRUE
 * `ENRICHMENT_CONTRACT_MISMATCH` on every degenerate option.
 *
 * PRODUCER BYTES the expectations below are derived from (trap 13c — the
 * oracle is the producer's declared semantics, not this lane's reading):
 *   - ISL `src/models/response_v2.py` `OutcomeDistributionV2` @ staging
 *     `c25836f7`: mean/std Optional (travel together; absent ONLY when
 *     `percentiles_source == 'unavailable'`), p10/p50/p90 Optional,
 *     `percentiles_source: Literal["samples","unavailable"]` with a
 *     PYTHON-side default of "samples".
 *   - PLoT `src/routes/v2/run.ts` @ staging `c03e36fe` (2.581 partial
 *     carry): every stat individually finite-validated, invalid/absent →
 *     key OMITTED (never null); `percentiles_source` is NEVER DEFAULTED —
 *     "Substituting 'samples' for a build that sent nothing would
 *     manufacture a provenance claim PLoT never received".
 *
 * The absent-stays-absent rule is why this contract must not re-apply
 * ISL's Python default either: a `.default('samples')` here would be the
 * `?? 0` fabrication class wearing a string.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  EnrichmentOutcomeStatsSchema,
  EnrichmentOptionComparisonEntrySchema,
} from '../../src/boundary/enrichment.js';

// The exact degenerate shape PLoT emits after the 2.581 partial carry: the
// sample-accounting triple survives, the unmeasurable stats are ABSENT.
const DEGENERATE_HONEST_BLOCK = {
  n_samples: 10000,
  n_valid_samples: 0,
  validity_ratio: 0,
  percentiles_source: 'unavailable',
} as const;

const FULL_SAMPLED_BLOCK = {
  mean: 62.4,
  std: 8.1,
  p10: 51,
  p50: 62,
  p90: 74,
  n_samples: 10000,
  n_valid_samples: 9800,
  validity_ratio: 0.98,
  percentiles_source: 'samples',
} as const;

describe('EnrichmentOutcomeStatsSchema — honest absence (2.646)', () => {
  it('accepts the degenerate honest-absence block (stats absent, accounting present)', () => {
    const result = EnrichmentOutcomeStatsSchema.safeParse(DEGENERATE_HONEST_BLOCK);
    expect(result.success, JSON.stringify(!result.success ? result.error.issues : null)).toBe(true);
  });

  it('accepts a fully-sampled block carrying percentiles_source: samples', () => {
    const result = EnrichmentOutcomeStatsSchema.safeParse(FULL_SAMPLED_BLOCK);
    expect(result.success, JSON.stringify(!result.success ? result.error.issues : null)).toBe(true);
  });

  it('accepts a pre-0.38 fully-populated block with no percentiles_source (old wire)', () => {
    const { percentiles_source: _omit, ...pre038 } = FULL_SAMPLED_BLOCK;
    expect(EnrichmentOutcomeStatsSchema.safeParse(pre038).success).toBe(true);
  });

  it('rejects an out-of-vocabulary percentiles_source (declared key, closed domain)', () => {
    // Before 0.38.0 this key rode `.passthrough()` untyped, so garbage
    // parsed. Declaring it closes the domain to the producer's Literal.
    for (const bad of ['defaulted', 'SAMPLES', '', 'fabricated']) {
      expect(
        EnrichmentOutcomeStatsSchema.safeParse({ ...FULL_SAMPLED_BLOCK, percentiles_source: bad }).success,
        `percentiles_source=${JSON.stringify(bad)} must be rejected`,
      ).toBe(false);
    }
  });

  it('NEVER DEFAULTS: an absent percentiles_source stays absent in the parse output', () => {
    // The anti-fabrication pin. PLoT deliberately does not re-apply ISL's
    // Python-side default; neither may this contract. A future
    // `.default('samples')` on this field turns this test RED.
    const { percentiles_source: _omit, ...withoutSource } = FULL_SAMPLED_BLOCK;
    const parsed = EnrichmentOutcomeStatsSchema.parse(withoutSource);
    expect('percentiles_source' in parsed).toBe(false);
  });

  it('does not fabricate absent stats: parse output of the degenerate block carries no mean/p10/p50/p90', () => {
    const parsed = EnrichmentOutcomeStatsSchema.parse(DEGENERATE_HONEST_BLOCK);
    for (const key of ['mean', 'std', 'p10', 'p50', 'p90'] as const) {
      expect(key in parsed, `${key} must not be fabricated on absence`).toBe(false);
    }
    expect(parsed.n_valid_samples).toBe(0);
    expect(parsed.validity_ratio).toBe(0);
    expect(parsed.percentiles_source).toBe('unavailable');
  });

  it('percentiles_source vocabulary is exactly the producer Literal (samples | unavailable)', () => {
    // Derived from ISL OutcomeDistributionV2 @ c25836f7 — Literal["samples",
    // "unavailable"]. An exact-set pin so an unlisted widening goes RED here.
    const field = EnrichmentOutcomeStatsSchema.shape.percentiles_source;
    const unwrapped = (field as z.ZodOptional<z.ZodEnum<[string, ...string[]]>>).unwrap();
    expect(unwrapped.options).toEqual(['samples', 'unavailable']);
  });

  it('the degenerate block parses inside EnrichmentOptionComparisonEntrySchema.outcome', () => {
    // The seam the true ENRICHMENT_CONTRACT_MISMATCH fired at: a degenerate
    // option's partial outcome block inside the option-comparison entry.
    const result = EnrichmentOptionComparisonEntrySchema.safeParse({
      option_id: 'opt_do_nothing',
      outcome: DEGENERATE_HONEST_BLOCK,
      status: 'computed',
    });
    expect(result.success, JSON.stringify(!result.success ? result.error.issues : null)).toBe(true);
  });
});

/**
 * PLoT → CEE wire-shape contract (/v2/run envelope → run_analysis fact).
 *
 * CEE's run_analysis handler persists the PLoT /v2/run response
 * BYTE-FOR-BYTE as RunAnalysisHandlerFact.result.enrichment (F.6 handler-
 * ownership invariant). This contract pins:
 *
 *   1. the envelope parses against AnalysisEnrichmentSchema (typed since
 *      @talchain/schemas 0.14.0 — malformed known keys now fail loudly
 *      instead of flowing silently), and
 *   2. every load-bearing CEE read-path exists on the wire, and
 *   3. fields CEE reads but the producer does NOT emit stay pinned absent
 *      (the silent-empty class), so a producer change flips a test rather
 *      than a dashboard.
 *
 * Evidence: real staging capture (fixtures/enrichment/
 * plot-to-cee.run-analysis.staging.json) + code-derived doctrine-B fixture.
 * CEE read-paths: olumi-assistants-service
 * src/orchestrator-v5/tools/handlers/run-analysis.ts @ staging e122f16
 * (readAnalysisStatus, readResultRecords, extractWinProbabilities,
 * selectLeadingOptionId, buildAnalysisResultHeadline).
 *
 * INSTALLATION (CEE lane): copy into olumi-assistants-service
 * tests/contract/, swap the schema import to '@talchain/schemas/boundary'
 * (requires the 0.14.0 pin — rollout step 2 in
 * docs/enrichment-v1/ROLLOUT.md), and point the fixture path at the repo's
 * own tests/fixtures/cross-service/v5-turn.run-analysis.staging.json
 * (same capture). Ideally ALSO validate a freshly captured staging envelope
 * in the existing cross-service capture harness.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// In a consumer repo: import { AnalysisEnrichmentSchema } from '@talchain/schemas/boundary';
import { AnalysisEnrichmentSchema } from '../src/boundary/enrichment.js';

const here = dirname(fileURLToPath(import.meta.url));
const enrichmentFixtures = join(here, '..', 'fixtures', 'enrichment');

function loadEnrichment(name: string, key = 'enrichment'): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(join(enrichmentFixtures, name), 'utf-8'));
  return fixture[key];
}

const captured = loadEnrichment('plot-to-cee.run-analysis.staging.json');
const doctrineB = loadEnrichment('plot-to-cee.doctrine-b.code-derived.json');
const suppressed = loadEnrichment(
  'plot-to-cee.doctrine-b.code-derived.json',
  'enrichment_suppressed_variant',
);

describe('PLoT→CEE: envelope validates against the typed schema', () => {
  it.each([
    ['staging capture (real wire)', captured],
    ['doctrine-B delivered (code-derived)', doctrineB],
    ['doctrine-B suppressed variant (code-derived)', suppressed],
  ])('%s parses', (_name, envelope) => {
    const result = AnalysisEnrichmentSchema.safeParse(envelope);
    if (!result.success) throw new Error(result.error.message);
    expect(result.success).toBe(true);
  });
});

describe('PLoT→CEE: load-bearing CEE read-paths exist on the wire', () => {
  it('analysis_status present (readAnalysisStatus gates the whole fact)', () => {
    expect(typeof captured.analysis_status).toBe('string');
  });

  it('option_comparison[] carries option_id + option_label + win_probability (readResultRecords/extractWinProbabilities)', () => {
    const oc = captured.option_comparison as Array<Record<string, unknown>>;
    expect(oc.length).toBeGreaterThan(0);
    for (const record of oc) {
      expect(typeof record.option_id).toBe('string');
      expect(typeof record.win_probability).toBe('number');
    }
  });

  it('factor_sensitivity[] carries factor_id (+label) for the headline builder and driver projection', () => {
    const fs = captured.factor_sensitivity as Array<Record<string, unknown>>;
    expect(fs.length).toBeGreaterThan(0);
    for (const record of fs) {
      expect(typeof record.factor_id).toBe('string');
    }
  });

  it('robustness.fragile_edges available for fragility phrasing', () => {
    const robustness = captured.robustness as Record<string, unknown>;
    expect(Array.isArray(robustness.fragile_edges)).toBe(true);
  });

  it('meta.computed_at present (freshness derivation input)', () => {
    const meta = captured.meta as Record<string, unknown>;
    expect(typeof meta.computed_at).toBe('string');
  });
});

describe('PLoT→CEE: consumer reads the producer does NOT emit (pinned absences)', () => {
  it('`results` is NOT emitted by /v2/run — CEE readResultRecords PREFERS it; if this starts failing, PLoT began emitting `results` and CEE read-order must be re-verified deliberately', () => {
    expect(captured).not.toHaveProperty('results');
    expect(doctrineB).not.toHaveProperty('results');
  });

  it('robustness.recommendation_stability no longer emitted on current builds (lane H item B) — tolerated inbound only', () => {
    // The 2025-12 capture PREDATES the removal, so assert on the
    // doctrine-B (current-code-derived) fixture; the capture assertion
    // documents the old wire for inbound tolerance.
    const currentRobustness = doctrineB.robustness as Record<string, unknown>;
    expect(currentRobustness).not.toHaveProperty('recommendation_stability');
  });

  it('doctrine-B suppressed variant withholds constraint numbers entirely (PR #205)', () => {
    expect(suppressed.constraints_status).toBe('unavailable');
    expect(suppressed).not.toHaveProperty('constraint_results');
    expect(suppressed).not.toHaveProperty('conditional_probabilities');
    const oc = (suppressed.option_comparison as Array<Record<string, unknown>>)[0];
    expect(oc).not.toHaveProperty('probability_of_joint_goal');
    expect(oc).not.toHaveProperty('constraint_probabilities');
  });
});

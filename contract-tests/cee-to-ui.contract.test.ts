/**
 * CEE → UI wire-shape contract (analysis_result block enrichment).
 *
 * CEE reduces the persisted 40-key PLoT envelope to the P0-B safe-transport
 * keep-list before it ships on `analysis_result` blocks
 * (olumi-assistants-service src/orchestrator-v5/compose.ts:
 * toSafeTransportEnrichment + stripInternalKeysDeep @ staging e122f16).
 * This contract pins:
 *
 *   1. the keep-list here (@talchain/schemas CEE_UI_ENRICHMENT_KEEP_LIST)
 *      matches what the UI's no-fallback reads require,
 *   2. the projected enrichment parses against AnalysisEnrichmentSchema, and
 *   3. internal carriers never ship (the leak class the keep-list exists
 *      to stop).
 *
 * UI read-path evidence (DecisionGuideAI @ staging eeea43d2):
 *   - option_comparison_status — OutcomePanel.tsx (read, no fallback)
 *   - conditional_probabilities — read with no fallback (CEE keep-list
 *     closure review)
 *   - factor_sensitivity[].influence_score / sensitivity_score —
 *     debug exportBundle field resolvers
 *   - block enrichment container — src/v5/extractPhase3FromV5Response.ts
 *
 * INSTALLATION (CEE lane): copy into olumi-assistants-service
 * tests/contract/ and additionally assert
 * `P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP === CEE_UI_ENRICHMENT_KEEP_LIST`
 * (import both) so the compose.ts list and the schemas list cannot drift.
 * INSTALLATION (UI lane): copy into DecisionGuideAI src/__tests__/contract/
 * and run the projection parse against a captured turn response
 * (blocks[type==='analysis_result'].enrichment) instead of the local
 * projection helper below. Both require the 0.14.0 pin.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// In a consumer repo: import from '@talchain/schemas/boundary';
import {
  AnalysisEnrichmentSchema,
  CEE_UI_ENRICHMENT_KEEP_LIST,
} from '../src/boundary/enrichment.js';

const here = dirname(fileURLToPath(import.meta.url));
const enrichmentFixtures = join(here, '..', 'fixtures', 'enrichment');

/** Keys CEE strips at ANY depth (mirror of compose.ts INTERNAL_ENRICHMENT_KEYS). */
const INTERNAL_KEYS = new Set([
  '_meta', 'meta', '_diagnostics', 'ceeTrace', 'cee_trace', 'debug',
  'payloads', 'downstream_calls', 'graph', 'graph_hash', 'graph_hash_at_run',
  'feature_flags', 'feature_flags_snapshot', 'lineage', 'seed',
  'isl_response', 'isl_engine',
]);

/** Faithful re-implementation of CEE toSafeTransportEnrichment for the pin. */
function stripInternalKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_KEYS.has(k)) continue;
      if (typeof v === 'string' && v.includes('[REDACTED]')) continue;
      out[k] = stripInternalKeysDeep(v);
    }
    return out;
  }
  return value;
}

function projectKeepList(enrichment: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CEE_UI_ENRICHMENT_KEEP_LIST) {
    if (enrichment[key] !== undefined) out[key] = stripInternalKeysDeep(enrichment[key]);
  }
  return out;
}

const fixture = JSON.parse(
  readFileSync(join(enrichmentFixtures, 'plot-to-cee.run-analysis.staging.json'), 'utf-8'),
);
const persisted = fixture.enrichment as Record<string, unknown>;
const projected = projectKeepList(persisted);

describe('CEE→UI: keep-list projection', () => {
  it('parses against AnalysisEnrichmentSchema', () => {
    const result = AnalysisEnrichmentSchema.safeParse(projected);
    if (!result.success) throw new Error(result.error.message);
    expect(result.success).toBe(true);
  });

  it('carries every UI no-fallback read present on the source envelope', () => {
    // option_comparison_status: OutcomePanel read.
    expect(projected.option_comparison_status).toBe(persisted.option_comparison_status);
    // factor_sensitivity influence/sensitivity scores: exportBundle resolvers.
    const fs = projected.factor_sensitivity as Array<Record<string, unknown>>;
    expect(fs.length).toBeGreaterThan(0);
    expect(typeof fs[0].influence_score).toBe('number');
    expect(typeof fs[0].sensitivity_score).toBe('number');
  });

  it('ships NO internal carrier at any depth (leak pin)', () => {
    const violations: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (INTERNAL_KEYS.has(k)) violations.push(`${path}.${k}`);
          walk(v, `${path}.${k}`);
        }
      } else if (typeof value === 'string' && value.includes('[REDACTED]')) {
        violations.push(`${path} carries [REDACTED]`);
      }
    };
    walk(projected, '$');
    expect(violations).toEqual([]);
  });

  it('drops the non-keep-listed keys (they exist on the persisted fact, not the wire)', () => {
    for (const droppedKey of ['m1_coaching', '_meta', 'meta', 'downstream_calls', 'fact_objects', 'critiques']) {
      expect(projected, `${droppedKey} must not ship`).not.toHaveProperty(droppedKey);
    }
  });

  // 0.19.0 (wave-2 ask 3): decision_brief joined the keep-list — the UI's
  // leader-band consumer (DGAI #291/#292) shipped contract-pinned and never
  // fired because this key was stripped. Mutation-check discipline: the
  // PERSISTED copy on this staging capture carries `seed`, `graph_hash` AND
  // `lineage` (verified — that leak risk is WHY the key was originally
  // omitted), so these assertions are their own positive control: if the
  // deep strip ever stops discriminating, the internal-key checks go red.
  it('ships decision_brief WITH its internal lineage stripped (0.19.0)', () => {
    const persistedBrief = persisted.decision_brief as Record<string, unknown>;
    // Positive control — the source really carries the internal keys.
    expect(persistedBrief).toHaveProperty('seed');
    expect(persistedBrief).toHaveProperty('graph_hash');
    expect(persistedBrief).toHaveProperty('lineage');
    // The projection ships the brief…
    const shipped = projected.decision_brief as Record<string, unknown>;
    expect(shipped).toBeDefined();
    expect(shipped.headline).toBe(persistedBrief.headline);
    expect(shipped.options).toEqual(persistedBrief.options);
    // …minus every internal carrier.
    expect(shipped).not.toHaveProperty('seed');
    expect(shipped).not.toHaveProperty('graph_hash');
    expect(shipped).not.toHaveProperty('lineage');
  });
});

describe('CEE→UI: keep-list membership pins', () => {
  it('conditional_probabilities and results stay keep-listed (UI reads with no fallback)', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toContain('conditional_probabilities');
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toContain('results');
  });

  it('m1_coaching stays DEFERRED (carries internal isl_engine provenance token)', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).not.toContain('m1_coaching');
  });

  it('decision_brief is keep-listed (0.19.0, wave-2 ask 3)', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toContain('decision_brief');
  });

  it('keep-list is exactly the CEE compose.ts P0B list (12 keys)', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toHaveLength(12);
  });
});

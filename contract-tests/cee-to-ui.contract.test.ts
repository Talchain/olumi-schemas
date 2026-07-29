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

  it('keep-list is exactly the CEE compose.ts P0B list (16 keys)', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toHaveLength(16);
  });
});

// ============================================================================
// 0.30.0 — the VOI family joins the keep-list (V7-C slice 1a).
//
// WHY THIS BLOCK EXISTS. `factor_evppi`, `decision_evpi`, `p_win_sensitivity`
// and `correlation_model` are emitted by ISL and forwarded verbatim by PLoT,
// and were then stripped HERE — one hop before the browser. The chain was
// whole everywhere except at its last link, which is precisely the shape that
// reads as "the field reaches the UI" in every producer-side probe.
//
// PROVENANCE, STATED HONESTLY: the checked-in staging capture
// (plot-to-cee.run-analysis.staging.json, 2025-12) PREDATES the VOI family and
// carries none of these keys — verified, and it is why the overlay below is
// SYNTHESISED from ISL's typed model rather than captured. That makes this a
// SHAPE pin, not a live-wire pin. The live-wire claim belongs to the staging
// probe in the transport lane's slice 2, and this comment exists so nobody
// reads a green tick here as evidence the bytes arrived.
// ============================================================================

/** Synthesised from ISL `FactorEvppiEntryV2` @ staging 1716f9bb — NOT a capture. */
const VOI_OVERLAY = {
  factor_evppi: [
    {
      factor_id: 'fac_market_receptivity',
      evppi: 0.34,
      evppi_raw: 0.341982,
      units: 'outcome',
      method: 'regression_evppi_v1',
      noise_floor: 0.02,
      status: 'resolved',
      correlation_active: false,
    },
    {
      factor_id: 'fac_hiring_pace',
      evppi: 0,
      evppi_raw: -0.0004,
      units: 'outcome',
      method: 'regression_evppi_v1',
      clamped_low: true,
      noise_floor: 0.02,
      status: 'below_resolution',
    },
  ],
  decision_evpi: 0.91,
  p_win_sensitivity: [{ factor_id: 'fac_market_receptivity', delta_pp: 4.2 }],
  correlation_model: { suppressed_attributions: ['p_win_sensitivity'] },
} as const;

describe('CEE→UI: the VOI family transports (0.30.0)', () => {
  const withVoi = projectKeepList({ ...persisted, ...VOI_OVERLAY });

  it('all four VOI keys are keep-listed', () => {
    for (const key of ['factor_evppi', 'decision_evpi', 'p_win_sensitivity', 'correlation_model']) {
      expect(CEE_UI_ENRICHMENT_KEEP_LIST, `${key} must transport`).toContain(key);
    }
  });

  it('POSITIVE CONTROL: the same projection at the PRE-0.30.0 list strips all four', () => {
    // Trap 13 — an "it arrives now" assertion is vacuous unless it can see the
    // absence it claims to have fixed. This replays the exact keep-list that
    // shipped in 0.19.0-0.29.0 against the same input.
    const PRE_0_30_0 = [
      'option_comparison', 'factor_sensitivity', 'results', 'robustness',
      'decision_review', 'option_comparison_status', 'conditional_probabilities',
      'edge_e_values', 'inference_warnings', 'confidence_tier', 'flip_thresholds',
      'decision_brief',
    ];
    const source = { ...persisted, ...VOI_OVERLAY } as Record<string, unknown>;
    const old: Record<string, unknown> = {};
    for (const key of PRE_0_30_0) {
      if (source[key] !== undefined) old[key] = source[key];
    }
    for (const key of ['factor_evppi', 'decision_evpi', 'p_win_sensitivity', 'correlation_model']) {
      expect(old, `${key} was stripped before 0.30.0`).not.toHaveProperty(key);
    }
    // …and the same source, projected at the CURRENT list, carries them.
    for (const key of ['factor_evppi', 'decision_evpi', 'p_win_sensitivity', 'correlation_model']) {
      expect(withVoi, `${key} transports at 0.30.0`).toHaveProperty(key);
    }
  });

  it('carries factor_evppi rows VERBATIM, in producer order, values untouched', () => {
    const rows = withVoi.factor_evppi as Array<Record<string, unknown>>;
    expect(rows).toEqual(VOI_OVERLAY.factor_evppi);
    // Order is the contract: ISL sorts by evppi DESC and a consumer never re-sorts.
    expect(rows.map((r) => r.factor_id)).toEqual([
      'fac_market_receptivity',
      'fac_hiring_pace',
    ]);
    // The below-resolution row keeps its clamped 0 AND its status — the two
    // together are what stop a consumer reading 0 as "measured worthless".
    expect(rows[1].evppi).toBe(0);
    expect(rows[1].status).toBe('below_resolution');
    expect(rows[1].clamped_low).toBe(true);
  });

  it('the projected VOI family parses against AnalysisEnrichmentSchema', () => {
    const result = AnalysisEnrichmentSchema.safeParse(withVoi);
    if (!result.success) throw new Error(result.error.message);
    expect(result.success).toBe(true);
  });

  it('no VOI shape carries OPTION IDENTITY — the withheld-turn licence', () => {
    // This is the derived basis for CEE passing these keys through a
    // withheld-claim turn unchanged: the leading-option egress guard has
    // nothing to catch because no field in any of these shapes names an
    // option. Asserted by walking the real values, not by reading the types.
    const OPTION_KEY = /(^|_)option(_|$)|option_id|leading_option/i;
    const violations: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (OPTION_KEY.test(k)) violations.push(`${path}.${k}`);
          walk(v, `${path}.${k}`);
        }
      }
    };
    for (const key of ['factor_evppi', 'decision_evpi', 'p_win_sensitivity', 'correlation_model']) {
      walk(withVoi[key], `$.${key}`);
    }
    expect(violations).toEqual([]);
    // Positive control: the walker CAN see an option key when one is present.
    const control: string[] = [];
    const walkControl = (value: unknown, path: string): void => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (OPTION_KEY.test(k)) control.push(`${path}.${k}`);
          walkControl(v, `${path}.${k}`);
        }
      }
    };
    walkControl({ leading_option_id: 'opt_a' }, '$');
    expect(control).toEqual(['$.leading_option_id']);
  });

  it('the VOI keys survive the deep internal-key strip untouched', () => {
    // stripInternalKeysDeep removes {_meta, meta, seed, graph_hash, lineage, …}
    // at any depth. Zero collisions with any VOI field name — pinned here so a
    // future addition to INTERNAL_ENRICHMENT_KEYS that DID collide goes red.
    for (const key of Object.keys(VOI_OVERLAY.factor_evppi[0])) {
      expect(INTERNAL_KEYS.has(key), `${key} must not be an internal-strip key`).toBe(false);
    }
    expect(INTERNAL_KEYS.has('suppressed_attributions')).toBe(false);
  });
});

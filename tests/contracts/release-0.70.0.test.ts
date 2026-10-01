// ============================================================================
// 0.70.0 — PANEL L5(b) (#85 5930973561; DL 5930981429: the next additive release after 0.69.0): the KNOWN producer
//   vocabulary of `zero_reason`, as `ZeroSensitivityReason`.
//   ISL `ZeroSensitivityReason` (src/models/response_v2.py:101-106, staging 04836e20b0ba12f38417c17a12eeb91a0d05ccdd): 6.
//   PLoT `src/lib/factor-influence.ts:853` (staging 2f2427f7d97772d381846261d344d8661c7c3def): `no_path_to_goal`,
//   `zero_net_influence`.
//
// RED-first: before 0.70.0 there is no such export; the UI cast the wire string and PLoT's two codes had no label
// (the 1 Oct Reasoning-tab `charAt` crash). The wire field itself stays OPEN — a control below.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { EnrichmentFactorSensitivityEntrySchema, ZeroSensitivityReason } from '../../src/boundary/enrichment.js';
import * as boundary from '../../src/boundary/index.js';

const ISL = ['zero_outcome_diff', 'zero_delta', 'intervention_override', 'disconnected', 'baseline_normalised', 'point_mass'];
const PLOT = ['no_path_to_goal', 'zero_net_influence'];

describe('0.70.0 · ZeroSensitivityReason (the known zero_reason vocabulary)', () => {
  it('RED: exactly the 8 producer codes, ISL first then PLoT', () => {
    expect(ZeroSensitivityReason.options).toStrictEqual([...ISL, ...PLOT]);
  });

  it.each([...ISL, ...PLOT])('RED: %s is a known reason', (code) => {
    expect(ZeroSensitivityReason.safeParse(code).success).toBe(true);
  });

  it.each(['no_path', 'Disconnected', 'zero-delta', ''])('%j is not a known reason', (code) => {
    expect(ZeroSensitivityReason.safeParse(code).success).toBe(false);
  });

  it('RED: exported from the boundary barrel (the `@talchain/schemas/boundary` subpath the UI imports)', () => {
    expect(boundary.ZeroSensitivityReason).toBe(ZeroSensitivityReason);
  });

  it.each([['a code no producer emits yet', 'a_future_code'], ['null', null]])(
    'CONTROL: the wire field stays OPEN — %s still parses (persisted facts keep parsing)', (_n, zero_reason) => {
      const parsed = EnrichmentFactorSensitivityEntrySchema.parse({ factor_id: 'fac_price', sensitivity_score: 0, zero_reason });
      expect(parsed.zero_reason).toBe(zero_reason);
    });

  it('CONTROL: absent stays absent (no fabricated reason)', () => {
    expect(EnrichmentFactorSensitivityEntrySchema.parse({ factor_id: 'fac_price', sensitivity_score: 0 })).not.toHaveProperty('zero_reason');
  });
});

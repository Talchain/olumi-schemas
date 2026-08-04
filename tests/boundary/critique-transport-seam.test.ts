/**
 * LANE 3 Car 2 (0.33.0) — seam-specific critique schemas (ROADMAP 2.293).
 *
 * THE DEFECT (Codex B1, confirmed 3 Aug; independently re-derived by lane 3
 * at the bytes on 4 Aug): CEE's transport projection
 * (`projectCritiquesForTransport`, sanitise-enrichment.ts:690 @ d2cdd99b)
 * deliberately WITHHOLDS `message` (internal wording; carries raw node ids
 * on the staging capture) and ships `user_message` — while
 * `EnrichmentCritiqueSchema` REQUIRES `message`. `AnalysisEnrichmentSchema`'s
 * own doc claims to cover "the reduced CEE→UI keep-list projection", so a
 * surviving projected critique FAILED the very envelope that claims to parse
 * it. One schema was claiming two intentionally-different projections.
 *
 * THE FIX: a second, seam-specific row schema — `TransportedCritiqueSchema`
 * (browser-transport seam: `user_message` required, NO `message`) — and the
 * envelope's `critiques` accepts inbound OR transported rows. The inbound
 * schema is byte-for-byte UNTOUCHED (producer seam unchanged; nothing about
 * 0.32.0's ui_directive/ui_target work is touched either).
 *
 * RED-FIRST at pristine 0.32.0 `5e91f104`: the "projected row parses"
 * assertions FAIL (and the TransportedCritiqueSchema import does not
 * resolve); the inbound-row controls pass via the existing schema.
 */

import { describe, it, expect } from 'vitest';
import {
  AnalysisEnrichmentSchema,
  EnrichmentCritiqueSchema,
  TransportedCritiqueSchema,
} from '../../src/boundary/index.js';

/**
 * A row EXACTLY as CEE's projection emits it (explicit allow-list at
 * sanitise-enrichment.ts:727-758 @ d2cdd99b): note NO `message` key at all,
 * and S-bucket `user_message` is the Paul-approved display copy.
 */
const PROJECTED_ROW = {
  id: 'crit-1',
  code: 'EMPTY_INTERVENTIONS',
  severity: 'warning',
  source: 'validation',
  blocks_analysis: false,
  affected_node_ids: ['opt_b'],
  affected_option_ids: ['opt_b'],
  suggestion: 'Specify what this option changes.',
  user_message:
    "Option 'Bravo' does not change anything yet. Specify what makes this option different.",
};

/** An inbound (PLoT→CEE) row — `message` present, exactly as PLoT emits. */
const INBOUND_ROW = {
  id: 'crit-2',
  code: 'NORMALIZATION_WARNING',
  severity: 'info',
  source: 'validation',
  message: 'edge e_1 strength clamped from 1.2 to 1.0',
  blocks_analysis: false,
};

describe('critique seam split (2.293) — the envelope parses BOTH projections it claims to cover', () => {
  it('RED at 0.32.0 — a verbatim CEE-projected row (no `message`) parses under the envelope', () => {
    const parsed = AnalysisEnrichmentSchema.safeParse({ critiques: [PROJECTED_ROW] });
    expect(
      parsed.success,
      parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2),
    ).toBe(true);
  });

  it('RED at 0.32.0 — TransportedCritiqueSchema accepts the projected row and preserves every allow-listed field', () => {
    const parsed = TransportedCritiqueSchema.safeParse(PROJECTED_ROW);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe('EMPTY_INTERVENTIONS');
      expect(parsed.data.user_message).toBe(PROJECTED_ROW.user_message);
      expect(parsed.data.affected_node_ids).toEqual(['opt_b']);
    }
  });

  it('CONTROL — an inbound row (message present) still parses under the envelope, unchanged seam', () => {
    const parsed = AnalysisEnrichmentSchema.safeParse({ critiques: [INBOUND_ROW] });
    expect(parsed.success).toBe(true);
  });

  it('CONTROL — the inbound schema is NOT loosened: it still REQUIRES `message`', () => {
    // The seam split adds a second schema; it must not relax the first.
    expect(EnrichmentCritiqueSchema.safeParse(PROJECTED_ROW).success).toBe(false);
    expect(EnrichmentCritiqueSchema.safeParse(INBOUND_ROW).success).toBe(true);
  });

  it('FLOOR — the widening has a floor: a row with NEITHER message NOR user_message fails both seams', () => {
    const bare = { code: 'SOMETHING', severity: 'info' };
    expect(TransportedCritiqueSchema.safeParse(bare).success).toBe(false);
    const parsed = AnalysisEnrichmentSchema.safeParse({ critiques: [bare] });
    expect(parsed.success).toBe(false);
  });

  it('FLOOR — transported rows still require a non-empty code', () => {
    const noCode = { user_message: 'Readable copy.', severity: 'info' };
    expect(TransportedCritiqueSchema.safeParse(noCode).success).toBe(false);
  });

  it('mixed arrays parse — a wire that carries one row per seam form is legal', () => {
    const parsed = AnalysisEnrichmentSchema.safeParse({
      critiques: [PROJECTED_ROW, INBOUND_ROW],
    });
    expect(parsed.success).toBe(true);
  });
});

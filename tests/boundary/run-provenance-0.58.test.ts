import { describe, expect, it } from 'vitest';

import {
  AnalysisEnrichmentSchema,
  AnalysisResultBlockSchema,
  CEE_UI_ENRICHMENT_KEEP_LIST,
  EnrichmentRunProvenanceSchema,
} from '../../src/boundary/index.js';

// ============================================================================
// 0.58.0 — `run_provenance`, the provisional-run marker, typed and transported.
//
// CEE stamps it on the persisted fact of a run the SERVER started. These tests
// pin what a consumer may rely on: the SHAPE (and what it refuses), the
// ABSENCE RULE, the PLACEMENT inside the block's open `enrichment` record, and
// the name rule that keeps every member clear of CEE's deep internal-key strip.
// ============================================================================

/** The two shapes CEE's writer produces at this release. */
const DRAFT = {
  initiated_by: 'auto_post_draft',
  provisional: true,
  draft_turn_id: 'draft-turn-0001',
} as const;
const CONSTRUCTION = {
  initiated_by: 'auto_post_construction',
  provisional: true,
  construction_turn_id: 'graph_registration:00000000-0000-4000-8000-000000000001',
} as const;

describe('EnrichmentRunProvenanceSchema — the shape', () => {
  it.each([
    ['auto_post_draft', DRAFT],
    ['auto_post_construction', CONSTRUCTION],
  ])('accepts the %s stamp and returns it unchanged', (_label, stamp) => {
    const parsed = EnrichmentRunProvenanceSchema.safeParse(stamp);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual(stamp);
  });

  it('initiated_by is an OPEN vocabulary: an initiator CEE adds later still parses', () => {
    // A closed enum here would make one new CEE initiator fail the WHOLE
    // envelope parse at every consumer on an older pin.
    const later = { initiated_by: 'auto_some_future_trigger', provisional: true };
    expect(EnrichmentRunProvenanceSchema.safeParse(later).success).toBe(true);
    expect(AnalysisEnrichmentSchema.safeParse({ run_provenance: later }).success).toBe(true);
  });

  it('refuses a stamp that is not provisional, or names no initiator', () => {
    for (const bad of [
      { ...CONSTRUCTION, provisional: false },
      { initiated_by: 'auto_post_construction' },
      { provisional: true },
      { ...CONSTRUCTION, initiated_by: '' },
      'auto_post_construction',
      null,
      [],
    ] as unknown[]) {
      expect(EnrichmentRunProvenanceSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
      // …and on the envelope a malformed KNOWN key is a rejection, the
      // envelope's standing rule.
      expect(
        AnalysisEnrichmentSchema.safeParse({ run_provenance: bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it('passes unknown members through (producer-owned, forward-tolerant)', () => {
    const parsed = EnrichmentRunProvenanceSchema.parse({ ...CONSTRUCTION, future_member: 'kept' });
    expect((parsed as Record<string, unknown>).future_member).toBe('kept');
  });

  it('declares NO member CEE deep-strips before transport (graph_hash, graph_hash_at_run)', () => {
    const members = Object.keys(EnrichmentRunProvenanceSchema.shape);
    // Positive control: the walk sees the members it should.
    expect(members).toEqual(
      expect.arrayContaining(['initiated_by', 'provisional', 'construction_turn_id']),
    );
    for (const stripped of ['graph_hash', 'graph_hash_at_run']) {
      expect(members).not.toContain(stripped);
    }
  });
});

describe('AnalysisEnrichmentSchema.run_provenance — typed, optional, with its absence rule', () => {
  it('reads back through the envelope by name', () => {
    const parsed = AnalysisEnrichmentSchema.safeParse({ run_provenance: CONSTRUCTION });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.run_provenance?.provisional).toBe(true);
    expect(parsed.success && parsed.data.run_provenance?.construction_turn_id).toBe(
      CONSTRUCTION.construction_turn_id,
    );
  });

  it('is OPTIONAL with NO default: absence parses and stays absent', () => {
    const parsed = AnalysisEnrichmentSchema.safeParse({ analysis_status: 'computed' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && Object.prototype.hasOwnProperty.call(parsed.data, 'run_provenance')).toBe(
      false,
    );
  });

  it('carries its absence rule on the field, so it ships in dist/ and the JSON-Schema', () => {
    const description = AnalysisEnrichmentSchema.shape.run_provenance.description ?? '';
    expect(description).toContain('Absent means NO provenance attestation');
    expect(description).toContain('never evidence that a user confirmed anything');
  });

  it('is keep-listed, so it reaches the browser', () => {
    expect(CEE_UI_ENRICHMENT_KEEP_LIST).toContain('run_provenance');
  });
});

describe('placement — inside the block\'s open enrichment record, safe at every pin', () => {
  it('a strict analysis_result block accepts it, because `enrichment` is z.record(z.unknown())', () => {
    // This is why the marker needs no UI-first deploy window: a consumer on an
    // older pin strict-parses the block and still carries the key.
    const block = {
      type: 'analysis_result' as const,
      summary: 'Olumi ran a first pass on the model it had just drafted.',
      leading_option_id: null,
      enrichment: { run_provenance: CONSTRUCTION },
    };
    expect(AnalysisResultBlockSchema.safeParse(block).success).toBe(true);
  });

  it('CONTRAST: the same member at the block TOP LEVEL is refused (.strict())', () => {
    // Positive control for the placement claim above: the block really is
    // strict, so "it parses" is a statement about `enrichment`, not about a
    // permissive block.
    const block = {
      type: 'analysis_result' as const,
      summary: 'x',
      leading_option_id: null,
      run_provenance: CONSTRUCTION,
    };
    expect(AnalysisResultBlockSchema.safeParse(block).success).toBe(false);
  });
});

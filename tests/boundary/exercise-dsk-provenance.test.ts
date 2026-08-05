/**
 * 0.37.0 additive — `ExerciseBlock.dsk_provenance`.
 *
 * WHY THIS SHAPE IS A NESTED OBJECT AND NOT THREE SIBLING FIELDS.
 * The defect this contract change exists to make impossible is CEE #830's:
 * an attestation that validated a claim id EXISTED without checking that the
 * text displayed under it RESOLVED TO that id — a badge printing the model's
 * own prose under the bundle's authority. Three optional sibling fields would
 * let a producer ship `dsk_protocol_id` alone, which is exactly that shape: an
 * authority claim with nothing to check it against. A single strict nested
 * object makes the triple ATOMIC BY CONSTRUCTION — the id can never travel
 * without the title and strength that a consumer can verify it against — with
 * no `superRefine`, so `ExerciseBlockSchema` stays a bare `ZodObject` and the
 * `.shape`-derived guards in CEE keep working.
 *
 * The id pattern is the bundle's own (`data/dsk/v1.json`, DSKObjectBase:
 * `/^DSK-(B|T|F|G|P|TR)-\d{3}$/`), narrowed to the `P` (protocol) arm because
 * this field names a PROTOCOL. `evidence_strength`'s domain is the bundle's
 * declared union, not the two values that happen to occur in v1.0.0 — the
 * expectation is derived from the producer's declared semantics, not from a
 * reading of today's data (a bundle revision may introduce `weak`/`mixed`).
 */
import { describe, it, expect } from 'vitest';
import { ExerciseBlockSchema, BlockSchema } from '../../src/boundary/blocks.js';

const VALID_BASE = {
  block_id: '77777777-7777-4777-8777-777777777777',
  signal_id: 'exercise:consider_opposite:gh',
  created_at: '2026-08-05T09:00:00.000Z',
  source_handler: 'decision_review_enricher',
  freshness: 'fresh',
  type: 'exercise',
  exercise_kind: 'consider_opposite',
  counter_case: 'Take the opposite view for a moment.',
  target_refs: [],
} as const;

const VALID_PROVENANCE = {
  protocol_id: 'DSK-P-003',
  protocol_title: 'Disconfirmation exercise',
  evidence_strength: 'medium',
} as const;

describe('ExerciseBlock.dsk_provenance (0.37.0 additive)', () => {
  it('accepts a complete provenance triple and preserves every member', () => {
    const parsed = ExerciseBlockSchema.safeParse({
      ...VALID_BASE,
      dsk_provenance: VALID_PROVENANCE,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.dsk_provenance).toEqual(VALID_PROVENANCE);
  });

  it('stays OPTIONAL — an exercise with no provenance is still valid (no forced attribution)', () => {
    expect(ExerciseBlockSchema.safeParse(VALID_BASE).success).toBe(true);
  });

  it('is ATOMIC: an id without the title it must resolve to is REJECTED (the #830 shape)', () => {
    const parsed = ExerciseBlockSchema.safeParse({
      ...VALID_BASE,
      dsk_provenance: { protocol_id: 'DSK-P-003' },
    });
    expect(parsed.success).toBe(false);
  });

  it('is ATOMIC: a title without the id that authorises it is REJECTED', () => {
    const parsed = ExerciseBlockSchema.safeParse({
      ...VALID_BASE,
      dsk_provenance: {
        protocol_title: 'Disconfirmation exercise',
        evidence_strength: 'medium',
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an id that is not a PROTOCOL id — a claim/trigger id cannot masquerade as a protocol', () => {
    for (const wrong of ['DSK-T-003', 'DSK-TR-003', 'DSK-B-001', 'P-003', 'DSK-P-3', '']) {
      expect(
        ExerciseBlockSchema.safeParse({
          ...VALID_BASE,
          dsk_provenance: { ...VALID_PROVENANCE, protocol_id: wrong },
        }).success,
        `protocol_id '${wrong}' must be rejected`,
      ).toBe(false);
    }
  });

  it('accepts every evidence_strength the BUNDLE declares, and rejects anything else', () => {
    // Domain derived from DSKObjectBase.evidence_strength, not from the values
    // present in v1.0.0 (which are only `strong` and `medium`).
    for (const ok of ['strong', 'medium', 'weak', 'mixed']) {
      expect(
        ExerciseBlockSchema.safeParse({
          ...VALID_BASE,
          dsk_provenance: { ...VALID_PROVENANCE, evidence_strength: ok },
        }).success,
        `evidence_strength '${ok}' must be accepted`,
      ).toBe(true);
    }
    for (const bad of ['high', 'STRONG', 'unknown', '']) {
      expect(
        ExerciseBlockSchema.safeParse({
          ...VALID_BASE,
          dsk_provenance: { ...VALID_PROVENANCE, evidence_strength: bad },
        }).success,
        `evidence_strength '${bad}' must be rejected`,
      ).toBe(false);
    }
  });

  it('is STRICT — an unknown member cannot ride inside the provenance object', () => {
    expect(
      ExerciseBlockSchema.safeParse({
        ...VALID_BASE,
        dsk_provenance: { ...VALID_PROVENANCE, principle: 'model prose' },
      }).success,
    ).toBe(false);
  });

  it('the same rules hold at the WIRE level (BlockSchema union), not only on the block export', () => {
    expect(
      BlockSchema.safeParse({ ...VALID_BASE, dsk_provenance: VALID_PROVENANCE }).success,
    ).toBe(true);
    expect(
      BlockSchema.safeParse({ ...VALID_BASE, dsk_provenance: { protocol_id: 'DSK-P-003' } })
        .success,
    ).toBe(false);
  });

  it('ExerciseBlockSchema is still a bare ZodObject (the .shape-derived CEE guards depend on it)', () => {
    expect(ExerciseBlockSchema.shape).toBeDefined();
    expect(Object.keys(ExerciseBlockSchema.shape)).toContain('dsk_provenance');
  });
});

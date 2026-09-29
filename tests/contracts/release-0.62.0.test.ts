// ============================================================================
// 0.62.0 — Shared Data row 1: WHOSE a value is enters the analysis revision; a confirm is REVIEW, not authorship.
//   Finding: Canonical #72 5881225605 (live on served CEE f79119b: churn 3.2% moved cee_inference → user_override with
//   the value unchanged; the analysis hash did not move; the Run stayed CURRENT with `estimate_only` while a rerun gave
//   `scored`). Claim 5881253593 · meaning AIQ 5881277231 (a canvas confirm-as-is is REVIEW, R11 extends to nodes;
//   `source` in the hash: YES; `reviewed_by_user`: NO) · order DL 5881332034.
//
//   · CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields gains `source` (projection version 2 → 3).
//   · factor_value_edit gains `intent: 'set' | 'confirm_current'` (optional; ABSENT = 'set', today's behaviour).
//   · ObservedStateSchema declares `reviewed_by_user` ({intent: 'confirm', at} | {intent: 'confirm_pairing', quote}),
//     NOT a hash input (review changes no analysis meaning).
//
// RED-first: before 0.62.0 `source` is absent from the vocabulary (version 2), `intent` on factor_value_edit is REFUSED
// by the strict event, and `reviewed_by_user` rides .passthrough() with NO validation (any shape is waved through).
// ============================================================================
import { describe, expect, it } from 'vitest';

import { ObservedStateSchema } from '../../src/graph.js';
import {
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
} from '../../src/boundary/graph-hash-contract.js';
import { SystemEventSchema } from '../../src/boundary/turn-payload.js';

const edit = { kind: 'factor_value_edit', target_id: 'monthly_churn', value: 0.032, raw_value: 3.2, unit: '%' } as const;

describe('0.62.0 · whose a value is enters the analysis revision', () => {
  it('RED: observed_state.source is a hash input, appended after value/baseline/cap', () => {
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields).toEqual(['value', 'baseline', 'cap', 'source']);
  });

  it('RED: the projection version moves 2 → 3 (the module\'s own bump rule)', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(3);
  });

  it('CONTROL: display twins and the review record stay OUT of the vocabulary', () => {
    const fields: readonly string[] = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields;
    for (const display of ['unit', 'raw_value', 'extractionType', 'reviewed_by_user', 'elicited_from']) {
      expect(fields, display).not.toContain(display);
    }
  });
});

describe('0.62.0 · factor_value_edit.intent — a confirm is distinct from a typed value', () => {
  it.each(['set', 'confirm_current'] as const)('RED: intent %s parses and is preserved', (intent) => {
    const parsed = SystemEventSchema.parse({ ...edit, intent }) as { intent?: string };
    expect(parsed.intent).toBe(intent);
  });

  it('CONTROL: an edit with NO intent still parses (absent = set; every pre-0.62.0 client)', () => {
    const parsed = SystemEventSchema.parse(edit) as { intent?: string };
    expect(parsed.intent).toBeUndefined();
  });

  it('refuses an off-vocabulary intent (the wire refuses; no consumer guesses)', () => {
    for (const bad of ['confirm', 'review', 'Confirm_current', '']) {
      expect(SystemEventSchema.safeParse({ ...edit, intent: bad }).success, bad).toBe(false);
    }
  });
});

describe('0.62.0 · ObservedStateSchema.reviewed_by_user — the review record is declared, never authorship', () => {
  it('RED: a confirm-as-is record parses and keeps Olumi\'s source', () => {
    const parsed = ObservedStateSchema.parse({ value: 0.032, source: 'cee_inference', reviewed_by_user: { intent: 'confirm', at: '2026-09-29T00:40:00.000Z' } });
    expect(parsed.source).toBe('cee_inference');
    expect(parsed.reviewed_by_user).toEqual({ intent: 'confirm', at: '2026-09-29T00:40:00.000Z' });
  });

  it('RED: the #2235 pairing record (CEE #2258) parses with its quote', () => {
    const quote = 'our monthly marketing spend is £8,000';
    expect(ObservedStateSchema.parse({ value: 8000, source: 'user_override', reviewed_by_user: { intent: 'confirm_pairing', quote } }).reviewed_by_user)
      .toEqual({ intent: 'confirm_pairing', quote });
  });

  it('RED: a malformed record is REFUSED (before 0.62.0 .passthrough() waved it through)', () => {
    for (const bad of [
      { intent: 'confirm_pairing' },               // a pairing without its quote
      { intent: 'authored' },                      // not a review intent
      { intent: 'confirm', at: 'yesterday' },      // not an ISO instant
      { intent: 'confirm', at: '2026-09-29T00:40:00.000Z', source: 'user_override' }, // a review never carries authorship
    ]) {
      expect(ObservedStateSchema.safeParse({ value: 1, reviewed_by_user: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('CONTROL: absent means not reviewed, and parses unchanged', () => {
    expect(ObservedStateSchema.parse({ value: 1, source: 'cee_inference' }).reviewed_by_user).toBeUndefined();
  });
});

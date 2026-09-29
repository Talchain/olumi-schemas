// ============================================================================
// 0.62.0 — Shared Data row 1: WHOSE a value is enters the analysis revision; a confirm is REVIEW, not authorship.
//   Finding: Canonical #72 5881225605 (live on served CEE f79119b: churn 3.2% moved cee_inference → user_override with
//   the value unchanged; the analysis hash did not move; the Run stayed CURRENT with `estimate_only` while a rerun gave
//   `scored`). Claim 5881253593 · meaning AIQ 5881277231 (a canvas confirm-as-is is REVIEW, R11 extends to nodes;
//   `source` in the hash: YES; `reviewed_by_user`: NO) · order DL 5881332034.
//
//   · CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields gains `source`, `unit`, `raw_value`, and node
//     `fields` gains `scale_frame` (projection version 2 → 3; the last three: AIQ 5881494849 — CEE's run path reads them
//     into the PLoT wire, so they were never display twins).
//   · factor_value_edit gains `intent: 'set' | 'confirm_current'` (optional; ABSENT is conditional: same persisted value
//     = confirm_current, a different value = set — AIQ 5881405845).
//   · ObservedStateSchema declares `reviewed_by_user` ({intent: 'confirm', at} | {intent: 'confirm_pairing', quote}),
//     NOT a hash input (review changes no analysis meaning).
//
// RED-first: before 0.62.0 `source` is absent from the vocabulary (version 2), `intent` on factor_value_edit is REFUSED
// by the strict event, and `reviewed_by_user` rides .passthrough() with NO validation (any shape is waved through).
// ============================================================================
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ObservedStateSchema } from '../../src/graph.js';
import {
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
} from '../../src/boundary/graph-hash-contract.js';
import { SystemEventSchema } from '../../src/boundary/turn-payload.js';

const edit = { kind: 'factor_value_edit', target_id: 'monthly_churn', value: 0.032, raw_value: 3.2, unit: '%' } as const;

describe('0.62.0 · whose a value is enters the analysis revision', () => {
  it('RED: observed_state.source, unit, raw_value and std are hash inputs, appended after value/baseline/cap', () => {
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields)
      .toEqual(['value', 'baseline', 'cap', 'source', 'unit', 'raw_value', 'std']);
  });

  it('RED: node scale_frame, nonlinear_identity and analysis_participation are hash inputs, appended after 0.61.0', () => {
    const fields: readonly string[] = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields;
    expect(fields.slice(10)).toEqual([
      'goal_threshold_frame', 'goal_direction', 'quantity_frame',
      'scale_frame', 'nonlinear_identity', 'analysis_participation',
    ]);
  });

  it('RED: the projection version moves 2 → 3 (the module\'s own bump rule)', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(3);
  });

  it('CONTROL: fields no analysis path reads — extraction trace, elicitation, the review record, the label — stay OUT', () => {
    const observed: readonly string[] = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields;
    for (const unread of ['extractionType', 'reviewed_by_user', 'elicited_from']) {
      expect(observed, unread).not.toContain(unread);
    }
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields as readonly string[]).not.toContain('label');
  });
});

describe('0.62.0 · factor_value_edit.intent — a confirm is distinct from a typed value', () => {
  it('the machine-readable adoption row states the CONDITIONAL absence rule, not "absent = set"', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../contracts/adoption-manifest.json', import.meta.url), 'utf8')) as {
      fields: Array<{ field: string; declared_in: string; consumer: string }>;
    };
    expect(manifest.fields.length).toBeGreaterThan(0);
    const row = manifest.fields.find((r) => r.field === 'factor_value_edit.intent');
    expect(row, 'factor_value_edit.intent adoption row').toBeDefined();
    expect(row!.declared_in).toMatch(/absent is conditional: the same value as the PERSISTED one = confirm_current, a different value = set/);
    expect(row!.declared_in).not.toMatch(/absent = set/);
    expect(row!.consumer).toMatch(/absent intent with the same persisted value as confirm_current/);
  });

  it.each(['set', 'confirm_current'] as const)('RED: intent %s parses and is preserved', (intent) => {
    const parsed = SystemEventSchema.parse({ ...edit, intent }) as { intent?: string };
    expect(parsed.intent).toBe(intent);
  });

  it('CONTROL: an edit with NO intent still parses (every pre-0.62.0 client; absence is read against the persisted value)', () => {
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
      { intent: 'confirm' },                       // a confirm without its timestamp
      { intent: 'confirm', at: '2026-09-29T00:40:00.000Z', quote: 'our churn is 3.2%' }, // a pairing member on a confirm
      { intent: 'confirm_pairing', quote: 'x', note: 'extra' }, // an unknown member on a pairing
    ]) {
      expect(ObservedStateSchema.safeParse({ value: 1, reviewed_by_user: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('CONTROL: absent means not reviewed, and parses unchanged', () => {
    expect(ObservedStateSchema.parse({ value: 1, source: 'cee_inference' }).reviewed_by_user).toBeUndefined();
  });
});

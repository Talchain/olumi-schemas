/** 0.83.0 (P48): `changed_since_run` and the ids on edit_graph receipts. Rows bind by exact value; each refusal has a passing twin. */
import { describe, expect, it } from 'vitest';
import { ChangedSinceRunV1Schema } from '../../src/boundary/index.js';
import { EditGraphAffectedEntitySchema } from '../../src/orchestrator/index.js';

const block = { version: 1, since_run_id: 'run_b', node_ids: ['fac_price'], links: [{ from: 'fac_price', to: 'out_rev' }], unattributed_changes: 0, complete: true };

describe('ChangedSinceRunV1Schema', () => {
  it('parses the producer block unchanged', () => {
    expect(ChangedSinceRunV1Schema.parse(block)).toEqual(block);
  });
  it('a null Run parses; a missing since_run_id does not (absence is never "no Run")', () => {
    expect(ChangedSinceRunV1Schema.safeParse({ ...block, since_run_id: null }).success).toBe(true);
    const { since_run_id: _drop, ...missing } = block;
    expect(ChangedSinceRunV1Schema.safeParse(missing).success).toBe(false);
  });
  it.each([
    ['an unknown key (strict)', { ...block, labels: ['Price'] }],
    ['a negative count', { ...block, unattributed_changes: -1 }],
    ['a link with one end', { ...block, links: [{ from: 'fac_price' }] }],
    ['an empty id', { ...block, node_ids: [''] }],
    ['version 2', { ...block, version: 2 }],
  ])('refuses %s', (_name, bad) => {
    expect(ChangedSinceRunV1Schema.safeParse(bad).success).toBe(false);
  });
});

describe('EditGraphAffectedEntitySchema ids (0.83.0)', () => {
  it('a node may carry its id; a link its two ends; an older receipt carries neither', () => {
    expect(EditGraphAffectedEntitySchema.safeParse({ kind: 'risk', label: 'Oven', id: 'risk_oven' }).success).toBe(true);
    expect(EditGraphAffectedEntitySchema.safeParse({ kind: 'edge', label: 'link', from: 'a', to: 'b' }).success).toBe(true);
    expect(EditGraphAffectedEntitySchema.safeParse({ kind: 'risk', label: 'Oven' }).success).toBe(true);
  });
  it.each([
    ['a link with an id', { kind: 'edge', label: 'link', id: 'e1', from: 'a', to: 'b' }],
    ['a link with one end', { kind: 'edge', label: 'link', from: 'a' }],
    ['a node with link ends', { kind: 'factor', label: 'Price', from: 'a', to: 'b' }],
    ['an empty id', { kind: 'factor', label: 'Price', id: '' }],
  ])('refuses %s', (_name, bad) => {
    expect(EditGraphAffectedEntitySchema.safeParse(bad).success).toBe(false);
  });
});

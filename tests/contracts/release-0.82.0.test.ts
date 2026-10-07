// ============================================================================
// 0.82.0 — event_risk.v1: a risk is an EVENT that may happen within a horizon
// (Science 393023 pilot §4). Opt-in per risk node; strict at every level. Each
// rejection mutates ONE field of the accepted control, so unrelated invalidity
// cannot make it pass.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { EventRiskV1Schema, NodeV3Schema } from '../../src/index.js';
import {
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
} from '../../src/boundary/graph-hash-contract.js';

type Rec = Record<string, unknown>;
const BLOCK = {
  version: 1,
  occurrence: { p_low: 0.05, p_high: 0.15, meaning: 'at_least_once_within_horizon', basis: 'reference' },
  horizon: { months: 12 },
  mitigations: [{ factor_id: 'dual_sourcing', occurrence_reduction: 0.7 }],
};
const riskNode = (eventRisk?: unknown): Rec => ({
  id: 'supplier_fails',
  kind: 'risk',
  label: 'Key supplier fails',
  ...(eventRisk === undefined ? {} : { event_risk: eventRisk }),
});

function rejects(mutant: Rec): void {
  expect(EventRiskV1Schema.parse(BLOCK)).toStrictEqual(BLOCK);
  expect(EventRiskV1Schema.safeParse(mutant).success).toBe(false);
}

describe('0.82.0 · event_risk.v1 on a risk node', () => {
  it('carries a valid block verbatim on NodeV3Schema', () => {
    expect(NodeV3Schema.parse(riskNode(BLOCK)).event_risk).toStrictEqual(BLOCK);
  });

  it('a node without it parses with no key (absence = today\'s risk node)', () => {
    expect('event_risk' in NodeV3Schema.parse(riskNode())).toBe(false);
  });

  it.each([
    ['an unknown key', { ...BLOCK, likelihood: 0.1 }],
    ['version 2', { ...BLOCK, version: 2 }],
    ['p_low above p_high', { ...BLOCK, occurrence: { ...BLOCK.occurrence, p_low: 0.2 } }],
    ['a probability above 1', { ...BLOCK, occurrence: { ...BLOCK.occurrence, p_high: 1.5 } }],
    ['no basis (an unattested range)', { ...BLOCK, occurrence: { p_low: 0.05, p_high: 0.15 } }],
    ['an unknown occurrence key', { ...BLOCK, occurrence: { ...BLOCK.occurrence, p_mid: 0.1 } }],
    ['a zero horizon', { ...BLOCK, horizon: { months: 0 } }],
    ['a reduction above 1', { ...BLOCK, mitigations: [{ factor_id: 'dual_sourcing', occurrence_reduction: 1.5 }] }],
    ['an empty mitigation list', { ...BLOCK, mitigations: [] }],
    ['a factor named twice', { ...BLOCK, mitigations: [BLOCK.mitigations[0], BLOCK.mitigations[0]] }],
    ['a malformed factor id', { ...BLOCK, mitigations: [{ factor_id: 'Dual Sourcing', occurrence_reduction: 0.7 }] }],
  ])('REFUSES %s', (_label, mutant) => {
    rejects(mutant as Rec);
  });

  it('a node carrying a malformed block fails the node parse (never silently dropped)', () => {
    expect(NodeV3Schema.safeParse(riskNode({ ...BLOCK, version: 2 })).success).toBe(false);
  });
});

describe('0.82.0 · the graph hash sees an event risk (projection version 6)', () => {
  it('appends event_risk to the node fields and bumps the projection version', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(6);
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields.at(-1)).toBe('event_risk');
  });
});

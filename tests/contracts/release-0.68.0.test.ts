// ============================================================================
// 0.68.0 — SC-24: "previous Run vs this Run", with WHAT THE USER CHANGED in their own units.
//   Design: SC-24 v2, agreed on programme-docs #84 (review 5913851822, correction 5913873645, acceptance 5914416431).
//   Lease: DL #75 5914474485 (one schemas train: TEMPORAL 0.66.0 → MG 0.68.0 → SC-24 0.68.0).
//   One Run-unit carrier: AIQ 5912905493 + 5914731075, P0 SHARED DATA 5914750268 (`input_snapshot.goal`).
//
// RED-first: before 0.68.0 the Run fact refuses `input_snapshot` and RunDelta refuses `endpoints` / `input_coverage` /
// `input_changes` / `C5_unattributed` — every schema here is `.strict()`.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  RunDeltaAttributionCase,
  RunDeltaInputChangeSchema,
  RunDeltaSchema,
} from '../../src/boundary/run-delta.js';
import { RunAnalysisResultSchema, RunInputSettingSchema, RunInputSnapshotSchema } from '../../src/orchestrator/index.js';

const DIGEST = 'd'.repeat(64);

// ── the Run fact's input snapshot ───────────────────────────────────────────
const SNAPSHOT = {
  snapshot_version: 1,
  sent_digest: DIGEST,
  goal: { node_id: 'goal_mrr', label: 'Pro MRR', target_raw: 55000, unit: 'GBP per month', operator: '>=', frame: 'level' },
  options: [
    { option_id: 'opt_raise', label: 'Raise to £60', settings: [{ factor_id: 'fac_price', label: 'Pro price', raw: 60, unit: 'GBP', encoded: 60 }] },
    { option_id: 'opt_hold', label: 'Hold at £49', is_baseline: true,
      settings: [{ factor_id: 'fac_price', label: 'Pro price', raw: 49, unit: 'GBP', encoded: 49, held: true }] },
  ],
  options_not_sent: [{ option_id: 'opt_olumi', label: 'Moderate rise', reason: 'olumi_proposed' }],
  factors: [{ factor_id: 'fac_churn', label: 'Monthly churn', raw: 3.7, unit: '%', encoded: 0.037, source: 'user_override' }],
  constraints: [{ constraint_id: 'c_churn', node_id: 'fac_churn', label: 'Churn cap', operator: '<=', raw: 5, unit: '%' }],
  links: [{ from: 'fac_price', to: 'fac_churn', mean: 0.4, std: 0.1, exists_probability: 0.9 }],
} as const;

const RUN = {
  scenario_id: '0938f068-2b83-4a77-9b47-def252ac03f0',
  leading_option_id: 'opt_hold',
  summary: 's',
  graph_hash_at_run: 'a'.repeat(64),
  computed_at: '2026-09-30T14:02:00.000Z',
};

describe('0.68.0 · input_snapshot on the Run fact — what the Run was SENT', () => {
  it('RED: a Run carrying its input snapshot parses and keeps it byte-for-byte', () => {
    const parsed = RunAnalysisResultSchema.parse({ ...RUN, input_snapshot: SNAPSHOT }) as { input_snapshot?: unknown };
    expect(parsed.input_snapshot).toStrictEqual(SNAPSHOT);
  });

  it('a Run sent no goal records goal: null (absent snapshot = not recorded, a different claim)', () => {
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, goal: null }).success).toBe(true);
  });

  it('RED: the Run carries its execution identity (run_id)', () => {
    const parsed = RunAnalysisResultSchema.parse({ ...RUN, run_id: 'run-b', input_snapshot: SNAPSHOT }) as { run_id?: string };
    expect(parsed.run_id).toBe('run-b');
  });

  it('AIQ 5914731075: a goal field the Run was not sent stays ABSENT — a missing unit never defaults', () => {
    const { unit: _u, operator: _o, ...bare } = SNAPSHOT.goal;
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, goal: bare }).success).toBe(true);
    // …and an empty-string unit is not "absent", it is refused.
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, goal: { ...SNAPSHOT.goal, unit: '' } }).success).toBe(false);
  });

  it('REFUSED: a digest that is not a sha256 hex, an unknown snapshot version, an undeclared key', () => {
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, sent_digest: 'abc' }).success).toBe(false);
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, snapshot_version: 2 }).success).toBe(false);
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, graph: { nodes: [] } }).success).toBe(false);
  });

  it('the goal comparator and limit operator are closed sets (the node\'s held comparator, as sent)', () => {
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, goal: { ...SNAPSHOT.goal, operator: 'above' } }).success).toBe(false);
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, constraints: [{ ...SNAPSHOT.constraints[0], operator: '>' }] }).success).toBe(false);
  });

  it('a setting always records the number PLoT was sent; the authored figure is optional (an encoded-only option)', () => {
    const { raw: _r, unit: _u, ...encodedOnly } = SNAPSHOT.options[0].settings[0];
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, options: [{ ...SNAPSHOT.options[0], settings: [encodedOnly] }] }).success).toBe(true);
    const { encoded: _e, ...noWire } = SNAPSHOT.options[0].settings[0];
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, options: [{ ...SNAPSHOT.options[0], settings: [noWire] }] }).success).toBe(false);
  });

  it('REFUSED: one option twice, or one factor set twice by the same option (one row per input)', () => {
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, options: [SNAPSHOT.options[0], SNAPSHOT.options[0]] }).success).toBe(false);
    const twice = { ...SNAPSHOT.options[0], settings: [SNAPSHOT.options[0].settings[0], SNAPSHOT.options[0].settings[0]] };
    expect(RunInputSnapshotSchema.safeParse({ ...SNAPSHOT, options: [twice] }).success).toBe(false);
  });

  it('GUARD: a malformed snapshot is refused with the whole Run fact (never half-kept)', () => {
    expect(RunAnalysisResultSchema.safeParse({ ...RUN, input_snapshot: { ...SNAPSHOT, options: 'all' } }).success).toBe(false);
  });
});

// ── RunDelta: endpoints + input changes, independent of attribution ─────────
const C2 = {
  attribution_case: 'C2_unpaired',
  pair_provenance: { seed_equal: false, hash_equal: false, builds_equal: 'equal', n_equal: true },
  leader: { changed: false, noise_verdict: 'within_noise' },
  win_probabilities: [],
  flip_thresholds: [],
} as const;

const ENDPOINTS = {
  prior: { run_id: 'run-a', computed_at: '2026-09-30T14:02:00.000Z' },
  current: { run_id: 'run-b', computed_at: '2026-09-30T14:09:00.000Z' },
};

const PRICE_ROW = {
  entity_kind: 'option_setting',
  entity_id: 'fac_price',
  option_id: 'opt_raise',
  field: 'value',
  label_before: 'Pro price',
  label_after: 'Pro price',
  before: { raw: 59, unit: 'GBP' },
  after: { raw: 60, unit: 'GBP' },
  change: 'changed',
} as const;

const ok = (d: unknown) => RunDeltaSchema.safeParse(d).success;

describe('0.68.0 · RunDelta carries the exact input changes, whatever the attribution case', () => {
  it('RED: a C2 (unpaired) pair still carries £59 → £60 — attribution never hides a true input difference', () => {
    const d = { ...C2, endpoints: ENDPOINTS, input_coverage: 'complete', input_changes: [PRICE_ROW] };
    expect(RunDeltaSchema.parse(d)).toStrictEqual(d);
  });

  it('RED: C5_unattributed is a case of its own — the pair exists, the classifier could not attribute it', () => {
    expect(RunDeltaAttributionCase.options).toContain('C5_unattributed');
    const d = {
      ...C2,
      attribution_case: 'C5_unattributed',
      pair_provenance: { seed_equal: true, hash_equal: false, builds_equal: 'unknown', n_equal: true },
      endpoints: ENDPOINTS,
      input_coverage: 'complete',
      input_changes: [PRICE_ROW],
    };
    expect(ok(d)).toBe(true);
  });

  it('REFUSED: C5 where C0 or C1 preconditions hold — a classifiable pair is never downgraded', () => {
    const c1Echoes = { seed_equal: true, hash_equal: false, builds_equal: 'equal', n_equal: true };
    const c0Echoes = { seed_equal: true, hash_equal: true, builds_equal: 'equal', n_equal: true };
    expect(ok({ ...C2, attribution_case: 'C5_unattributed', pair_provenance: c1Echoes })).toBe(false);
    expect(ok({ ...C2, attribution_case: 'C5_unattributed', pair_provenance: c0Echoes })).toBe(false);
  });

  it('complete coverage with NO input difference is [] (a Run re-run on the same inputs)', () => {
    expect(ok({ ...C2, endpoints: ENDPOINTS, input_coverage: 'complete', input_changes: [] })).toBe(true);
  });

  it('not_recorded (an endpoint predates snapshots) carries NO list — absence, never an empty diff', () => {
    expect(ok({ ...C2, endpoints: ENDPOINTS, input_coverage: 'not_recorded' })).toBe(true);
    expect(ok({ ...C2, endpoints: ENDPOINTS, input_coverage: 'not_recorded', input_changes: [] })).toBe(false);
  });

  it('REFUSED: a list without its coverage, or complete/partial coverage without a list', () => {
    expect(ok({ ...C2, endpoints: ENDPOINTS, input_changes: [PRICE_ROW] })).toBe(false);
    expect(ok({ ...C2, endpoints: ENDPOINTS, input_coverage: 'complete' })).toBe(false);
    expect(ok({ ...C2, endpoints: ENDPOINTS, input_coverage: 'partial' })).toBe(false);
  });

  it('REFUSED: input changes with no named endpoints — a diff about no Run pair is a claim with no subject', () => {
    expect(ok({ ...C2, input_coverage: 'complete', input_changes: [PRICE_ROW] })).toBe(false);
  });

  it('not_recorded may travel alone — an older Run has no run_id to name', () => {
    expect(ok({ ...C2, input_coverage: 'not_recorded' })).toBe(true);
  });

  it('REFUSED: a Run compared with itself (same execution id on both ends)', () => {
    const same = { prior: ENDPOINTS.prior, current: { ...ENDPOINTS.current, run_id: 'run-a' } };
    expect(ok({ ...C2, endpoints: same })).toBe(false);
  });

  it('REFUSED: the same input reported twice', () => {
    expect(ok({ ...C2, endpoints: ENDPOINTS, input_coverage: 'complete', input_changes: [PRICE_ROW, PRICE_ROW] })).toBe(false);
  });

  it('a pre-0.68 delta (no endpoints, no coverage) still parses byte-identically', () => {
    expect(RunDeltaSchema.parse(C2)).toStrictEqual(C2);
  });
});

describe('0.68.0 · one input-change row says exactly one thing', () => {
  const row = (r: unknown) => RunDeltaInputChangeSchema.safeParse(r).success;

  it('changed needs both ends and a real difference; a label-only difference is NOT an input change', () => {
    expect(row(PRICE_ROW)).toBe(true);
    expect(row({ ...PRICE_ROW, after: PRICE_ROW.before, label_after: 'Price (Pro)' })).toBe(false);
  });

  it('a unit change with the same number is a change (cross-unit rows keep both ends; nothing computes a delta)', () => {
    expect(row({ ...PRICE_ROW, before: { raw: 60, unit: 'GBP' }, after: { raw: 60, unit: 'USD' } })).toBe(true);
  });

  it('MG B1 (#76 5916764589): no row and no setting carries a `kind` — no writer exists, so a free string would be an unwritten claim', () => {
    expect(row({ ...PRICE_ROW, kind_before: 'absolute', kind_after: 'delta' })).toBe(false);
    expect(RunInputSettingSchema.safeParse({ factor_id: 'fac_price', raw: 60, unit: 'GBP', encoded: 60, kind: 'absolute' }).success).toBe(false);
    expect(RunInputSettingSchema.safeParse({ factor_id: 'fac_price', raw: 60, unit: 'GBP', encoded: 60 }).success).toBe(true);
  });

  it('TEMPORAL seam (AIQ 5918201688): a setting records the stated range AS SENT, with its own author', () => {
    const range = { low: 40, high: 75, meaning: 'likely_range', source: 'user_stated' };
    expect(RunInputSettingSchema.safeParse({ factor_id: 'fac_price', raw: 60, unit: 'GBP', encoded: 60, range }).success).toBe(true);
    // The SAME InterventionRangeSchema (not a mirror): an authorless range, or high <= low, is refused.
    const { source: _s, ...authorless } = range;
    expect(RunInputSettingSchema.safeParse({ factor_id: 'fac_price', raw: 60, unit: 'GBP', encoded: 60, range: authorless }).success).toBe(false);
    expect(RunInputSettingSchema.safeParse({ factor_id: 'fac_price', raw: 60, unit: 'GBP', encoded: 60, range: { ...range, high: 40 } }).success).toBe(false);
  });

  it('the same value and unit on both ends is not a change (nothing else can make it one)', () => {
    expect(row({ ...PRICE_ROW, after: PRICE_ROW.before })).toBe(false);
  });

  it('added has no before; removed has no after', () => {
    expect(row({ ...PRICE_ROW, change: 'added', before: null })).toBe(true);
    expect(row({ ...PRICE_ROW, change: 'added' })).toBe(false);
    expect(row({ ...PRICE_ROW, change: 'removed', after: null })).toBe(true);
    expect(row({ ...PRICE_ROW, change: 'removed', before: null, after: null })).toBe(false);
  });

  it('an option setting names its option; nothing else does', () => {
    const { option_id: _o, ...noOption } = PRICE_ROW;
    expect(row(noOption)).toBe(false);
    expect(row({ ...PRICE_ROW, entity_kind: 'factor_value', entity_id: 'fac_churn' })).toBe(false);
    const { option_id: _p, ...factor } = { ...PRICE_ROW, entity_kind: 'factor_value', entity_id: 'fac_churn' };
    expect(row(factor)).toBe(true);
  });

  it('a link names both ends; nothing else does', () => {
    const { option_id: _o, ...base } = PRICE_ROW;
    const link = { ...base, entity_kind: 'link', entity_id: 'fac_price->fac_churn', field: 'strength',
      link: { from: 'fac_price', to: 'fac_churn' }, before: { raw: 0.4 }, after: { raw: 0.6 } };
    expect(row(link)).toBe(true);
    const { link: _l, ...noEnds } = link;
    expect(row(noEnds)).toBe(false);
    expect(row({ ...base, link: { from: 'a', to: 'b' } })).toBe(false);
  });

  it('REFUSED: an unknown entity kind or field, a free-text value over the bound, an undeclared key', () => {
    expect(row({ ...PRICE_ROW, entity_kind: 'graph' })).toBe(false);
    expect(row({ ...PRICE_ROW, field: 'everything' })).toBe(false);
    expect(row({ ...PRICE_ROW, after: { raw: 'x'.repeat(201) } })).toBe(false);
    expect(row({ ...PRICE_ROW, delta: 1 })).toBe(false);
  });
});

// Identity-bound evidence matrices. Each row starts from a parsing control; no fixture positions are used.
// Mutant measurements are recorded in CHANGELOG and produced by scripts/check-structural-challenge-mutants.mjs.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  STRUCTURAL_CHALLENGE_REASONS,
  StructuralChallengeBaselineV1Schema,
  StructuralChallengeClaimV1Schema,
  StructuralChallengeLeaderClaimV1Schema,
  StructuralChallengeQuantityClaimV1Schema,
  StructuralChallengeResultV1Schema,
} from '../../src/index.js';
import { RunInputSnapshotSchema } from '../../src/orchestrator/run-input-snapshot.js';
import { maximalStructuralChallengeResultV1 as COMPLETED } from '../../src/fixtures/index.js';

type Rec = Record<string, unknown>;
type Kind = 'leader' | 'goal_probability' | 'outcome_level' | 'constraint_probability';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const PRICE = 'raise_pro_price_to_59';
const CONSTRAINT = 'agent-lane:monthly_churn:<=';
const identity = (c: Rec) => JSON.stringify([
  c.kind, c.kind === 'leader' ? c.baseline_option_id : c.option_id,
  c.kind === 'leader' ? null : c.constraint_id,
]);
const byId = (kind: Kind, option: string = PRICE, constraint: string | null = null): Rec => {
  const found = COMPLETED.claims.find((c) => c.kind === kind && (c.kind === 'leader'
    ? c.baseline_option_id === option
    : c.option_id === option && c.constraint_id === constraint));
  if (!found) throw new Error(`Missing control ${kind}/${option}/${constraint}`);
  return clone(found) as Rec;
};
const controls = [
  byId('leader'), byId('goal_probability'), byId('outcome_level'),
  byId('constraint_probability', PRICE, CONSTRAINT),
];
const result = (claim: Rec) => ({ ...clone(COMPLETED), claims: [claim] });
const paths = (claim: Rec) => [
  ['standalone', claim.kind === 'leader' ? StructuralChallengeLeaderClaimV1Schema : StructuralChallengeQuantityClaimV1Schema, claim],
  ['union', StructuralChallengeClaimV1Schema, claim],
  ['result', StructuralChallengeResultV1Schema, result(claim)],
] as const;
const acceptsClaim = (claim: Rec) => {
  for (const [path, schema, value] of paths(claim)) {
    const parsed = schema.safeParse(value);
    expect(parsed.success, `${identity(claim)} ${path}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
  }
};
const rejectsClaim = (claim: Rec, rule: string) => {
  for (const [path, schema, value] of paths(claim)) {
    const parsed = schema.safeParse(value);
    expect(parsed.success, `${identity(claim)} ${path}`).toBe(false);
    if (!parsed.success) {
      // Proves the intended refinement, rather than an unrelated shape error, rejected the row.
      expect(parsed.error.issues.every((issue) => issue.message.startsWith(`${rule}:`)), parsed.error.message).toBe(true);
    }
  }
};
const bare = (c: Rec) => ({ ...c, invariant_by_construction: false });

const constraintRows: { id: string; control: Rec; broken: Rec }[] = [];
for (const operator of ['>=', '<=', '>', '<'] as const) {
  const side = (p: number) => operator === '>=' ? p >= 0.5 : operator === '<=' ? p <= 0.5 : operator === '>' ? p > 0.5 : p < 0.5;
  for (const baseline of [0, 0.5, 1]) for (const alternative of [0, 0.5, 1]) {
    const same = side(baseline) === side(alternative);
    const c = {
      ...bare(byId('constraint_probability', PRICE, CONSTRAINT)), baseline, alternative,
      constraint_boundary: { probability_threshold: 0.5, operator },
      noise_verdict: 'signal', verdict: same ? 'holds' : 'changes',
      basis: same ? 'constraint_side_same' : 'constraint_side_changed',
    };
    constraintRows.push({ id: `${identity(c)}/${operator}/${baseline}->${alternative}`, control: c,
      broken: { ...c, verdict: same ? 'changes' : 'holds', basis: same ? 'constraint_side_changed' : 'constraint_side_same' } });
  }
}
for (const basis of ['constraint_side_changed', 'constraint_side_same']) {
  const c = { ...bare(byId('constraint_probability', PRICE, CONSTRAINT)),
    baseline: 0, alternative: basis === 'constraint_side_changed' ? 1 : 0,
    constraint_boundary: { probability_threshold: 0.5, operator: '>=' }, noise_verdict: 'signal',
    verdict: basis === 'constraint_side_changed' ? 'changes' : 'holds', basis };
  constraintRows.push({ id: `${identity(c)}/${basis}/missing-boundary`, control: c, broken: { ...c, constraint_boundary: null } });
}
describe('negative matrix: constraint boundaries (38 rows x 3 parse paths)', () => {
  it('pins the matrix size and covers equality, interior boundary, opposite extremes and all comparators', () => {
    expect(constraintRows).toHaveLength(38);
  });
  it.each(constraintRows)('$id', ({ control, broken }) => {
    acceptsClaim(control);
    rejectsClaim(broken, 'C5');
  });
});

const leaderRows = ['leader_same', 'unaffected_by_construction'].flatMap((basis) =>
  ['within_noise', 'not_noise_qualified'].map((noise_verdict) => ({
    id: `${identity(byId('leader'))}/${basis}/${noise_verdict}`,
    control: { ...byId('leader'), basis, invariant_by_construction: basis === 'unaffected_by_construction' },
    noise_verdict,
  })));
describe('negative matrix: leader entitlement (4 rows x 3 parse paths)', () => {
  it('pins both HOLDS bases and both non-signal noise states', () => { expect(leaderRows).toHaveLength(4); });
  it.each(leaderRows)('$id', ({ control, noise_verdict }) => {
    acceptsClaim(control);
    rejectsClaim({ ...control, noise_verdict }, 'C2');
  });
});

const provenanceRows = COMPLETED.claims.flatMap((claim) => {
  const rows: { id: string; control: Rec; pair_provenance: Rec }[] = [];
  for (const seed_equal of [true, false]) for (const n_equal of [true, false])
    for (const builds_equal of ['equal', 'unequal', 'unknown']) {
      if (seed_equal && n_equal && builds_equal === 'equal') continue;
      rows.push({ id: `${identity(claim as Rec)}/seed=${seed_equal}/n=${n_equal}/builds=${builds_equal}`,
        control: result(clone(claim) as Rec), pair_provenance: { hash_equal: false, seed_equal, n_equal, builds_equal } });
    }
  return rows;
});
describe('negative matrix: completed provenance (66 rows)', () => {
  it('pins every claim identity against all 11 inadmissible seed/budget/build combinations', () => { expect(provenanceRows).toHaveLength(66); });
  it.each(provenanceRows)('$id', ({ control, pair_provenance }) => {
    expect(StructuralChallengeResultV1Schema.safeParse(control).success).toBe(true);
    const parsed = StructuralChallengeResultV1Schema.safeParse({ ...control, pair_provenance });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.every((issue) => issue.message.startsWith('S3:'))).toBe(true);
  });
});

const deltaRows = controls.flatMap((seed) => {
  const rows: { id: string; control: Rec; broken: Rec }[] = [];
  const tags = [
    ['within_noise', 'within_noise'], ['no_licensed_boundary', 'signal'],
    ['no_licensed_boundary', 'within_noise'], ['no_licensed_boundary', 'not_noise_qualified'],
    ['not_noise_qualified', 'not_noise_qualified'],
  ];
  for (const [basis, noise_verdict] of tags) for (const absent of ['baseline', 'alternative', 'both']) {
    const control = { ...bare(seed), verdict: 'delta_only', basis, noise_verdict };
    const broken: Rec = { ...control };
    const b = seed.kind === 'leader' ? 'baseline_option_id' : 'baseline';
    const a = seed.kind === 'leader' ? 'alternative_option_id' : 'alternative';
    if (absent !== 'alternative') broken[b] = null;
    if (absent !== 'baseline') broken[a] = null;
    rows.push({ id: `${identity(seed)}/${basis}/${noise_verdict}/${absent}`, control, broken });
  }
  return rows;
});
const absenceRows = controls.flatMap((seed) => ['missing_on_one_side', 'withheld_on_one_side'].map((basis) => {
  const broken = { ...bare(seed), verdict: 'not_comparable', basis };
  const nullSides = ['baseline', 'alternative', 'both'].map((absent) => {
    const c: Rec = { ...broken };
    if (absent !== 'alternative') c[seed.kind === 'leader' ? 'baseline_option_id' : 'baseline'] = null;
    if (absent !== 'baseline') c[seed.kind === 'leader' ? 'alternative_option_id' : 'alternative'] = null;
    return c;
  });
  return { id: `${identity(seed)}/${basis}/both-present`, broken, nullSides };
}));
describe('negative matrix: missing or withheld sides (68 rows x 3 parse paths)', () => {
  it('pins 60 absent delta rows and 8 falsely absent comparisons', () => {
    expect(deltaRows).toHaveLength(60); expect(absenceRows).toHaveLength(8);
  });
  it.each(deltaRows)('$id', ({ control, broken }) => { acceptsClaim(control); rejectsClaim(broken, 'C3'); });
  it.each(absenceRows)('$id', ({ broken, nullSides }) => {
    for (const control of nullSides) acceptsClaim(control);
    rejectsClaim(broken, 'C4');
  });
});

const nonCompletedRows = Object.entries(STRUCTURAL_CHALLENGE_REASONS).flatMap(([status, reasons]) =>
  reasons.map((reason) => ({ id: `${status}/${reason}`, status, reason })));
describe('negative matrix: non-completed provenance (15 rows)', () => {
  it('pins all five statuses and all 15 reasons', () => {
    expect(nonCompletedRows).toHaveLength(15);
    expect(new Set(nonCompletedRows.map((r) => r.status)).size).toBe(5);
  });
  it.each(nonCompletedRows)('$id', ({ status, reason }) => {
    const control = { ...clone(COMPLETED), status, reason, claims: [], pair_provenance: null };
    expect(StructuralChallengeResultV1Schema.safeParse(control).success).toBe(true);
    const parsed = StructuralChallengeResultV1Schema.safeParse({ ...control, pair_provenance: clone(COMPLETED.pair_provenance) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.every((issue) => issue.message.startsWith('S1:'))).toBe(true);
  });
});

describe('structural challenge: digest and typed boundary controls', () => {
  it('reuses the snapshot SHA validator, with negative malformed-digest controls', () => {
    expect(StructuralChallengeBaselineV1Schema.shape.sent_digest).toBe(RunInputSnapshotSchema.shape.sent_digest);
    for (const sent_digest of ['', 'not-a-sha', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64)]) {
      expect(StructuralChallengeBaselineV1Schema.safeParse({ ...COMPLETED.baseline, sent_digest }).success).toBe(false);
    }
  });
  it('golden recompute key: UTF-8 JSON tuple, ordered alternative members, no whitespace/newline, seed type preserved', () => {
    const { baseline: b, alternative: a } = COMPLETED;
    const canonical = JSON.stringify([b.sent_digest, { from_id: a.from_id, op: a.op, origin: a.origin, sizing: a.sizing, to_id: a.to_id }, b.seed_used, b.n_samples]);
    expect(canonical).toBe('["90d572771786ae04e8fe0885fd6bceaed633ad03dd41d7005c928969d6b45da2",{"from_id":"monthly_churn","op":"remove_link","origin":"olumi_suggested","sizing":"olumi_estimate","to_id":"paying_subscribers"},"1254899477",10000]');
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
    expect(digest).toBe('7ef9ac27f55d3c44c3226801fa4c39916232d43342607d8f0fc1edcd4e78c65e');
    expect(COMPLETED.recompute_key).toBe(digest);
    const numericSeed = JSON.stringify([b.sent_digest, { from_id: a.from_id, op: a.op, origin: a.origin, sizing: a.sizing, to_id: a.to_id }, Number(b.seed_used), b.n_samples]);
    expect(createHash('sha256').update(numericSeed).digest('hex')).not.toBe(digest);
  });
  it('the boundary is strict, probability-typed, and only carried on a constraint', () => {
    for (const constraint_boundary of [
      { probability_threshold: -0.1, operator: '>=' }, { probability_threshold: 1.1, operator: '>=' },
      { probability_threshold: 0.5, operator: '=' }, { probability_threshold: 0.5, operator: '>=', extra: true },
      { probability_threshold: 0.5 }, { operator: '>=' },
    ]) expect(StructuralChallengeQuantityClaimV1Schema.safeParse({ ...constraintRows[0].control, constraint_boundary }).success).toBe(false);
    for (const kind of ['goal_probability', 'outcome_level'] as const) {
      rejectsClaim({ ...byId(kind), constraint_boundary: { probability_threshold: 0.5, operator: '>=' } }, 'C7');
    }
  });
});

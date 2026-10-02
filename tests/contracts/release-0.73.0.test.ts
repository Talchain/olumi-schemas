// ============================================================================
// 0.73.0 — a factor's AUTHORSHIP, recorded so a user's value edit is credited pairwise (F1b 52f8cd; DL lease #85
// 5945475375). Served witness 5945463610: a value edit moved the factor's source / provenance / display_value, so the
// residual differed and the pair read `partial`.
//
// RED-first: on 0.72.0 the `.strict()` factor refuses `authorship_digest`.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { RunInputFactorSchema, RunInputSnapshotSchema } from '../../src/orchestrator/run-input-snapshot.js';

type Rec = Record<string, unknown>;
const factor = (extra: Rec = {}) => ({ factor_id: 'fac_abandon', label: 'Trial abandonment', raw: 20, unit: '%', encoded: 0.2, source: 'user_override', ...extra });

describe('0.73.0 · a snapshot factor records its authorship digest', () => {
  it('RED: a hex-64 authorship digest parses and is carried verbatim', () => {
    const f = factor({ authorship_digest: 'f'.repeat(64) });
    expect(RunInputFactorSchema.parse(f)).toStrictEqual(f);
  });

  it('CONTROL: an older factor without one still parses — absent is "not recorded", never a default', () => {
    expect(RunInputFactorSchema.parse(factor()) as Rec).not.toHaveProperty('authorship_digest');
  });

  it.each([
    ['upper-case hex', 'F'.repeat(64)],
    ['63 characters', 'f'.repeat(63)],
    ['a non-hex character', `${'f'.repeat(63)}z`],
    ['an empty string', ''],
    ['null', null],
    ['an object', { source: 'user_override' }],
  ])('refuses %s', (_name, authorship_digest) => {
    expect(RunInputFactorSchema.safeParse(factor({ authorship_digest })).success).toBe(false);
  });

  it('the factor stays strict, and a whole snapshot carrying it parses', () => {
    expect(RunInputFactorSchema.safeParse(factor({ authorship_digest: 'f'.repeat(64), authorship: {} })).success).toBe(false);
    const snapshot = {
      snapshot_version: 1, sent_digest: 'a'.repeat(64), residual_digest: 'b'.repeat(64), goal: null,
      options: [], options_not_sent: [], factors: [factor({ authorship_digest: 'f'.repeat(64) })], constraints: [], links: [],
    };
    expect(RunInputSnapshotSchema.parse(snapshot)).toStrictEqual(snapshot);
  });
});

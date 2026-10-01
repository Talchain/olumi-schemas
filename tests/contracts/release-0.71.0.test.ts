// ============================================================================
// 0.71.0 — `input_coverage: 'complete'` means VERIFIED (F1b 52f8cd; DL ruling on CEE #2482, 5939864517).
//   CODEX overflow on #2482 reproduced a factor-σ change and an encoded goal-threshold change that the snapshot does not
//   record: the diff of the recorded fields was empty and the pair read `complete`. The class (every analysis input the
//   snapshot does not record) is closed once: each Run records a RESIDUAL digest — the analysis-affecting projection of
//   the request PLoT received, minus every recorded field — and a producer says `complete` only when both ends carry one
//   and they are equal.
//
// RED-first: on 0.70.0 the `.strict()` snapshot refuses `residual_digest`.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { RunInputSnapshotSchema } from '../../src/orchestrator/run-input-snapshot.js';

type Rec = Record<string, unknown>;
const snapshot = (extra: Rec = {}) => ({
  snapshot_version: 1,
  sent_digest: 'a'.repeat(64),
  goal: null,
  options: [],
  options_not_sent: [],
  factors: [],
  constraints: [],
  links: [{ from: 'fac_a', to: 'fac_b', mean: 0.6, std: 0.3, band: 'strong', sizing: 'olumi_accepted' }],
  ...extra,
});

describe('0.71.0 · the snapshot records its residual digest', () => {
  it('RED: a hex-64 residual digest parses and is carried verbatim', () => {
    const s = snapshot({ residual_digest: 'b'.repeat(64) });
    expect(RunInputSnapshotSchema.parse(s)).toStrictEqual(s);
  });

  it('CONTROL: an older snapshot without one still parses — absent is "not recorded", never a default', () => {
    const parsed = RunInputSnapshotSchema.parse(snapshot()) as Rec;
    expect(parsed).not.toHaveProperty('residual_digest');
  });

  it.each([
    ['upper-case hex', 'B'.repeat(64)],
    ['63 characters', 'b'.repeat(63)],
    ['65 characters', 'b'.repeat(65)],
    ['a non-hex character', `${'b'.repeat(63)}g`],
    ['an empty string', ''],
    ['null', null],
    ['a number', 1],
  ])('refuses %s', (_name, residual_digest) => {
    expect(RunInputSnapshotSchema.safeParse(snapshot({ residual_digest })).success).toBe(false);
  });

  it('the snapshot stays strict: an unknown key is still refused', () => {
    expect(RunInputSnapshotSchema.safeParse(snapshot({ residual_digest: 'b'.repeat(64), residual: 'x' })).success).toBe(false);
  });
});

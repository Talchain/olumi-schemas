// ============================================================================
// 0.72.0 — a link's AUTHORSHIP, recorded so an authorship change can be explained pairwise (F1b 52f8cd; DL ruling on
// CEE #2482 round 3). A user's typed band edit and an Accept both move link provenance; with only the residual, a per-Run
// digest cannot say "this change is the one the `sizing` row states", so the investor step read `partial`.
//
// RED-first: on 0.71.0 the `.strict()` link refuses `authorship_digest`.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { RunInputLinkSchema, RunInputSnapshotSchema } from '../../src/orchestrator/run-input-snapshot.js';

type Rec = Record<string, unknown>;
const link = (extra: Rec = {}) => ({ from: 'fac_a', to: 'fac_b', mean: 0.6, std: 0.3, band: 'strong', sizing: 'user', ...extra });

describe('0.72.0 · a snapshot link records its authorship digest', () => {
  it('RED: a hex-64 authorship digest parses and is carried verbatim', () => {
    const l = link({ authorship_digest: 'e'.repeat(64) });
    expect(RunInputLinkSchema.parse(l)).toStrictEqual(l);
  });

  it('CONTROL: an older link without one still parses — absent is "not recorded", never a default', () => {
    expect(RunInputLinkSchema.parse(link()) as Rec).not.toHaveProperty('authorship_digest');
  });

  it.each([
    ['upper-case hex', 'E'.repeat(64)],
    ['63 characters', 'e'.repeat(63)],
    ['a non-hex character', `${'e'.repeat(63)}z`],
    ['an empty string', ''],
    ['null', null],
    ['an object', { source: 'user_specified' }],
  ])('refuses %s', (_name, authorship_digest) => {
    expect(RunInputLinkSchema.safeParse(link({ authorship_digest })).success).toBe(false);
  });

  it('the link stays strict, and a whole 0.71 snapshot carrying it parses', () => {
    expect(RunInputLinkSchema.safeParse(link({ authorship_digest: 'e'.repeat(64), authorship: {} })).success).toBe(false);
    const snapshot = {
      snapshot_version: 1, sent_digest: 'a'.repeat(64), residual_digest: 'b'.repeat(64), goal: null,
      options: [], options_not_sent: [], factors: [], constraints: [], links: [link({ authorship_digest: 'e'.repeat(64) })],
    };
    expect(RunInputSnapshotSchema.parse(snapshot)).toStrictEqual(snapshot);
  });
});

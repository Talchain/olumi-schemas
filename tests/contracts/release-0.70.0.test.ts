// ============================================================================
// 0.70.0 — a link's edit in the user's terms, and WHY a delta has no win shares (F1b 52f8cd).
//   R3 DEFECT 3 (programme-docs #85 5936673643): `input_changes` omitted every link-strength edit — a link's
//   mean/std/exists_probability are the engine's numbers, never a row figure (AIQ 5918134795) — and accepting Olumi's
//   estimate moved no number at all. CANVAS 5936762171 / RC 5936776917: an empty `win_probabilities` was the only
//   signal, for any cause. Plan + order: DL 5937207590 / 5937225976 (schemas → DGAI vendors → CEE emits).
//
// RED-first: on 0.69.0 the `.strict()` objects refuse `links[].band`, `links[].sizing` and
// `win_probabilities_unavailable`, and `field: 'sizing'` is outside the closed RunInputField.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  RunDeltaInputChangeSchema,
  RunDeltaSchema,
  RunDeltaWinProbabilitiesUnavailable,
  RunInputField,
  RunInputLinkSizing,
} from '../../src/boundary/run-delta.js';
import { RunInputLinkSchema, RunInputSnapshotSchema } from '../../src/orchestrator/run-input-snapshot.js';
import { maximalRunDelta, maximalRunDeltaPriorWithheld } from '../../src/fixtures/index.js';

type Rec = Record<string, unknown>;
const link = (extra: Rec = {}) => ({ from: 'fac_ai_module', to: 'fac_sprint_initiatives', mean: 0.6, std: 0.3, ...extra });
const sizingRow = (extra: Rec = {}) => ({
  entity_kind: 'link',
  entity_id: 'fac_ai_module->fac_sprint_initiatives',
  link: { from: 'fac_ai_module', to: 'fac_sprint_initiatives' },
  field: 'sizing',
  before: { raw: 'placeholder' },
  after: { raw: 'olumi_accepted' },
  change: 'changed',
  ...extra,
});
const withheldDelta = (extra: Rec = {}) => ({ ...maximalRunDeltaPriorWithheld, ...extra });

describe('0.70.0 · snapshot links record the band and who sized them', () => {
  it.each([
    ['very_strong', 'user'],
    ['strong', 'olumi_accepted'],
    ['moderate', 'olumi_estimate'],
    ['slight', 'placeholder'],
    ['moderate', 'unmarked'],
  ])('RED: band %s + sizing %s parse and are carried verbatim', (band, sizing) => {
    expect(RunInputLinkSchema.parse(link({ band, sizing }))).toStrictEqual(link({ band, sizing }));
  });

  it('CONTROL: an older Run\'s link (neither recorded) still parses — absent is "not recorded", never a default', () => {
    const parsed = RunInputLinkSchema.parse(link()) as Rec;
    expect(parsed).not.toHaveProperty('band');
    expect(parsed).not.toHaveProperty('sizing');
  });

  it.each([
    ['a band spelled as words', { band: 'very strong' }],
    ['a band outside StrengthBand', { band: 'weak' }],
    ['a sizing outside the vocabulary', { sizing: 'accepted' }],
    ['a sizing in the wrong case', { sizing: 'Placeholder' }],
    ['a number as the band', { band: 0.6 }],
  ])('refuses %s', (_name, extra) => {
    expect(RunInputLinkSchema.safeParse(link(extra)).success).toBe(false);
  });

  it('the link object stays strict: an unknown key is still refused', () => {
    expect(RunInputLinkSchema.safeParse(link({ band: 'strong', note: 'x' })).success).toBe(false);
  });

  it('a whole snapshot carries both, and an older snapshot without them parses unchanged', () => {
    const snapshot = (links: Rec[]) => ({
      snapshot_version: 1,
      sent_digest: 'a'.repeat(64),
      goal: null,
      options: [],
      options_not_sent: [],
      factors: [],
      constraints: [],
      links,
    });
    expect(RunInputSnapshotSchema.safeParse(snapshot([link({ band: 'strong', sizing: 'olumi_accepted' })])).success).toBe(true);
    expect(RunInputSnapshotSchema.safeParse(snapshot([link()])).success).toBe(true);
  });
});

describe('0.70.0 · a `sizing` row says who sized a link, in the user\'s terms', () => {
  it('RED: `sizing` is the appended RunInputField value (the closed set grows by one, at the end)', () => {
    expect(RunInputField.options).toEqual(['value', 'target', 'unit', 'operator', 'direction', 'strength', 'presence', 'sizing']);
    expect(RunInputLinkSizing.options).toEqual(['user', 'placeholder', 'olumi_estimate', 'olumi_accepted', 'unmarked']);
  });

  it.each([
    ['placeholder', 'olumi_accepted'],
    ['olumi_estimate', 'olumi_accepted'],
    ['placeholder', 'user'],
    ['olumi_accepted', 'user'],
  ])('RED: %s → %s parses', (before, after) => {
    expect(RunDeltaInputChangeSchema.safeParse(sizingRow({ before: { raw: before }, after: { raw: after } })).success).toBe(true);
  });

  it.each([
    ['on an option row', { entity_kind: 'option', entity_id: 'opt_a', link: undefined }],
    ['as an added row (a new link is a presence row)', { change: 'added', before: null }],
    ['as a removed row', { change: 'removed', after: null }],
    ['with a unit on an end', { after: { raw: 'olumi_accepted', unit: 'GBP' } }],
    ['with a free-text end', { after: { raw: 'accepted' } }],
    ['with a number as an end', { before: { raw: 0.5 } }],
    ['with equal ends', { before: { raw: 'olumi_accepted' } }],
  ])('refuses a sizing row %s', (_name, extra) => {
    expect(RunDeltaInputChangeSchema.safeParse(sizingRow(extra)).success).toBe(false);
  });

  it('CONTROL: a `strength` row is unchanged by 0.70.0 — band literals (the 0.70 producer) and numbers both parse', () => {
    const strength = (before: unknown, after: unknown) => sizingRow({ field: 'strength', before: { raw: before }, after: { raw: after } });
    expect(RunDeltaInputChangeSchema.safeParse(strength('moderate', 'strong')).success).toBe(true);
    expect(RunDeltaInputChangeSchema.safeParse(strength(0.3, 0.55)).success).toBe(true);
  });

  it('the maximal C1 delta carries a sizing row and still parses (refinements included)', () => {
    const rows = (maximalRunDelta as { input_changes: Rec[] }).input_changes;
    expect(rows.filter((r) => r.field === 'sizing')).toHaveLength(1);
    expect(RunDeltaSchema.safeParse(maximalRunDelta).success).toBe(true);
  });
});

describe('0.70.0 · `win_probabilities_unavailable` — why a delta has no win shares', () => {
  it.each(RunDeltaWinProbabilitiesUnavailable.options)('RED: %s parses beside an empty list', (reason) => {
    expect(RunDeltaSchema.safeParse(withheldDelta({ win_probabilities_unavailable: reason })).success).toBe(true);
  });

  it('refuses a reason beside win shares it would contradict', () => {
    const withShares = withheldDelta({
      win_probabilities: [{ option_id: 'opt_a', prior: 0.4, current: 0.5, noise_verdict: 'signal' }],
    });
    const r = RunDeltaSchema.safeParse(withShares);
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toContain('win_probabilities_unavailable');
  });

  it.each(['withheld', 'none', '', null])('refuses the reason %j', (reason) => {
    expect(RunDeltaSchema.safeParse(withheldDelta({ win_probabilities_unavailable: reason })).success).toBe(false);
  });

  it('CONTROL: absent stays legal on an empty list (a pre-0.70 producer) — the consumer keeps cause-neutral words', () => {
    const { win_probabilities_unavailable: _drop, ...older } = maximalRunDeltaPriorWithheld as Rec;
    expect(RunDeltaSchema.safeParse(older).success).toBe(true);
  });
});

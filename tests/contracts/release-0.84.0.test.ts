import { describe, expect, it } from 'vitest';
import { InterventionRangeSchema, OptionForAnalysisSchema } from '../../src/index.js';
import { RunInputSettingSchema, RunInputSnapshotSchema } from '../../src/orchestrator/index.js';

// Synthetic declarations, not fitted distributions or historical Run evidence.
const law = {
  family: 'uniform', role: 'uncertain_outcome', origin: 'olumi_illustrative',
  basis: 'Untested uniform assumption for this migration, independent of model inputs.',
  quantity: 'Downtime in days', reference: 'Migration', period: 'Migration window',
  conditions: ['During migration'], independent_of_model: true,
};
const range = {
  low: 5, high: 20, meaning: 'likely_range',
  source: 'user_specified', source_quote: 'between 5 and 20 days',
};
const option = (value?: unknown) => ({
  id: 'migrate', label: 'Migrate', status: 'ready', interventions: { downtime: 10 },
  ...(value === undefined ? {} : { intervention_ranges: { downtime: value } }),
});
const snapshot = (value?: unknown) => ({
  snapshot_version: 1, sent_digest: 'a'.repeat(64), goal: null,
  options: [
    { option_id: 'migrate', settings: [{ factor_id: 'downtime', encoded: 10,
      ...(value === undefined ? {} : { range: value }) }] },
    { option_id: 'stay', settings: [{ factor_id: 'downtime', encoded: 0 }] },
  ],
  options_not_sent: [], factors: [], constraints: [], links: [],
});

describe('0.84.0 explicit intervention law: shared admission and evaluated Run snapshot', () => {
  it.each(['declared', 'supported', 'olumi_illustrative'])('carries %s law separately from the raw range author', (origin) => {
    const declared = { ...range, law: { ...law, origin } };
    expect(InterventionRangeSchema.parse(declared)).toStrictEqual(declared);
    expect(OptionForAnalysisSchema.parse(option(declared))).toStrictEqual(option(declared));
    const input = snapshot(declared);
    expect(RunInputSnapshotSchema.parse(input)).toStrictEqual(input);
    // A law on one option must not create a range, law or authorship on another.
    expect(RunInputSnapshotSchema.parse(input).options[1].settings[0]).toStrictEqual({ factor_id: 'downtime', encoded: 0 });
  });

  it.each([undefined, range, { low: 3, high: 6, meaning: 'min_max', source: 'cee_inference' }])(
    'keeps no-law option and snapshot bytes unchanged (%j)', (bare) => {
      expect(JSON.stringify(OptionForAnalysisSchema.parse(option(bare)))).toBe(JSON.stringify(option(bare)));
      expect(JSON.stringify(RunInputSnapshotSchema.parse(snapshot(bare)))).toBe(JSON.stringify(snapshot(bare)));
      if (bare) expect(JSON.stringify(InterventionRangeSchema.parse(bare))).toBe(JSON.stringify(bare));
    },
  );

  it.each<[string, unknown]>([
    ['null law', null],
    ['unknown key', { ...law, approved_by: 'user' }],
    ['unknown origin', { ...law, origin: 'user' }],
    ['unknown role', { ...law, role: 'recommendation' }],
    ['empty family', { ...law, family: '' }],
    ['long family', { ...law, family: 'x'.repeat(65) }],
    ...['basis', 'quantity', 'reference', 'period'].map((key): [string, unknown] => [`empty ${key}`, { ...law, [key]: '' }]),
    ...Object.keys(law).map((key): [string, unknown] => [`missing ${key}`, Object.fromEntries(Object.entries(law).filter(([k]) => k !== key))]),
    ['non-string condition', { ...law, conditions: [42] }],
    ['non-boolean independence', { ...law, independent_of_model: 'true' }],
  ])('strictly rejects %s on both real contract routes', (_name, invalid) => {
    const bad = { ...range, law: invalid };
    expect(InterventionRangeSchema.safeParse(bad).success).toBe(false);
    expect(OptionForAnalysisSchema.safeParse(option(bad)).success).toBe(false);
    expect(RunInputSnapshotSchema.safeParse(snapshot(bad)).success).toBe(false);
  });

  it('records the declaration without granting engine support or inventing independence', () => {
    // ISL owns scientific support/refusal; the canonical transport vocabulary stays identical to #235.
    const input = { ...range, law: { ...law, family: 'unsupported', role: 'setting', conditions: [], independent_of_model: false } };
    expect(InterventionRangeSchema.parse(input)).toStrictEqual(input);
  });

  it('uses the same range schema and detaches the evaluated snapshot from later input edits', () => {
    expect(RunInputSettingSchema.shape.range.unwrap()).toBe(InterventionRangeSchema);
    const input = snapshot({ ...range, law: { ...law, conditions: [...law.conditions] } });
    const evaluated = RunInputSnapshotSchema.parse(input);
    const bytes = JSON.stringify(evaluated);
    // Simulate later model edits: the captured Run must retain the exact evaluated declaration.
    const original = input.options[0].settings[0].range as typeof range & { law: typeof law };
    original.law.conditions.push('Later condition');
    original.law.origin = 'declared';
    original.high = 30;
    expect(JSON.stringify(evaluated)).toBe(bytes);
  });
});

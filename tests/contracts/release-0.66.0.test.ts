// ============================================================================
// 0.66.0 — TEMPORAL S1/S2: an option's stated RANGE for a value it sets (e.g. migration downtime days).
//   Engine halves, both merged to staging: ISL #216 samples `options[].intervention_ranges` (R3 #75 5911436566: a
//   "likely range" is the quartiles of a lognormal) and PLoT #424 forwards it and fails closed without ISL's echo.
//   Placement: olumi-programme-docs #75 5914193872 (TEMPORAL). AIQ words: 5912321226.
//
//   S1 — `OptionForAnalysisSchema.intervention_ranges`: the analysis-ready carrier, in RAW units, with its MEANING. Only
//        `likely_range` is sampled today; other meanings are carried so the engine can refuse them BY NAME.
//   S2 — the analysis hash: `intervention.fields` gains `range`, so editing a stated range marks a Run stale. Without it
//        a user who changes "5–20 days" to "5–30 days" would see the old chance reported as CURRENT.
//
// RED-first: before 0.66.0 the analysis-ready option strips `intervention_ranges` (passthrough keeps it, but nothing
// validates it: a range with low > high parses), and `range` is not a hash input.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
} from '../../src/boundary/graph-hash-contract.js';
import { InterventionRangeSchema, OptionForAnalysisSchema } from '../../src/analysis.js';

const USER = { source: 'brief_extraction', source_quote: 'somewhere between 5 and 20 days' };

const option = (ranges?: unknown) => ({
  id: 'opt_liftshift',
  label: 'Lift-and-shift',
  status: 'ready',
  interventions: { fac_downtime: 10 },
  ...(ranges === undefined ? {} : { intervention_ranges: ranges }),
});

describe('0.66.0 · S1 — an option carries its stated range for a value it sets', () => {
  it('RED: a likely range parses and is carried verbatim', () => {
    const parsed = OptionForAnalysisSchema.parse(option({ fac_downtime: { low: 5, high: 20, meaning: 'likely_range', ...USER } }));
    expect((parsed as { intervention_ranges?: unknown }).intervention_ranges).toEqual({
      fac_downtime: { low: 5, high: 20, meaning: 'likely_range', ...USER },
    });
  });

  it('RED: another stated meaning is CARRIED (the engine refuses it by name; the contract never misreads it)', () => {
    expect(OptionForAnalysisSchema.safeParse(option({ fac_downtime: { low: 5, high: 20, meaning: 'min_max', ...USER } })).success).toBe(true);
  });

  it('RED (AIQ 5914222384): an Olumi-supplied range carries ITS OWN author, distinct from the value\'s', () => {
    const olumi = { low: 3, high: 6, meaning: 'likely_range', source: 'cee_inference' };
    const parsed = InterventionRangeSchema.parse(olumi) as { source: string; source_quote?: string };
    expect(parsed.source).toBe('cee_inference');
    expect(parsed.source_quote).toBeUndefined();
  });

  it.each([
    ['low >= high', { low: 20, high: 5, meaning: 'likely_range', ...USER }],
    ['low <= 0 (a duration range has positive support)', { low: 0, high: 5, meaning: 'likely_range', ...USER }],
    ['non-finite', { low: 5, high: Number.POSITIVE_INFINITY, meaning: 'likely_range', ...USER }],
    ['no meaning', { low: 5, high: 20, ...USER }],
    ['a meaning outside the enumerated set (R3 5914230653 (3))', { low: 5, high: 20, meaning: 'roughly', ...USER }],
    ['no author (AIQ 5914222384)', { low: 5, high: 20, meaning: 'likely_range' }],
    ['an undeclared key (closed object)', { low: 5, high: 20, meaning: 'likely_range', ...USER, unit: 'days' }],
  ])('REFUSED: %s', (_name, bad) => {
    expect(InterventionRangeSchema.safeParse(bad).success).toBe(false);
    expect(OptionForAnalysisSchema.safeParse(option({ fac_downtime: bad })).success).toBe(false);
  });

  it('CONTROL: absent is today\'s option, unchanged', () => {
    expect(OptionForAnalysisSchema.safeParse(option()).success).toBe(true);
  });
});

describe('0.66.0 · S2 — editing a stated range moves the analysis revision', () => {
  const fields: readonly string[] = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.intervention.fields;

  it('RED: `range` is an intervention hash input, appended LAST', () => {
    expect(fields[fields.length - 1]).toBe('range');
  });

  it('RED: the projection version moves 4 → 5 (the module\'s own bump rule)', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(5);
  });

  it('APPEND-ONLY: every pre-0.66.0 intervention field keeps its exact order as the prefix', () => {
    expect(fields.slice(0, -1)).toEqual(['value', 'value_type', 'encoding_map']);
  });

  it('CONTROL: the other vocabularies are unchanged by this release', () => {
    expect(Object.keys(CANONICAL_GRAPH_HASH_NESTED_PROJECTION)).toEqual(['node', 'edge', 'option', 'intervention']);
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields[CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields.length - 1])
      .toBe('proposed_by');
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.option.fields).toEqual(['id', 'status', 'is_baseline']);
  });
});

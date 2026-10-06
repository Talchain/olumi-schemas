// ============================================================================
// 0.78.0 — a link's SIZE in the user's terms, so "what changed" can say the user's own figure (SD-1 cut 6, lease #87
// 6008093205). Served S7 (CEE #2629) can only say "You changed how much X changes Y; it is still strong": the snapshot
// records the link's engine mean, band and sizing, never the size the user stated, so a move inside one band had no
// figure to show.
//
// RED-first: on 0.77.0 the `.strict()` link refuses `natural_effect`, the `.strict()` value refuses `per`, and
// `field: 'effect'` is outside the closed RunInputField.
// ============================================================================
import { describe, expect, it } from 'vitest';

import { RunDeltaInputChangeSchema, RunDeltaSchema, RunInputField, RunInputValueSchema } from '../../src/boundary/run-delta.js';
import { BlockSchema } from '../../src/boundary/blocks.js';
import { RunInputLinkSchema, RunInputSnapshotSchema } from '../../src/orchestrator/run-input-snapshot.js';
import { maximalReviewCardBlock, maximalRunDelta, maximalRunDeliveredRecord, maximalTextBlock } from '../../src/fixtures/index.js';
import { RunAnalysisResultSchema } from '../../src/orchestrator/handler-results.js';
import {
  RUN_DELIVERED_RECORD_MAX_BLOCKS,
  RUN_DELIVERED_RECORD_MAX_BYTES,
  RunDeliveredRecordSchema,
} from '../../src/boundary/run-delivered-record.js';

type Rec = Record<string, unknown>;
const size = (extra: Rec = {}) => ({ amount: 350, amount_unit: 'GBP per month', per_source_change: 1, per_source_change_unit: 'customer lost', ...extra });
const link = (extra: Rec = {}) => ({ from: 'fac_churn', to: 'out_mrr', mean: -0.42, band: 'strong', sizing: 'user', ...extra });
const per = { amount: 1, unit: 'customer lost' };
const effectRow = (extra: Rec = {}) => ({
  entity_kind: 'link',
  entity_id: 'fac_churn->out_mrr',
  link: { from: 'fac_churn', to: 'out_mrr' },
  field: 'effect',
  before: { raw: 300, unit: 'GBP per month', per },
  after: { raw: 350, unit: 'GBP per month', per },
  change: 'changed',
  ...extra,
});
const parses = (row: Rec) => RunDeltaInputChangeSchema.safeParse(row).success;

describe('0.78.0 · a snapshot link records its size in the user\'s terms', () => {
  it('RED: a point size parses and is carried verbatim', () => {
    expect(RunInputLinkSchema.parse(link({ natural_effect: size() }))).toStrictEqual(link({ natural_effect: size() }));
  });

  it('CONTROL: an older Run\'s link without one still parses — absent is "not recorded", never inferred from the mean', () => {
    expect(RunInputLinkSchema.parse(link()) as Rec).not.toHaveProperty('natural_effect');
  });

  it.each([
    ['a size per a zero change of the source', size({ per_source_change: 0 })],
    ['a non-finite amount', size({ amount: Number.POSITIVE_INFINITY })],
    ['an amount as words', size({ amount: '£350' })],
    ['no amount unit', (({ amount_unit: _u, ...rest }) => rest)(size())],
    ['an empty source-change unit', size({ per_source_change_unit: '' })],
    // The engine frame is never a user figure, and a range's text is free text this snapshot never holds.
    ['the engine strength it was written for', size({ strength_mean: -0.42 })],
    ['a stated range', size({ stated_range: { low: 300, high: 400, text: '£300-400', end: 'low' } })],
  ])('refuses %s', (_name, natural_effect) => {
    expect(RunInputLinkSchema.safeParse(link({ natural_effect })).success).toBe(false);
  });

  it('a whole snapshot carrying it parses', () => {
    const snapshot = {
      snapshot_version: 1, sent_digest: 'a'.repeat(64), residual_digest: 'b'.repeat(64), goal: null,
      options: [], options_not_sent: [], factors: [], constraints: [], links: [link({ natural_effect: size() })],
    };
    expect(RunInputSnapshotSchema.parse(snapshot)).toStrictEqual(snapshot);
  });
});

describe('0.78.0 · an `effect` row says a link\'s size moved, per the same source change', () => {
  it('RED: `effect` is the appended RunInputField value — the whole closed set, pinned by hand', () => {
    expect(RunInputField.options).toStrictEqual(
      ['value', 'target', 'unit', 'operator', 'direction', 'strength', 'presence', 'sizing', 'effect'],
    );
  });

  it('RED: £300 → £350 a month per customer lost parses', () => {
    expect(parses(effectRow())).toBe(true);
  });

  it('a unit change at the same amount is a change (both ends shown)', () => {
    expect(parses(effectRow({ after: { raw: 300, unit: 'GBP per quarter', per } }))).toBe(true);
  });

  it.each([
    ['on a factor', { entity_kind: 'factor_value', link: undefined }],
    ['as an added row (a size on one end only is not a pair)', { change: 'added', before: null }],
    ['as a removed row', { change: 'removed', after: null }],
    ['with an end that has no per', { after: { raw: 350, unit: 'GBP per month' } }],
    ['with no per on either end', { before: { raw: 300, unit: 'GBP per month' }, after: { raw: 350, unit: 'GBP per month' } }],
    ['with an end that has no unit', { after: { raw: 350, per } }],
    ['with a band as the figure', { before: { raw: 'strong', unit: 'GBP per month', per } }],
    ['per a different source change on each end', { after: { raw: 350, unit: 'GBP per month', per: { amount: 10, unit: 'customer lost' } } }],
    ['per a source change in a different unit', { after: { raw: 350, unit: 'GBP per month', per: { amount: 1, unit: 'deal lost' } } }],
    ['with the same figure on both ends', { after: { raw: 300, unit: 'GBP per month', per } }],
  ])('refuses an effect row %s', (_name, extra) => {
    expect(parses(effectRow(extra as Rec))).toBe(false);
  });

  it.each([
    ['a value row', { entity_kind: 'factor_value', entity_id: 'fac_price', link: undefined, field: 'value', before: { raw: 59, unit: 'GBP', per }, after: { raw: 60, unit: 'GBP' } }],
    ['a strength row', { field: 'strength', before: { raw: 'moderate', per }, after: { raw: 'strong' } }],
    ['a sizing row', { field: 'sizing', before: { raw: 'placeholder' }, after: { raw: 'user', per } }],
  ])('refuses `per` on %s — it travels on an effect end only', (_name, extra) => {
    expect(parses(effectRow(extra as Rec))).toBe(false);
  });

  it.each([
    ['a value row', { entity_kind: 'factor_value', entity_id: 'fac_price', link: undefined, field: 'value', before: { raw: 59, unit: 'GBP' }, after: { raw: 60, unit: 'GBP' } }],
    ['a strength row', { field: 'strength', before: { raw: 'moderate' }, after: { raw: 'strong' } }],
    ['a sizing row', { field: 'sizing', before: { raw: 'placeholder' }, after: { raw: 'user' } }],
  ])('CONTROL: %s without per parses exactly as before', (_name, extra) => {
    expect(parses(effectRow(extra as Rec))).toBe(true);
  });

  it('`per` is refused when malformed', () => {
    expect(RunInputValueSchema.safeParse({ raw: 350, unit: 'GBP per month', per: { amount: 0, unit: 'customer lost' } }).success).toBe(false);
    expect(RunInputValueSchema.safeParse({ raw: 350, unit: 'GBP per month', per: { amount: 1, unit: 'customer lost', each: true } }).success).toBe(false);
  });

  it('the maximal C1 delta carries one effect row and still parses (refinements included)', () => {
    const rows = (maximalRunDelta as { input_changes: Rec[] }).input_changes;
    expect(rows.filter((r) => r.field === 'effect')).toHaveLength(1);
    expect(RunDeltaSchema.safeParse(maximalRunDelta).success).toBe(true);
  });
});

// ── SD-1 Slice R (DL ruling #87, 6 Oct): the Run's own DELIVERED record ─────────────────────────────────────────────
// Witnessed J1 record 4b (run 37402501132): after a reload, the "Olumi model review" cards and the coverage disclosure
// were gone — composed for the Run's turn and stored nowhere. RED on 0.77: the strict Run fact refuses `delivered_record`.
describe('0.78.0 · the Run fact carries what its turn delivered', () => {
  const record = (extra: Rec = {}) => ({ ...(maximalRunDeliveredRecord as unknown as Rec), ...extra });
  const runFact = (extra: Rec = {}) => ({ scenario_id: '11111111-1111-4111-8111-111111111111', leading_option_id: null, summary: 's', run_id: 'fixture_run_b', ...extra });

  it('RED: a delivered record parses verbatim, alone and on the Run fact', () => {
    expect(RunDeliveredRecordSchema.parse(record())).toStrictEqual(record());
    expect(RunAnalysisResultSchema.parse(runFact({ delivered_record: record() }))).toStrictEqual(runFact({ delivered_record: record() }));
  });

  it('CONTROL: an older Run fact without one still parses — absent is "nothing recorded", never re-composed', () => {
    expect(RunAnalysisResultSchema.parse(runFact()) as Rec).not.toHaveProperty('delivered_record');
  });

  it('an empty delivery is a record, distinct from absence', () => {
    expect(RunDeliveredRecordSchema.safeParse(record({ phase3_blocks: [], analysis_ready_options: [] })).success).toBe(true);
  });

  const option = (id: string, interventions: Record<string, number> = { f: 1 }) => ({ option_id: id, label: id, status: 'ready', interventions });
  it.each([
    ['a VALID block that is not Phase 3 (the maximal text block)', { phase3_blocks: [maximalTextBlock] }],
    [`more than ${RUN_DELIVERED_RECORD_MAX_BLOCKS} blocks`, { phase3_blocks: Array.from({ length: RUN_DELIVERED_RECORD_MAX_BLOCKS + 1 }, () => maximalReviewCardBlock) }],
    ['more than the option cap', { analysis_ready_options: Array.from({ length: 17 }, (_, i) => option(`o${i}`)) }],
    ['the same option twice', { analysis_ready_options: [option('o1'), option('o1')] }],
    ['an option setting a non-finite number', { analysis_ready_options: [option('o1', { f: Number.NaN })] }],
    ['a record over the byte cap', { analysis_ready_options: [option('o1', Object.fromEntries(Array.from({ length: 4000 }, (_, i) => [`factor_${i}_with_a_long_id`, i])))] }],
    ['another record version', { record_version: 2 }],
    ['an unbound record (no run_id)', { run_id: undefined }],
    ['an extra key', { recomposed: true }],
  ])('refuses %s', (_name, extra) => {
    expect(RunDeliveredRecordSchema.safeParse(record(extra as Rec)).success).toBe(false);
  });

  it('CONTROL: that text block is valid on the wire — the record refuses it for its type alone', () => {
    expect(BlockSchema.safeParse(maximalTextBlock).success).toBe(true);
  });

  it('a long option label CEE can deliver is stored verbatim — only the whole-record byte cap bounds it (buddy r2)', () => {
    const long = record({ phase3_blocks: [], analysis_ready_options: [option('o1')].map((o) => ({ ...o, label: 'A'.repeat(201) })) });
    expect(RunDeliveredRecordSchema.parse(long)).toStrictEqual(long);
  });

  it('the byte cap is the published constant', () => {
    expect(RUN_DELIVERED_RECORD_MAX_BYTES).toBe(64_000);
  });
});

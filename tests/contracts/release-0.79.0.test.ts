// ============================================================================
// 0.79.0 — `run_delivery`: what a Run's turn DELIVERED, recorded on the turn row whose egress is final (SD-1 Slice R on
// the AGENT lane; DL ruling #87, 6 Oct, option A).
//
// The served Run (AGENT_LANE_ENABLED=true on staging and prod) commits its `run_analysis` fact inside an internal
// dispatch, then composes the blocks the user sees from its post-commit readback. So 0.78's
// `RunAnalysisResultSchema.delivered_record` cannot hold what was delivered; the agent's ANSWER row records this
// append-only fact after its final egress instead.
//
// RED-first: on 0.78.0 `HandlerFactSchema` is a CLOSED discriminated union with no `run_delivery` member, so a stored row
// carrying one is refused on every read (CEE re-parses every stored fact strictly). That is also why the order is reader
// first: publish → CEE reader (staging AND prod) on 0.79 → only then the writer (`writer-after-prod-0.79`).
// ============================================================================
import { describe, expect, it } from 'vitest';

import { HandlerFactSchema, RunDeliveryHandlerFactSchema } from '../../src/orchestrator/handler-fact.js';
import { RunDeliveryResultSchema } from '../../src/orchestrator/handler-results.js';
import * as orchestrator from '../../src/orchestrator/index.js';
import { maximalRunDeliveredRecord } from '../../src/fixtures/index.js';

type Rec = Record<string, unknown>;
const record = () => structuredClone(maximalRunDeliveredRecord) as Rec;
const fact = (result: Rec = { run_id: record().run_id, record: record() }, extra: Rec = {}) => ({
  fact_type: 'run_delivery',
  fact_version: 1,
  noop: false,
  result,
  ...extra,
});

describe('0.79.0 · `run_delivery` is a member of the stored-fact union', () => {
  it('RED: the union resolves a run_delivery row to THIS member, verbatim', () => {
    // Bound by identity: the discriminator AND the bytes, never "some member accepted it".
    const parsed = HandlerFactSchema.safeParse(fact());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fact_type).toBe('run_delivery');
      expect(parsed.data).toStrictEqual(fact());
    }
  });

  it('CONTROL: the record it carries is the 0.78 delivered record, unchanged', () => {
    expect(RunDeliveryResultSchema.parse({ run_id: record().run_id, record: record() }).record).toStrictEqual(record());
  });

  it('is appended LAST to the union, so every earlier member keeps its place', () => {
    const members = (HandlerFactSchema as unknown as { options: Array<{ shape: { fact_type: { value: string } } }> }).options
      .map((m) => m.shape.fact_type.value);
    expect(members.at(-1)).toBe('run_delivery');
    expect(members.at(-2)).toBe('finding_dissent');
    expect(members.filter((m) => m === 'run_delivery')).toHaveLength(1);
  });

  it('is exported from the orchestrator entry point, schema and fact', () => {
    expect(orchestrator.RunDeliveryHandlerFactSchema).toBe(RunDeliveryHandlerFactSchema);
    expect(orchestrator.RunDeliveryResultSchema).toBe(RunDeliveryResultSchema);
  });
});

describe('0.79.0 · a delivery belongs to exactly the Run it names', () => {
  it.each([
    ['a record for another Run', { run_id: 'run_other', record: record() }],
    ['no run_id', { record: record() }],
    ['an empty run_id', { run_id: '', record: { ...record(), run_id: '' } }],
    ['no record', { run_id: record().run_id }],
    ['an unknown key beside the record', { run_id: record().run_id, record: record(), graph_hash: 'a'.repeat(64) }],
    ['a record with an unknown key', { run_id: record().run_id, record: { ...record(), blocks: [] } }],
    ['a record of another version', { run_id: record().run_id, record: { ...record(), record_version: 2 } }],
  ])('refuses %s', (_name, result) => {
    expect(RunDeliveryHandlerFactSchema.safeParse(fact(result as Rec)).success).toBe(false);
    expect(HandlerFactSchema.safeParse(fact(result as Rec)).success).toBe(false);
  });

  it.each([
    ['an unknown key on the fact', { delivered_at: '2026-10-06T05:00:00Z' }],
    ['another fact version', { fact_version: 2 }],
    ['no noop flag', { noop: undefined }],
  ])('refuses %s', (_name, extra) => {
    expect(HandlerFactSchema.safeParse(fact(undefined, extra as Rec)).success).toBe(false);
  });
});

/**
 * `observed_state.raw_value` and `observed_state.cap` — the SCALE FRAME,
 * declared.
 *
 * WHY THIS SUITE EXISTS. `ObservedStateSchema.value` is documented as being on
 * the MODEL scale, and for a capped factor that is `raw_value / cap`. Both
 * halves of the pair a consumer needs in order to recover that frame rode
 * `.passthrough()` — untyped — so the contract stated a rule about two fields
 * it did not declare. `src/graph.ts` said so against itself, under `baseline`.
 *
 * WHAT THE PAIR IS FOR, and it is not a tidy-up. `cap` is a PER-FACTOR
 * denominator, not a per-unit one, so `unit` cannot stand in for it: two
 * factors both `{unit: '£', value: 0.3}` are £30,000 and £300 when their caps
 * are 100,000 and 1,000. The denominator is minted per factor by CEE's
 * order-of-magnitude ladder (`computeNormalisationCap`,
 * `olumi-assistants-service` `src/cee/factor-extraction/enricher.ts:143-160`,
 * read at staging `a59f7901`), so a single unit carries as many caps as it has
 * factors. Nothing else in this object can tell a reader which ruler a number
 * is on.
 *
 * THE SHAPE OF THE SUITE. Three questions, because a declaration can fail in
 * three directions:
 *   1. does it REFUSE what every consumer already refuses (the point of
 *      declaring — a string, a null, a non-finite divisor);
 *   2. does it still ACCEPT everything that parses today (the additive
 *      guarantee — absence, a bare cap, an incoherent triple);
 *   3. does the DECLARED key set agree with this package's own hash
 *      vocabulary (the mirror check — derived from the manifest, not restated).
 *
 * Question 2 carries the opposite-direction twins, and question 3 is the cell
 * neither of the first two names.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { ObservedStateSchema, NodeV3Schema } from '../src/index.js';
import { CANONICAL_GRAPH_HASH_NESTED_PROJECTION } from '../src/boundary/index.js';
import { maximalObservedState } from '../src/fixtures/index.js';

/** The canonical capped quartet: £30,000 on a factor whose ladder rung is 100,000. */
const CAPPED = { value: 0.3, raw_value: 30000, cap: 100000, unit: '£' } as const;

describe('ObservedState declares its scale frame', () => {
  // ── 1. REFUSALS — the whole point of declaring ─────────────────────────────
  // Each of these parses at pristine, because `.passthrough()` inspects
  // nothing. Each is refused by at least one consumer that already types the
  // field, so accepting it here is the contract disagreeing with every service
  // that reads it.

  it('REFUSES a string raw_value — the class the UI narrows away rather than render', () => {
    const r = ObservedStateSchema.safeParse({ ...CAPPED, raw_value: '30000' });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]?.path).toStrictEqual(['raw_value']);
  });

  it('REFUSES a null raw_value and a null cap — absent and null must not be two bytes for one state', () => {
    expect(ObservedStateSchema.safeParse({ ...CAPPED, raw_value: null }).success).toBe(false);
    expect(ObservedStateSchema.safeParse({ ...CAPPED, cap: null }).success).toBe(false);
  });

  it('REFUSES a non-finite cap — the divisor, where a silent Infinity is a zeroed magnitude', () => {
    expect(ObservedStateSchema.safeParse({ ...CAPPED, cap: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(ObservedStateSchema.safeParse({ ...CAPPED, cap: Number.NaN }).success).toBe(false);
    expect(ObservedStateSchema.safeParse({ ...CAPPED, raw_value: Number.NaN }).success).toBe(false);
  });

  it('refuses the same two fields nested inside a node, not only on the bare object', () => {
    const node = {
      id: 'fixture_factor_1',
      kind: 'factor' as const,
      label: 'Annual cost',
      observed_state: { ...CAPPED, cap: '100000' },
    };
    expect(NodeV3Schema.safeParse(node).success).toBe(false);
    expect(NodeV3Schema.safeParse({ ...node, observed_state: { ...CAPPED } }).success).toBe(true);
  });

  // ── 2. ACCEPTANCES — the additive guarantee, and its opposite-direction twins ─

  it('ACCEPTS the capped quartet and returns both numbers unchanged', () => {
    const parsed = ObservedStateSchema.parse({ ...CAPPED });
    expect(parsed.raw_value).toBe(30000);
    expect(parsed.cap).toBe(100000);
    // The declared invariant, on the fixture the rest of this suite varies.
    expect(parsed.raw_value! / parsed.cap!).toBeCloseTo(parsed.value, 12);
  });

  it('ACCEPTS absence of both — the majority path — and does NOT default them', () => {
    const parsed = ObservedStateSchema.parse({ value: 0.42 });
    expect('raw_value' in parsed).toBe(false);
    expect('cap' in parsed).toBe(false);
    expect(parsed.raw_value).toBeUndefined();
    expect(parsed.cap).toBeUndefined();
  });

  it('ACCEPTS a cap with NO corroborating raw_value — the class CEE LOGS rather than refuses', () => {
    // `olumi-assistants-service` `src/cee/transforms/schema-v3.ts:1227` emits a
    // warning for exactly this factor and ships it. A refusal here would turn
    // that warning into a rejected graph.
    expect(ObservedStateSchema.safeParse({ value: 0.6, cap: 150000 }).success).toBe(true);
    expect(ObservedStateSchema.safeParse({ value: 30000, raw_value: 30000 }).success).toBe(true);
  });

  it('does NOT enforce value === raw_value / cap — the cell neither refusal nor absence names', () => {
    // ISL records this attestation as "deliberately NOT implemented"
    // (`Inference-Service-Layer` `src/services/robustness_analyzer_v2.py:4010-4012`,
    // staging `7781ca4f`). A cross-field refinement here would refuse stored
    // graphs that three services accept today — a breaking change wearing an
    // additive one's clothes.
    const incoherent = ObservedStateSchema.parse({ value: 0.3, raw_value: 30000, cap: 1000 });
    expect(incoherent.value).toBe(0.3);
    expect(incoherent.raw_value! / incoherent.cap!).not.toBeCloseTo(incoherent.value, 6);
  });

  it('ACCEPTS a non-positive cap rather than bounding it — declining to divide is the consumer rule', () => {
    expect(ObservedStateSchema.safeParse({ value: 0, raw_value: 0, cap: 0 }).success).toBe(true);
  });

  it('keeps the object PASSTHROUGH — declaring two keys must not close the others', () => {
    const parsed = ObservedStateSchema.parse({ value: 0.3, metadata: { operator: '<=' } });
    expect((parsed as Record<string, unknown>).metadata).toStrictEqual({ operator: '<=' });
  });

  // ── 3. THE MIRROR CHECK — derived from this package's own hash vocabulary ──

  it('every observed_state field in the canonical hash vocabulary is a DECLARED key of this schema', () => {
    const declared = new Set(Object.keys(ObservedStateSchema.shape));
    const hashed = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields;
    // Positive control: the vocabulary is non-empty, so an empty list cannot
    // pass this by having nothing to check.
    expect(hashed.length).toBeGreaterThan(0);
    expect(hashed.filter((f) => !declared.has(f))).toStrictEqual([]);
  });

  it('raw_value is deliberately NOT a hash input, while cap is', () => {
    const hashed: readonly string[] = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields;
    expect(hashed).toContain('cap');
    // A display/user-scale twin must not move the analysis identity: repairing
    // a magnitude a user reads would otherwise invalidate a committed receipt.
    expect(hashed).not.toContain('raw_value');
  });

  it('the maximal fixture states a RESOLVABLE frame — a fixture that cannot recover one cannot exercise the pair', () => {
    const parsed = ObservedStateSchema.parse(maximalObservedState);
    expect(typeof parsed.raw_value).toBe('number');
    expect(typeof parsed.cap).toBe('number');
    expect(parsed.raw_value! / parsed.cap!).toBeCloseTo(parsed.value, 12);
  });

  it('the declared members are number-typed, not z.unknown() passthrough placeholders', () => {
    // Binds by IDENTITY (the shape key), never by "some member rejects a string".
    const shape = ObservedStateSchema.shape as Record<string, z.ZodTypeAny>;
    for (const key of ['raw_value', 'cap']) {
      const member = shape[key];
      expect(member, `${key} is not a declared member`).toBeDefined();
      expect(member!.isOptional()).toBe(true);
      expect(member!.safeParse(7).success).toBe(true);
      expect(member!.safeParse('7').success).toBe(false);
      expect(member!.safeParse(undefined).success).toBe(true);
    }
  });
});

// ============================================================================
// 0.51.0 — `edit_refusal`: durable evidence that a proposed EDIT was declined.
//
// THE GAP THIS CLOSES. Two refusals exist in CEE and only one had a carrier:
//
//   · ANALYSIS refusal (`run-analysis.ts` -> `analysis_not_ready`) — CARRIED.
//     `buildAnalysisRefusalFact` persists a `run_analysis` fact with
//     `enrichment.analysis_status: 'refused'`. It needed no contract change
//     because `RunAnalysisResultSchema.enrichment` is an OPEN
//     `z.record(z.string(), z.unknown())`.
//
//   · EDIT refusal (`compose/validation-failure-responses.ts`, the
//     validator-recovery path) — NO CARRIER. The turn commits
//     `handler_facts: []` and `handler_id: null`, so the next turn is
//     STRUCTURALLY incapable of knowing the edit was refused.
//
// WHY THIS IS A NEW FACT TYPE AND NOT A REUSE OF `edit_graph`. Settled against
// the contract's OWN declared semantics, not by preference —
// `EditGraphHandlerFactSchema`'s docstring states: "this turn was processed by
// the `edit_graph` dispatcher; `result.status` records whether the proposed
// mutation was applied or compiled to a noop". A validator-recovery refusal is
// NOT processed by that dispatcher (`handler_id` is null on the commit), so
// stamping it `edit_graph` would assert in a durable record that a dispatcher
// ran which did not. `status` is also `z.enum(['applied','noop'])` and the
// whole result is `.strict()`, with no open seam to ride.
//
// WHY `noop` IS NOT PINNED TO `true` HERE. Tempting, and rejected deliberately.
// `noop` in this union means "the D1 NOOP suppression fired", not "nothing
// changed" — the existing refusal carrier (`buildAnalysisRefusalFact`) sets
// `noop: false` for exactly that reason. Pinning `z.literal(true)` would also
// be actively dangerous: CEE's read path (`supabase-store.ts`
// `readFactsWithTurnFor`) THROWS `SessionReadError` on a parse miss rather than
// skipping the row, and it defaults a missing `noop` column to `false` — so a
// literal would turn one column default into a permanently unreadable session.
// Keeping a refusal out of "what just changed" is the job of CEE's
// `MUTATION_DISPATCH_SKIP`, whose conformance test already fails loud when a
// new `fact_type` is classified in neither set.
// ============================================================================
import { describe, it, expect } from 'vitest';

import {
  EditRefusalHandlerFactSchema,
  HandlerFactSchema,
} from '../../src/orchestrator/handler-fact.js';
import { EditRefusalResultSchema } from '../../src/orchestrator/handler-results.js';

/** The canonical shape, as CEE's validator-recovery path would build it. */
const editRefusalFact = {
  fact_type: 'edit_refusal',
  fact_version: 1,
  noop: false,
  result: {
    reason_code: 'option_intervention_misroute',
    template_id: 'option_intervention_misroute',
    graph_hash_at_refusal: 'a3f1c09e7b21',
    refused_at: '2026-09-07T16:20:00.000Z',
  },
} as const;

describe('edit_refusal fact — the missing continuity carrier', () => {
  it('parses the canonical refusal shape', () => {
    const parsed = EditRefusalHandlerFactSchema.safeParse(editRefusalFact);
    expect(parsed.success).toBe(true);
  });

  // IDENTITY BINDING, not a value predicate: assert the discriminator itself
  // AND a field unique to EditRefusalResultSchema. A test that only asserted
  // `success === true` would pass on any union branch that happened to accept
  // the payload.
  it('is a member of the HandlerFactSchema union AND routes to the edit_refusal branch', () => {
    const parsed = HandlerFactSchema.safeParse(editRefusalFact);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.fact_type).toBe('edit_refusal');
    // `reason_code` exists on NO other branch, so its survival proves WHICH
    // branch validated the payload — not merely that some branch accepted it.
    if (parsed.data.fact_type !== 'edit_refusal') throw new Error('wrong branch');
    expect(parsed.data.result.reason_code).toBe('option_intervention_misroute');
    expect(parsed.data.result.template_id).toBe('option_intervention_misroute');
  });

  it('records ONE hash, not a before/after pair — a refusal changes nothing', () => {
    // Two hash fields would imply a transition that never happened, and could
    // drift into disagreeing with each other. The shape forbids the pair.
    const withPair = {
      ...editRefusalFact,
      result: {
        reason_code: 'option_intervention_misroute',
        template_id: 'option_intervention_misroute',
        graph_hash_before: 'a3f1c09e7b21',
        graph_hash_after: 'a3f1c09e7b21',
        refused_at: '2026-09-07T16:20:00.000Z',
      },
    };
    expect(EditRefusalHandlerFactSchema.safeParse(withPair).success).toBe(false);
  });

  it('accepts a null graph hash — hashing can fail at emission', () => {
    const unhashed = {
      ...editRefusalFact,
      result: { ...editRefusalFact.result, graph_hash_at_refusal: null },
    };
    expect(EditRefusalHandlerFactSchema.safeParse(unhashed).success).toBe(true);
  });

  it('REJECTS a free-text user message — a fact row is long-lived and widely read (R-004 precedent)', () => {
    const withText = {
      ...editRefusalFact,
      result: { ...editRefusalFact.result, user_message: 'set Jane’s salary to 90k' },
    };
    expect(EditRefusalHandlerFactSchema.safeParse(withText).success).toBe(false);
  });
});

describe('edit_refusal result — reason_code is shape-constrained, NOT enumerated', () => {
  // The reason-code vocabulary belongs to CEE's ValidationErrorCode. Enumerating
  // it here would be a cross-repo hand-maintained mirror (CLAUDE.md trap 12):
  // it would drift, and it would reject a legitimate new CEE code at the
  // consumer with no error anywhere useful. The contract constrains SHAPE only.
  const base = editRefusalFact.result;

  it('accepts an arbitrary well-formed snake_case code the contract has never seen', () => {
    const parsed = EditRefusalResultSchema.safeParse({
      ...base,
      reason_code: 'a_code_minted_in_cee_long_after_this_release',
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ['uppercase', 'Option_Intervention_Misroute'],
    ['leading digit', '1_bad_start'],
    ['spaces', 'option intervention misroute'],
    ['hyphens', 'option-intervention-misroute'],
    ['empty', ''],
  ])('REJECTS a malformed reason_code (%s)', (_label, reason_code) => {
    expect(EditRefusalResultSchema.safeParse({ ...base, reason_code }).success).toBe(false);
  });

  it('REJECTS a reason_code longer than the 80-char cap', () => {
    expect(
      EditRefusalResultSchema.safeParse({ ...base, reason_code: 'a'.repeat(81) }).success,
    ).toBe(false);
  });

  it('REJECTS a malformed template_id on the same shape rule', () => {
    expect(
      EditRefusalResultSchema.safeParse({ ...base, template_id: 'Not A Template' }).success,
    ).toBe(false);
  });
});

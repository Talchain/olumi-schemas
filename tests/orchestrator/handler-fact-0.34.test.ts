// ============================================================================
// 0.34.0 — three fact types that make human judgement PERSIST server-side
// (P4 transport lane; evidence
// PHASE0-EVIDENCE-2026-07-28/lane-p4-transport-2026-08-05.md).
//
//   · `feedback`         — CEE's dispatch previously committed an EMPTY ack
//                          (`handler_facts: []`) and the thumbs rating was
//                          discarded after hashing.
//   · `edge_adjudication` — no persisted record of a human settling a
//                          contested edge existed anywhere.
//   · `prior_range_edit`  — likewise for user-set prior ranges.
//
// Facts ride the existing `v5_handler_facts.payload` store (same wrapper the
// `set_factor_value` / `edit_graph` facts use) — no new infrastructure.
// ============================================================================
import { describe, it, expect } from 'vitest';

import {
  FeedbackHandlerFactSchema,
  EdgeAdjudicationHandlerFactSchema,
  PriorRangeEditHandlerFactSchema,
  HandlerFactSchema,
} from '../../src/orchestrator/handler-fact.js';

const feedbackFact = {
  fact_type: 'feedback',
  fact_version: 1,
  noop: false,
  result: {
    target_id: '33333333-3333-4333-8333-333333333333',
    target_kind: 'turn',
    rating: 'up',
    comment_present: false,
  },
} as const;

const adjudicationFact = {
  fact_type: 'edge_adjudication',
  fact_version: 1,
  noop: false,
  result: {
    from: 'fac_price_rise',
    to: 'out_churn',
    edge_id: null,
    verdict: 'overridden',
    resolved_strength_mean: -0.45,
    provenance: 'user_set',
  },
} as const;

const priorRangeFact = {
  fact_type: 'prior_range_edit',
  fact_version: 1,
  noop: false,
  result: {
    target_id: 'fac_adoption_rate',
    range_min: 0.2,
    range_max: 0.6,
    distribution: null,
    provenance: 'user_set',
  },
} as const;

describe('feedback fact — the thumbs rating, persisted', () => {
  it('parses a whole-turn rating', () => {
    expect(FeedbackHandlerFactSchema.safeParse(feedbackFact).success).toBe(true);
  });

  it('is a member of the HandlerFactSchema union', () => {
    expect(HandlerFactSchema.safeParse(feedbackFact).success).toBe(true);
  });

  it('REJECTS a verbatim comment field — R-004: the fact records PRESENCE, never the text', () => {
    const withComment = {
      ...feedbackFact,
      result: { ...feedbackFact.result, comment: 'my boss Jane hated this' },
    };
    expect(FeedbackHandlerFactSchema.safeParse(withComment).success).toBe(false);
  });

  it('REJECTS an unknown rating', () => {
    const bad = { ...feedbackFact, result: { ...feedbackFact.result, rating: 'sideways' } };
    expect(FeedbackHandlerFactSchema.safeParse(bad).success).toBe(false);
  });

  it('REJECTS an unknown target kind', () => {
    const bad = { ...feedbackFact, result: { ...feedbackFact.result, target_kind: 'vibe' } };
    expect(FeedbackHandlerFactSchema.safeParse(bad).success).toBe(false);
  });
});

describe('edge_adjudication fact — the settled disagreement, persisted', () => {
  it('parses an overridden verdict with its value', () => {
    expect(EdgeAdjudicationHandlerFactSchema.safeParse(adjudicationFact).success).toBe(true);
  });

  it('is a member of the HandlerFactSchema union', () => {
    expect(HandlerFactSchema.safeParse(adjudicationFact).success).toBe(true);
  });

  it('parses a dismissal with a null value', () => {
    const dismissed = {
      ...adjudicationFact,
      result: {
        ...adjudicationFact.result,
        verdict: 'dismissed',
        resolved_strength_mean: null,
      },
    };
    expect(EdgeAdjudicationHandlerFactSchema.safeParse(dismissed).success).toBe(true);
  });

  it('carries the user_set provenance literal — nothing weaker parses', () => {
    const laundered = {
      ...adjudicationFact,
      result: { ...adjudicationFact.result, provenance: 'cee_inference' },
    };
    expect(EdgeAdjudicationHandlerFactSchema.safeParse(laundered).success).toBe(false);
  });

  it('REJECTS an unknown verdict — including the unresolved state `pending`', () => {
    const bad = { ...adjudicationFact, result: { ...adjudicationFact.result, verdict: 'pending' } };
    expect(EdgeAdjudicationHandlerFactSchema.safeParse(bad).success).toBe(false);
  });
});

describe('prior_range_edit fact — the user-set prior range, persisted', () => {
  it('parses a range with no stated distribution', () => {
    expect(PriorRangeEditHandlerFactSchema.safeParse(priorRangeFact).success).toBe(true);
  });

  it('is a member of the HandlerFactSchema union', () => {
    expect(HandlerFactSchema.safeParse(priorRangeFact).success).toBe(true);
  });

  it('carries the user_set provenance literal', () => {
    const laundered = {
      ...priorRangeFact,
      result: { ...priorRangeFact.result, provenance: 'brief_extraction' },
    };
    expect(PriorRangeEditHandlerFactSchema.safeParse(laundered).success).toBe(false);
  });

  it('REJECTS non-finite bounds', () => {
    const bad = {
      ...priorRangeFact,
      result: { ...priorRangeFact.result, range_min: Number.NaN },
    };
    expect(PriorRangeEditHandlerFactSchema.safeParse(bad).success).toBe(false);
  });
});

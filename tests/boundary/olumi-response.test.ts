import { describe, it, expect } from 'vitest';
import {
  OlumiResponseSchema,
  BlockSchema,
  TextBlockSchema,
  ErrorBlockSchema,
  DraftGraphBlockSchema,
  DraftGoalConstraintSchema,
  FAILURE_USER_TEXT,
  FailureType,
} from '../../src/boundary/index.js';

const validResponse = {
  response_version: 2 as const,
  assistant_text: 'V5 orchestrator is not enabled.',
  blocks: [
    { type: 'error' as const, error_code: 'FEATURE_NOT_ENABLED' as const, severity: 'info' as const },
  ],
  suggested_actions: [],
  insights: [],
  stage_indicator: 'frame' as const,
};

describe('OlumiResponse', () => {
  it('accepts the A0 feature-unavailable envelope', () => {
    expect(OlumiResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('rejects response_version !== 2', () => {
    const r = OlumiResponseSchema.safeParse({ ...validResponse, response_version: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects unknown top-level fields (strict)', () => {
    const r = OlumiResponseSchema.safeParse({ ...validResponse, extra: true });
    expect(r.success).toBe(false);
  });

  it('rejects unknown stage_indicator', () => {
    const r = OlumiResponseSchema.safeParse({ ...validResponse, stage_indicator: 'not-a-stage' });
    expect(r.success).toBe(false);
  });
});

describe('Block discriminated union', () => {
  it('accepts a text block', () => {
    const b = { type: 'text' as const, content: 'hello' };
    expect(BlockSchema.parse(b)).toEqual(b);
    expect(TextBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts an error block', () => {
    const b = {
      type: 'error' as const,
      error_code: 'INGRESS_CONTRACT_VIOLATION' as const,
      severity: 'error' as const,
    };
    expect(BlockSchema.parse(b)).toEqual(b);
    expect(ErrorBlockSchema.parse(b)).toEqual(b);
  });

  it('rejects an unknown block type', () => {
    const r = BlockSchema.safeParse({ type: 'chart', points: [] });
    expect(r.success).toBe(false);
  });

  it('rejects an error block with unknown error_code', () => {
    const r = ErrorBlockSchema.safeParse({
      type: 'error',
      error_code: 'NOT_A_CODE',
      severity: 'info',
    });
    expect(r.success).toBe(false);
  });
});

describe('FailureType and user-visible text (addendum §2.1.5)', () => {
  it('declares user-visible text for every FailureType member', () => {
    for (const code of FailureType.options) {
      expect(FAILURE_USER_TEXT[code]).toBeTruthy();
      expect(typeof FAILURE_USER_TEXT[code]).toBe('string');
    }
  });
});

describe('OlumiResponse v0.8.0 — draft_graph field', () => {
  const base = {
    response_version: 2 as const,
    assistant_text: 'Drafted a graph.',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'analyse' as const,
  };

  it('accepts a response without draft_graph (field is optional)', () => {
    expect(OlumiResponseSchema.parse(base)).toEqual(base);
  });

  it('accepts a response with a valid draft_graph block', () => {
    const r = {
      ...base,
      draft_graph: { nodes: [{ id: 'n1' }], edges: [], node_count: 1, edge_count: 0 },
    };
    const parsed = OlumiResponseSchema.parse(r);
    expect(parsed.draft_graph?.node_count).toBe(1);
    expect(parsed.draft_graph?.edge_count).toBe(0);
  });

  it('rejects draft_graph with negative node_count', () => {
    const r = {
      ...base,
      draft_graph: { nodes: [], edges: [], node_count: -1, edge_count: 0 },
    };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });

  it('rejects draft_graph with non-integer node_count', () => {
    const r = {
      ...base,
      draft_graph: { nodes: [], edges: [], node_count: 1.5, edge_count: 0 },
    };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });
});

describe('OlumiResponse v0.8.1 — analysis_ready field', () => {
  const base = {
    response_version: 2 as const,
    assistant_text: 'Drafted a graph.',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'analyse' as const,
  };

  const validAnalysisReady = {
    status: 'ready',
    options: [
      { option_id: 'opt_a', label: 'Option A', status: 'ready', interventions: { fac_revenue: 0.8 } },
    ],
    goal_node_id: 'goal_revenue',
  };

  it('accepts a response without analysis_ready (field is optional)', () => {
    expect(OlumiResponseSchema.parse(base)).toEqual(base);
  });

  it('accepts a response with valid analysis_ready', () => {
    const r = { ...base, analysis_ready: validAnalysisReady };
    const parsed = OlumiResponseSchema.parse(r);
    expect(parsed.analysis_ready?.status).toBe('ready');
    expect(parsed.analysis_ready?.goal_node_id).toBe('goal_revenue');
    expect(Array.isArray(parsed.analysis_ready?.options)).toBe(true);
  });

  it('preserves extra fields via passthrough (forward-compat)', () => {
    const r = { ...base, analysis_ready: { ...validAnalysisReady, bias_findings: [] } };
    const parsed = OlumiResponseSchema.parse(r);
    expect((parsed.analysis_ready as Record<string, unknown>)?.bias_findings).toEqual([]);
  });

  it('rejects analysis_ready missing status', () => {
    const { status: _s, ...noStatus } = validAnalysisReady;
    expect(OlumiResponseSchema.safeParse({ ...base, analysis_ready: noStatus }).success).toBe(false);
  });

  it('rejects analysis_ready missing goal_node_id', () => {
    const { goal_node_id: _g, ...noGoal } = validAnalysisReady;
    expect(OlumiResponseSchema.safeParse({ ...base, analysis_ready: noGoal }).success).toBe(false);
  });

  it('rejects analysis_ready missing options', () => {
    const { options: _o, ...noOptions } = validAnalysisReady;
    expect(OlumiResponseSchema.safeParse({ ...base, analysis_ready: noOptions }).success).toBe(false);
  });
});

describe('OlumiResponse v0.15.0 — reasoning field (ROADMAP 1.42)', () => {
  const base = {
    response_version: 2 as const,
    assistant_text: 'Here is my recommendation.',
    blocks: [],
    suggested_actions: [],
    insights: [],
    stage_indicator: 'decide' as const,
  };

  it('accepts a response without reasoning (field is optional — model-adaptive)', () => {
    expect(OlumiResponseSchema.parse(base)).toEqual(base);
  });

  it('accepts a response with reasoning as a verbatim string', () => {
    const r = { ...base, reasoning: 'Weighing option A against option B, given the cost constraint...' };
    const parsed = OlumiResponseSchema.parse(r);
    expect(parsed.reasoning).toBe(r.reasoning);
  });

  it('accepts an empty-string reasoning (schema does not impose a minimum length)', () => {
    const r = { ...base, reasoning: '' };
    expect(OlumiResponseSchema.parse(r).reasoning).toBe('');
  });

  it('rejects a non-string reasoning', () => {
    const r = { ...base, reasoning: 12345 };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });

  it('still rejects unknown top-level fields alongside reasoning (strict)', () => {
    const r = { ...base, reasoning: 'text', extra_field: true };
    expect(OlumiResponseSchema.safeParse(r).success).toBe(false);
  });
});

describe('DraftGraphBlockSchema', () => {
  it('accepts a valid draft_graph block', () => {
    const b = { type: 'draft_graph' as const, nodes: [], edges: [], node_count: 0, edge_count: 0 };
    expect(DraftGraphBlockSchema.parse(b)).toEqual(b);
  });

  it('is accepted by the BlockSchema discriminated union', () => {
    const b = { type: 'draft_graph' as const, nodes: [{ id: 'n1' }], edges: [], node_count: 1, edge_count: 0 };
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it('rejects unknown fields (strict)', () => {
    const r = DraftGraphBlockSchema.safeParse({
      type: 'draft_graph', nodes: [], edges: [], node_count: 0, edge_count: 0, extra: true,
    });
    expect(r.success).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// goal_constraints on the draft_graph block.
//
// The defect this closes: CEE's deterministic extractor produces
// goal_constraints[] and they survive to the draft dispatcher, which then
// rebuilds the wire block as exactly {nodes, edges, node_count, edge_count}.
// It could not thread the field through, because this schema is `.strict()`
// and an undeclared key produces `unrecognized_keys` -> CEE's validateEgress
// replaces the ENTIRE draft response with an EGRESS_CONTRACT_VIOLATION
// fallback. Declaring the field here is what unblocks the producer.
//
// `.strict()` is retained deliberately — the fix is DECLARING the field, not
// loosening the block. The negative controls below pin that.
// ----------------------------------------------------------------------------

const BUDGET_CONSTRAINT = {
  constraint_id: 'c_first_year_budget',
  node_id: 'fac_first_year_cost',
  operator: '<=' as const,
  value: 50000,
  label: 'First-year budget cap',
  unit: '£',
  source_quote: 'first-year budget cannot exceed £50,000',
  confidence: 0.85,
  provenance: 'explicit' as const,
};

describe('DraftGoalConstraintSchema', () => {
  it('accepts the full CEE producer shape', () => {
    expect(DraftGoalConstraintSchema.parse(BUDGET_CONSTRAINT)).toEqual(BUDGET_CONSTRAINT);
  });

  it('accepts the minimal required shape (4 required keys)', () => {
    const minimal = {
      constraint_id: 'c1', node_id: 'n1', operator: '>=' as const, value: 1,
    };
    expect(DraftGoalConstraintSchema.parse(minimal)).toEqual(minimal);
  });

  it('carries deadline_metadata for temporal constraints', () => {
    const c = {
      ...BUDGET_CONSTRAINT,
      deadline_metadata: {
        deadline_date: '2027-01-01',
        reference_date: '2026-07-18',
        assumed_reference_date: true,
      },
    };
    expect(DraftGoalConstraintSchema.parse(c)).toEqual(c);
  });

  // The regex path emits this via normaliseConstraintUnits() when a percent
  // value is rewritten to a fraction. It is NOT declared in CEE's own
  // GoalConstraintSchema, and CEE's structural-parse is validation-only (the
  // parsed result is discarded), so the key reaches the wire. A `.strict()`
  // element here would therefore have detonated egress on percent
  // constraints — exactly the failure this change exists to prevent.
  it('carries provenance_unit_normalised from the percent->fraction rewrite', () => {
    const c = {
      ...BUDGET_CONSTRAINT,
      unit: 'fraction',
      value: 0.15,
      provenance_unit_normalised: {
        rule: 'percent_to_fraction',
        original_value: 15,
        original_unit: '%',
      },
    };
    expect(DraftGoalConstraintSchema.parse(c)).toEqual(c);
  });

  it('is passthrough — an undeclared producer key survives rather than failing egress', () => {
    const c = { ...BUDGET_CONSTRAINT, some_future_field: 'kept' };
    expect(DraftGoalConstraintSchema.parse(c)).toEqual(c);
  });

  it('rejects an operator outside the ASCII pair CEE emits', () => {
    for (const operator of ['<', '>', 'lte', '≤', 'eq']) {
      expect(DraftGoalConstraintSchema.safeParse({ ...BUDGET_CONSTRAINT, operator }).success)
        .toBe(false);
    }
  });

  it('requires constraint_id, node_id, operator and value', () => {
    for (const key of ['constraint_id', 'node_id', 'operator', 'value']) {
      const { [key]: _dropped, ...rest } = BUDGET_CONSTRAINT as Record<string, unknown>;
      expect(DraftGoalConstraintSchema.safeParse(rest).success).toBe(false);
    }
  });

  it('rejects empty identifiers and out-of-range confidence', () => {
    expect(DraftGoalConstraintSchema.safeParse({ ...BUDGET_CONSTRAINT, node_id: '' }).success)
      .toBe(false);
    expect(DraftGoalConstraintSchema.safeParse({ ...BUDGET_CONSTRAINT, constraint_id: '' }).success)
      .toBe(false);
    expect(DraftGoalConstraintSchema.safeParse({ ...BUDGET_CONSTRAINT, confidence: 1.5 }).success)
      .toBe(false);
  });

  it('rejects a provenance value outside the CEE enum', () => {
    expect(DraftGoalConstraintSchema.safeParse({ ...BUDGET_CONSTRAINT, provenance: 'guessed' }).success)
      .toBe(false);
  });
});

describe('DraftGraphBlockSchema — goal_constraints', () => {
  const base = {
    type: 'draft_graph' as const,
    nodes: [{ id: 'fac_first_year_cost' }],
    edges: [],
    node_count: 1,
    edge_count: 0,
  };

  it('parses the block when goal_constraints is present', () => {
    const b = { ...base, goal_constraints: [BUDGET_CONSTRAINT] };
    expect(DraftGraphBlockSchema.parse(b)).toEqual(b);
  });

  it('is OPTIONAL — the pre-0.18.0 four-key block still parses unchanged', () => {
    expect(DraftGraphBlockSchema.parse(base)).toEqual(base);
    expect('goal_constraints' in DraftGraphBlockSchema.parse(base)).toBe(false);
  });

  it('accepts an empty goal_constraints array', () => {
    const b = { ...base, goal_constraints: [] };
    expect(DraftGraphBlockSchema.parse(b)).toEqual(b);
  });

  it('STILL rejects an unknown key alongside goal_constraints (.strict() intact)', () => {
    const r = DraftGraphBlockSchema.safeParse({
      ...base, goal_constraints: [BUDGET_CONSTRAINT], extra: true,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a malformed constraint inside the array', () => {
    const r = DraftGraphBlockSchema.safeParse({
      ...base, goal_constraints: [{ constraint_id: 'c1' }],
    });
    expect(r.success).toBe(false);
  });

  it('survives the BlockSchema discriminated union', () => {
    const b = { ...base, goal_constraints: [BUDGET_CONSTRAINT] };
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  // The block rides on OlumiResponseSchema.draft_graph as `.omit({type:true})`,
  // which is where the UI actually reads it. A field declared on the block but
  // lost through the omit-projection would be a silent no-op.
  it('reaches the UI through OlumiResponseSchema.draft_graph', () => {
    const r = {
      ...validResponse,
      draft_graph: {
        nodes: base.nodes,
        edges: [],
        node_count: 1,
        edge_count: 0,
        goal_constraints: [BUDGET_CONSTRAINT],
      },
    };
    const parsed = OlumiResponseSchema.parse(r);
    expect(parsed.draft_graph?.goal_constraints).toHaveLength(1);
    expect(parsed.draft_graph?.goal_constraints?.[0]).toMatchObject({
      node_id: 'fac_first_year_cost',
      operator: '<=',
      value: 50000,
    });
  });

  // Serialization control: `undefined` vanishes silently through JSON, so a
  // presence assertion on a reconstructed object would not prove the field
  // reaches the wire bytes.
  it('appears in the SERIALIZED response bytes', () => {
    const { type: _omitted, ...blockWithoutType } = base;
    const parsed = OlumiResponseSchema.parse({
      ...validResponse,
      draft_graph: { ...blockWithoutType, goal_constraints: [BUDGET_CONSTRAINT] },
    });
    const wire = JSON.stringify(parsed);
    expect(wire).toContain('"goal_constraints"');
    expect(JSON.parse(wire).draft_graph.goal_constraints[0].value).toBe(50000);
  });
});

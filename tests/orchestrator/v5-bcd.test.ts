import { describe, it, expect } from 'vitest';
import {
  V5ActionTypeSchema,
  SessionTurnSchema,
  SessionCacheEntrySchema,
  GraphInvalidationSchema,
  DecisionContextSchema,
  EMPTY_DECISION_CONTEXT,
  RunAnalysisArgsSchema,
  ExplainResultArgsSchema,
  CompareOptionsArgsSchema,
  WhatWouldFlipArgsSchema,
  SetFactorValueArgsSchema,
  AddConstraintArgsSchema,
  AdjustEdgeStrengthArgsSchema,
  RunAnalysisResultSchema,
  ExplainResultResultSchema,
  ExplainResultsResultSchema,
  ExplainFromStructureResultSchema,
  CompareOptionsResultSchema,
  WhatWouldFlipResultSchema,
  SetFactorValueResultSchema,
  AddConstraintResultSchema,
  AdjustEdgeStrengthResultSchema,
  HandlerFactSchema,
  RunAnalysisHandlerFactSchema,
  SetFactorValueHandlerFactSchema,
} from '../../src/orchestrator/index.js';
import {
  ActionType,
  ActionSchema,
  BlockSchema,
  AnalysisResultBlockSchema,
  GraphPatchBlockSchema,
  ExplanationBlockSchema,
  ComparisonBlockSchema,
  FlipAnalysisBlockSchema,
} from '../../src/boundary/index.js';

const VALID_UUID_A = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_B = '22222222-2222-2222-2222-222222222222';
const VALID_UUID_C = '33333333-3333-3333-3333-333333333333';

describe('@talchain/schemas 0.5.0 — V5 action type', () => {
  it('accepts all seven canonical V4 action-type literals', () => {
    const literals = [
      'run_analysis',
      'set_factor_value',
      'add_constraint',
      'adjust_edge_strength',
      'explain_result',
      'compare_options',
      'what_would_flip',
    ] as const;
    for (const lit of literals) {
      expect(V5ActionTypeSchema.parse(lit)).toBe(lit);
    }
  });

  it('rejects unknown action-type literals', () => {
    expect(() => V5ActionTypeSchema.parse('run_premortem')).toThrow();
    expect(() => V5ActionTypeSchema.parse('add_factor')).toThrow();
    expect(() => V5ActionTypeSchema.parse('')).toThrow();
  });

  it('is the same enum as boundary ActionType (single source of truth)', () => {
    expect(V5ActionTypeSchema).toBe(ActionType);
  });
});

describe('SessionTurnSchema', () => {
  const baseTurn = {
    id: VALID_UUID_A,
    scenario_id: VALID_UUID_B,
    user_id: VALID_UUID_C,
    turn_id: 'req-abc-123',
    turn_class: 'direct_answer' as const,
    handler_id: null,
    request_hash: 'sha256:deadbeef',
    response_emitted: true,
    llm_calls_used: 2,
    duration_ms: 1500,
    created_at: '2026-04-17T10:00:00.000Z',
  };

  it('accepts a minimal valid turn row', () => {
    const parsed = SessionTurnSchema.parse(baseTurn);
    expect(parsed.turn_id).toBe('req-abc-123');
    expect(parsed.response_emitted).toBe(true);
  });

  it('accepts handler_id when turn_class = handler', () => {
    const parsed = SessionTurnSchema.parse({
      ...baseTurn,
      turn_class: 'handler' as const,
      handler_id: 'run_analysis' as const,
    });
    expect(parsed.handler_id).toBe('run_analysis');
  });

  it('accepts all four ConversationTurnClass values (with biconditional-correct handler_id)', () => {
    for (const tc of ['direct_answer', 'clarify', 'handler', 'unhandled'] as const) {
      const handler_id = tc === 'handler' ? ('run_analysis' as const) : null;
      const parsed = SessionTurnSchema.parse({ ...baseTurn, turn_class: tc, handler_id });
      expect(parsed.turn_class).toBe(tc);
    }
  });

  it('rejects invalid turn_class values (boundary TurnClass leak)', () => {
    expect(() =>
      SessionTurnSchema.parse({ ...baseTurn, turn_class: 'frame' as never }),
    ).toThrow();
  });

  it('rejects invalid UUIDs', () => {
    expect(() => SessionTurnSchema.parse({ ...baseTurn, id: 'not-a-uuid' })).toThrow();
    expect(() => SessionTurnSchema.parse({ ...baseTurn, scenario_id: 'x' })).toThrow();
  });

  it('rejects negative llm_calls_used or duration_ms', () => {
    expect(() => SessionTurnSchema.parse({ ...baseTurn, llm_calls_used: -1 })).toThrow();
    expect(() => SessionTurnSchema.parse({ ...baseTurn, duration_ms: -1 })).toThrow();
  });

  it('is strict — rejects extra fields', () => {
    expect(() => SessionTurnSchema.parse({ ...baseTurn, extra: true })).toThrow();
  });

  it('rejects invalid handler_id values', () => {
    expect(() =>
      SessionTurnSchema.parse({ ...baseTurn, handler_id: 'generate_artefact' as never }),
    ).toThrow();
  });
});

describe('SessionCacheEntrySchema', () => {
  it('extends SessionTurnSchema with stale flag + reason', () => {
    const entry = {
      id: VALID_UUID_A,
      scenario_id: VALID_UUID_B,
      user_id: VALID_UUID_C,
      turn_id: 'req-1',
      turn_class: 'handler' as const,
      handler_id: 'run_analysis' as const,
      request_hash: 'sha256:x',
      response_emitted: true,
      llm_calls_used: 1,
      duration_ms: 800,
      created_at: '2026-04-17T10:00:00.000Z',
      stale: true,
      stale_reason: 'factor_value_changed',
    };
    const parsed = SessionCacheEntrySchema.parse(entry);
    expect(parsed.stale).toBe(true);
    expect(parsed.stale_reason).toBe('factor_value_changed');
  });

  it('accepts stale = false with stale_reason = null', () => {
    const entry = {
      id: VALID_UUID_A,
      scenario_id: VALID_UUID_B,
      user_id: VALID_UUID_C,
      turn_id: 'req-2',
      turn_class: 'direct_answer' as const,
      handler_id: null,
      request_hash: 'sha256:y',
      response_emitted: true,
      llm_calls_used: 2,
      duration_ms: 2000,
      created_at: '2026-04-17T10:01:00.000Z',
      stale: false,
      stale_reason: null,
    };
    expect(SessionCacheEntrySchema.parse(entry).stale).toBe(false);
  });
});

describe('GraphInvalidationSchema', () => {
  it('accepts factor-scope invalidation', () => {
    const parsed = GraphInvalidationSchema.parse({
      scope: 'factor',
      scenario_id: VALID_UUID_A,
      target_id: 'factor_mrr',
      reason: 'set_factor_value',
    });
    expect(parsed.scope).toBe('factor');
  });

  it('accepts structural-scope invalidation', () => {
    const parsed = GraphInvalidationSchema.parse({
      scope: 'structural',
      scenario_id: VALID_UUID_A,
      reason: 'node_removed',
    });
    expect(parsed.scope).toBe('structural');
  });

  it('accepts manual-scope invalidation', () => {
    const parsed = GraphInvalidationSchema.parse({
      scope: 'manual',
      scenario_id: VALID_UUID_A,
      reason: 'user_reset',
    });
    expect(parsed.scope).toBe('manual');
  });

  it('requires target_id on factor scope only', () => {
    expect(() =>
      GraphInvalidationSchema.parse({
        scope: 'factor',
        scenario_id: VALID_UUID_A,
        reason: 'x',
      }),
    ).toThrow();
  });

  it('rejects unknown scope', () => {
    expect(() =>
      GraphInvalidationSchema.parse({
        scope: 'global',
        scenario_id: VALID_UUID_A,
        reason: 'x',
      }),
    ).toThrow();
  });
});

describe('DecisionContextSchema + EMPTY_DECISION_CONTEXT', () => {
  it('validates EMPTY_DECISION_CONTEXT as a conformant instance', () => {
    expect(DecisionContextSchema.parse(EMPTY_DECISION_CONTEXT)).toEqual(EMPTY_DECISION_CONTEXT);
    expect(EMPTY_DECISION_CONTEXT.status).toBe('not_populated');
    expect(EMPTY_DECISION_CONTEXT.domain_anchors.named_entities).toEqual([]);
  });

  it('accepts partial and populated statuses', () => {
    for (const status of ['partial', 'populated'] as const) {
      const parsed = DecisionContextSchema.parse({
        ...EMPTY_DECISION_CONTEXT,
        status,
      });
      expect(parsed.status).toBe(status);
    }
  });

  it('rejects unknown status', () => {
    expect(() =>
      DecisionContextSchema.parse({ ...EMPTY_DECISION_CONTEXT, status: 'halfway' as never }),
    ).toThrow();
  });
});

describe('Handler argument schemas', () => {
  it('RunAnalysisArgsSchema accepts scenario_id only', () => {
    expect(RunAnalysisArgsSchema.parse({ scenario_id: VALID_UUID_A })).toBeTruthy();
  });

  it('ExplainResultArgsSchema accepts optional focus_option_id', () => {
    const parsed = ExplainResultArgsSchema.parse({
      scenario_id: VALID_UUID_A,
      focus_option_id: 'opt_a',
    });
    expect(parsed.focus_option_id).toBe('opt_a');
  });

  it('CompareOptionsArgsSchema accepts optional option_ids array', () => {
    const parsed = CompareOptionsArgsSchema.parse({
      scenario_id: VALID_UUID_A,
      option_ids: ['opt_a', 'opt_b'],
    });
    expect(parsed.option_ids).toEqual(['opt_a', 'opt_b']);
  });

  it('WhatWouldFlipArgsSchema accepts optional focus_factor_id', () => {
    expect(
      WhatWouldFlipArgsSchema.parse({ scenario_id: VALID_UUID_A, focus_factor_id: 'f1' }),
    ).toBeTruthy();
  });

  it('SetFactorValueArgsSchema requires factor_id + value', () => {
    expect(
      SetFactorValueArgsSchema.parse({
        scenario_id: VALID_UUID_A,
        factor_id: 'f1',
        value: 42,
      }),
    ).toBeTruthy();
    expect(() =>
      SetFactorValueArgsSchema.parse({ scenario_id: VALID_UUID_A, factor_id: 'f1' }),
    ).toThrow();
  });

  it('AddConstraintArgsSchema enforces constraint_kind enum', () => {
    const parsed = AddConstraintArgsSchema.parse({
      scenario_id: VALID_UUID_A,
      factor_id: 'f1',
      constraint_kind: 'range',
      lower: 0,
      upper: 1,
    });
    expect(parsed.constraint_kind).toBe('range');
    expect(() =>
      AddConstraintArgsSchema.parse({
        scenario_id: VALID_UUID_A,
        factor_id: 'f1',
        constraint_kind: 'not_a_kind',
        lower: 0,
        upper: 1,
      }),
    ).toThrow();
  });

  it('AdjustEdgeStrengthArgsSchema clamps strength to [-1, 1]', () => {
    expect(
      AdjustEdgeStrengthArgsSchema.parse({
        scenario_id: VALID_UUID_A,
        edge_id: 'e1',
        strength: 0.5,
      }),
    ).toBeTruthy();
    expect(() =>
      AdjustEdgeStrengthArgsSchema.parse({
        scenario_id: VALID_UUID_A,
        edge_id: 'e1',
        strength: 1.5,
      }),
    ).toThrow();
  });
});

describe('Handler result schemas', () => {
  it('RunAnalysisResultSchema accepts enrichment record', () => {
    const parsed = RunAnalysisResultSchema.parse({
      scenario_id: VALID_UUID_A,
      leading_option_id: 'opt_a',
      win_probabilities: { opt_a: 0.6, opt_b: 0.4 },
      summary: 'Option A leads at 60%.',
      enrichment: { factor_sensitivity: [{ factor_id: 'f1', rank: 1 }] },
    });
    expect(parsed.leading_option_id).toBe('opt_a');
    expect(parsed.win_probabilities?.opt_a).toBe(0.6);
  });

  it('ExplainResultResultSchema requires referenced_option_ids array', () => {
    expect(() =>
      ExplainResultResultSchema.parse({ narrative: 'x' }),
    ).toThrow();
  });

  it('CompareOptionsResultSchema requires ≥1 option (tests enforce ≥2 when available)', () => {
    expect(() => CompareOptionsResultSchema.parse({ options: [] })).toThrow();
    const parsed = CompareOptionsResultSchema.parse({
      options: [{ option_id: 'o1', label: 'One' }],
    });
    expect(parsed.options).toHaveLength(1);
  });

  it('WhatWouldFlipResultSchema accepts empty flip_scenarios', () => {
    const parsed = WhatWouldFlipResultSchema.parse({
      precondition_unmet: false,
      option_count: 4,
      narrative: 'No fragile edges.',
      flip_scenarios: [],
    });
    expect(parsed.flip_scenarios).toEqual([]);
  });

  it('SetFactorValueResultSchema requires target_id + status', () => {
    const parsed = SetFactorValueResultSchema.parse({
      target_id: 'f1',
      status: 'applied',
      before: { value: 3 },
      after: { value: 5 },
    });
    expect(parsed.status).toBe('applied');
  });

  it('AddConstraintResultSchema accepts noop status', () => {
    const parsed = AddConstraintResultSchema.parse({
      target_id: 'c1',
      status: 'noop',
      before: null,
      after: null,
    });
    expect(parsed.status).toBe('noop');
  });

  it('AdjustEdgeStrengthResultSchema rejects unknown status', () => {
    expect(() =>
      AdjustEdgeStrengthResultSchema.parse({
        target_id: 'e1',
        status: 'deferred',
        before: null,
        after: null,
      }),
    ).toThrow();
  });

  // V5 explain-stabilisation: the four diagnostic fields are additive +
  // optional. Historic v1 rows without these fields must continue to parse
  // cleanly. The fact_version stays at 1 — additive optional-only changes
  // do not warrant a version bump.
  it('ExplainResultsResultSchema parses a historic v1 row without diagnostic fields', () => {
    const parsed = ExplainResultsResultSchema.parse({
      precondition_unmet: false,
      option_count: 4,
    });
    expect(parsed.answer_source).toBeUndefined();
    expect(parsed.fallback_reason).toBeUndefined();
    expect(parsed.answer_text_length).toBeUndefined();
    expect(parsed.staleness_prefixed).toBeUndefined();
  });

  it('ExplainResultsResultSchema accepts populated diagnostics', () => {
    const parsed = ExplainResultsResultSchema.parse({
      precondition_unmet: false,
      option_count: 4,
      answer_source: 'sonnet',
      fallback_reason: null,
      answer_text_length: 482,
      staleness_prefixed: true,
    });
    expect(parsed.answer_source).toBe('sonnet');
    expect(parsed.fallback_reason).toBeNull();
    expect(parsed.staleness_prefixed).toBe(true);
  });

  it('ExplainResultsResultSchema accepts each fallback_reason value', () => {
    // Brief contract: missing | too_short | forbidden_internal_term |
    // mutation_language | null. The validator's
    // analysis_language_without_analysis_fact code is mapped to 'missing'
    // by the handler-side translator.
    for (const reason of [
      'missing',
      'too_short',
      'forbidden_internal_term',
      'mutation_language',
    ] as const) {
      const parsed = ExplainResultsResultSchema.parse({
        precondition_unmet: false,
        option_count: 0,
        answer_source: 'deterministic_fallback',
        fallback_reason: reason,
      });
      expect(parsed.fallback_reason).toBe(reason);
    }
  });

  it('ExplainFromStructureResultSchema parses a historic v1 row without diagnostic fields', () => {
    const parsed = ExplainFromStructureResultSchema.parse({ option_count: 0 });
    expect(parsed.answer_source).toBeUndefined();
    expect(parsed.fallback_reason).toBeUndefined();
  });

  it('ExplainFromStructureResultSchema rejects staleness_prefixed (exempt handler)', () => {
    // The structure projection has no staleness_reason; the exemption is
    // enforced by .strict() — extraneous fields are rejected.
    expect(() =>
      ExplainFromStructureResultSchema.parse({
        option_count: 0,
        staleness_prefixed: true,
      }),
    ).toThrow();
  });

  it('WhatWouldFlipResultSchema parses a 0.9.0-shape row without the new diagnostic fields', () => {
    // Backwards-compat baseline for the V5 explain-stabilisation additive
    // change: `answer_source`, `fallback_reason`, `answer_text_length`,
    // `staleness_prefixed` are all optional, so a 0.9.0-era row that
    // predates these fields parses cleanly.
    const parsed = WhatWouldFlipResultSchema.parse({
      precondition_unmet: false,
      option_count: 4,
    });
    expect(parsed.answer_source).toBeUndefined();
    expect(parsed.staleness_prefixed).toBeUndefined();
  });

  it('WhatWouldFlipResultSchema rejects pre-0.9 narrative-only legacy rows (precondition_unmet + option_count became required in 0.9.0)', () => {
    // True pre-0.9 shape: { narrative, flip_scenarios } only. These rows
    // were rejected when 0.9.0 made `precondition_unmet` and
    // `option_count` required (this is unrelated to the V5 explain-
    // stabilisation additive change). Pinning the rejection so a future
    // refactor can make a deliberate widen-or-keep call.
    expect(() =>
      WhatWouldFlipResultSchema.parse({
        narrative: 'No fragile edges.',
        flip_scenarios: [],
      }),
    ).toThrow();
  });
});

describe('HandlerFactSchema (discriminated union)', () => {
  it('parses a run_analysis fact', () => {
    const fact = {
      fact_type: 'run_analysis' as const,
      fact_version: 1 as const,
      noop: false,
      result: {
        scenario_id: VALID_UUID_A,
        leading_option_id: 'opt_a',
        summary: 'A leads.',
      },
    };
    const parsed = HandlerFactSchema.parse(fact);
    expect(parsed.fact_type).toBe('run_analysis');
    expect(RunAnalysisHandlerFactSchema.parse(fact)).toEqual(fact);
  });

  it('parses a set_factor_value fact with noop = true', () => {
    const fact = {
      fact_type: 'set_factor_value' as const,
      fact_version: 1 as const,
      noop: true,
      result: {
        target_id: 'f1',
        status: 'noop' as const,
        before: { value: 5 },
        after: { value: 5 },
      },
    };
    const parsed = HandlerFactSchema.parse(fact);
    expect(parsed.noop).toBe(true);
    expect(SetFactorValueHandlerFactSchema.parse(fact)).toEqual(fact);
  });

  it('parses facts for every remaining handler variant', () => {
    const variants: Array<{ fact_type: string; result: unknown }> = [
      { fact_type: 'explain_result', result: { narrative: 'x', referenced_option_ids: [] } },
      { fact_type: 'compare_options', result: { options: [{ option_id: 'o1', label: 'L' }] } },
      { fact_type: 'what_would_flip', result: { precondition_unmet: false, option_count: 0, narrative: 'x', flip_scenarios: [] } },
      { fact_type: 'add_constraint', result: { target_id: 'c1', status: 'applied', before: null, after: { range: [0, 1] } } },
      { fact_type: 'adjust_edge_strength', result: { target_id: 'e1', status: 'applied', before: { strength: 0.1 }, after: { strength: 0.5 } } },
    ];
    for (const v of variants) {
      const parsed = HandlerFactSchema.parse({ ...v, fact_version: 1, noop: false });
      expect(parsed.fact_type).toBe(v.fact_type);
    }
  });

  it('rejects a fact whose result does not match its fact_type', () => {
    expect(() =>
      HandlerFactSchema.parse({
        fact_type: 'set_factor_value',
        fact_version: 1,
        noop: false,
        // missing target_id/status
        result: { scenario_id: VALID_UUID_A, leading_option_id: null, summary: 'x' },
      }),
    ).toThrow();
  });
});

describe('Handler-result block schemas (boundary)', () => {
  it('AnalysisResultBlockSchema accepts enrichment passthrough', () => {
    const b = {
      type: 'analysis_result' as const,
      summary: 'A leads at 60%.',
      leading_option_id: 'opt_a',
      win_probabilities: { opt_a: 0.6, opt_b: 0.4 },
      enrichment: { factor_sensitivity: [] },
    };
    expect(AnalysisResultBlockSchema.parse(b)).toEqual(b);
    expect(BlockSchema.parse(b).type).toBe('analysis_result');
  });

  it('GraphPatchBlockSchema requires operation + target_id', () => {
    const b = {
      type: 'graph_patch' as const,
      status: 'applied' as const,
      operation: 'set_factor_value' as const,
      target_id: 'f1',
      before: { value: 3 },
      after: { value: 5 },
    };
    expect(GraphPatchBlockSchema.parse(b)).toEqual(b);
  });

  it('ExplanationBlockSchema requires referenced_option_ids', () => {
    const b = {
      type: 'explanation' as const,
      narrative: 'Because A dominates on MRR …',
      referenced_option_ids: ['opt_a'],
    };
    expect(ExplanationBlockSchema.parse(b)).toEqual(b);
  });

  it('ComparisonBlockSchema accepts ≥1 option at schema level', () => {
    const b = {
      type: 'comparison' as const,
      options: [
        { option_id: 'o1', label: 'One', win_probability: 0.6 },
        { option_id: 'o2', label: 'Two', win_probability: 0.4 },
      ],
    };
    expect(ComparisonBlockSchema.parse(b)).toEqual(b);
  });

  it('FlipAnalysisBlockSchema accepts empty flip_scenarios', () => {
    const b = {
      type: 'flip_analysis' as const,
      narrative: 'No fragile edges.',
      flip_scenarios: [],
    };
    expect(FlipAnalysisBlockSchema.parse(b)).toEqual(b);
  });

  it('BlockSchema accepts all five new handler-result block types', () => {
    const types = ['analysis_result', 'graph_patch', 'explanation', 'comparison', 'flip_analysis'] as const;
    for (const t of types) {
      // Each type's minimal shape:
      if (t === 'analysis_result') {
        expect(BlockSchema.parse({ type: t, summary: 's', leading_option_id: null })).toBeTruthy();
      } else if (t === 'graph_patch') {
        expect(BlockSchema.parse({
          type: t,
          status: 'applied',
          operation: 'set_factor_value',
          target_id: 'f1',
          before: null,
          after: null,
        })).toBeTruthy();
      } else if (t === 'explanation') {
        expect(BlockSchema.parse({ type: t, narrative: 'x', referenced_option_ids: [] })).toBeTruthy();
      } else if (t === 'comparison') {
        expect(BlockSchema.parse({ type: t, options: [{ option_id: 'o1', label: 'L' }] })).toBeTruthy();
      } else if (t === 'flip_analysis') {
        expect(BlockSchema.parse({ type: t, narrative: 'x', flip_scenarios: [] })).toBeTruthy();
      }
    }
  });
});

// ----------------------------------------------------------------------------
// 0.5.1 — negative contract tests (P1-1 biconditional, P1-2 operation narrowing,
// P1-3 constraint cross-field). Proves each refinement actually rejects the
// class of bug it was introduced for, not just passes lint.
// ----------------------------------------------------------------------------

describe('SessionTurnSchema biconditional (0.5.1)', () => {
  const baseTurn = {
    id: VALID_UUID_A,
    scenario_id: VALID_UUID_B,
    user_id: VALID_UUID_C,
    turn_id: 'req-xyz',
    request_hash: 'sha256:x',
    response_emitted: true,
    llm_calls_used: 0,
    duration_ms: 100,
    created_at: '2026-04-17T10:00:00.000Z',
  };

  it('rejects non-handler turn with a handler_id (direct_answer + handler_id set)', () => {
    expect(() =>
      SessionTurnSchema.parse({
        ...baseTurn,
        turn_class: 'direct_answer',
        handler_id: 'run_analysis',
      }),
    ).toThrow(/handler_id/);
  });

  it('rejects handler turn without handler_id', () => {
    expect(() =>
      SessionTurnSchema.parse({
        ...baseTurn,
        turn_class: 'handler',
        handler_id: null,
      }),
    ).toThrow(/handler_id/);
  });

  it('rejects clarify turn with handler_id set', () => {
    expect(() =>
      SessionTurnSchema.parse({
        ...baseTurn,
        turn_class: 'clarify',
        handler_id: 'set_factor_value',
      }),
    ).toThrow();
  });

  it('rejects unhandled turn with handler_id set', () => {
    expect(() =>
      SessionTurnSchema.parse({
        ...baseTurn,
        turn_class: 'unhandled',
        handler_id: 'run_analysis',
      }),
    ).toThrow();
  });

  it('accepts a handler turn with a matching handler_id', () => {
    const parsed = SessionTurnSchema.parse({
      ...baseTurn,
      turn_class: 'handler',
      handler_id: 'run_analysis',
    });
    expect(parsed.handler_id).toBe('run_analysis');
  });
});

describe('SessionCacheEntrySchema biconditional (0.5.1)', () => {
  const baseEntry = {
    id: VALID_UUID_A,
    scenario_id: VALID_UUID_B,
    user_id: VALID_UUID_C,
    turn_id: 'req-xyz',
    request_hash: 'sha256:y',
    response_emitted: true,
    llm_calls_used: 0,
    duration_ms: 100,
    created_at: '2026-04-17T10:00:00.000Z',
    stale: false,
    stale_reason: null,
  };

  it('rejects non-handler cache entry with handler_id set', () => {
    expect(() =>
      SessionCacheEntrySchema.parse({
        ...baseEntry,
        turn_class: 'direct_answer',
        handler_id: 'run_analysis',
      }),
    ).toThrow(/handler_id/);
  });

  it('rejects handler cache entry without handler_id', () => {
    expect(() =>
      SessionCacheEntrySchema.parse({
        ...baseEntry,
        turn_class: 'handler',
        handler_id: null,
      }),
    ).toThrow(/handler_id/);
  });
});

describe('GraphPatchBlock operation narrowing (0.5.1, P1-2)', () => {
  const validPatch = {
    type: 'graph_patch' as const,
    status: 'applied' as const,
    target_id: 'f1',
    before: { value: 3 },
    after: { value: 5 },
  };

  it('rejects non-graph-edit operations (run_analysis)', () => {
    expect(() =>
      GraphPatchBlockSchema.parse({ ...validPatch, operation: 'run_analysis' }),
    ).toThrow();
    expect(() =>
      BlockSchema.parse({ ...validPatch, operation: 'run_analysis' }),
    ).toThrow();
  });

  it('rejects read-family operations (explain_result, compare_options, what_would_flip)', () => {
    for (const op of ['explain_result', 'compare_options', 'what_would_flip'] as const) {
      expect(() =>
        GraphPatchBlockSchema.parse({ ...validPatch, operation: op }),
      ).toThrow();
    }
  });

  it('accepts each of the three graph-edit operations', () => {
    for (const op of ['set_factor_value', 'add_constraint', 'adjust_edge_strength'] as const) {
      const parsed = GraphPatchBlockSchema.parse({ ...validPatch, operation: op });
      expect(parsed.operation).toBe(op);
    }
  });

  it('subset guard: every GraphPatch operation is a valid ActionType', () => {
    // Drift detector: if someone adds a literal to the narrow enum that is
    // NOT an ActionType, this test fails and forces the reviewer to either
    // (a) extend ActionType or (b) drop the rogue value.
    const narrow = ['set_factor_value', 'add_constraint', 'adjust_edge_strength'] as const;
    const wide = ActionType.options;
    for (const lit of narrow) {
      expect(wide).toContain(lit);
    }
  });
});

describe('AddConstraintArgsSchema cross-field (0.5.1, P1-3)', () => {
  const base = { scenario_id: VALID_UUID_A, factor_id: 'f1' };

  it("accepts range with both bounds", () => {
    expect(
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'range',
        lower: 0,
        upper: 1,
      }),
    ).toBeTruthy();
  });

  it("rejects range with null lower", () => {
    expect(() =>
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'range',
        lower: null,
        upper: 1,
      }),
    ).toThrow(/lower/);
  });

  it("rejects range with null upper", () => {
    expect(() =>
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'range',
        lower: 0,
        upper: null,
      }),
    ).toThrow(/upper/);
  });

  it("accepts lower_bound with lower only", () => {
    expect(
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'lower_bound',
        lower: 0,
        upper: null,
      }),
    ).toBeTruthy();
  });

  it("rejects lower_bound with null lower", () => {
    expect(() =>
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'lower_bound',
        lower: null,
        upper: null,
      }),
    ).toThrow(/lower/);
  });

  it("rejects lower_bound with non-null upper (contradiction)", () => {
    expect(() =>
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'lower_bound',
        lower: 0,
        upper: 1,
      }),
    ).toThrow(/upper/);
  });

  it("accepts upper_bound with upper only", () => {
    expect(
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'upper_bound',
        lower: null,
        upper: 1,
      }),
    ).toBeTruthy();
  });

  it("rejects upper_bound with null upper", () => {
    expect(() =>
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'upper_bound',
        lower: null,
        upper: null,
      }),
    ).toThrow(/upper/);
  });

  it("rejects upper_bound with non-null lower (contradiction)", () => {
    expect(() =>
      AddConstraintArgsSchema.parse({
        ...base,
        constraint_kind: 'upper_bound',
        lower: 0,
        upper: 1,
      }),
    ).toThrow(/lower/);
  });
});

describe('ActionSchema (0.5.0 optional action_type)', () => {
  it('accepts an action without action_type (back-compat with A0/A1/A2)', () => {
    const a = { id: 'a1', label: 'Run analysis', message: 'run_analysis please' };
    const parsed = ActionSchema.parse(a);
    expect(parsed.action_type).toBeUndefined();
  });

  it('accepts an action with a valid action_type', () => {
    const a = {
      id: 'a1',
      label: 'Run analysis',
      message: 'run_analysis please',
      action_type: 'run_analysis' as const,
    };
    const parsed = ActionSchema.parse(a);
    expect(parsed.action_type).toBe('run_analysis');
  });

  it('rejects an action with an invalid action_type', () => {
    expect(() =>
      ActionSchema.parse({
        id: 'a1',
        label: 'X',
        message: 'y',
        action_type: 'run_premortem',
      }),
    ).toThrow();
  });
});

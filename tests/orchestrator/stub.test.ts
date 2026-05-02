import { describe, it, expect } from 'vitest';
import {
  ConversationMessageSchema,
  TurnContextSchema,
  EntityRegistrySchema,
  BudgetsSchema,
  CapabilityFlagsSchema,
  LLMAdapterRequestSchema,
  LLMAdapterResponseSchema,
  HandlerFactSchema,
} from '../../src/orchestrator/index.js';

describe('@talchain/schemas/orchestrator (A1 + 0.5.0 surface)', () => {
  it('exports runtime schemas for A1 + B/C/D1/D2 additions', async () => {
    const mod = await import('../../src/orchestrator/index.js');
    const exported = Object.keys(mod).sort();
    // Snapshot the exported surface so accidental additions/removals are visible.
    // A1 surface (8) + 0.5.0 additions: V5 action alias (1), session (3),
    // decision-context (2), handler args (7), handler results (7),
    // handler-fact variants (7), union (1) = 36 total.
    expect(exported).toEqual(
      [
        // A1
        'BudgetsSchema',
        'CapabilityFlagsSchema',
        'ConversationMessageSchema',
        'EntityRegistrySchema',
        'HandlerFactSchema',
        'LLMAdapterRequestSchema',
        'LLMAdapterResponseSchema',
        'TurnContextSchema',
        // 0.5.0 — action type alias
        'V5ActionTypeSchema',
        // 0.5.0 — session
        'ConversationTurnClassSchema',
        'SessionTurnSchema',
        'SessionCacheEntrySchema',
        'GraphInvalidationSchema',
        // 0.5.0 — decision context
        'DecisionContextSchema',
        'EMPTY_DECISION_CONTEXT',
        // 0.5.0 — handler args
        'RunAnalysisArgsSchema',
        'ExplainResultArgsSchema',
        'ExplainResultsArgsSchema',
        'ExplainFromStructureArgsSchema',
        'CompareOptionsArgsSchema',
        'WhatWouldFlipArgsSchema',
        'SetFactorValueArgsSchema',
        'AddConstraintArgsSchema',
        'AdjustEdgeStrengthArgsSchema',
        // 0.5.0 — handler results
        'RunAnalysisResultSchema',
        'ExplainResultResultSchema',
        'ExplainResultsResultSchema',
        'ExplainFromStructureResultSchema',
        'CompareOptionsResultSchema',
        'WhatWouldFlipResultSchema',
        'SetFactorValueResultSchema',
        'AddConstraintResultSchema',
        'AdjustEdgeStrengthResultSchema',
        // V5 explain-stabilisation — diagnostic field enums (additive)
        'ExplainAnswerSourceSchema',
        'ExplainFallbackReasonSchema',
        // 0.5.0 — handler-fact variants
        'RunAnalysisHandlerFactSchema',
        'ExplainResultHandlerFactSchema',
        'ExplainResultsHandlerFactSchema',
        'ExplainFromStructureHandlerFactSchema',
        'CompareOptionsHandlerFactSchema',
        'WhatWouldFlipHandlerFactSchema',
        'SetFactorValueHandlerFactSchema',
        'AddConstraintHandlerFactSchema',
        'AdjustEdgeStrengthHandlerFactSchema',
      ].sort(),
    );
  });

  describe('ConversationMessage', () => {
    it('accepts user, assistant, system roles', () => {
      for (const role of ['user', 'assistant', 'system'] as const) {
        const parsed = ConversationMessageSchema.parse({ role, content: 'hi' });
        expect(parsed.role).toBe(role);
      }
    });

    it('rejects unknown roles', () => {
      expect(() =>
        ConversationMessageSchema.parse({ role: 'tool', content: 'x' }),
      ).toThrow();
    });

    it('is strict — rejects extra fields', () => {
      expect(() =>
        ConversationMessageSchema.parse({ role: 'user', content: 'x', extra: 1 }),
      ).toThrow();
    });
  });

  describe('EntityRegistry', () => {
    it('accepts an empty skeleton', () => {
      const parsed = EntityRegistrySchema.parse({
        option_ids: [],
        goal_id: null,
      });
      expect(parsed.option_ids).toEqual([]);
      expect(parsed.goal_id).toBeNull();
    });

    it('accepts populated option_ids and goal_id', () => {
      const parsed = EntityRegistrySchema.parse({
        option_ids: ['opt_a', 'opt_b'],
        goal_id: 'goal_mrr',
      });
      expect(parsed.option_ids).toHaveLength(2);
      expect(parsed.goal_id).toBe('goal_mrr');
    });

    it('rejects missing required fields', () => {
      expect(() =>
        EntityRegistrySchema.parse({ option_ids: [] }),
      ).toThrow();
    });
  });

  describe('CapabilityFlags', () => {
    it('accepts an empty record (A1 zero-handler case)', () => {
      const parsed = CapabilityFlagsSchema.parse({});
      expect(parsed).toEqual({});
    });

    it('accepts only false values (A1 invariant)', () => {
      const parsed = CapabilityFlagsSchema.parse({
        can_run_analysis: false,
        can_edit_graph: false,
      });
      expect(parsed.can_run_analysis).toBe(false);
    });

    it('rejects true values (A1 has no handlers)', () => {
      expect(() =>
        CapabilityFlagsSchema.parse({ can_run_analysis: true }),
      ).toThrow();
    });
  });

  describe('Budgets', () => {
    it('accepts positive int milliseconds', () => {
      const parsed = BudgetsSchema.parse({
        turn_ms: 180000,
        llm_narrate_ms: 60000,
      });
      expect(parsed.turn_ms).toBe(180000);
    });

    it('rejects zero or negative budgets', () => {
      expect(() => BudgetsSchema.parse({ turn_ms: 0, llm_narrate_ms: 60000 })).toThrow();
      expect(() => BudgetsSchema.parse({ turn_ms: -1, llm_narrate_ms: 60000 })).toThrow();
    });
  });

  describe('TurnContext', () => {
    const baseContext = {
      stage: 'frame' as const,
      entity_registry: { option_ids: [], goal_id: null },
      capabilities: {},
      messages: [{ role: 'user' as const, content: 'hello' }],
      session_id: 'sess-1',
      request_id: 'req-1',
      budgets: { turn_ms: 180000, llm_narrate_ms: 60000 },
    };

    it('accepts a minimal A1 context', () => {
      const parsed = TurnContextSchema.parse(baseContext);
      expect(parsed.stage).toBe('frame');
      expect(parsed.messages).toHaveLength(1);
    });

    it('accepts all 4 Stage enum values', () => {
      for (const stage of ['frame', 'analyse', 'decide', 'review'] as const) {
        const parsed = TurnContextSchema.parse({ ...baseContext, stage });
        expect(parsed.stage).toBe(stage);
      }
    });

    it('rejects invalid Stage values (V4 stages like "evaluate")', () => {
      expect(() =>
        TurnContextSchema.parse({ ...baseContext, stage: 'evaluate' as never }),
      ).toThrow();
    });

    it('rejects empty session_id or request_id', () => {
      expect(() =>
        TurnContextSchema.parse({ ...baseContext, session_id: '' }),
      ).toThrow();
      expect(() =>
        TurnContextSchema.parse({ ...baseContext, request_id: '' }),
      ).toThrow();
    });

    it('is strict — rejects extra top-level fields', () => {
      expect(() =>
        TurnContextSchema.parse({ ...baseContext, extra: 'nope' }),
      ).toThrow();
    });
  });

  describe('LLMAdapterRequest / LLMAdapterResponse', () => {
    it('accepts a minimal narrate request', () => {
      const parsed = LLMAdapterRequestSchema.parse({
        system: 'You are a decision coach.',
        user_message: 'Run a pre-mortem.',
        request_id: 'req-1',
        budget_ms: 60000,
      });
      expect(parsed.system).toBeTruthy();
    });

    it('accepts optional temperature + max_tokens', () => {
      const parsed = LLMAdapterRequestSchema.parse({
        system: 's',
        user_message: 'm',
        request_id: 'r',
        budget_ms: 1000,
        temperature: 0.7,
        max_tokens: 512,
      });
      expect(parsed.temperature).toBe(0.7);
      expect(parsed.max_tokens).toBe(512);
    });

    it('rejects invalid temperature bounds', () => {
      expect(() =>
        LLMAdapterRequestSchema.parse({
          system: 's',
          user_message: 'm',
          request_id: 'r',
          budget_ms: 1,
          temperature: -1,
        }),
      ).toThrow();
      expect(() =>
        LLMAdapterRequestSchema.parse({
          system: 's',
          user_message: 'm',
          request_id: 'r',
          budget_ms: 1,
          temperature: 2.5,
        }),
      ).toThrow();
    });

    it('accepts a minimal response', () => {
      const parsed = LLMAdapterResponseSchema.parse({ text: 'hello world' });
      expect(parsed.text).toBe('hello world');
    });

    it('accepts optional tokens_used', () => {
      const parsed = LLMAdapterResponseSchema.parse({
        text: 'x',
        tokens_used: 42,
      });
      expect(parsed.tokens_used).toBe(42);
    });
  });

  describe('HandlerFact (discriminated union, 0.5.0)', () => {
    it('rejects values that do not carry a valid fact_type discriminator', () => {
      expect(() => HandlerFactSchema.parse({})).toThrow();
      expect(() => HandlerFactSchema.parse(null)).toThrow();
      expect(() => HandlerFactSchema.parse('anything')).toThrow();
      expect(() => HandlerFactSchema.parse({ fact_type: 'not_a_real_handler' })).toThrow();
    });
  });
});

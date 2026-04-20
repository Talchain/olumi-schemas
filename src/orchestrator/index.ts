// @talchain/schemas/orchestrator — CEE-internal runtime contracts.
//
// A1 populated this namespace with the minimum shapes TurnExecutor needs for
// `direct_answer`: TurnContext, LLMAdapter I/O, HandlerFact stub.
// A2 added the classifier seam (implicitly via TurnContext).
// 0.5.0 (slices B + C + D1 + D2) adds: HandlerFact discriminated union,
// session persistence types, graph invalidation, per-handler argument +
// result schemas, decision-context placeholder, and the V5 action-type alias.
//
// Extend additively as later slices land (ActionRecommendation, ContextPack,
// CoachingSignal, etc.).

// Conversation messages (carried on TurnContext)
export { ConversationMessageSchema } from './conversation.js';
export type { ConversationMessage } from './conversation.js';

// TurnContext and its building blocks
export {
  CapabilityFlagsSchema,
  EntityRegistrySchema,
  BudgetsSchema,
  TurnContextSchema,
} from './turn-context.js';
export type {
  CapabilityFlags,
  EntityRegistry,
  Budgets,
  TurnContext,
} from './turn-context.js';

// Narrate-mode LLM adapter I/O
export {
  LLMAdapterRequestSchema,
  LLMAdapterResponseSchema,
} from './llm-adapter.js';
export type {
  LLMAdapterRequest,
  LLMAdapterResponse,
} from './llm-adapter.js';

// V5 action-type alias (canonical enum lives in /boundary)
export { V5ActionTypeSchema } from './action-types.js';
export type { V5ActionType } from './action-types.js';

// Session persistence types (Slice B)
export {
  ConversationTurnClassSchema,
  SessionTurnSchema,
  SessionCacheEntrySchema,
  GraphInvalidationSchema,
} from './session.js';
export type {
  ConversationTurnClass,
  SessionTurn,
  SessionCacheEntry,
  GraphInvalidation,
} from './session.js';

// Decision-context placeholder (populated by E-series; schema lands now so
// downstream tranches can thread the shape without another bump)
export {
  DecisionContextSchema,
  EMPTY_DECISION_CONTEXT,
} from './decision-context.js';
export type { DecisionContext } from './decision-context.js';

// Per-handler argument schemas (validated at dispatch seam)
export {
  RunAnalysisArgsSchema,
  ExplainResultArgsSchema,
  CompareOptionsArgsSchema,
  WhatWouldFlipArgsSchema,
  SetFactorValueArgsSchema,
  AddConstraintArgsSchema,
  AdjustEdgeStrengthArgsSchema,
} from './handler-args.js';
export type {
  RunAnalysisArgs,
  ExplainResultArgs,
  CompareOptionsArgs,
  WhatWouldFlipArgs,
  SetFactorValueArgs,
  AddConstraintArgs,
  AdjustEdgeStrengthArgs,
} from './handler-args.js';

// Per-handler result schemas (content of HandlerFact.result)
export {
  RunAnalysisResultSchema,
  ExplainResultResultSchema,
  CompareOptionsResultSchema,
  WhatWouldFlipResultSchema,
  SetFactorValueResultSchema,
  AddConstraintResultSchema,
  AdjustEdgeStrengthResultSchema,
} from './handler-results.js';
export type {
  RunAnalysisResult,
  ExplainResultResult,
  CompareOptionsResult,
  WhatWouldFlipResult,
  SetFactorValueResult,
  AddConstraintResult,
  AdjustEdgeStrengthResult,
} from './handler-results.js';

// Quantity extraction (CQE — V5 Layer 0, spec v3.2 §11.1)
export {
  ParameterOperatorSchema,
  QuantityExtractionResultSchema,
} from './quantity-extraction.js';
export type {
  ParameterOperator,
  QuantityExtractionResult,
} from './quantity-extraction.js';

// HandlerFact discriminated union (widened from A1's z.never() stub)
export {
  RunAnalysisHandlerFactSchema,
  ExplainResultHandlerFactSchema,
  CompareOptionsHandlerFactSchema,
  WhatWouldFlipHandlerFactSchema,
  SetFactorValueHandlerFactSchema,
  AddConstraintHandlerFactSchema,
  AdjustEdgeStrengthHandlerFactSchema,
  HandlerFactSchema,
} from './handler-fact.js';
export type {
  RunAnalysisHandlerFact,
  ExplainResultHandlerFact,
  CompareOptionsHandlerFact,
  WhatWouldFlipHandlerFact,
  SetFactorValueHandlerFact,
  AddConstraintHandlerFact,
  AdjustEdgeStrengthHandlerFact,
  HandlerFact,
} from './handler-fact.js';

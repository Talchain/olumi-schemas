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
  ExplainResultsArgsSchema,
  ExplainFromStructureArgsSchema,
  CompareOptionsArgsSchema,
  WhatWouldFlipArgsSchema,
  SetFactorValueArgsSchema,
  AddConstraintArgsSchema,
  AdjustEdgeStrengthArgsSchema,
} from './handler-args.js';
export type {
  RunAnalysisArgs,
  ExplainResultArgs,
  ExplainResultsArgs,
  ExplainFromStructureArgs,
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
  ExplainResultsResultSchema,
  ExplainFromStructureResultSchema,
  CompareOptionsResultSchema,
  WhatWouldFlipResultSchema,
  SetFactorValueResultSchema,
  AddConstraintResultSchema,
  AdjustEdgeStrengthResultSchema,
  EditGraphResultSchema,
  EditGraphEditKindSchema,
  EditGraphImpactSchema,
  EditGraphAffectedEntitySchema,
  ExplainAnswerSourceSchema,
  ExplainFallbackReasonSchema,
  // 0.25.0 — T1 claim safety (RunAnalysisResult.constraint_verdict)
  ConstraintVerdictSchema,
  ConstraintVerdictStateSchema,
} from './handler-results.js';
export type {
  RunAnalysisResult,
  ExplainResultResult,
  ExplainResultsResult,
  ExplainFromStructureResult,
  CompareOptionsResult,
  WhatWouldFlipResult,
  SetFactorValueResult,
  AddConstraintResult,
  AdjustEdgeStrengthResult,
  EditGraphResult,
  EditGraphEditKind,
  EditGraphImpact,
  EditGraphAffectedEntity,
  ExplainAnswerSource,
  ExplainFallbackReason,
  ConstraintVerdict,
  ConstraintVerdictState,
} from './handler-results.js';

// Analysis facts (0.27.0 — arch step 2 slice 4; Codex F3).
// Re-exported from ../contracts/analysis-fact.ts (also on the root entry point;
// same schema objects, so one maximal fixture covers both keys) because the
// attachment point — RunAnalysisResult.analysis_facts — lives in THIS
// namespace, and a producer constructing a fact should not have to know the
// file it was declared in.
export {
  AnalysisFactSchema,
  ComputedFactSchema,
  UnavailableFactSchema,
  SuppressedFactSchema,
  SuppressionGuardSchema,
  AnalysisFactSubjectSchema,
  AnalysisFactSubjectKindSchema,
  MetricStatusSchema,
  ANALYSIS_FACT_SUBJECT_KINDS,
  ANALYSIS_FACT_STATUSES,
} from '../contracts/analysis-fact.js';
export type {
  AnalysisFact,
  ComputedFact,
  UnavailableFact,
  SuppressedFact,
  SuppressionGuard,
  AnalysisFactSubject,
  AnalysisFactSubjectKind,
  MetricStatus,
} from '../contracts/analysis-fact.js';

// HandlerFact discriminated union (widened from A1's z.never() stub)
export {
  RunAnalysisHandlerFactSchema,
  ExplainResultHandlerFactSchema,
  ExplainResultsHandlerFactSchema,
  ExplainFromStructureHandlerFactSchema,
  CompareOptionsHandlerFactSchema,
  WhatWouldFlipHandlerFactSchema,
  SetFactorValueHandlerFactSchema,
  AddConstraintHandlerFactSchema,
  AdjustEdgeStrengthHandlerFactSchema,
  EditGraphHandlerFactSchema,
  HandlerFactSchema,
} from './handler-fact.js';
export type {
  RunAnalysisHandlerFact,
  ExplainResultHandlerFact,
  ExplainResultsHandlerFact,
  ExplainFromStructureHandlerFact,
  CompareOptionsHandlerFact,
  WhatWouldFlipHandlerFact,
  SetFactorValueHandlerFact,
  AddConstraintHandlerFact,
  AdjustEdgeStrengthHandlerFact,
  EditGraphHandlerFact,
  HandlerFact,
} from './handler-fact.js';

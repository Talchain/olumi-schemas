// @talchain/schemas/orchestrator — CEE-internal runtime contracts.
//
// A1 populates this namespace with the minimum shapes TurnExecutor needs for
// `direct_answer`: TurnContext, LLMAdapter I/O, HandlerFact stub. Extend
// additively as later slices land (ActionRecommendation, ContextPack,
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

// HandlerFact stub (empty union; widens in later slices)
export { HandlerFactSchema } from './handler-fact.js';
export type { HandlerFact } from './handler-fact.js';

// @talchain/schemas/boundary — cross-service wire contracts per Boundary Contract v1.1 §2.1.
// Additive only. Consumers (CEE, PLoT, UI) pin an exact version.

// Enums
export {
  TurnClass,
  Stage,
  Severity,
  RunResult,
  FeatureStatus,
  ActionType,
  SystemEventKind,
  TurnSource,
} from './enums.js';
export type {
  TurnClassType,
  StageType,
  SeverityType,
  RunResultType,
  FeatureStatusType,
  ActionTypeLiteral,
  SystemEventKindLiteral,
  TurnSourceLiteral,
} from './enums.js';

// Error codes + user-visible outcome text (addendum §2.1.5)
export {
  BoundaryErrorCode,
  FailureType,
  FAILURE_USER_TEXT,
} from './error-codes.js';
export type {
  BoundaryErrorCodeType,
  FailureTypeLiteral,
} from './error-codes.js';

// BoundaryError (per §6.4)
export { BoundaryErrorSchema } from './errors.js';
export type { BoundaryError } from './errors.js';

// Blocks + chips
export {
  TextBlockSchema,
  ErrorBlockSchema,
  AnalysisResultBlockSchema,
  GraphPatchBlockSchema,
  ExplanationBlockSchema,
  ComparisonBlockSchema,
  FlipAnalysisBlockSchema,
  DraftGraphBlockSchema,
  BlockSchema,
  ChipSchema,
} from './blocks.js';
export type {
  TextBlock,
  ErrorBlock,
  AnalysisResultBlock,
  GraphPatchBlock,
  ExplanationBlock,
  ComparisonBlock,
  FlipAnalysisBlock,
  DraftGraphBlock,
  Block,
  Chip,
} from './blocks.js';

// Turn payload (ingress to /orchestrate/v2/turn) — v0.7.0 discriminated union
export {
  OrchestratorTurnPayloadSchema,
  MessageTurnPayloadSchema,
  SystemEventTurnPayloadSchema,
  SystemEventSchema,
} from './turn-payload.js';
export type {
  OrchestratorTurnPayload,
  MessageTurnPayload,
  SystemEventTurnPayload,
  SystemEvent,
} from './turn-payload.js';

// OlumiResponse (egress from /orchestrate/v2/turn)
export {
  ActionSchema,
  InsightSchema,
  OlumiResponseSchema,
} from './olumi-response.js';
export type {
  Action,
  Insight,
  OlumiResponse,
} from './olumi-response.js';

// V2 run contract (PLoT surface; pinned now, used later)
export {
  GoalConstraintSchema,
  V2OptionSchema,
  V2RunRequestSchema,
  V2RunErrorSchema,
  V2RunResponseSchema,
} from './run.js';
export type {
  GoalConstraint,
  V2Option,
  V2RunRequest,
  V2RunError,
  V2RunResponse,
} from './run.js';

// Patch validation contract
export {
  ValidatePatchRequestSchema,
  ValidatePatchResponseSchema,
} from './patch.js';
export type {
  ValidatePatchRequest,
  ValidatePatchResponse,
} from './patch.js';

// Re-exports from the flat root for convenience inside /boundary consumers.
// Keeping these under /boundary lets V5 code import everything it needs
// from a single namespace.
export {
  NodeKind,
  FactorCategory,
  NodeV3Schema,
  EdgeV3Schema,
  GraphV3Schema,
  TopologyPlanSchema,
} from '../graph.js';
export type {
  NodeV3,
  EdgeV3,
  GraphV3,
  NodeKindType,
  FactorCategoryType,
  TopologyPlan,
} from '../graph.js';

// Coaching contract (v0.11.0 — per Boundary Contract v1.1 §2.1, MC-25)
export {
  BiasType,
  BiasSignalSchema,
  BriefCompleteness,
  WideningLogSchema,
  StrengthenItemActionType,
  StrengthenItemSchema,
  CoachingSchema,
} from '../coaching.js';
export type {
  BiasTypeT,
  BiasSignal,
  BriefCompletenessT,
  WideningLog,
  StrengthenItemActionTypeT,
  StrengthenItem,
  Coaching,
} from '../coaching.js';

// Causal claims contract (v0.11.0)
export {
  StrengthBand,
  DirectEffectClaimSchema,
  MediationOnlyClaimSchema,
  NoDirectEffectClaimSchema,
  UnmeasuredConfounderClaimSchema,
  CausalClaimSchema,
  CausalClaimsArraySchema,
} from '../causal-claims.js';
export type {
  StrengthBandT,
  CausalClaim,
  CausalClaimsArray,
} from '../causal-claims.js';

export {
  ProductReadiness,
  SeedSource,
} from '../analysis.js';
export type {
  ProductReadinessType,
  SeedSourceType,
} from '../analysis.js';

export {
  LIMITS,
  MAX_NODES,
  MAX_EDGES,
  MAX_OPTIONS,
  MAX_CONSTRAINTS,
  DEFAULT_EXISTS_PROBABILITY,
  STRENGTH_BOUNDS,
  DEFAULT_SEED,
} from '../limits.js';

export { NODE_ID_PATTERN } from '../graph.js';
export { STRENGTH_DEFAULT_SIGNATURE } from '../warnings.js';

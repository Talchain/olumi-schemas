// Graph schemas
export {
  NODE_ID_PATTERN,
  NodeKind,
  FactorCategory,
  ObservedStateSchema,
  PriorSchema,
  StateSpaceSchema,
  NodeV3Schema,
  StrengthSchema,
  EffectDirection,
  EdgeType,
  EdgeV3Schema,
  GraphV3Schema,
  TopologyPlanSchema,
} from './graph.js';
export type {
  NodeV3,
  EdgeV3,
  GraphV3,
  NodeKindType,
  FactorCategoryType,
  ObservedStateType,
  PriorType,
  EffectDirectionType,
  EdgeTypeType,
  TopologyPlan,
} from './graph.js';

// Coaching schemas (v0.11.0 — first-class coaching contract)
//
// NAMING: New types in this contract surface (BiasType, BriefCompleteness,
// StrengthenItemActionType, StrengthBand) use a single bare identifier
// per the brief. Each is declared in source as both a runtime Zod schema
// AND an inferred TS type under the same name (TypeScript's value/type
// namespace separation). A single `export { BiasType }` re-export
// publishes both meanings — no separate `export type` line is needed.
// Earlier types in this package (NodeKindType, EffectDirectionType, ...)
// kept the legacy `Type` suffix; new exports do not.
export {
  BiasType,
  BiasSignalSchema,
  BriefCompleteness,
  WideningLogSchema,
  StrengthenItemActionType,
  StrengthenItemSchema,
  CoachingSchema,
} from './coaching.js';
// Only types that have no value-namespace counterpart need `export type`.
export type {
  BiasSignal,
  WideningLog,
  StrengthenItem,
  Coaching,
} from './coaching.js';

// Causal claims (v0.11.0 — first-class causal-claim contract)
export {
  StrengthBand,
  DirectEffectClaimSchema,
  MediationOnlyClaimSchema,
  NoDirectEffectClaimSchema,
  UnmeasuredConfounderClaimSchema,
  CausalClaimSchema,
  CausalClaimsArraySchema,
} from './causal-claims.js';
export type {
  CausalClaim,
  CausalClaimsArray,
} from './causal-claims.js';

// Analysis schemas
export {
  ProductReadiness,
  SeedSource,
  DetailLevel,
  ConfidenceLevel,
  OptionForAnalysisSchema,
  AnalysisReadyV3Schema,
  AnalysisRequestIdChainSchema,
  DraftGraphTraceSchema,
  ResponseMetaSchema,
  isFullyReady,
} from './analysis.js';
export type {
  ProductReadinessType,
  SeedSourceType,
  ConfidenceLevelType,
  OptionForAnalysis,
  AnalysisReadyV3,
  ResponseMeta,
  AnalysisRequestIdChain,
  DraftGraphTrace,
} from './analysis.js';

// CIL warnings and constants
export {
  STRENGTH_DEFAULT_SIGNATURE,
  CIL_WARNING_CODES,
  CIL_WARNING_SEVERITY,
  CIL_THRESHOLDS,
  STRENGTH_DEFAULT_THRESHOLD,
  STRENGTH_MEAN_DEFAULT_THRESHOLD,
  STRENGTH_DEFAULT_MIN_EDGES,
  EDGE_STRENGTH_LOW_THRESHOLD,
  EDGE_STRENGTH_NEGLIGIBLE_THRESHOLD,
  StrengthDefaultAppliedDetailsSchema,
  StrengthMeanDefaultDominantDetailsSchema,
  EdgeStrengthDetailsSchema,
  ValidationWarningSchema,
} from './warnings.js';
export type {
  CILWarningCode,
  ValidationWarning,
  StrengthDefaultAppliedDetails,
  StrengthMeanDefaultDominantDetails,
  EdgeStrengthDetails,
} from './warnings.js';

// CEE error contracts
export {
  CeeErrorCode,
  CeeTypedErrorSchema,
  CeeTimeoutErrorSchema,
  CeeBudgetErrorSchema,
  CeeUpstreamLlmErrorSchema,
  // 0.19.0 — typed recovery guidance (wave-2 ask 7)
  CeeErrorRecoverySchema,
} from './cee-errors.js';
export type {
  CeeErrorCodeType,
  CeeTypedError,
  // 0.19.0 — typed recovery guidance (wave-2 ask 7)
  CeeErrorRecovery,
} from './cee-errors.js';

// PLoT BFF error envelopes
export {
  PlotProxyTimeoutErrorSchema,
  PlotCeeUpstreamEnvelopeSchema,
} from './plot-errors.js';
export type {
  PlotProxyTimeoutError,
  PlotCeeUpstreamEnvelope,
} from './plot-errors.js';

// Repairs
export {
  RepairLayer,
  REPAIR_CODES,
  RepairEntrySchema,
} from './repairs.js';
export type {
  RepairCode,
  RepairEntry,
} from './repairs.js';

// Limits and constants
export {
  LIMITS,
  MAX_NODES,
  MAX_EDGES,
  MAX_OPTIONS,
  MAX_CONSTRAINTS,
  STD_FLOOR,
  STD_CEILING_RATIO,
  STD_CEILING_ABS,
  DEFAULT_STD,
  DEFAULT_EXISTS_PROBABILITY,
  STRENGTH_BOUNDS,
  DEFAULT_SEED,
  validateGraphLimits,
} from './limits.js';
export type {
  LimitViolation,
} from './limits.js';

// Validation types
export type {
  ValidationBlocker,
  ValidationResult,
} from './validation.js';

// Response schemas (sensitivity, fragile edges)
export {
  SensitivityDirection,
  FactorSensitivitySchema,
  FragileEdgeSchema,
  isFactorSensitivity,
  isFragileEdge,
} from './responses.js';
export type {
  SensitivityDirectionType,
  FactorSensitivity,
  FragileEdge,
} from './responses.js';

// Request chain types
export type {
  PlotRequestIdChain,
} from './request-chain.js';

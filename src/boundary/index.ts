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
  // Draft-time goal constraints (0.18.0). NOT `GoalConstraintSchema` from
  // ./run.ts — see the note on the schema for why the two are distinct.
  DraftGoalConstraintSchema,
  // Phase 3 — Analysis tab data contract v1.3
  ReviewCardBlockSchema,
  CoachingBlockSchema,
  EvidenceBlockSchema,
  ExerciseBlockSchema,
  // Phase 3 shared
  ActionIntent,
  TargetRefKind,
  TargetRefSchema,
  Phase3BlockFreshness,
  Phase3BlockSeverity,
  // Guidance signals (0.19.0 — wave-2 producer fields, UI-SEM-085)
  GuidanceCategory,
  // Held proposal (0.15.0 — ROADMAP 1.43)
  HeldProposalBlockSchema,
  HeldProposalMutationClass,
  HeldProposalReasonCode,
  // UI directive (0.15.0 — seamlessness R4 keystone)
  UiDirectiveBlockSchema,
  UiDirectiveVerb,
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
  DraftGoalConstraint,
  // Phase 3 — Analysis tab data contract v1.3
  ReviewCardBlock,
  CoachingBlock,
  EvidenceBlock,
  ExerciseBlock,
  // Phase 3 shared
  ActionIntentLiteral,
  TargetRefKindLiteral,
  TargetRef,
  Phase3BlockFreshnessLiteral,
  Phase3BlockSeverityLiteral,
  // Guidance signals (0.19.0 — wave-2 producer fields, UI-SEM-085)
  GuidanceCategoryLiteral,
  // Held proposal (0.15.0 — ROADMAP 1.43)
  HeldProposalBlock,
  HeldProposalMutationClassLiteral,
  HeldProposalReasonCodeLiteral,
  // UI directive (0.15.0 — seamlessness R4 keystone)
  UiDirectiveBlock,
  UiDirectiveVerbLiteral,
  Block,
  Chip,
} from './blocks.js';

// Analysis enrichment envelope (v0.14.0) — typed opt-in layer over the
// PLoT→CEE→UI enrichment passthrough. Additive: transport fields on blocks
// remain z.record(z.unknown()); this is the validation/typing surface.
export {
  AnalysisEnrichmentSchema,
  EnrichmentAnalysisStatus,
  EnrichmentFeatureStatus,
  EnrichmentConfidenceTier,
  EnrichmentOutcomeStatsSchema,
  EnrichmentGoalFitBasisSchema,
  EnrichmentOptionComparisonEntrySchema,
  EnrichmentConfidenceProvenanceSchema,
  EnrichmentFactorSensitivityEntrySchema,
  EnrichmentRobustnessEdgeSchema,
  EnrichmentNearTieSchema,
  EnrichmentRobustnessSchema,
  EnrichmentFlipThresholdSchema,
  EnrichmentEdgeEValueSchema,
  // 0.19.0 — per-edge flip-stability band (wave-2 ask 8)
  EnrichmentEdgeEValueStabilitySchema,
  EnrichmentInferenceWarningSchema,
  EnrichmentCritiqueSchema,
  EnrichmentM1CoachingSchema,
  EnrichmentDecisionReviewSchema,
  EnrichmentConstraintResultSchema,
  EnrichmentConditionalProbabilitySchema,
  CEE_UI_ENRICHMENT_KEEP_LIST,
  parseAnalysisEnrichment,
  isAnalysisEnrichment,
} from './enrichment.js';
export type {
  AnalysisEnrichment,
  EnrichmentAnalysisStatusType,
  EnrichmentFeatureStatusType,
  EnrichmentConfidenceTierType,
  EnrichmentOutcomeStats,
  EnrichmentGoalFitBasis,
  EnrichmentOptionComparisonEntry,
  EnrichmentConfidenceProvenance,
  EnrichmentFactorSensitivityEntry,
  EnrichmentRobustnessEdge,
  EnrichmentNearTie,
  EnrichmentRobustness,
  EnrichmentFlipThreshold,
  EnrichmentEdgeEValue,
  // 0.19.0 — per-edge flip-stability band (wave-2 ask 8)
  EnrichmentEdgeEValueStability,
  EnrichmentInferenceWarning,
  EnrichmentCritique,
  EnrichmentM1Coaching,
  EnrichmentDecisionReview,
  EnrichmentConstraintResult,
  EnrichmentConditionalProbability,
  CeeUiEnrichmentKeepKey,
} from './enrichment.js';

// Turn payload (ingress to /orchestrate/v2/turn) — v0.7.0 discriminated union
export {
  OrchestratorTurnPayloadSchema,
  MessageTurnPayloadSchema,
  SystemEventTurnPayloadSchema,
  SystemEventSchema,
  // Selection context (0.15.0)
  SelectedElementRefSchema,
} from './turn-payload.js';
export type {
  OrchestratorTurnPayload,
  MessageTurnPayload,
  SystemEventTurnPayload,
  SystemEvent,
  // Selection context (0.15.0)
  SelectedElementRef,
} from './turn-payload.js';

// OlumiResponse (egress from /orchestrate/v2/turn)
export {
  ActionSchema,
  InsightSchema,
  OlumiResponseSchema,
  // 0.19.0 — decision classification (wave-2 ask 5, UI-SEM-077)
  DecisionClassificationSchema,
  DecisionClassificationStakes,
  DecisionClassificationReversibility,
  DecisionClassificationRisk,
  // 0.20.0 — producer framing-quality verdict (ROADMAP 1.120, UI-SEM-079)
  FramingQuality,
} from './olumi-response.js';
export type {
  Action,
  Insight,
  OlumiResponse,
  // 0.19.0 — decision classification (wave-2 ask 5, UI-SEM-077)
  DecisionClassification,
  DecisionClassificationStakesLiteral,
  DecisionClassificationReversibilityLiteral,
  DecisionClassificationRiskLiteral,
  // 0.20.0 — producer framing-quality verdict (ROADMAP 1.120, UI-SEM-079)
  FramingQualityLiteral,
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

// Decision record (0.15.0 — ROADMAP 3.1; 0.16.0 adds the additive scoring/
// provenance fields + DecisionRecordConfidenceSource). Standalone wire/API
// contract, NOT wired into OlumiResponse — see decision-record.ts for scope
// + persistence note (Supabase, coordinated separately).
export {
  DecisionRecordSchema,
  DecisionRecordDecisionSchema,
  DecisionRecordAnalysisSummarySchema,
  DecisionRecordPredictionSchema,
  DecisionRecordOutcomeSchema,
  DecisionRecordOutcomeResult,
  DecisionRecordConfidenceSource,
} from './decision-record.js';
export type {
  DecisionRecord,
  DecisionRecordDecision,
  DecisionRecordAnalysisSummary,
  DecisionRecordPrediction,
  DecisionRecordOutcome,
  DecisionRecordOutcomeResultLiteral,
  DecisionRecordConfidenceSourceLiteral,
} from './decision-record.js';

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
// Same value+type identifier convention as the root entry point — single
// `export { Foo }` republishes both meanings when source declares both.
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
  BiasSignal,
  WideningLog,
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

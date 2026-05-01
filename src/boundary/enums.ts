import { z } from 'zod';

// V5 turn classification — per AI Architecture v4.1.
// Exact members are provisional in A0; stabilised in A1 when TurnExecutor lands.
export const TurnClass = z.enum([
  'frame',
  'clarify',
  'propose',
  'decide',
  'review',
]);
export type TurnClassType = z.infer<typeof TurnClass>;

// Stage indicator attached to every OlumiResponse.
export const Stage = z.enum([
  'frame',
  'analyse',
  'decide',
  'review',
]);
export type StageType = z.infer<typeof Stage>;

// Severity for error blocks and boundary validation telemetry.
export const Severity = z.enum(['info', 'warn', 'error']);
export type SeverityType = z.infer<typeof Severity>;

// Result classification for replay fixtures and V2 runs.
export const RunResult = z.enum([
  'success',
  'degraded',
  'failed',
  'timeout',
  'not_attempted',
]);
export type RunResultType = z.infer<typeof RunResult>;

// Feature availability signal used by client routers.
export const FeatureStatus = z.enum([
  'enabled',
  'disabled',
  'degraded',
]);
export type FeatureStatusType = z.infer<typeof FeatureStatus>;

// V5 handler action types. Canonical V4 literals verified against
// src/orchestrator/deterministic/actions/*.ts at phase-0 audit time.
// Additive: new handler classes (coaching exercises, E-series) extend
// this enum in future minor bumps without breaking A0/A1/A2 consumers.
//
// 0.9.0 additions: `explain_from_structure` and `explain_results` (plural)
// register the V5 no-op routing handlers that give Sonnet correct tool
// surfaces for analytical / explanatory user intents. `explain_result`
// (singular) is retained as a DEPRECATED literal — historic
// `v5_handler_facts` rows reference it and existing fixtures / tests
// assert against it. New code should target `explain_results`.
export const ActionType = z.enum([
  'run_analysis',
  'set_factor_value',
  'add_constraint',
  'adjust_edge_strength',
  /** @deprecated use `explain_results` (plural). Retained for historic fact rows. */
  'explain_result',
  'explain_results',
  'explain_from_structure',
  'compare_options',
  'what_would_flip',
]);
export type ActionTypeLiteral = z.infer<typeof ActionType>;

// v0.7.0 — UI-initiated system-event kinds. Distinct from user-typed messages:
// they carry no free text and never add a user bubble. CEE V5 dispatches each
// to a deterministic handler (no LLM). See Docs/v5/v5-turn-shape-matrix.md
// in olumi-assistants-service for the authoritative handler coverage table.
export const SystemEventKind = z.enum([
  'patch_accepted',
  'patch_dismissed',
  'direct_graph_edit',
  'chip_click',
  'undo',
  'redo',
]);
export type SystemEventKindLiteral = z.infer<typeof SystemEventKind>;

// v0.7.0 — Source of a `kind: 'message'` turn. Distinguishes composer-typed
// text from chip clicks and retries so CEE can apply the right dispatch path.
export const TurnSource = z.enum([
  'composer',
  'chip',
  'chip_click',
  'retry',
]);
export type TurnSourceLiteral = z.infer<typeof TurnSource>;

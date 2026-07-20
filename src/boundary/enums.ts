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
//
// 0.19.0 (UI-SEM-020, wave-2 ask ⑥) — THIS ENUM IS THE CANONICAL
// `stage_indicator` VOCABULARY, versioned by this package's version. Stated
// explicitly because a consumer was observed typing its OWN stage union
// locally, which drifted (`'analyse'` — a canonical member since this enum
// shipped — sat outside it, silently disabling stage-adaptive behaviour).
//
//   * The complete vocabulary is exactly: frame | analyse | decide | review.
//   * British spelling `analyse` is canonical — never `analyze`.
//   * Consumers MUST derive their stage type from `Stage` / `StageType`
//     (or the runtime member list `Stage.options`), never re-declare it. A
//     hand-maintained mirror of this list is the known drift defect.
//   * Additions land here first as a MINOR bump and are announced in the
//     CHANGELOG; consumers should treat an unrecognised future member as
//     "no stage signal" (fail closed), not as an error.
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
//
// 0.20.0 addition: `analysis_readiness` — the analysis-preparation /
// readiness intent for PRODUCT-AUTHORED chips (the UI's pre-analysis spark
// prompts, e.g. "What should I check before running the first analysis?").
// Today those sparks travel as anonymous free text; CEE's draft-shape
// heuristic misclassified one as a decision brief and Monte-Carlo'd the
// meta-decision (META-DECISION-DIAGNOSIS-2026-07-20 §5 P0 — derive intent,
// don't re-infer it by regex). This value lets the UI declare the intent on
// the wire (`chip.action_type`) so CEE routes the turn through the existing
// pre-heuristic chip branch to its readiness/coaching arm, never the draft
// heuristic. Named after CEE's own coaching-arm vocabulary (coaching signal
// source `'analysis_readiness'`, `readiness_blocker` signals); like
// `what_would_flip` it names an intent, not an imperative graph operation.
// Name SIGNED OFF by the UI workstream (20 Jul 2026), with a scope rule:
// this value covers the READINESS-CLASS sparks only — a spark whose honest
// intent differs stays gated dark rather than borrowing this literal.
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
  'analysis_readiness',
]);
export type ActionTypeLiteral = z.infer<typeof ActionType>;

// CoachingIntent (0.21.0) — the typed coaching / elicitation intent vocabulary
// (S2 spec §3 addition 1, schemas-0.21.0-manifest b1).
//
// A PARALLEL literal set, DECOUPLED from `ActionType` — deliberately NOT an
// `ActionType` extension. `ActionType` names registered V5 mutation-handler
// IDs (the imperative "dispatch to THIS handler" channel: set_factor_value,
// add_constraint, adjust_edge_strength, run_analysis, ...). A coaching intent
// names WHAT THE USER MEANT ("run a pre-mortem with me", "take the outside
// view"), not a handler to invoke — exactly as `analysis_readiness` already
// "names an intent, not an imperative graph operation" (the note on
// `ActionType`). Fusing the two would re-conflate intent-naming with
// handler-dispatch, the meta-decision defect this vocabulary exists to close
// (META-DECISION-DIAGNOSIS-2026-07-20). So a chip declares its handler
// imperative through `chip.action_type` (unchanged) AND its coaching intent
// through the new `chip.intent` (turn-payload.ts) — two channels, two
// vocabularies.
//
// ⚠ PAUL-CONFIRMABLE (single-graph ratification batch):
//   (1) parallel enum vs extending `ActionType` — the architect / S2 §4
//       recommend PARALLEL (this); confirm.
//   (2) exact membership. `analysis_readiness` is NOT repeated here — it is the
//       readiness-class intent and already lives in `ActionType` from 0.20.0;
//       these are the REST of the coaching vocabulary the product authors
//       today (currently travelling as anonymous chip text or as UI-stripped
//       invalid literals). Each value below maps to a real UI source (S2 §3
//       table). `mitigation_help` is the S2 table's optional 12th
//       (Strengthen / mitigation family) — included for completeness; drop if
//       the mitigation family is not to declare an intent yet.
//
// Forward-compat (same rule as `Stage` / `ActionType`): a consumer MUST treat
// an unrecognised future member as "no intent signal" (fail closed), never an
// error. Additions land here as a MINOR bump, announced in the CHANGELOG.
export const CoachingIntent = z.enum([
  'challenge_frame', // "Is this the right question… fit my wider goals?" (ACTIONS_MENU)
  'elicit_options', // "Suggest materially different options… different mechanism"
  'outside_view', // "Take the outside view… base rates"
  'pre_mortem', // "Run a pre-mortem… imagine this choice failed"
  'elicit_risks', // "What risks and best-case upsides are missing"
  'estimate_help', // "Help me check the estimates that matter most"
  'discuss', // "Compare my view… where do we differ"
  'define_success', // "Help me define a measurable success target"
  'reflect_bias', // "You flagged a possible blind spot…" (reflectBias spark)
  'challenge_assumption', // InsightsStrip / AskOlumiDrawer authored-but-stripped
  'add_option', // InsightsStrip authored-but-stripped
  'mitigation_help', // Strengthen / mitigation family (S2 §3 optional 12th)
]);
export type CoachingIntentLiteral = z.infer<typeof CoachingIntent>;

// v0.7.0 — UI-initiated system-event kinds. Distinct from user-typed messages:
// they carry no free text and never add a user bubble. CEE V5 dispatches each
// to a deterministic handler (no LLM). See Docs/v5/v5-turn-shape-matrix.md
// in olumi-assistants-service for the authoritative handler coverage table.
// 0.15.0: `selection_change` added — between-turn canvas selection
// awareness (debounced, advisory-only). Mirrors the member added to the
// `SystemEventSchema` discriminated union in turn-payload.ts; kept in sync
// here for parity even though this enum is not itself composed into that
// union (each event's `kind` there is a literal, not a reference to this
// enum) — this export is a consumer-facing convenience list of valid kinds.
export const SystemEventKind = z.enum([
  'patch_accepted',
  'patch_dismissed',
  'direct_graph_edit',
  'chip_click',
  'undo',
  'redo',
  'selection_change',
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

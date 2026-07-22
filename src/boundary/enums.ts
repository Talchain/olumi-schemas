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
//
// 0.21.0 addition: `what_changed` — the typed door for the "What changed?"
// pill (F2 CHANGE B). Today that pill is a device-local canvas diff
// (`WhatChangedChip.tsx` computes a localStorage graph diff and only pulses
// the canvas) that NEVER reaches CEE, while CEE's real two-run comparison
// (`compareRuns` → `RunDelta`, `run-comparison-gate.ts`) is reachable only via
// free-text typed in chat. This value lets the UI declare the intent on the
// wire (`chip.action_type`) so CEE answers it from the real `RunDelta`. As
// shipped (the accept-half, CEE PR #620), a confirmed-fresh compared delta is
// answered by the DETERMINISTIC `composeComparison` (0-LLM); freshness stays
// fail-closed. Coach-narration of that delta is DEFERRED — an architectural
// fold with its own review — its precondition being `what_changed` registered
// as a PINNED explanation-class handler + the `RunDelta` threaded as ground
// truth, with `composeComparison` kept as the fallback. Like
// `what_would_flip`/`analysis_readiness` it names an INTENT,
// not an imperative graph operation. Name chosen for END-TO-END parity with
// CEE's existing intent literal `'what_changed'` (`classifyAnalyticalIntent` /
// `run-comparison-gate.ts`) so the typed pill and the free-text path answer to
// ONE name — the whole point of the typed door (derive intent, don't re-name
// it at a boundary).
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
  'what_changed',
]);
export type ActionTypeLiteral = z.infer<typeof ActionType>;

// ----------------------------------------------------------------------------
// Intent vocabulary (0.22.0 — S2, ROADMAP 1.179/1.181; design decision ①).
//
// A PARALLEL literal set, DECOUPLED from `ActionType` above. `ActionType`
// conflates "names a user intent" with "names an imperative handler id"; this
// enum carries the product's authored COACHING / ELICITATION intent vocabulary
// so CEE routes a typed chip on its TYPE instead of re-inferring intent from
// canned chip copy via the hand-maintained ten-string mirror
// (`PRODUCT_COACHING_PROMPTS` in CEE `process-meta-intake.ts` — the drift
// defect this closes; derive intent, don't re-parse it).
//
// WHY A NEW SET, NOT A WIDER `ActionType` (decision ①, rec adopted): keeping
// the handler-id space clean lets ONE intent fan out to several handlers, and
// avoids stamping coaching intents into an enum whose other members name
// graph-mutating operations. `analysis_readiness` already set the precedent
// that a member can name an intent, not a handler — this enum generalises that
// discipline to the whole coaching/elicitation surface. The three UI literals
// that are ALREADY authored-but-invalid against `ActionType` and silently
// stripped at the UI gate today (`add_option`, `challenge_assumption`,
// `discuss`) get their typed home HERE (S2 §1a).
//
// Members cover the 12 identity-only node chips + 8 unmapped sparks + the
// insight / drawer / coaching-card families (design §2.1):
//   * elicit_options       — "help me list the options"
//   * add_option           — add a decision option (the compound-transaction
//                            intent; the referee `add_option` case wires to a
//                            LIVE producer through this — design §3.3)
//   * challenge_frame       — challenge how the decision is framed
//   * challenge_assumption  — challenge a stated assumption
//   * outside_view          — take the outside/base-rate view
//   * pre_mortem            — run a pre-mortem
//   * elicit_risks          — surface risks
//   * estimate_help         — help estimating a value
//   * mitigation_help       — help mitigating a risk
//   * define_success        — define the success measure
//   * discuss               — open-ended coaching discussion
//
// ADDITIONS land here as a MINOR bump and are announced in the CHANGELOG;
// consumers treat an unrecognised future member as "no typed intent" (fail
// closed to the existing free-text path), never as an error.
//
// RESERVED HEADROOM (R-6, ROADMAP 1.183 CAPABILITY LAYER — do NOT re-design):
// the capability layer names S2 typed intents as a HARD GATE for
// framework/research requests. `framework_request` and `research_request` are
// ANTICIPATED members of THIS set; they are intentionally NOT added yet (no
// producer/consumer maps them at 0.22.0), but this vocabulary is designed to
// grow to include them additively so 1.183-P1 needs no second contract shape —
// only the two literals appended here.
export const Intent = z.enum([
  'elicit_options',
  'add_option',
  'challenge_frame',
  'challenge_assumption',
  'outside_view',
  'pre_mortem',
  'elicit_risks',
  'estimate_help',
  'mitigation_help',
  'define_success',
  'discuss',
]);
export type IntentLiteral = z.infer<typeof Intent>;

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
// 0.22.0: `feedback` added — the typed thumbs-rating event (Paul ruled WIRE,
// design decision ⑥). Mirrors the `feedback` member added to the
// `SystemEventSchema` union in turn-payload.ts; kept in parity here.
export const SystemEventKind = z.enum([
  'patch_accepted',
  'patch_dismissed',
  'direct_graph_edit',
  'chip_click',
  'undo',
  'redo',
  'selection_change',
  'feedback',
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

# Changelog

All notable changes to `@talchain/schemas` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] — 2026-05-09

### Added — `EditGraphHandlerFact` variant (DL-7 V5-integration contract)

Adds a new member to the canonical `HandlerFact` discriminated union
representing a successful (or noop) accepted `edit_graph` mutation —
the LLM-driven counterpart to the deterministic D1 mutation facts
(`set_factor_value`, `add_constraint`, `adjust_edge_strength`).
Closes the schema-contract half of the downstream CEE workstream's
DL-7 (V5 integration acceptance gate); consumer-side wiring follows
in a separate downstream PR.

- `EditGraphHandlerFactSchema` — `{ fact_type: 'edit_graph',
  fact_version: 1, noop, result }`. Strict on both wrapper and
  `result`. Joins the `HandlerFactSchema` discriminated union.
- `EditGraphResultSchema` — strict object carrying `edit_kind`
  (`'parameter_update' | 'option_configuration' | 'structural'`),
  `status` (`'applied' | 'noop'`), `operations_count` (non-negative
  integer), `affected_entities` (capped at 8), `graph_hash_before` /
  `graph_hash_after` (required nullable strings — diagnostic only,
  NOT user-facing source of truth for "what changed"),
  `safe_summary` (`.min(1).max(80)` — user-facing source of truth),
  `impact` (`'low' | 'moderate' | 'high'`), `rerun_recommended`
  (boolean).
- `EditGraphAffectedEntitySchema` — strict object whose `kind`
  reuses the canonical `NodeKind` enum (`'goal' | 'factor' |
  'outcome' | 'risk' | 'action' | 'decision' | 'option' |
  'constraint'`) PLUS the literal `'edge'` for edge-mutation
  receipts. `label` is `z.string().min(1)`, matching the existing
  `CompareOptionsResultSchema.options[].label` convention.
- Sub-enums exported for downstream reuse:
  `EditGraphEditKindSchema`, `EditGraphImpactSchema`,
  `EditGraphAffectedEntitySchema`.
- Canonical regression-fixture file at
  `tests/orchestrator/__fixtures__/handler-fact-fixtures.ts` — one
  realistic, parsing-valid sample per HandlerFact variant including
  the new `edit_graph` member. Future HandlerFact variants MUST add
  a fixture here. `KNOWN_FACT_TYPES` sentinel pins the
  discriminated-union members; a contract test asserts the fixture
  map and the sentinel stay in sync.

### Notes — schema bounds vs emitter-side safety boundary

The schema enforces SHAPE only:

- `safe_summary` capped at 80 chars (matches consumer-side
  `RECENT_CHANGES_SUMMARY_MAX_CHARS` so dashboards / state-query
  guards can quote it verbatim); content-form check (raw-ID
  detection, jargon guard) is emitter responsibility.
- `affected_entities` capped at 8 entries; per-entity `label` shape
  is non-empty, but `.max()` and content-form checks are emitter
  responsibility.
- `kind` enforces canonical vocabulary via `NodeKind ∪ 'edge'`.

Sanitisation, truncation, and raw-ID removal are explicitly
emitter responsibilities — labels and `safe_summary` are display
text supplied by the emitting service. The test suite includes
"PERMITS …" assertions for each deliberately-permissive case
(long labels, identifier-looking labels, identifier-looking
summaries, jargon-laden summaries) so the contract surface is
explicit and a future tranche won't bikeshed adding refinements.

### Notes — cross-field invariants are emitter-enforced

The schema deliberately permits combinations such as `noop=true`
with `status='applied'` and `status='applied'` with
`operations_count=0`. This matches the existing
`GraphEditResultBaseSchema` pattern (`set_factor_value`,
`add_constraint`, `adjust_edge_strength` similarly leave
status/noop coupling to the emitter). A test group
(`describe('… cross-field invariants are emitter-enforced')`)
asserts these combinations PASS schema validation, with a
documenting comment so a future tranche doesn't silently add Zod
refinements. Downstream PR B (CEE wiring) is required to add
emitter/consumer tests asserting `status='applied'` implies
`operations_count >= 1`, `noop=false` for successful applied
mutations, and `noop=true` facts are not surfaced as successful
recent-change projections without explicit handling.

### Backward compatibility

Purely additive: new union member; no existing variant changed; no
discriminator field rename, no field removal, no enum value
removal. Existing consumers that don't reference `'edit_graph'`
continue to parse and operate identically. A read-only audit of
the primary downstream consumer (CEE / `olumi-assistants-service`)
confirmed zero `assertNever` / `: never` exhaustiveness checks
coupled to `fact_type` and zero `switch (fact.fact_type)` blocks
— all branching is via guarded `if (fact.fact_type === 'X')`
chains which forward-compatibly skip the new variant until the
consumer's own wiring lands.

---

## [0.11.0] — 2026-05-01

### Added — Coaching contract (first-class)

Lifts coaching, causal-claim, and topology-plan fields out of consumer-side
`.passthrough()` survivors into declared shared types. The brief contract is
now visible to MC-25 boundary validation and locked against silent drift.

- `BiasType` — single canonical export. Values: `anchoring | narrow_framing | status_quo_bias | overconfidence`. No local re-declaration permitted in any consumer.
- `BiasSignalSchema` — `{ type: BiasType, detail: string }`.
- `BriefCompleteness` — enum: `complete | partial | thin`.
- `WideningLogSchema` — `{ elements_added: string[], elements_considered_but_excluded: string[], brief_completeness: BriefCompleteness }`.
- `StrengthenItemActionType` — enum: `add_option | add_constraint | add_risk | reframe_goal`.
- `StrengthenItemSchema` — `{ id, label, detail, action_type, bias_category? }` with optional bias_category typed as `BiasType`.
- `CoachingSchema` — `{ summary, strengthen_items, widening_log, bias_signals }`. **All four fields are required.** Empty arrays / empty `WideningLog` (`{ elements_added: [], elements_considered_but_excluded: [], brief_completeness: "thin" }`) are valid. Transitional permissiveness — accepting LLM responses that omit `widening_log` or `bias_signals` — lives in CEE's normaliser, not in this canonical contract.
- `StrengthBand` — enum: `very_strong | strong | moderate | slight` (4-band; replaces the prior consumer-side 3-band `strong | moderate | weak`).
- `CausalClaimSchema` — discriminated union on `type`:
  - `direct_effect`: `{ from, to, stated_strength: StrengthBand }`
  - `mediation_only`: `{ from, via, to }`
  - `no_direct_effect`: `{ from, to }`
  - `unmeasured_confounder`: `{ between: [string, string] }` (tuple of length 2)
- `CausalClaimsArraySchema` — shape only. Cardinality rules (e.g. 3–8 entries when graph has 5+ causal edges) are CEE-side concerns and live in graph-validator.
- `TopologyPlanSchema` — `string[]`. Soft cap of ≤15 lines is prompt-side, not enforced here.

### Changed

- `src/index.ts` re-exports the new schemas and types from the root entry point.
- `src/boundary/index.ts` (`@talchain/schemas/boundary` subpath) re-exports the same coaching, causal-claim, and topology-plan contracts, per Boundary Contract v1.1 §2.1 — these are cross-service types, so consumers should be able to import them from a single boundary namespace without falling back to the root entry.
- `package.json` script ordering: `test` now builds first (`npm run build && vitest run`) so `tests/exports.test.ts` (which imports from `dist/`) does not race the build step. `prepublishOnly` reordered to `lint → build → test`. `.github/workflows/publish.yml` reordered to Lint → Build → Test for the same reason.

### Notes

- **Naming convention**: New types in this contract surface (`BiasType`, `BriefCompleteness`, `StrengthenItemActionType`, `StrengthBand`) use a single bare identifier — the runtime Zod schema and the inferred TS type share the same name via TypeScript's value/type namespace separation. Earlier types in this package (`NodeKindType`, `EffectDirectionType`, ...) kept the legacy `Type` suffix; new exports do not.
- `EdgeStatedStrength` (per-edge) is intentionally NOT declared. No production consumer.
- `UnmeasuredConfounderClaim.stated_source` is intentionally dropped. Discovery confirmed zero consumer usage and zero fixture occurrences.
- Schemas package is shape-only. CEE consumers add referential-integrity validators and an output-safety scanner separately.
- **Tarball reproducibility**: `npm pack` / `pnpm pack` does not produce byte-deterministic output (mtime + install state leak in). Don't pin a sha256 in this repo's commit messages or CHANGELOG; the canonical sha for v0.11.0 is recorded in CEE's `vendor/talchain-schemas-0.11.0.tgz.sha256` at vendor time, against the exact tarball CEE consumes.

## [0.10.0] — 2026-04-25 (recovery commit landed 2026-05-01)

### Added — V5 explain handlers + freshness derivation

Recovery commit reconstructed from working-tree edits that backed the v0.10.0
tarball. Combines v0.9.0 and v0.10.0 changes into a single commit.

- `explain_results` and `explain_from_structure` ActionType enum values.
- `ExplainResultsArgsSchema`, `ExplainFromStructureArgsSchema`.
- `ExplainAnswerSourceSchema` (`sonnet | deterministic_fallback | precondition_template`).
- `ExplainFallbackReasonSchema` (`missing | too_short | forbidden_internal_term | mutation_language` nullable).
- `ExplainResultsResultSchema`, `ExplainFromStructureResultSchema`.
- `ExplainResultsHandlerFactSchema`, `ExplainFromStructureHandlerFactSchema` added to `HandlerFactSchema` discriminated union.
- `RunAnalysisResult` gains optional `graph_hash_at_run` and `computed_at` for V5 state-trust freshness derivation.
- `WhatWouldFlipResultSchema` shape: `precondition_unmet` and `option_count` are now required; `narrative` and `flip_scenarios` are optional.

### Changed

- `session.user_id` widened from `z.string().uuid()` to `z.string().uuid().nullable()`.

### Deprecated

- `explain_result` (singular) ActionType / ExplainResultArgsSchema / ExplainResultHandlerFactSchema retained for historic `v5_handler_facts` row compatibility. New code should target `explain_results` (plural).

## [0.8.1] — 2026-04-XX

### Added

- `draft_graph` block on OlumiResponse.
- `analysis_ready` field on OlumiResponse.

## [0.7.0] — 2026-04-XX

### Added

- `OrchestratorTurnPayload` discriminated union for system events (`patch_accepted`, `patch_dismissed`, `direct_graph_edit`, `chip_click`, `undo`, `redo`).

## [0.6.0] — 2026-04-XX

### Added

- Quantity extraction schema for CQE.

## [0.5.1] — 2026-XX-XX

### Added

- Defensive schema tightening (P1-1, P1-2, P1-3).

## [0.5.0] — 2026-XX-XX

### Added

- HandlerFact discriminated union.
- Per-handler args + results schemas.
- Session types.

## [0.4.0] — 2026-XX-XX

### Added

- `/orchestrator` subpath for V5 slice A1.

## [0.3.0] — 2026-XX-XX

### Added

- `/boundary` subpath.
- Orchestrator stub for V5 slice A0.

## [0.2.1] — 2025-XX-XX

### Added

- `edge_type` field on `EdgeV3Schema`.

## [0.2.0] — 2025-XX-XX

### Added

- v0.2.0 exports for UI schema fork elimination.

## [0.1.0] — 2025-XX-XX

Initial release of `@olumi/schemas` (renamed to `@talchain/schemas` in this version line).

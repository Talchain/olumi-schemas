import { z } from 'zod';
import { BoundaryErrorCode } from './error-codes.js';
import { Severity } from './enums.js';

// Narrowed subset of ActionType for graph-edit operations. Used by the
// GraphPatchBlock `operation` field so semantic-garbage constructions like
// `GraphPatchBlock{ operation: 'run_analysis' }` fail at parse time.
// Kept inline here because GraphPatchBlock is the only consumer; if a future
// slice needs the same subset elsewhere, lift to /boundary/enums.ts.
// Subset-ness relative to ActionType is verified by a runtime test in the
// schemas test suite (drift guard).
const GraphEditOperationSchema = z.enum([
  'set_factor_value',
  'add_constraint',
  'adjust_edge_strength',
]);

// Text block — carries free-form assistant content.
export const TextBlockSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
}).strict();
export type TextBlock = z.infer<typeof TextBlockSchema>;

// Error block — user-visible failure, keyed by stable BoundaryErrorCode.
export const ErrorBlockSchema = z.object({
  type: z.literal('error'),
  error_code: BoundaryErrorCode,
  severity: Severity,
  details: z.object({}).passthrough().optional(),
}).strict();
export type ErrorBlock = z.infer<typeof ErrorBlockSchema>;

// ----------------------------------------------------------------------------
// V5 handler-result blocks (0.5.0)
//
// Discriminated by `type`. Additive — new block types join the BlockSchema
// union without breaking A0/A1/A2 consumers.
//
// Content-shape is intentionally permissive: each block declares its common
// rendering fields and leaves handler-specific enrichment under an `enrichment`
// record so that D1/D2 tranches can extend without another schema bump. The
// content assertions (rev-2 revision 6) live in CEE tests, not in schemas.
// ----------------------------------------------------------------------------

// AnalysisResultBlock — emitted by run_analysis. Threads PLoT enrichment
// (factor_sensitivity, flip_thresholds, conditional_probabilities, edge_e_values,
// m1_coaching) through the `enrichment` record.
//
// v0.14.0: the enrichment record now has a typed opt-in envelope —
// `AnalysisEnrichmentSchema` in ./enrichment.ts. The transport field below
// deliberately STAYS `z.record(z.unknown())` (behaviour-preserving for every
// pinned consumer); consumers validate/type via
// `AnalysisEnrichmentSchema.safeParse(block.enrichment)`.
export const AnalysisResultBlockSchema = z.object({
  type: z.literal('analysis_result'),
  summary: z.string(),
  leading_option_id: z.string().nullable(),
  win_probabilities: z.record(z.string(), z.number()).optional(),
  enrichment: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type AnalysisResultBlock = z.infer<typeof AnalysisResultBlockSchema>;

// GraphPatchBlock — emitted by D1 handlers (set_factor_value, add_constraint,
// adjust_edge_strength). `status: 'noop'` signals the D1 NOOP suppression path
// (rev-2 revision 5).
export const GraphPatchBlockSchema = z.object({
  type: z.literal('graph_patch'),
  status: z.enum(['applied', 'noop']),
  operation: GraphEditOperationSchema,
  target_id: z.string().min(1),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
}).strict();
export type GraphPatchBlock = z.infer<typeof GraphPatchBlockSchema>;

// ExplanationBlock — emitted by explain_result.
export const ExplanationBlockSchema = z.object({
  type: z.literal('explanation'),
  narrative: z.string(),
  referenced_option_ids: z.array(z.string()),
  enrichment: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type ExplanationBlock = z.infer<typeof ExplanationBlockSchema>;

// ComparisonBlock — emitted by compare_options. Tests assert ≥2 distinct
// options when analysis has them; schema permits ≥1 so edge cases (degenerate
// single-option analyses) do not blow up at validation time.
export const ComparisonBlockSchema = z.object({
  type: z.literal('comparison'),
  options: z.array(z.object({
    option_id: z.string().min(1),
    label: z.string().min(1),
    win_probability: z.number().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  }).strict()).min(1),
  narrative: z.string().optional(),
}).strict();
export type ComparisonBlock = z.infer<typeof ComparisonBlockSchema>;

// FlipAnalysisBlock — emitted by what_would_flip. `flip_scenarios` may be
// empty when no fragile edges or thresholds exist.
export const FlipAnalysisBlockSchema = z.object({
  type: z.literal('flip_analysis'),
  narrative: z.string(),
  flip_scenarios: z.array(z.object({
    factor_id: z.string().min(1),
    current_value: z.number().nullable(),
    flip_threshold: z.number().nullable(),
    from_option_id: z.string().nullable(),
    to_option_id: z.string().nullable(),
    fragile: z.boolean(),
  }).strict()),
  enrichment: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type FlipAnalysisBlock = z.infer<typeof FlipAnalysisBlockSchema>;

// DraftGraphBlock — emitted by the draft_graph pre-Sonnet dispatcher (v0.8.0).
// Carries the full initial graph inline so the UI can render it directly from
// the response without a Supabase re-fetch. nodes/edges are permissive arrays
// (z.unknown() elements) so CEE-format node/edge shapes pass without a
// schema bump when node fields evolve. node_count/edge_count are authoritative
// counts derived from the FINAL post-repair graph.
export const DraftGraphBlockSchema = z.object({
  type: z.literal('draft_graph'),
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
  node_count: z.number().int().min(0),
  edge_count: z.number().int().min(0),
}).strict();
export type DraftGraphBlock = z.infer<typeof DraftGraphBlockSchema>;

// ----------------------------------------------------------------------------
// V5 Phase 3 block types — Analysis tab data contract v1.3
//
// Source of truth: `Docs/v5/v5-analysis-tab-data-contract-v1_3.md` in the CEE
// repo (committed via PR #177, SHA-256
// 24905122025585da88ba3f9423bc8300ff5985736984814fce9fac334dd1df69).
//
// These schemas encode the contract verbatim. Field shapes, unions, and
// optionality match §0–§1.4. Do not deviate without a contract amendment
// (§8 change process).
//
// Scope of common metadata (§0): MANDATORY for ReviewCardBlock,
// CoachingBlock, EvidenceBlock, ExerciseBlock. Existing FactBlock /
// GraphPatchBlock remain unchanged unless separately versioned.
// ----------------------------------------------------------------------------

// §0.4 — Action intent strict union (15 values). New intents require a
// contract update.
export const ActionIntent = z.enum([
  'explain_driver',
  'explain_result',
  'what_would_flip',
  'rerun_analysis',
  'gather_evidence',
  'create_decision_brief',
  'add_option',
  'add_risk',
  'confirm_factor',
  'edit_factor',
  'compare_options',
  'run_pre_mortem',
  'run_outside_view',
  'run_devils_advocacy',
  'start_guided_chat',
]);
export type ActionIntentLiteral = z.infer<typeof ActionIntent>;

// §0.1 — target_refs kind union (7 values). Strict; no string escape hatch.
export const TargetRefKind = z.enum([
  'factor',
  'option',
  'edge',
  'goal',
  'risk',
  'constraint',
  'outcome',
]);
export type TargetRefKindLiteral = z.infer<typeof TargetRefKind>;

// §0.1 — Target reference. IDs allowed in this structured field; must NOT
// appear in `title`, `body`, `action_label`, or any other user-facing
// text field (composer-layer enforcement).
export const TargetRefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: TargetRefKind,
}).strict();
export type TargetRef = z.infer<typeof TargetRefSchema>;

// §0 — Freshness verdict for Phase 3 blocks. Distinct from the
// analysis-ready freshness used elsewhere ('fresh' | 'stale' | 'unknown'
// | 'none'): Phase 3 block freshness uses `pending` while generation is
// in flight and `failed` when the generator threw.
export const Phase3BlockFreshness = z.enum([
  'fresh',
  'stale',
  'pending',
  'failed',
]);
export type Phase3BlockFreshnessLiteral = z.infer<typeof Phase3BlockFreshness>;

// §1.1 / §1.3 — Block-level severity for user-facing review / evidence
// rendering. DISTINCT from the existing `Severity` (`info` / `warn` /
// `error`) used for ErrorBlock / system telemetry. Phase 3 blocks use
// product-tier severities that map to visual treatment in the Analysis
// tab.
export const Phase3BlockSeverity = z.enum([
  'info',
  'warning',
  'critical',
]);
export type Phase3BlockSeverityLiteral = z.infer<typeof Phase3BlockSeverity>;

// §0.2 — Copy-length constraints. CEE enforces at the composer layer;
// schema-side enforcement is defence-in-depth so a composer bug surfaces
// as a Zod validation failure at the boundary rather than being silently
// truncated downstream by the Analysis tab.
const PHASE3_TITLE_MAX = 80;
const PHASE3_BODY_MAX = 300;
const PHASE3_ACTION_LABEL_MAX = 40;

// §1.1 — ReviewCardBlock. Produced by the decision_review enricher
// (auto-invoked after run_analysis, once per fresh graph hash, persisted,
// invalidated on graph edit). Hero eligible — `priority_rank` REQUIRED.
// signal_id REQUIRED; graph_hash_at_generation REQUIRED (analysis-derived).
export const ReviewCardBlockSchema = z.object({
  // common metadata (§0)
  block_id: z.string().uuid(),
  signal_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  source_handler: z.string().min(1),
  graph_hash_at_generation: z.string().min(1),
  freshness: Phase3BlockFreshness,
  // type discriminator
  type: z.literal('review_card'),
  card_kind: z.enum([
    'narrative',
    'bias',
    'flip_threshold',
    'evidence_priority',
    'pre_mortem',
    'assumption',
    'robustness',
    'scenario_context',
  ]),
  title: z.string().min(1).max(PHASE3_TITLE_MAX),
  body: z.string().min(1).max(PHASE3_BODY_MAX),
  severity: Phase3BlockSeverity,
  target_refs: z.array(TargetRefSchema),
  priority_rank: z.number(),
  action_intent: ActionIntent.optional(),
  action_label: z.string().min(1).max(PHASE3_ACTION_LABEL_MAX).optional(),
}).strict();
export type ReviewCardBlock = z.infer<typeof ReviewCardBlockSchema>;

// §1.2 — CoachingBlock. Produced by the coaching pass (Step 5 of the
// seven-step turn assembly) and draft_graph structured-output threading.
// Hero eligible — `priority_rank` REQUIRED. signal_id REQUIRED;
// graph_hash_at_generation OPTIONAL (draft / pre-analysis blocks may
// pre-date a runnable graph hash).
export const CoachingBlockSchema = z.object({
  // common metadata (§0)
  block_id: z.string().uuid(),
  signal_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  source_handler: z.string().min(1),
  graph_hash_at_generation: z.string().min(1).optional(),
  freshness: Phase3BlockFreshness,
  // type discriminator
  type: z.literal('coaching'),
  coaching_kind: z.enum([
    'orientation',
    'widening',
    'bias_signal',
    'strengthen',
    'assumption_check',
    'calibration_prompt',
  ]),
  title: z.string().min(1).max(PHASE3_TITLE_MAX),
  body: z.string().min(1).max(PHASE3_BODY_MAX),
  source: z.enum(['draft_graph', 'decision_review', 'deterministic_signal']),
  target_refs: z.array(TargetRefSchema),
  priority_rank: z.number(),
  action_intent: ActionIntent.optional(),
  action_label: z.string().min(1).max(PHASE3_ACTION_LABEL_MAX).optional(),
}).strict();
export type CoachingBlock = z.infer<typeof CoachingBlockSchema>;

// §1.3 — EvidenceBlock. Produced by the evidence-ranking module
// (`rankEvidenceSources`). Hero eligible — `priority_rank` REQUIRED.
// signal_id REQUIRED; graph_hash_at_generation REQUIRED.
//
// Consistency rule (§1.3): `factor_ref` MUST match the primary factor
// entry in `target_refs`. Enforced at the schema layer via
// `superRefine` on the exported `EvidenceBlockSchema` below (round-3
// review correction — the natural import name now gives the full v1.3
// contract validation). `factor_label` is a backward-compatibility
// convenience; renderers prefer `target_refs[].label` on conflict per
// the contract. The "primary factor entry" is the FIRST entry in
// `target_refs` with `kind: 'factor'` — this admits non-factor refs
// (options / edges / etc.) elsewhere in the array while pinning the
// canonical factor association at the schema boundary.
//
// `EvidenceBlockObjectSchema` (bare ZodObject) is kept as an internal
// helper because `z.discriminatedUnion` only accepts ZodObject members
// (ZodEffects are rejected). It is NOT exported from the package.
const EvidenceBlockObjectSchema = z.object({
  // common metadata (§0)
  block_id: z.string().uuid(),
  signal_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  source_handler: z.string().min(1),
  graph_hash_at_generation: z.string().min(1),
  freshness: Phase3BlockFreshness,
  // type discriminator
  type: z.literal('evidence'),
  factor_label: z.string().min(1),
  factor_ref: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.literal('factor'),
  }).strict(),
  target_refs: z.array(TargetRefSchema),
  current_confidence: z.enum(['high', 'medium', 'low']),
  evidence_gap: z.string().min(1),
  suggested_technique: z.string().min(1),
  impact_if_gathered: z.string().min(1),
  priority_rank: z.number(),
  severity: Phase3BlockSeverity,
  action_intent: ActionIntent.optional(),
  action_label: z.string().min(1).max(PHASE3_ACTION_LABEL_MAX).optional(),
}).strict();
export type EvidenceBlock = z.infer<typeof EvidenceBlockObjectSchema>;

/**
 * §1.3 consistency rule: factor_ref must match the primary factor
 * entry in target_refs (first entry with `kind: 'factor'`). Applied
 * via `superRefine` on the EXPORTED `EvidenceBlockSchema` so the
 * natural import name gives the full v1.3 contract validator
 * (round-3 review correction — composer code can't silently bypass
 * the rule). Also applied at the discriminated-union level on
 * `BlockSchema` below so wire-level parsing fails closed independently
 * of which entry point the consumer used.
 */
function applyEvidenceConsistencyRule(
  data: EvidenceBlock,
  ctx: z.RefinementCtx,
): void {
  const primaryFactor = data.target_refs.find((r) => r.kind === 'factor');
  if (!primaryFactor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['target_refs'],
      message:
        'EvidenceBlock target_refs must contain at least one entry with kind="factor" (the primary factor matching factor_ref). Per Analysis tab data contract v1.3 §1.3.',
    });
    return;
  }
  if (primaryFactor.id !== data.factor_ref.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['factor_ref', 'id'],
      message:
        'EvidenceBlock factor_ref.id must match the primary factor entry in target_refs (first target_refs entry with kind="factor"). Per Analysis tab data contract v1.3 §1.3.',
    });
  }
  if (primaryFactor.label !== data.factor_ref.label) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['factor_ref', 'label'],
      message:
        'EvidenceBlock factor_ref.label must match the primary factor entry in target_refs (first target_refs entry with kind="factor"). Per Analysis tab data contract v1.3 §1.3.',
    });
  }
}

/**
 * Public EvidenceBlock schema — full v1.3 contract including the
 * §1.3 consistency rule. The bare ZodObject lives off-export as
 * `EvidenceBlockObjectSchema` for the discriminated-union construction
 * below.
 */
export const EvidenceBlockSchema =
  EvidenceBlockObjectSchema.superRefine(applyEvidenceConsistencyRule);

// §1.4 — ExerciseBlock. Produced by on-demand handler invocation
// (pre-mortem, outside view, devil's advocacy, consider opposite). NOT
// auto-invoked — triggered by user interaction intent. Hero eligible:
// no (note: no `priority_rank` field per v1.3). signal_id REQUIRED;
// graph_hash_at_generation OPTIONAL (some exercises are graph-agnostic).
export const ExerciseBlockSchema = z.object({
  // common metadata (§0)
  block_id: z.string().uuid(),
  signal_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  source_handler: z.string().min(1),
  graph_hash_at_generation: z.string().min(1).optional(),
  freshness: Phase3BlockFreshness,
  // type discriminator
  type: z.literal('exercise'),
  exercise_kind: z.enum([
    'pre_mortem',
    'outside_view',
    'devils_advocacy',
    'consider_opposite',
  ]),
  failure_scenario: z.string().min(1).optional(),
  warning_signs: z.array(z.string().min(1)).optional(),
  mitigation: z.string().min(1).optional(),
  reference_class: z.string().min(1).optional(),
  target_element_ref: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: TargetRefKind,
  }).strict().optional(),
  counter_case: z.string().min(1).optional(),
  review_trigger: z.string().min(1).optional(),
  target_refs: z.array(TargetRefSchema),
}).strict();
export type ExerciseBlock = z.infer<typeof ExerciseBlockSchema>;

// ----------------------------------------------------------------------------
// HeldProposalBlock (0.15.0) — durable fix for ROADMAP 1.43.
//
// Graph Management (`CEE_GRAPH_MANAGEMENT_MODE=live`, live on staging 9 Jul
// 2026) currently surfaces a held mutation batch as a `type:"error"` /
// `error_code:"INTERNAL_ERROR"` block (severity `warn`), with the real story
// only in `details` — honest copy, but an error-styled block that a literal
// error renderer shows as a failure on a healthy hold. `details.blocker_readable`
// also carries internal doctrine prose verbatim (e.g. "Structural mutation
// held: §6 structural-vs-tunable doctrine is pending sign-off"), which 1.43
// flags as an internal-wording leak. `held_proposal` is the dedicated,
// non-error-styled replacement.
//
// Evidence (verbatim wire capture, GM live-flip journey T2/T4 —
// acceptance-evidence/gm-live-flip/journey/T2-gm-propose-response.json,
// olumi-schemas repo consumer olumi-assistants-service):
//   blocks: [{ type: "error", error_code: "INTERNAL_ERROR", severity: "warn",
//     details: { source: "graph_management", verdict: "held",
//       mutation_class: "structural", blocker_code: "STRUCTURAL_APPLY_HELD",
//       blocker_readable: "Structural mutation held: ...", candidate_id: "...",
//       base_hash_match: true } }]
//   suggested_actions: [{ id: "gmh_<12hex>", label: "Continue with this change",
//     message: "Yes" }]
// (CEE source: src/orchestrator-v5/handlers/edit-graph-referee-gate.ts
// `publicReasonOf` / `GM_HELD_CHIP_LABEL`; `gmHeldProposalRef` mints the
// `gmh_` handle; src/orchestrator-v5/graph-management/referee.ts is the
// verdict/blocker-code source of truth.)
//
// MINIMAL and additive, per the other block kinds. Candidate/operation
// internals never cross this block (T4.0 §5 redaction contract carries over
// unchanged) — it carries only what a UI needs to render a held-proposal
// card: a display-safe summary, a code-keyed reason (not free prose), and
// action refs into the response's top-level `suggested_actions`, never its
// own duplicate action objects.

// Mechanical structural/tunable taxonomy for the held mutation. Mirrors CEE's
// graph-management `MutationClass`, restricted to the two classes a `held`
// verdict can carry — `non_mutating` kinds (flag_uncertainty, clarification)
// resolve to `clarify_required`, never `held` (CEE classify-mutation.ts).
export const HeldProposalMutationClass = z.enum(['structural', 'tunable']);
export type HeldProposalMutationClassLiteral = z.infer<typeof HeldProposalMutationClass>;

// Code-keyed held reason — restates the `held`-reachable subset of CEE's
// graph-management `MutationReasonCode` vocabulary (Track 3,
// olumi-assistants-service src/orchestrator-v5/graph-management/reason-codes.ts
// + referee.ts verdict table, read at staging tip `origin/staging` 2026-07-09).
// Deliberately code-keyed, not free text: a consumer maps each code to its
// OWN user-facing copy, so the internal-doctrine-prose leak 1.43 flagged in
// `blocker_readable` cannot recur through this block. Extend additively when
// CEE mints a new held-reachable code; do not add prose members here.
export const HeldProposalReasonCode = z.enum([
  'STRUCTURAL_APPLY_HELD',
  'TUNABLE_APPLY_HELD',
  'REMOVE_UNCONFIRMED',
  'ADD_OPTION_APPLY_UNWIRED',
  'OPTION_TOP_LEVEL_OPTIONS_DIVERGENCE',
  'FRAME_UNAVAILABLE',
  'CURRENT_GRAPH_UNREADABLE',
  'CLASSIFY_FAILED',
]);
export type HeldProposalReasonCodeLiteral = z.infer<typeof HeldProposalReasonCode>;

export const HeldProposalBlockSchema = z.object({
  type: z.literal('held_proposal'),
  // Deterministic held-pending handle CEE mints per (scenario, mutation
  // target) — `gmh_<sha256-12hex>` on the wire today (CEE
  // `gmHeldProposalRef`). Typed here as a stable non-empty identifier rather
  // than the CEE-internal format so the mint scheme can evolve without a bump.
  proposal_id: z.string().min(1),
  // Short, user-facing description of the change being held (composer-
  // generated). Display-safe by construction — MUST NOT be internal
  // doctrine prose; that class of wording is exactly what `reason_code`
  // replaces.
  summary: z.string().min(1),
  mutation_class: HeldProposalMutationClass,
  reason_code: HeldProposalReasonCode,
  // Reference into this response's top-level `suggested_actions[].id` for
  // the "apply this change" affordance. Always present — every held verdict
  // the referee gate emits carries a confirm chip. This block never embeds
  // its own action object, so the chip is never duplicated on the wire.
  confirm_action_id: z.string().min(1),
  // Reference into `suggested_actions[].id` for an explicit "decline"
  // affordance, when one exists. Optional: CEE does not yet emit a
  // dedicated decline chip (today's decline path is free-text — "tell me
  // what to adjust instead") — this field is forward-declared for when it
  // does, not fabricated ahead of the wire carrying it.
  decline_action_id: z.string().min(1).optional(),
}).strict();
export type HeldProposalBlock = z.infer<typeof HeldProposalBlockSchema>;

// Discriminated union. Additive — new block types land in A1+ without breaking.
// 0.5.0: handler-result blocks joined the union.
// 0.8.0: DraftGraphBlock added.
// 0.13.0: Phase 3 block types (ReviewCard / Coaching / Evidence / Exercise)
//         added per Analysis tab data contract v1.3.
// 0.15.0: HeldProposalBlock added (ROADMAP 1.43).
export const BlockSchema = z
  .discriminatedUnion('type', [
    TextBlockSchema,
    ErrorBlockSchema,
    AnalysisResultBlockSchema,
    GraphPatchBlockSchema,
    ExplanationBlockSchema,
    ComparisonBlockSchema,
    FlipAnalysisBlockSchema,
    DraftGraphBlockSchema,
    ReviewCardBlockSchema,
    CoachingBlockSchema,
    EvidenceBlockObjectSchema,
    ExerciseBlockSchema,
    HeldProposalBlockSchema,
  ])
  // Apply the §1.3 EvidenceBlock consistency rule at the union level so
  // wire-level `BlockSchema.safeParse(x)` fails closed when an
  // EvidenceBlock's `factor_ref` does not match the primary factor
  // entry in `target_refs`. The union itself uses the internal
  // `EvidenceBlockObjectSchema` (bare ZodObject) because
  // `z.discriminatedUnion` only accepts `ZodObject` members, not
  // `ZodEffects`. The public `EvidenceBlockSchema` carries the same
  // rule via its own `.superRefine` — see its definition above.
  .superRefine((data, ctx) => {
    if (data.type === 'evidence') {
      applyEvidenceConsistencyRule(data, ctx);
    }
  });
export type Block = z.infer<typeof BlockSchema>;

// Chip — UI action affordance. Not rendered in A0 scaffold; schema pinned now.
export const ChipSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  action: z.string().optional(),
}).strict();
export type Chip = z.infer<typeof ChipSchema>;

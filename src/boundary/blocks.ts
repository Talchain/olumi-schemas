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

// DraftGoalConstraint — a hard constraint extracted from the user's brief at
// DRAFT time and carried on the draft_graph block (v0.18.0).
//
// ⚠ NOT THE SAME TYPE AS `GoalConstraintSchema` in `./run.ts`. These are two
// different payloads at two different seams, and conflating them is the exact
// same-named-twin defect that has bitten this programme before:
//
//   ./run.ts GoalConstraintSchema  — the V2 RUN-REQUEST constraint (UI/CEE ->
//     PLoT compute). Identity `id`, five-way `bound` enum
//     ('lt'|'lte'|'gt'|'gte'|'eq'), no node binding, no provenance. `.strict()`.
//   THIS schema                    — the DRAFTING-time EXTRACTION (CEE -> UI).
//     Identity `constraint_id`, node-bound via `node_id`, two-way ASCII
//     `operator` ('>='|'<='), and carries extraction provenance the compute
//     path has no concept of (source_quote / confidence / provenance).
//
// Neither is a superset of the other, and reshaping `run.ts`'s to fit would be
// a BREAKING change to `V2RunRequestSchema` (a major bump, blast radius = the
// PLoT compute path). They are therefore kept distinct and DIFFERENTLY NAMED.
//
// Field-level validators mirror CEE's producer schema (`src/schemas/assist.ts`
// `GoalConstraintSchema`) exactly. That is safe rather than risky: CEE's Stage-4
// structural-parse substep already runs `DraftGraphOutput.parse()` — which
// embeds those same validators — over this very array and hard-fails the turn
// (400 CEE_GRAPH_INVALID) before egress, so anything that reaches the wire has
// already satisfied them. Re-declaring them here adds no new rejection surface.
//
// `.passthrough()` — deliberate, and the one place this schema does NOT mirror
// CEE. CEE's regex path emits `provenance_unit_normalised` (from the
// percent->fraction rewrite in `normaliseConstraintUnits`), which is absent from
// CEE's own schema; its structural-parse is validation-only (the parsed result
// is discarded, so nothing is stripped) and the key reaches the wire. A
// `.strict()` element would turn every percent constraint into an
// EGRESS_CONTRACT_VIOLATION — the precise failure mode this change exists to
// remove. Passthrough is also this package's documented default (README).
export const DraftGoalConstraintSchema = z.object({
  /** Unique constraint identifier (CEE: `constraint_<node_id>_<min|max>`). */
  constraint_id: z.string().min(1),
  /**
   * Target node this constraint binds to. CEE drops any constraint whose
   * node_id does not match a node in the drafted graph, so a value here is
   * guaranteed to resolve against the sibling `nodes` array.
   */
  node_id: z.string().min(1),
  /** ASCII only — CEE normalises away '<', '>' and the Unicode forms. */
  operator: z.enum(['>=', '<=']),
  /** Threshold in the user's units; PLoT normalises downstream. */
  value: z.number(),
  /** Human-readable label, e.g. 'First-year budget cap'. */
  label: z.string().optional(),
  /** Unit if known ('£', '%', 'fraction', 'hours', ...). */
  unit: z.string().optional(),
  /**
   * Verbatim span from the brief that produced this constraint. CEE truncates
   * to 200 chars at extraction; not re-capped here — the cap is CEE ingestion
   * policy, not a wire invariant, and this contract must never be the thing
   * that fails a draft response.
   */
  source_quote: z.string().optional(),
  /** Extraction confidence (0-1). Regex path: 0.85 explicit / 0.6 inferred. */
  confidence: z.number().min(0).max(1).optional(),
  /** How the constraint was obtained — drives UI provenance display. */
  provenance: z.enum(['explicit', 'inferred', 'proxy']).optional(),
  /** Present only for temporal ('by <date>') constraints. */
  deadline_metadata: z.object({
    deadline_date: z.string().optional(),
    reference_date: z.string().optional(),
    assumed_reference_date: z.boolean().optional(),
  }).passthrough().optional(),
  /**
   * Audit trail for the percent->fraction rewrite. Declared (rather than left
   * to passthrough) so the value is typed for consumers and cannot be silently
   * dropped by a future stricter pin.
   */
  provenance_unit_normalised: z.object({
    rule: z.string(),
    original_value: z.number(),
    original_unit: z.string(),
  }).passthrough().optional(),
}).passthrough();
export type DraftGoalConstraint = z.infer<typeof DraftGoalConstraintSchema>;

// DraftGraphBlock — emitted by the draft_graph pre-Sonnet dispatcher (v0.8.0).
// Carries the full initial graph inline so the UI can render it directly from
// the response without a Supabase re-fetch. nodes/edges are permissive arrays
// (z.unknown() elements) so CEE-format node/edge shapes pass without a
// schema bump when node fields evolve. node_count/edge_count are authoritative
// counts derived from the FINAL post-repair graph.
//
// `.strict()` is retained deliberately. It is why `goal_constraints` had to be
// declared here before CEE could emit it (an undeclared key produces
// `unrecognized_keys`, which CEE's validateEgress turns into a whole-response
// EGRESS_CONTRACT_VIOLATION fallback) — the fix for a dropped field at this
// seam is to DECLARE it, never to loosen the block to passthrough.
export const DraftGraphBlockSchema = z.object({
  type: z.literal('draft_graph'),
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
  node_count: z.number().int().min(0),
  edge_count: z.number().int().min(0),
  /**
   * Hard constraints extracted from the brief (v0.18.0, additive/optional).
   * Constraints are METADATA, not causal structure — CEE deliberately does not
   * emit them as graph nodes or edges, so this array is the ONLY channel by
   * which a user's stated constraint reaches the client on the drafting path.
   * Absent when the brief carried none; consumers must treat absence and `[]`
   * as equivalent.
   */
  goal_constraints: z.array(DraftGoalConstraintSchema).optional(),
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

// ----------------------------------------------------------------------------
// Guidance signals (0.19.0) — wave-2 producer fields, UI-SEM-085.
//
// THE `priority_rank` CONTRACT, stated once, authoritatively (this is the
// answer to the UI's §3.2 ask — consumers were inverting it as
// `100 - priority_rank`, which is WRONG):
//
//   * `priority_rank` is an ASCENDING ordinal: LOWER = shown FIRST. It is a
//     display order, not a merit score.
//   * Its range is the positive integers, UNBOUNDED. It is NOT a 0–100 scale;
//     never invert it against 100 (ranks ≥ 100 are routine).
//   * The band prefix IS meaningful — it encodes the producer's block-class
//     ordering, not a score: 1–9 lifecycle-urgent (e.g. the stale-rerun
//     nudge at rank 1); 10–99 analysis review cards (curated per-kind bands:
//     narrative 10, pre-mortem 20, flip 30+, bias 40+, robustness 50,
//     evidence-priority 60, assumption 70+, scenario-context 80+);
//     100–199 coaching; 200+ calibration prompts / exercises.
//   * Ranks are unique only WITHIN a producing band, not globally: a
//     consumer sorting a mixed guidance feed sorts ascending and treats
//     equal ranks as producer-order ties.
//
// `GuidanceCategory` + `priority` (both OPTIONAL, additive 0.19.0) are the
// producer-owned severity/urgency signals the UI previously invented
// client-side (UI-SEM-085: measured 10/10 blocks with UI-authored
// `category`). Semantics:
//
//   * `category` — the canonical four-value guidance class the Strengthen
//     surface budgets and filters on. Code-keyed: a consumer maps each value
//     to its OWN display copy (same doctrine as HeldProposalReasonCode).
//   * `priority` — a COARSE 0–100 urgency score for cross-surface budgeting,
//     HIGHER = more urgent. It is intentionally band-granular (derived 1:1
//     from `category` by the producer): ties are expected and normal. It is
//     NOT a display order — to order a feed, sort by `priority_rank`
//     ascending; use `priority`/`category` to budget, filter, and style.
//
// Consumers MUST tolerate absence (fail closed to their existing unranked
// treatment): blocks produced before 0.19.0, or by producers that have not
// re-vendored, will not carry these fields.
export const GuidanceCategory = z.enum([
  'must_fix',
  'should_fix',
  'could_fix',
  'technique',
]);
export type GuidanceCategoryLiteral = z.infer<typeof GuidanceCategory>;

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
  // 0.19.0 additive (UI-SEM-085) — producer-owned guidance class + coarse
  // urgency score. See the GuidanceCategory block comment for semantics.
  category: GuidanceCategory.optional(),
  priority: z.number().min(0).max(100).optional(),
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
  // 0.19.0 additive (UI-SEM-085) — producer-owned guidance class + coarse
  // urgency score. See the GuidanceCategory block comment for semantics.
  // (CoachingBlock has no `severity` field; `category` is its ONLY
  // producer-owned severity-class signal.)
  category: GuidanceCategory.optional(),
  priority: z.number().min(0).max(100).optional(),
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
  // 0.19.0 additive (UI-SEM-085) — producer-owned guidance class + coarse
  // urgency score. See the GuidanceCategory block comment for semantics.
  category: GuidanceCategory.optional(),
  priority: z.number().min(0).max(100).optional(),
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
  // 0.19.0 additive (UI-SEM-085) — producer-owned guidance class + coarse
  // urgency score, declared on every guidance-bearing block kind for
  // uniformity (ExerciseBlock has no priority_rank per v1.3; `category` /
  // `priority` give a consumer its only producer-owned budgeting signals).
  category: GuidanceCategory.optional(),
  priority: z.number().min(0).max(100).optional(),
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

// ----------------------------------------------------------------------------
// UiDirectiveBlock (0.15.0) — seamlessness R4 keystone.
//
// Verified-absent channel: no existing block kind lets a CEE response tell
// the UI "look here" / "open this" without inventing a graph mutation or a
// free-text instruction the composer has to parse. `ui_directive` is that
// channel — a pure UX hint, never a state mutation.
//
// Fail-closed dispatch contract: `targets[].id` values that the UI's
// dispatcher does not recognise (stale, already-removed, or a future kind
// the dispatcher doesn't yet handle) are SILENTLY SKIPPED — a directive
// must never throw, block rendering, or surface an error for an unknown
// id. This mirrors the closed-union block-renderer pattern already in the
// UI (`InlineBlocks.tsx` switches on `block.type` with a no-op default;
// there is no fallback affordance today) — `ui_directive` is designed to
// degrade the same way at the id level, not just the block-kind level.
//
// Advisory, not a command: directives are UX suggestions (highlight/focus/
// open a panel) for the CURRENT turn's response. They never carry graph
// state, never imply a mutation happened or should happen, and a consumer
// that ignores every `ui_directive` block loses only presentation polish,
// never correctness.
//
// Closed `verb` enum, v1: `highlight` | `focus` | `open_inspector`.
// `annotate` (attach a note to a graph element) and `start_tour` (multi-step
// guided sequence) were considered and deliberately DEFERRED — both need
// their own payload shape (annotate needs placement; start_tour needs an
// ordered step list) that would either bloat this block or need a second
// block kind; v1 stays minimal. Extend the enum additively when a verb's
// shape is actually needed by a shipping consumer.
//
// Rate expectations: a single response should carry AT MOST ~3 of these
// blocks. Not schema-enforced (a hard cap would be a false floor — CEE
// composition, not wire validation, owns pacing) but documented here so a
// future composer bug (e.g. one directive per target_ref emitted in a loop)
// is recognisable as a bug against a stated expectation.
export const UiDirectiveVerb = z.enum(['highlight', 'focus', 'open_inspector']);
export type UiDirectiveVerbLiteral = z.infer<typeof UiDirectiveVerb>;

const UI_DIRECTIVE_DURATION_MIN_MS = 500;
const UI_DIRECTIVE_DURATION_MAX_MS = 10_000;
const UI_DIRECTIVE_NOTE_MAX = 140;

export const UiDirectiveBlockSchema = z.object({
  type: z.literal('ui_directive'),
  verb: UiDirectiveVerb,
  // Reuses the existing TargetRefSchema shape (§0.1) rather than a
  // bespoke minimal {id, kind} — TargetRef's `label` is harmless-but-
  // unused here (dispatch keys off `id`/`kind` only) and reuse avoids a
  // second near-identical ref shape in the same package.
  targets: z.array(TargetRefSchema),
  duration_ms: z
    .number()
    .int()
    .min(UI_DIRECTIVE_DURATION_MIN_MS)
    .max(UI_DIRECTIVE_DURATION_MAX_MS)
    .optional(),
  // Short, display-safe caption a UI MAY render alongside the directive
  // (e.g. a tooltip). Same display-safety expectation as ReviewCardBlock's
  // `title` — no internal ids, no doctrine prose. Bounded short: this is a
  // caption, not a narrative field (compare PHASE3_TITLE_MAX=80 for a
  // full card title).
  note: z.string().min(1).max(UI_DIRECTIVE_NOTE_MAX).optional(),
}).strict();
export type UiDirectiveBlock = z.infer<typeof UiDirectiveBlockSchema>;

// Discriminated union. Additive — new block types land in A1+ without breaking.
// 0.5.0: handler-result blocks joined the union.
// 0.8.0: DraftGraphBlock added.
// 0.13.0: Phase 3 block types (ReviewCard / Coaching / Evidence / Exercise)
//         added per Analysis tab data contract v1.3.
// 0.15.0: HeldProposalBlock added (ROADMAP 1.43).
// 0.15.0: UiDirectiveBlock added (seamlessness R4 keystone).
// 0.18.0: DraftGraphBlock gained optional `goal_constraints` (additive; the
//         block stays strict, so the union member's key set widened by one).
// 0.19.0: ReviewCard / Coaching / Evidence / Exercise gained optional
//         `category` + `priority` (wave-2 producer fields, UI-SEM-085; all
//         four stay strict — consumers on OLDER pins strict-fail a block
//         carrying the new keys, so producers must not emit them until every
//         strict consumer has re-vendored ≥ 0.19.0).
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
    UiDirectiveBlockSchema,
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

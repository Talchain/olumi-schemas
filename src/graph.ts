import { z } from 'zod';
import { DeclaredScale, factorScaleFields } from './factor-scale.js';
import { FactorReasoningSchema, FactorValueTierSchema, UnquantifiedPriorSchema } from './factor-quantification.js';
import { RoundParticipantRefSchema } from './boundary/collab.js';

export const NODE_ID_PATTERN = /^[a-z0-9_:-]+$/;

export const NodeKind = z.enum([
  'goal', 'factor', 'outcome', 'risk', 'action',
  'decision', 'option', 'constraint',
]);

export const FactorCategory = z.enum(['controllable', 'observable', 'external']);

export { DeclaredScale, DECLARED_SCALE_BOUNDS } from './factor-scale.js';
export type { DeclaredScaleType } from './factor-scale.js';

/**
 * 0.40.0 (PR4 evidence loop) — the KNOWN `observed_state.source` literals,
 * DECLARED in the contract for the first time. Until 0.40.0 this union lived
 * only in the consumers, twice, as hand-maintained mirrors of each other:
 *
 *   · CEE `src/schemas/cee-v3.ts` `ObservedStateV3.source` — a closed
 *     7-member z.enum, self-described "the narrowest validator in the chain"
 *     (derived at staging `335a9380`, 13 Aug 2026);
 *   · UI `src/canvas/domain/valueProvenance.ts` `SOURCE_CLASSES` — 11
 *     literals, a strict superset of CEE's 7, and the file CEE's own comment
 *     names as "the acknowledged cross-repo source of this list" (derived at
 *     staging `f04e756d`, same day).
 *
 * The list below is the UNION of those two corpora plus `panel_elicited`
 * (minted 0.40.0 for the evidence loop). Per-member provenance:
 *
 *   brief_extraction, explicit          — extraction from the user's brief
 *   cee_inference, inferred, cee_repair — the model's own estimate/repair
 *   user_override                       — typed value (UI edit surfaces AND
 *                                         CEE set_factor_value / chat edits)
 *   user_confirmed                      — "confirm as is"
 *   user                                — Model-tab factor-value edits
 *   user_edited                         — OutputsDock transition bridge
 *   user_calibration                    — inspector calibration
 *   user_assumption                     — reserved "mark as assumption"
 *   panel_elicited                      — 0.40.0: applied from a named
 *                                         participant's panel answer; MUST be
 *                                         accompanied by `elicited_from`
 *                                         when CEE stamps it (producer rule —
 *                                         see `elicited_from` below)
 *
 * ⚠ THE WIRE FIELD STAYS `z.string()`, DELIBERATELY — this enum is a
 * CONSUMER-SIDE VOCABULARY, NEVER A WIRE GATE. Narrowing the field would be
 * breaking (not a MINOR), and a gating vocabulary refuses every literal it
 * is missing (the trap-12d short-list failure). Consumers should DERIVE
 * their classifier/validator membership from this list at their ≥0.40.0
 * re-vendor (replacing the two mirrors above) while keeping their behaviour
 * on UNKNOWN literals honest-neutral, exactly as the UI's
 * `classifyValueProvenance` does today (null, never a guessed class).
 */
export const OBSERVED_STATE_SOURCE_LITERALS = [
  'brief_extraction',
  'explicit',
  'cee_inference',
  'inferred',
  'cee_repair',
  'user_override',
  'user_confirmed',
  'user',
  'user_edited',
  'user_calibration',
  'user_assumption',
  'panel_elicited',
] as const;

export const KnownObservedStateSource = z.enum(OBSERVED_STATE_SOURCE_LITERALS);
export type KnownObservedStateSourceLiteral = z.infer<typeof KnownObservedStateSource>;

export const ObservedStateSchema = z.object({
  value: z.number(),
  std: z.number().positive().optional(),
  reasoning: FactorReasoningSchema.optional().describe('Model rationale and supplied context references, not evidence authority. Absence means no model reasoning was recorded.'),
  value_tier: FactorValueTierSchema.optional().describe('Existing producer classification. Absence means no tier was declared; source attribution remains independent. fallback_default explicitly marks a resilience value. inferred_with_evidence alone is not evidence authority.'),
  baseline: z.number().optional(),
  unit: z.string().optional(),
  /**
   * How the value entered the model. A FREE STRING on the wire (see
   * `OBSERVED_STATE_SOURCE_LITERALS` above for the declared vocabulary and
   * for why the field is deliberately not narrowed to it). Absence means the
   * producer stamped no provenance — a consumer MUST NOT read absence as any
   * particular class; classify unknown/absent as neutral, never guess.
   */
  source: z.string().optional(),
  /**
   * 0.31.0 additive (ROADMAP 2.193). The declared scale of `value` — see
   * `DeclaredScale` above for the full producer/consumer/failure contract.
   * Absence means UNDECLARED and MUST fail open to today's behaviour.
   */
  declared_scale: DeclaredScale.optional(),
  /**
   * 0.40.0 additive (PR4 evidence loop). WHOSE panel answer this value was
   * applied from: `{round_id, participant_id}`, ids only — display names are
   * resolved at render and NEVER persisted (R-2 redaction rule; see
   * `RoundParticipantRefSchema`). Server-stamped by CEE only after verifying
   * the claim against its own collab store (INV-F).
   *
   * ABSENCE SEMANTICS — DISTINCT: absent means "this value was not applied
   * from a panel round" (which is every value written before 0.40.0 and
   * every non-panel write after it). Absence NEVER means "attribution lost".
   * Producer rule: CEE stamps `elicited_from` and `source: 'panel_elicited'`
   * together — a consumer may key display off either, but only
   * `elicited_from` carries the identity.
   */
  elicited_from: RoundParticipantRefSchema.optional(),
}).passthrough();

export type ObservedStateType = z.infer<typeof ObservedStateSchema>;

const QuantifiedPriorSchema = z.object({
  distribution: z.string(),
  range_min: z.number(),
  range_max: z.number(),
  ...factorScaleFields,
  source: z.string().optional().describe('Who supplied this distribution. Absence is unattributed and must not be guessed.'),
  reasoning: FactorReasoningSchema.optional().describe('Model rationale and supplied context references, not evidence authority. Absence means no model reasoning was recorded.'),
  value_tier: FactorValueTierSchema.optional().describe('Existing producer classification. Absence means no tier was declared; source attribution remains independent. fallback_default marks resilience support, not a defensible estimate.'),
  prior_is_unquantified: z.boolean().optional().describe('True identifies legacy ignorance support, not knowledge. Absent and false both mean no ignorance marker; neither establishes evidence or permission to compute.'),
}).passthrough();

/** Numeric distributions retain their existing carrier. Explicit unknown has no numeric claim. */
export const PriorSchema = z.union([QuantifiedPriorSchema, UnquantifiedPriorSchema]);

export type PriorType = z.infer<typeof PriorSchema>;

export const StateSpaceSchema = z.object({
  range: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
}).passthrough();

// ----------------------------------------------------------------------------
// goal_threshold_frame — 0.31.0 additive (ROADMAP 2.258)
// ----------------------------------------------------------------------------

/**
 * The FRAME a `goal_threshold` is stated in. 0.31.0 additive.
 *
 * WHY THIS EXISTS. ROADMAP 2.258: the goal probability has never been
 * meaningful. CEE mints `goal_threshold` as an absolute LEVEL (a target
 * revenue divided by a cap); ISL's goal samples are CHANGES FROM BASELINE
 * (the do-nothing option's median runs negative). Nobody converts. So the
 * engine answers "P(revenue CHANGE >= X)" for a user who asked "P(revenue
 * LEVEL >= X)", and the answer is a STRUCTURAL ZERO — 0 in nine of ten live
 * instances, every one `status: computed`, on decisions whose options
 * separate cleanly. The number was never discovered; it was forced by
 * construction.
 *
 * NOTHING COULD HAVE CAUGHT IT, WHICH IS WHY THE FIX IS A CONTRACT FIELD. The
 * existing guard refuses `<= 0` / `>= 1` and `0.8` is a perfectly sensible
 * VALUE — the defect lives in the threshold's FRAME, which no value guard can
 * test. Attesting the frame on the wire makes a level/delta mismatch fail
 * LOUD instead of silently computing the wrong question.
 *
 *   * `level` — an absolute target on the metric's own scale ("revenue of
 *     GBP 6M"), the frame CEE mints today.
 *   * `delta` — a change from the observed baseline ("revenue UP by GBP 6M"),
 *     the frame ISL's samples are already in.
 *
 * PRODUCER: CEE, stamped at its single mint site (`goal-threshold-cap.ts`) as
 * a **CODE CONSTANT**. This field is NEVER LLM-derivable and must never be
 * placed in a drafting prompt's output surface — the frame is a property of
 * the minting arithmetic, not of the user's phrasing, and an LLM writing it
 * would be guessing at exactly the seam this field exists to make certain.
 *
 * CONSUMERS: ISL owns the conversion at its single comparison site, because it
 * alone knows its sample frame and holds the `observed_state` baselines.
 *
 * ⚠ PLoT DOES NOT FORWARD THIS FIELD TODAY, AND WILL NOT BY DEFAULT. Verified
 * at PLoT tip `9beb4229`: `toISLNode` (`translator-v3.ts:233-242`) is a
 * SIX-FIELD CONSTRUCTOR and `ISL_DECLARED_OBSERVED_STATE_FIELDS` is a
 * TEN-MEMBER ALLOW-LIST — neither carries this key, and neither fails loud
 * when the contract gains a field. (`translator-v3.ts:534` is the
 * `goal_threshold` SCALAR line, not a node-level passthrough — do not read it
 * as one.) So PLoT must ADD forwarding, either by extending `toISLNode` or by
 * carrying a request-level scalar beside `goal_threshold`; it rides the 2.258
 * PLoT stint. Until it does, the frame stamped by CEE is STRUCTURALLY DELETED
 * at the V3→ISL boundary — which is safe (ISL fails closed and renders no goal
 * probability) but is NOT the same thing as "it arrives".
 *
 * FAILURE SEMANTICS — FAIL CLOSED. When the frame is absent, OR when the
 * frame is `level` and no baseline is available for the conversion, the
 * consumer MUST produce NO goal probability at all. A missing number is
 * honest; a confident wrong one is not. This is why PLoT #299 was reverted on
 * staging rather than left serving "< 1%".
 *
 * ADOPTION SEQUENCING (hazard 1) — HARD DEPLOY ORDER, and it is not
 * negotiable: schemas 0.31.0 -> ISL converter deploy-verified on staging ->
 * ONLY THEN does PLoT re-land #299. Re-landing the plumbing first would
 * resurrect the structural-zero "< 1%" untruth. CEE's stamp may land at any
 * time: an older-pinned PLoT strips the unknown key, which degrades to
 * dark-but-honest (no frame -> no probability), never to a wrong number.
 *
 * PROVENANCE-EXTENSIBLE BY DESIGN, DELIBERATELY AS A SIBLING. ROADMAP 2.215
 * will want to record HOW the frame was established (code constant today; an
 * infer-or-elicit coaching moment later). That arrives as a NEW OPTIONAL
 * SIBLING KEY on this same `.passthrough()` node — e.g.
 * `goal_threshold_frame_provenance` — which is additive by construction.
 * Widening THIS field into an object would be a breaking change, so it stays
 * a scalar enum: the sibling path is what lets 2.215 land without a second
 * contract train.
 */
export const GoalThresholdFrame = z.enum(['level', 'delta']);
export type GoalThresholdFrameType = z.infer<typeof GoalThresholdFrame>;

// ----------------------------------------------------------------------------
// goal_direction — reconciled from schemas #48 for the objective-authority train.
// ----------------------------------------------------------------------------

/**
 * The user's stated objective for the selected goal node.
 * maximise/minimise compare the propagated outcome; target compares distance
 * from goal_threshold in its declared goal_threshold_frame. The target reuses
 * the existing threshold carrier, but nearest-target ranking and threshold
 * attainment are different statistical questions.
 *
 * Absence is unknown and withholds comparison. Producers must not infer this
 * field from a node label. Only the selected goal node supplies the objective;
 * PLoT forwards it to ISL's request-level goal_direction.
 */
export const GoalDirection = z.enum(['maximise', 'minimise', 'target']);
export type GoalDirectionType = z.infer<typeof GoalDirection>;

export const NodeV3Schema = z.object({
  id: z.string().min(1).max(100).regex(NODE_ID_PATTERN),
  kind: NodeKind,
  label: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  type: z.enum(['numeric', 'ordinal', 'nominal', 'boolean']).optional(),
  categories: z.array(z.string()).optional(),
  category: FactorCategory.optional(),
  observed_state: ObservedStateSchema.optional(),
  state_space: StateSpaceSchema.optional(),
  goal_threshold: z.number().optional(),
  /**
   * 0.31.0 additive (ROADMAP 2.258). The frame `goal_threshold` is stated in
   * — see `GoalThresholdFrame` above for the full contract. Absence means
   * UNATTESTED and consumers MUST fail closed (no goal probability).
   */
  goal_threshold_frame: GoalThresholdFrame.optional(),
  /**
   * The stated objective of this goal. Absence is unknown, never maximise.
   */
  goal_direction: GoalDirection.optional(),
}).passthrough();

export const StrengthSchema = z.object({
  mean: z.number().min(-1).max(1),
  std: z.number().positive(),
});

export const EffectDirection = z.enum(['positive', 'negative', 'unknown']);
export type EffectDirectionType = z.infer<typeof EffectDirection>;

export const EdgeType = z.enum(['directed', 'bidirected']);
export type EdgeTypeType = z.infer<typeof EdgeType>;

export const EdgeV3Schema = z.object({
  from: z.string().min(1).max(100),
  to: z.string().min(1).max(100),
  strength: StrengthSchema,
  exists_probability: z.number().min(0).max(1),
  effect_direction: EffectDirection.optional(),
  edge_type: EdgeType.optional().default('directed'),
  label: z.string().optional(),
}).passthrough();

export const GraphV3Schema = z.object({
  nodes: z.array(NodeV3Schema),
  edges: z.array(EdgeV3Schema),
}).passthrough();

export const TopologyPlanSchema = z.array(z.string());
export type TopologyPlan = z.infer<typeof TopologyPlanSchema>;

// Inferred types
export type NodeV3 = z.infer<typeof NodeV3Schema>;
export type EdgeV3 = z.infer<typeof EdgeV3Schema>;
export type GraphV3 = z.infer<typeof GraphV3Schema>;
export type NodeKindType = z.infer<typeof NodeKind>;
export type FactorCategoryType = z.infer<typeof FactorCategory>;

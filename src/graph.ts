import { z } from 'zod';
import { RoundParticipantRefSchema } from './boundary/collab.js';

export const NODE_ID_PATTERN = /^[a-z0-9_:-]+$/;

export const NodeKind = z.enum([
  'goal', 'factor', 'outcome', 'risk', 'action',
  'decision', 'option', 'constraint',
]);

export const FactorCategory = z.enum(['controllable', 'observable', 'external']);

// ----------------------------------------------------------------------------
// declared_scale — 0.31.0 additive (ROADMAP 2.193; the fix path for 2.159)
// ----------------------------------------------------------------------------

/**
 * The DECLARED scale of a factor's `value`. 0.31.0 additive.
 *
 * WHY THIS EXISTS. ROADMAP 2.159 found normalised factors accepting
 * out-of-range values end-to-end (a `1.5` on a `[0,1]` factor accepted and
 * persisted). The #766 review then proved that no derivation from the CURRENT
 * VALUE can be sound in either direction — a `0` or `1` is a legal raw count
 * AND a legal proportion, so a classifier cannot be built. The conclusion of
 * record (2.193): the scale must be DECLARED by the producer that knows it,
 * never inferred by a consumer that does not.
 *
 * VOCABULARY DERIVED, NOT INVENTED. These three members are the classes CEE's
 * draft/edit prompt `SCALE_DISCIPLINE` already distinguishes at draft time —
 * the knowledge exists upstream today and is thrown away before the wire:
 *   * `unit_interval` — a proportion or a cap-normalised magnitude. Admissible
 *     `[0, 1]`. Covers BOTH SCALE_DISCIPLINE's bounded-percentage rule
 *     ("3% churn -> value 0.03") and its normalisation rule (cost / revenue /
 *     headcount expressed as `raw_value / cap`).
 *   * `ratio` — a ratio that can meaningfully exceed 100% (NRR, growth, ROI).
 *     Admissible `[0, +inf)`; `1.0` is parity. SCALE_DISCIPLINE's own test is
 *     "can this metric meaningfully exceed 100%?" — a `yes` lands here.
 *   * `raw_count` — a magnitude left un-normalised in `unit` (SCALE_DISCIPLINE
 *     permits this for small unitless counts). Admissible `[0, +inf)`.
 *
 * PRODUCER: CEE, stamped by the draft/edit transform that already applies
 * SCALE_DISCIPLINE. CONSUMERS: CEE's own value-edit authority check (enforce
 * against the DECLARED scale only) and the UI (a min/max input hint derived
 * from `DECLARED_SCALE_BOUNDS` below, never re-implemented client-side).
 *
 * FAILURE SEMANTICS — FAIL OPEN, DELIBERATELY, AND ONLY HERE. Absence means
 * UNDECLARED, which is every graph drafted before this field existed. A
 * consumer MUST NOT treat absence as `unit_interval`: that is the unsound
 * guess 2.193 exists to retire, and it would refuse legal values on stored
 * graphs. Enforce a bound only where the scale is declared; where it is
 * absent, behave exactly as today (no bound, no hint). This is the one field
 * in the 0.31.0 set whose absence-behaviour is permissive rather than closed,
 * because the alternative is breaking every pre-existing graph.
 *
 * ADOPTION SEQUENCING (hazard 1 — an older-pinned consumer silently DROPS an
 * unknown key): CEE may stamp as soon as it re-vendors; the UI hint and the
 * CEE authority check may adopt in any order after that. No consumer needs
 * the others, because absence is the status quo everywhere.
 */
export const DeclaredScale = z.enum(['unit_interval', 'ratio', 'raw_count']);
export type DeclaredScaleType = z.infer<typeof DeclaredScale>;

/**
 * The admissible range each declared scale licenses — the AUTHORITY BOUND.
 *
 * Exported so the bound is DERIVED from the declaration in one place instead
 * of being re-implemented in CEE's validator and again in the UI's input hint.
 * Two hand-written copies of a server rule is the estate's dominant defect
 * class (trap 12) and is precisely what ROADMAP 2.193 refused to ship.
 *
 * `null` means UNBOUNDED ON THAT SIDE — never "no bound was computed". Both
 * ends are `number | null`.
 *
 * WHY `min` IS NULLABLE WHEN NO CURRENT MEMBER USES IT (adversarial-review
 * amendment, and the reasoning is the useful part): every scale today has a
 * floor of 0, so `min: number` would have been sufficient — but `ratio` is
 * only non-negative under the MULTIPLIER convention this table assumes (1.0 =
 * parity, 1.10 = 110%, matching SCALE_DISCIPLINE's NRR/growth/ROI examples).
 * A signed-return convention (-0.2 for a 20% loss) is a perfectly ordinary way
 * to state the same metrics and is unbounded below. Widening the TYPE now is
 * free because the table has zero consumers; widening it after publication
 * would be a breaking change to every consumer that had narrowed on it. The
 * VALUES still assert the multiplier convention — that is a real claim, and a
 * producer using signed returns must declare `raw_count`, not `ratio`.
 */
export const DECLARED_SCALE_BOUNDS: Readonly<
  Record<
    DeclaredScaleType,
    { readonly min: number | null; readonly max: number | null }
  >
> = Object.freeze({
  unit_interval: Object.freeze({ min: 0, max: 1 }),
  ratio: Object.freeze({ min: 0, max: null }),
  raw_count: Object.freeze({ min: 0, max: null }),
});

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
  /**
   * ⭐ THE FACTOR'S LEVEL — AND *WHICH* LEVEL IT IS DEPENDS ON `baseline`.
   *
   * `value` answers ONE of two questions and THE DISAMBIGUATOR IS A SIBLING
   * FIELD, which is why it must be stated here rather than left to each
   * consumer to decide:
   *
   *   * `baseline` ABSENT — `value` is the level the factor is at TODAY (the
   *     current observed level). This is the COMMON case: measured at CEE
   *     staging `7aa49ec8`, 9 of the 13 `factors.push` mint sites in
   *     `src/cee/factor-extraction/index.ts` write no `baseline`.
   *   * `baseline` PRESENT AND DIFFERENT from `value` — `value` is the
   *     PROPOSED level and `baseline` is the current one. A brief phrased
   *     "from X to Y" lands as `{value: Y, baseline: X}`, so the factor is
   *     born AT ITS TARGET. A consumer that reads `value` as "today" here
   *     will conclude that an option changing the factor to Y changes
   *     nothing.
   *   * `baseline` PRESENT AND EQUAL to `value` — ONE number stamped TWICE,
   *     not a from-to. Goal and constraint-target writers do this
   *     deliberately, in model units, beside a raw `raw_value` (CEE
   *     `src/cee/transforms/schema-v3.ts:353-355`, whose own comment states
   *     it: "Both fields therefore carry the SAME single extracted number").
   *     A consumer MUST NOT read the equal case as an intervention.
   *
   * SCALE. `value` is on the MODEL scale — for a capped factor,
   * `raw_value / cap` (`src/boundary/turn-payload.ts:196-197`; see also
   * `declared_scale` below, which is how a producer ATTESTS the scale rather
   * than leaving a consumer to guess it). `baseline` is NOT guaranteed to be
   * on the same scale — see its own note.
   *
   * WHY THIS IS WRITTEN DOWN AT ALL. While these two fields were bare, every
   * consumer grew a private and unreviewable opinion of them, and the
   * opinions CONTRADICT. Two live readers in ONE repo, derived at CEE staging
   * `7aa49ec8`: `src/validators/option-no-op.ts:144-170` reads `baseline` as
   * "the level the user stated the factor is at today"; and
   * `src/orchestrator-v5/tools/handlers/whatif/build-counterfactual-model.ts:205-214`
   * reads the same field as the intervention TARGET ("then a `baseline` that
   * differs from the current value") while treating `value` as current. Same
   * field, opposite meanings, both shipped. The only definition that existed
   * anywhere was CEE-local (`src/schemas/graph.ts:157`), where the other
   * three services could not see it — the hand-maintained-mirror defect
   * (trap 12) in its purest form: no mirror at all, just four guesses.
   */
  value: z.number(),
  std: z.number().positive().optional(),
  /**
   * ⭐ THE LEVEL THE FACTOR IS AT TODAY — THE *FROM*, NEVER THE *TO*.
   *
   * For a brief phrased "from X to Y", `baseline` is X and `value` is Y. It
   * is the PRE-INTERVENTION level: where the factor sits before any option is
   * applied. It is NEVER an intervention target and NEVER a ceiling — a
   * declared ceiling is `cap`, and what an option would MAKE the factor
   * become is carried by that option, not here.
   *
   * PRODUCER RULE — DERIVED AT THE BYTES (CEE staging `7aa49ec8`), NOT
   * INFERRED FROM THE NAME. Every writer means the same thing by it. The
   * regex from-to extractors write the FROM number
   * (`src/cee/factor-extraction/index.ts:2177/2200/2224/2272` — the four of
   * thirteen mint sites that populate it at all); the LLM factor extractor is
   * instructed "baseline: (optional) Starting value for from-to patterns"
   * (`src/cee/factor-extraction/llm-extractor.ts:78`); the structural-edit
   * tool declares it to the model as "The amount before any change, when it
   * differs" (`src/orchestrator-v5/tools/propose-structural-edit.ts:1029`).
   * The drafting prompt never asks for it, so no LLM draft authors one.
   *
   * ABSENCE SEMANTICS — DISTINCT, AND ABSENCE IS THE NORMAL CASE. Absent
   * means "no separate current level was stated". It does NOT mean the
   * current level is unknown, and it does NOT mean nothing changes: where
   * `baseline` is absent, `value` IS the current level (see `value` above).
   * A consumer MUST NOT default this field, MUST NOT read absence as zero,
   * and MUST NOT synthesise it from a goal threshold or a cap.
   *
   * ⚠⚠ THE SCALE — DO NOT ASSUME IT MATCHES `value`. THIS IS THE FIELD'S
   * SHARPEST HAZARD AND IT IS ASYMMETRIC BY CONSTRUCTION. `baseline` is on
   * whatever frame `value` was on AT WRITE TIME, and a LATER reframe of
   * `value` DOES NOT REFRAME IT. Both halves measured at CEE staging
   * `7aa49ec8`:
   *
   *   1. The extractors write the pair on ONE frame — raw beside raw for a
   *      currency from-to (`index.ts:2200`: `{value: 59, baseline: 49}`),
   *      already-divided beside already-divided for a percent one
   *      (`index.ts:2217-2227`: both `/ 100`).
   *   2. `src/cee/factor-extraction/enricher.ts:1494-1495` then divides
   *      `value` by `cap` and copies `baseline` through UNTOUCHED, and
   *      `src/cee/transforms/schema-v3.ts:396-397` passes both on with NO
   *      further scaling.
   *
   * The shape that reaches the wire is therefore `{value: 0.59,
   * raw_value: 59, baseline: 49}` — `value` framed, `baseline` raw.
   *
   * SO, THE CONSUMER RULE: recover the frame from the `{value, raw_value}`
   * pair (or from a producer-stamped scale carrier) and divide `baseline` by
   * it before comparing the two — but ONLY where `baseline` and `value`
   * DIFFER. Reading `baseline` raw against a model-scale `value` is an error
   * the size of the cap (100x in the witnessed 59/0.59 case); dividing in the
   * EQUAL case, where the pair is already in model units, is the same error
   * in the other direction. CEE's `readStatedCurrentLevel`
   * (`src/validators/option-no-op.ts:144-170`) is the worked implementation
   * of exactly this rule.
   *
   * ⚠ `raw_value` and `cap` are NOT declared members of this object. They
   * ride `.passthrough()`, so the frame-recovery pair a consumer needs is
   * itself untyped here.
   */
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

export const PriorSchema = z.object({
  distribution: z.string(),
  range_min: z.number(),
  range_max: z.number(),
}).passthrough();

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

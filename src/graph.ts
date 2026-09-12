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
   * ⭐ THE LEVEL THE FACTOR IS AT TODAY, ON THE MODEL SCALE.
   *
   * `value` is the CURRENT level: where the factor sits before any option is
   * applied. What an option would MAKE the factor become is carried by that
   * option, not by this object. See TWO QUESTIONS below, because the two are
   * easy to read as one.
   *
   * THE PROPERTY, STATED AGAINST THE SPEC RATHER THAN AGAINST ANY FAILURE
   * MODE: where an extracted factor states a current level distinct from the
   * value beside it, the node's current-level fields carry that stated level,
   * on the frame the node's own cap defines. That is a rule about levels, not
   * about prices. It holds for a rate, a count or a duration exactly as it
   * holds for a currency.
   *
   * SCALE. `value` is on the MODEL scale. For a capped factor that is
   * `raw_value / cap`, already stated in this package at
   * `src/boundary/turn-payload.ts:196-197`. For a factor with no cap the
   * number stands as written, so a rate stated as 85% arrives as 0.85 and must
   * not be divided again. `declared_scale` (below) is how a producer attests
   * the scale instead of leaving a consumer to recover it.
   *
   * ⚠ TWO QUESTIONS LIVE NEAR THIS FIELD. A sentence about "the value" governs
   * both and will be wrong about one, so they are named apart here:
   *
   *   * WHAT LEVEL IS THIS FACTOR AT? Carried by a FACTOR node's
   *     `observed_state`, where `value` is the CURRENT level. This object
   *     answers only this question.
   *   * WHAT MAGNITUDE DOES AN INTERVENTION PROPOSE? Carried by an OPTION.
   *     The target is a model-unit TO, and where the scale cannot be resolved
   *     the producer refuses rather than divides.
   *
   * Same word, opposite point in time, different carriers. The producer states
   * it in the same terms: "the node carries where the factor IS, and the
   * brief's target reaches the analysis on the OPTION's intervention"
   * (`Talchain/olumi-assistants-service`,
   * `src/cee/factor-extraction/enricher.ts:1466-1467`, read at `712dd599`).
   *
   * A consumer that DISPLAYS a magnitude needs the user-scale number and not
   * this one. The formatter refuses any non-integer
   * (`src/orchestrator-v5/compose/format-factor-value.ts:102`), so a
   * model-scale 0.49 formats as nothing at all. Model units and display units
   * are therefore two named fields, not one field read twice.
   *
   * WITHDRAWN, AND LEFT ON THE PAGE RATHER THAN TIDIED AWAY (trap 14). An
   * earlier revision of this comment said `value` holds the PROPOSED level
   * whenever `baseline` is present and different, and gave
   * `{value: 0.59, raw_value: 59, baseline: 49}` for the brief "from GBP 49 to
   * GBP 59" as its worked example. That shape is a measured defect, not the
   * contract: it showed a user their TARGET as the present state of their
   * business. It is fixed and pinned, and for the same brief the shape is now
   * `{value: 0.49, raw_value: 49, baseline: 49, cap: 100}`, asserted at
   * `src/cee/factor-extraction/__tests__/factor-current-level-is-the-stated-baseline.test.ts:122-126`.
   * The reasoning that produced the wrong example is worth keeping too: it
   * counted `factors.push` sites, and those mint an extractor-internal
   * candidate rather than an `ObservedState`. The two share a field name and
   * part company at `enricher.ts:1468`, which is precisely where a stated
   * current level is moved into `value`.
   *
   * ⚠ THIS IS A STATEMENT ABOUT WHAT PRODUCERS WRITE, AND A STORED GRAPH MAY
   * HAVE BEEN WRITTEN BY AN OLDER ONE. A consumer that must be right about a
   * graph it did not just receive should read the level through the canonical
   * reader named under `baseline`, not infer it from the pair. One guarded
   * branch for a graph whose `value` is not the current level survives at
   * `src/orchestrator-v5/tools/handlers/whatif/build-counterfactual-model.ts:338-349`,
   * written so that it cannot fire once the two surfaces agree.
   */
  value: z.number(),
  std: z.number().positive().optional(),
  /**
   * ⚠⚠ `baseline` HAS NO SINGLE SCALE. IT IS IN THE UNITS OF THE `value` IT
   * WAS WRITTEN BESIDE.
   *
   * RAW for a currency from-to (49 beside 59). ALREADY FRACTIONAL for a
   * percentage one (0.85 beside 0.95). One line in the producer decides which:
   * `baseline: isPercent ? from.raw / 100 : from.raw`
   * (`Talchain/olumi-assistants-service`,
   * `src/cee/factor-extraction/index.ts:1851`, read at `712dd599`).
   *
   * A consumer that normalises this field unconditionally is correct on the
   * currency factor and 100 times wrong on the percentage one, silently, and
   * in the plausible direction: 0.85 becomes 0.0085, and a rate of 85% renders
   * as under one per cent. Dividing where no cap exists renders EVERY
   * percentage factor 100 times wrong. Reading it raw against a model-scale
   * `value` is the same size of error in the other direction.
   *
   * THE RULE HAS TWO HALVES AND A CONSUMER NEEDS BOTH:
   *
   *   1. DIVIDE where a frame RESOLVES, taken from a stored scale frame or
   *      from the `{value, raw_value}` pair written beside this field.
   *   2. DO NOT DIVIDE where no frame resolves. Hold the number in its own
   *      units, or decline to answer. Do not guess a divisor, and do not
   *      reach for `cap` as one.
   *
   * A test kit for a consumer of this field needs a NON-DIVISION case for
   * every DIVISION case it pins, or it cannot see half of this.
   *
   * WHAT IT HOLDS. The level the factor is at today: the level a user stated,
   * before any option is applied. It is never an intervention target and never
   * a ceiling. A declared ceiling is `cap`.
   *
   * BESIDE A CURRENT `value`, `baseline` RESTATES THE SAME LEVEL. It is not
   * the other end of a from-to. For "from GBP 49 to GBP 59" the pair is
   * `{value: 0.49, baseline: 49}`: one level, two frames. Where the two are
   * numerically EQUAL they are one number stamped twice, already in model
   * units, and dividing there is the error above in the other direction. Goal
   * and constraint-target writers stamp the equal pair deliberately
   * (`src/cee/transforms/schema-v3.ts:352-354`).
   *
   * ⭐ THE CANONICAL READER, SO A CONSUMER NEED NOT HOLD A PRIVATE OPINION.
   * `readFactorBaselineLevel` is DEFINED at
   * `src/validators/option-no-op.ts:198`;
   * `src/validators/graph-validator.ts:270` re-exports it and is not a second
   * definition. Its precedence is a stated current level first, then
   * `observed_state.value`, then `data.value`. Its refusal semantics are worth
   * echoing verbatim, because they are the safe direction: it "Returns
   * `undefined` when no surface carries a finite number. That is NOT a no-op
   * verdict: a factor the brief states no value for cannot prove an option
   * changes nothing."
   *
   * PRODUCERS AGREE ON WHAT THEY MEAN BY THE FIELD. The from-to extractors
   * write the FROM number; the model is instructed "baseline: (optional)
   * Starting value for from-to patterns"
   * (`src/cee/factor-extraction/llm-extractor.ts:78`) and, at the edit tool,
   * "The amount before any change, when it differs."
   * (`src/orchestrator-v5/tools/propose-structural-edit.ts:1029`). The
   * drafting prompt never asks for it, so no drafted graph authors one.
   *
   * ABSENCE IS THE NORMAL CASE, AND IT IS DISTINCT. Absent means no separate
   * current level was stated, so `value` alone carries the level. It does NOT
   * mean the current level is unknown, and it does NOT mean nothing changes. A
   * consumer MUST NOT default this field, MUST NOT read absence as zero, and
   * MUST NOT synthesise it from a goal threshold or from a cap.
   *
   * ⚠ A STATED LEVEL CAN SIT ABOVE THE FACTOR'S OWN `cap`. "cut the unit cost
   * from GBP 150 to GBP 90" states a current level of 150 while the point
   * picked out of the sentence is 90, so a cap chosen around 90 leaves the
   * stated level above its own ceiling, and normalising it puts the factor off
   * the top of its own scale. The producer rule is that the scale has to cover
   * what the user wrote, not the point a service picked out of it. A consumer
   * that finds `baseline` greater than `cap` is holding a factor whose scale
   * does not cover it, which is not the same thing as a value out of range.
   *
   * ⚠ `raw_value` and `cap` are NOT declared members of this object. They ride
   * `.passthrough()`, so the pair a consumer needs in order to recover a frame
   * is itself untyped here.
   *
   * THIS IS NOT THE ONLY STATEMENT OF THIS CONTRACT, AND WRITING IT DOWN DOES
   * NOT REDUCE THE COUNT. Read at the bytes, the same field is described in at
   * least eleven places across this package and
   * `Talchain/olumi-assistants-service`. Among them, here:
   * `src/boundary/turn-payload.ts:194-199`, `src/boundary/blocks.ts:235-236`
   * and `src/orchestrator/editable-fields.ts:244`. And there:
   * `src/schemas/graph.ts:157-158` and `:261-263`, whose `value` line reads
   * "The factor's current position on the model 0-1 scale" with no condition
   * attached. Several of those objects are `.passthrough()`, so an untyped
   * `baseline` rides through the very schema that documents `value`. A
   * definition four services must remember to keep in step with is a
   * hand-maintained mirror (trap 12). Consumers importing one reader, rather
   * than each holding an opinion, is what would retire the others; this
   * comment is the precondition for that and not a substitute for it.
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

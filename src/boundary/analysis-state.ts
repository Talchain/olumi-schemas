import { z } from 'zod';

// ============================================================================
// 0.46.0 — AnalysisStateV1: ONE composed analysis-state verdict.
//
// Analysis-state authority migration, STEP 2 (contract only). CEE emits ONE
// `analysis_state` per turn on the turn envelope, beside `analysis_ready`
// (OlumiResponseSchema.analysis_state). It is intended to become the SINGLE
// wire authority every surface consumes for "what is the state of the
// analysis, and what may I say about it".
//
// THE DEFECT CLASS THIS EXISTS TO CLOSE. Today each surface derives its own
// answer to that question from a different subset of the payload — a status
// string here, a freshness comparison there, an entitlement flag somewhere
// else — and the derivations disagree. Trap 21 in the estate's doctrine is
// exactly this shape measured in production: two authorities answering
// DIFFERENT questions under SIMILAR names, so a confirmation withheld a
// leader while the coaching sentence beneath it named one. A composed verdict
// computed ONCE by the producer is the structural fix: every surface reads the
// same fields, so two surfaces CANNOT disagree about a fact neither of them
// derives.
//
// WHAT IS DELIBERATELY NOT HERE, and why:
//   * NO consumer-derivable convenience. `requires_rerun` and friends are
//     producer-computed because a consumer recomputing them re-opens the
//     divergence this shape exists to close (the RunDelta S3 precedent: the
//     UI renders with ZERO client-side computation).
//   * NO cross-field refinement. Every composition rule below is stated as
//     LICENCE in a `.describe()` and is NOT enforced by the parser — see
//     "DISCLOSED LIMITS" at the foot of this header. Encoding a rule whose
//     producer does not yet exist would be this package guessing CEE's
//     semantics, which is trap 13c (a perfect score against a wrong oracle).
//     The gaps are named and pinned by tests rather than left for a reader to
//     assume closed — the AnalysisFactSchema 0.27.0 precedent.
//   * NO closed vocabulary for `reason_code`, `category`, `repairability`,
//     `readiness.status`, `aggregate_level` or `separation`. Those vocabularies
//     live with the producer (CEE), and a closed enum here would be a
//     hand-maintained mirror of a registry this package does not own — the
//     `metric_id` / `reason_code` rationale from analysis-fact.ts, applied
//     identically. Where the ratified design DID close a vocabulary
//     (`run_state.kind`, the two `cause` axes) it is closed here.
//
// THE DATA-VS-DESIGNATION DOCTRINE, because it is the reason `leader_claim`
// is a separate member rather than a boolean beside the numbers: withholding
// a leader claim drops the DESIGNATION ("Option B leads") and keeps the DATA
// (the win probabilities). A consumer that hides the probabilities when the
// designation is withheld has over-applied the rule; a consumer that names a
// leader from the probabilities when it is withheld has defeated it.
//
// DISCLOSED LIMITS (stated, not assumed closed):
//   L1. `leader_claim.permitted: true` alongside `withheld_reason` PARSES.
//       The two are contradictory in meaning and the parser does not refuse
//       the contradiction, because this package cannot yet derive from a
//       producer whether the pair is genuinely unreachable.
//   L2. The five usability booleans are not cross-checked against `run_state`.
//       `blocked_unusable: true` under `kind: 'complete_current'` PARSES.
//   L3. `contradictions` is the producer's OWN self-report of disagreements it
//       detected while composing this verdict. An empty array asserts the
//       producer found none — it is NOT evidence that none exist.
//   Each limit is pinned by a named test in
//   `tests/boundary/analysis-state-0.46.test.ts`, so it is visible in the
//   suite rather than invisible to it. They are the first questions for the
//   one-shot external adjudication this contract is earmarked for.
// ============================================================================

// ----------------------------------------------------------------------------
// Blockers — the per-option / per-factor actionability unit
// ----------------------------------------------------------------------------

/**
 * One reason the model cannot be analysed, scoped as precisely as the producer
 * can scope it.
 *
 * NOT the same shape as the root namespace's `ValidationBlocker` interface
 * (`src/validation.ts`), and deliberately differently named: that one is a
 * camelCase TypeScript interface describing the UI's OWN pre-run checks, has
 * no Zod schema, and never crosses this wire. Two shapes with one name is the
 * estate's chronic twin defect — so this one is `AnalysisBlocker`.
 */
export const AnalysisBlockerSchema = z
  .object({
    code: z.string().min(1).describe(
      'Machine code for this blocker, producer-owned and never user-facing prose. ' +
        'A consumer maps the code to its OWN display copy; it must not render the code ' +
        'itself and must not parse meaning out of its spelling. Free string by design: ' +
        'the blocker vocabulary lives with CEE, and a closed enum here would reject codes ' +
        'a newer producer legitimately emits.',
    ),
    category: z.string().min(1).describe(
      'The producer\'s grouping for this blocker (e.g. a structural family vs a ' +
        'missing-input family), used by a consumer to group or order blockers in a list. ' +
        'Producer-owned vocabulary, same rationale as `code`. It is a presentation aid, ' +
        'never a severity: nothing here licenses treating one category as more urgent ' +
        'than another.',
    ),
    message: z.string().min(1).describe(
      'The producer-authored, user-facing sentence for this blocker, rendered VERBATIM. ' +
        'CEE owns all user-facing language; a consumer must not rewrite, summarise, ' +
        'truncate for meaning, or synthesise a substitute when it dislikes the wording.',
    ),
    repairability: z.string().min(1).describe(
      'What kind of repair, if any, would clear this blocker — the producer\'s verdict on ' +
        'whether and how it can be fixed. It licenses a consumer to OFFER a repair ' +
        'affordance; it does not promise that applying one will succeed. Producer-owned ' +
        'vocabulary (free string), same rationale as `code`.',
    ),
    option_id: z.string().min(1).optional().describe(
      'The option this blocker is scoped to, by ID. ABSENCE IS DISTINCT: absent means the ' +
        'blocker is not scoped to any single option (it is model-level, or the producer ' +
        'could not attribute it), NEVER "all options" and never a default. Identity-bound ' +
        'on purpose (trap 19): a consumer attaches the blocker by this id, never by ' +
        'matching `option_label`, which duplicates and is renamed.',
    ),
    option_label: z.string().min(1).optional().describe(
      'Display label for `option_id`, carried so a consumer can render the blocker ' +
        'without a second lookup. NEVER an identifier: do not match, join or deduplicate ' +
        'on it. ABSENCE IS DISTINCT: absent means no label travelled, not that the option ' +
        'is unnamed — when it is absent and `option_id` is present, a consumer resolves ' +
        'the label from its own model or renders the blocker unscoped.',
    ),
    factor_id: z.string().min(1).optional().describe(
      'The factor this blocker is scoped to, by ID — the field the UI\'s ' +
        'draft-missing-values affordance consumes to focus the exact input that needs a ' +
        'value. ABSENCE IS DISTINCT: absent means the blocker is not scoped to any single ' +
        'factor, never "all factors". Identity-bound; see `option_id`.',
    ),
    factor_label: z.string().min(1).optional().describe(
      'Display label for `factor_id`. NEVER an identifier — same rule as `option_label`. ' +
        'ABSENCE IS DISTINCT: absent means no label travelled, not that the factor is ' +
        'unnamed.',
    ),
  })
  .strict()
  .describe(
    'One reason the model cannot be analysed, carrying per-option and per-factor scope so ' +
      'a consumer can make it actionable at the exact element rather than as a page-level ' +
      'banner. Both scopes are optional and independent: a blocker may be model-level, ' +
      'option-scoped, factor-scoped, or both.',
  );
export type AnalysisBlocker = z.infer<typeof AnalysisBlockerSchema>;

// ----------------------------------------------------------------------------
// run_state — the discriminated verdict on THIS turn's analysis
// ----------------------------------------------------------------------------

/**
 * The closed `run_state.kind` vocabulary.
 *
 * ANTI-MIRROR: this list and the union's branch discriminators below are two
 * statements of one vocabulary. `analysis-state-0.46.test.ts` derives BOTH at
 * run time and asserts they are equal, so the pair fails loud on drift instead
 * of drifting quietly — the `ANALYSIS_FACT_STATUSES` precedent.
 */
export const ANALYSIS_RUN_STATE_KINDS = [
  'never_run',
  'running',
  'blocked',
  'refused',
  'complete_current',
  'complete_stale',
  'unknown_degraded',
] as const;

export const AnalysisRunStateKindSchema = z.enum(ANALYSIS_RUN_STATE_KINDS);
export type AnalysisRunStateKind = z.infer<typeof AnalysisRunStateKindSchema>;

/**
 * Why a complete result is no longer current. Closed, because the two causes
 * carry DIFFERENT remedies — re-running after a graph change re-computes
 * against new structure, whereas an options change may invalidate the
 * comparison itself — and collapsing them to one "stale" loses the only thing
 * a consumer could act on.
 */
export const AnalysisStaleCauseSchema = z.enum(['graph_changed', 'options_changed']);
export type AnalysisStaleCause = z.infer<typeof AnalysisStaleCauseSchema>;

/**
 * Why the producer cannot state a run state at all. Closed, and every member
 * is a DIFFERENT epistemic failure with a different honest sentence:
 * `store_unreadable` (the fact store could not be read this turn),
 * `legacy_fact` (a persisted fact predates the fields needed to classify it),
 * `no_graph_this_turn` (no graph was in scope, so there was nothing to
 * classify), `refusal_unverified` (a refusal was reported but could not be
 * corroborated, so the currency of any visible result is unknown).
 */
export const AnalysisDegradedCauseSchema = z.enum([
  'store_unreadable',
  'legacy_fact',
  'no_graph_this_turn',
  'refusal_unverified',
]);
export type AnalysisDegradedCause = z.infer<typeof AnalysisDegradedCauseSchema>;

const NeverRunStateSchema = z
  .object({
    kind: z.literal('never_run').describe(
      'No analysis has ever been run for this model. There is no result to show and no ' +
        'result to caveat — a consumer renders the pre-analysis affordance, never an empty ' +
        'or zeroed result surface.',
    ),
  })
  .strict();

const RunningStateSchema = z
  .object({
    kind: z.literal('running').describe(
      'An analysis is in flight as at this turn. Any result currently on screen is from an ' +
        'EARLIER run: a consumer may keep showing it but must mark it as superseded-pending, ' +
        'and must not present it as the outcome of the run now in flight.',
    ),
    started_at: z.string().datetime().describe(
      'ISO-8601 UTC timestamp at which the in-flight run started, for elapsed-time display ' +
        'and stall detection. It is the START, never an estimated completion: nothing here ' +
        'licenses a consumer to predict, display or imply a finish time.',
    ),
  })
  .strict();

const BlockedStateSchema = z
  .object({
    kind: z.literal('blocked').describe(
      'THE MODEL IS NOT ANALYSABLE as it stands (design question Q2). This is a statement ' +
        'about the model, not about a failure of the engine: no run was attempted because ' +
        'attempting one could not have produced a meaningful result. A consumer renders the ' +
        'blockers as the work to be done, never as an error.',
    ),
    reason_code: z.string().min(1).describe(
      'Machine code for the overall blocked verdict, distinct from the individual blocker ' +
        'codes below: it says why the MODEL is unanalysable, where each blocker says what ' +
        'specifically is wrong. Producer-owned vocabulary; a consumer maps it to its own copy.',
    ),
    blockers: z
      .array(AnalysisBlockerSchema)
      .describe(
        'The blockers that together make the model unanalysable. MAY BE EMPTY: a producer ' +
          'that knows the model is unanalysable but cannot itemise why emits `[]` rather ' +
          'than inventing a blocker — an empty list means "not itemised", never "nothing is ' +
          'wrong", and a consumer must keep the blocked verdict either way.',
      ),
  })
  .strict();

const RefusedStateSchema = z
  .object({
    kind: z.literal('refused').describe(
      'THIS TURN DECLINED TO ANALYSE. The new state, and the one this contract exists to ' +
        'make sayable: any result visible on screen is from an EARLIER run whose currency ' +
        'is NOT VOUCHED FOR by this turn. It is materially different from `blocked` (the ' +
        'model could not be analysed) and from `complete_stale` (the producer knows the ' +
        'result is out of date and knows why). Here the producer is declining to make any ' +
        'claim about currency at all. A consumer must not present a visible result as ' +
        'current, must not silently drop it, and must not infer freshness from its own ' +
        'timestamps.',
    ),
    reason_code: z.string().min(1).describe(
      'Machine code for why this turn declined to analyse. Producer-owned vocabulary; a ' +
        'consumer maps it to its own copy and must not render the code. There is ' +
        'deliberately NO timestamp on this branch: the refusal says nothing about when any ' +
        'visible result was computed, and supplying one would invite exactly the currency ' +
        'claim the refusal withholds.',
    ),
  })
  .strict();

const CompleteCurrentStateSchema = z
  .object({
    kind: z.literal('complete_current').describe(
      'A completed analysis whose result is CURRENT for the model as it stands this turn. ' +
        'This is the only kind under which a ranked leader or ordinal may be rendered, and ' +
        'even then only when `leader_claim.permitted` is also true.',
    ),
    computed_at: z.string().datetime().describe(
      'ISO-8601 UTC timestamp at which this result was computed. Provenance for display ' +
        '("computed 3 minutes ago"), never a freshness derivation input: currency is the ' +
        'producer\'s verdict, carried by `kind`, and a consumer must not re-derive staleness ' +
        'by comparing this against its own clock or its own edit history.',
    ),
  })
  .strict();

const CompleteStaleStateSchema = z
  .object({
    kind: z.literal('complete_stale').describe(
      'A completed analysis whose result is NO LONGER CURRENT, with the producer stating ' +
        'why. The result remains showable and remains true of the model it ran against — a ' +
        'consumer caveats it and offers a rerun, and must not render a ranked leader or ' +
        'ordinal from it.',
    ),
    computed_at: z.string().datetime().describe(
      'ISO-8601 UTC timestamp at which this now-stale result was computed. Provenance for ' +
        'display; see the same field on `complete_current` — not a freshness input.',
    ),
    cause: AnalysisStaleCauseSchema.describe(
      'What invalidated the result: `graph_changed` (the model\'s structure or values moved ' +
        'under it) or `options_changed` (the set of options being compared moved, so the ' +
        'comparison itself is no longer the one that was run). Required, because "stale for ' +
        'an unstated reason" gives a consumer nothing to offer the user.',
    ),
  })
  .strict();

const UnknownDegradedStateSchema = z
  .object({
    kind: z.literal('unknown_degraded').describe(
      'The producer CANNOT DETERMINE the run state this turn. Not a fifth flavour of ' +
        '"no result": it is the honest absence of a verdict, and it is emitted in preference ' +
        'to guessing one. A consumer must degrade visibly — say the state is unknown — and ' +
        'must never fall back to a default kind, to its own last-known state, or to a ' +
        'client-side derivation.',
    ),
    cause: AnalysisDegradedCauseSchema.describe(
      'Which epistemic failure produced the unknown verdict — see AnalysisDegradedCauseSchema ' +
        'for what each member means. Required: an unexplained "unknown" is indistinguishable ' +
        'from a producer bug, and the four causes carry different honest sentences.',
    ),
  })
  .strict();

/**
 * The run-state verdict, discriminated on `kind`.
 *
 * Every branch is `.strict()` and declares ONLY the fields its kind can
 * honestly carry — the AnalysisFactSchema doctrine: where a rule can live in
 * the type system, it must not live in producer discipline. So a `refused`
 * state carrying `computed_at` is an unrecognized key and FAILS TO PARSE,
 * rather than quietly handing a consumer a timestamp it will read as currency.
 * An unknown `kind` fails to parse outright — this union never silently
 * accepts a state it does not understand.
 */
export const AnalysisRunStateSchema = z
  .discriminatedUnion('kind', [
    NeverRunStateSchema,
    RunningStateSchema,
    BlockedStateSchema,
    RefusedStateSchema,
    CompleteCurrentStateSchema,
    CompleteStaleStateSchema,
    UnknownDegradedStateSchema,
  ])
  .describe(
    'The producer\'s verdict on the state of the analysis as at this turn, discriminated on ' +
      '`kind`. It is the authority: a consumer must not derive, override or supplement it ' +
      'from timestamps, cached results, or its own edit tracking.',
  );
export type AnalysisRunState = z.infer<typeof AnalysisRunStateSchema>;

// ----------------------------------------------------------------------------
// readiness
// ----------------------------------------------------------------------------

export const AnalysisReadinessSchema = z
  .object({
    status: z.string().min(1).describe(
      'The producer\'s readiness verdict for the model — whether it is in a state that can ' +
        'be analysed, independent of whether an analysis has actually been run (that is ' +
        '`run_state`). Producer-owned vocabulary carried as a code, not prose: a consumer ' +
        'maps it to its own copy. Free string for the same reason as the blocker codes — the ' +
        'vocabulary lives with CEE and a closed enum here would be a mirror of a registry ' +
        'this package does not own.',
    ),
    blockers: z
      .array(AnalysisBlockerSchema)
      .describe(
        'Everything standing between the model and an analysable state, itemised with ' +
          'per-option and per-factor scope so a consumer can make each one actionable at the ' +
          'exact element — this is the list the UI\'s draft-missing-values affordance ' +
          'consumes. MAY BE EMPTY, and an empty list here is a POSITIVE claim: the producer ' +
          'assessed readiness and found nothing blocking. That is distinct from ' +
          '`analysis_state` being absent entirely, which means no verdict was supplied.',
      ),
  })
  .strict()
  .describe(
    'Whether the model is in an analysable state, and what is in the way. Answers a ' +
      'DIFFERENT question from `run_state`: readiness is about the MODEL, run state is about ' +
      'the RUN. A model can be ready with no run (`never_run`), and a model can have a ' +
      'complete result while readiness has since regressed.',
  );
export type AnalysisReadiness = z.infer<typeof AnalysisReadinessSchema>;

// ----------------------------------------------------------------------------
// leader_claim — the conjunction verdict
// ----------------------------------------------------------------------------

export const AnalysisLeaderClaimSchema = z
  .object({
    permitted: z.boolean().describe(
      'Whether this turn is entitled to NAME a leading option. It is a CONJUNCTION of two ' +
        'independent verdicts computed by two different systems — CEE\'s constraint ' +
        'entitlement (is the product permitted to make the claim at all) AND the engine\'s ' +
        'statistical separation (do the numbers actually separate the options) — and it is ' +
        'true only when BOTH hold. It is composed once, here, precisely so that no surface ' +
        'has to re-derive it and no two surfaces can disagree. ' +
        'LICENCE, and it is the whole point of this field: a ranked leader, an ordinal, a ' +
        '"best option", or any copy implying one option beats another MAY RENDER ONLY WHEN ' +
        '`permitted` is true AND `run_state.kind` is `complete_current`. Both conditions, ' +
        'every time; `permitted` alone is not sufficient, because a permitted claim about a ' +
        'stale run is still a claim about a run that no longer describes the model. ' +
        'WITHHOLDING DROPS THE DESIGNATION AND KEEPS THE DATA: when this is false, win ' +
        'probabilities and every other computed number remain showable and must still be ' +
        'shown — what is withheld is the DESIGNATION ("Option B leads"), not the evidence. ' +
        'A consumer that hides the numbers has over-applied this rule; a consumer that names ' +
        'a leader by reading the numbers itself has defeated it.',
    ),
    withheld_reason: z.string().min(1).optional().describe(
      'Why the leader claim was withheld, as a producer-owned code a consumer maps to its ' +
        'own copy. ABSENCE IS DISTINCT: absent means no withholding reason was supplied — ' +
        'the ordinary case when `permitted` is true — and NEVER an empty or generic reason. ' +
        'A consumer must not fabricate a reason when this is absent: if it needs to explain ' +
        'a withheld claim and has no reason, the honest surface says the comparison is not ' +
        'being ranked, without inventing a cause.',
    ),
    separation: z.string().min(1).optional().describe(
      'The producer\'s statement of how far apart the options actually are — the statistical ' +
        'half of the conjunction, carried so a consumer can show the evidence behind the ' +
        'verdict. ABSENCE IS DISTINCT: absent means no separation statement was computed or ' +
        'was available, NEVER "the options do not separate" and never zero separation. A ' +
        'consumer must not read absence as a negative result, and must not derive its own ' +
        'separation from win probabilities to fill the gap.',
    ),
  })
  .strict()
  .describe(
    'Whether this turn may name a leading option, and the evidence behind that verdict. See ' +
      '`permitted` for the full licence — this member exists as a separate composed verdict ' +
      'because entitlement and separation are computed by different systems and were ' +
      'previously reconciled independently by each surface, which is how two surfaces came ' +
      'to disagree about the same run.',
  );
export type AnalysisLeaderClaim = z.infer<typeof AnalysisLeaderClaimSchema>;

// ----------------------------------------------------------------------------
// robustness — two named fields, two different questions
// ----------------------------------------------------------------------------

export const AnalysisRobustnessSchema = z
  .object({
    aggregate_level: z.string().min(1).optional().describe(
      'SCOPE: THE RESULT AS A WHOLE. The producer\'s overall stability verdict for this ' +
        'analysis — how much the result moves under the uncertainty the model declares — ' +
        'carried as a producer-owned code a consumer maps to its own copy. It answers "how ' +
        'stable is this result overall". It says NOTHING about which individual factors ' +
        'matter, and copy derived from it must not name, imply or count factors: that is ' +
        '`factors_that_flip_leader`\'s question, and borrowing across the two is how an ' +
        'aggregate verdict becomes a false claim about a specific input. ' +
        'ABSENCE IS DISTINCT: absent means no aggregate verdict was computed or available, ' +
        'NEVER "not robust" and never a neutral default.',
    ),
    factors_that_flip_leader: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'SCOPE: INDIVIDUAL FACTORS. The ids of the factors which, varied alone within their ' +
          'declared uncertainty, change which option leads. It answers "which specific inputs ' +
          'is this conclusion sensitive to". It says NOTHING about overall stability, and copy ' +
          'derived from it must not make a whole-result claim: that is `aggregate_level`\'s ' +
          'question. Ids, not labels — identity-bound (trap 19) so a consumer resolves each ' +
          'factor in its own model rather than matching on display text. ' +
          'ABSENCE AND EMPTY ARE DIFFERENT STATES AND BOTH ARE REACHABLE: absent means the ' +
          'flip analysis was NOT COMPUTED (nothing is known); `[]` means it WAS computed and ' +
          'no single factor flips the leader (a positive, meaningful finding). A consumer must ' +
          'render these differently and must never collapse absent to empty — reporting "no ' +
          'factor changes the outcome" from an absent field is a fabricated finding.',
      ),
  })
  .strict()
  .describe(
    'Two named fields answering TWO DIFFERENT QUESTIONS about how much this result can be ' +
      'trusted: `aggregate_level` scopes to the result as a whole, `factors_that_flip_leader` ' +
      'scopes to individual inputs. They are deliberately not collapsed into one "robustness" ' +
      'value, and each carries its scope in its own `.describe()`, so consumer copy cannot ' +
      'borrow the other\'s claim. Both are optional and independent: either, both or neither ' +
      'may be computed for a given run.',
  );
export type AnalysisRobustness = z.infer<typeof AnalysisRobustnessSchema>;

// ----------------------------------------------------------------------------
// The composed verdict
// ----------------------------------------------------------------------------

export const AnalysisStateV1Schema = z
  .object({
    run_state: AnalysisRunStateSchema,
    readiness: AnalysisReadinessSchema,
    leader_claim: AnalysisLeaderClaimSchema,
    robustness: AnalysisRobustnessSchema,
    usable_for_prose: z.boolean().describe(
      'Whether this turn\'s analysis result may be referred to in PROSE — assistant sentences ' +
        'and narrative copy that describe or interpret the result. False means the result must ' +
        'not be characterised in sentences, even hedged ones. Producer-computed: a consumer ' +
        'reads this flag and does not re-derive it from `run_state`, because a re-derivation ' +
        'is precisely how two surfaces came to disagree about one run.',
    ),
    usable_for_chips: z.boolean().describe(
      'Whether this turn\'s analysis result may back CHIPS and other compact result ' +
        'affordances — the terse, unhedged surfaces where a caveat cannot fit. Deliberately ' +
        'separate from `usable_for_prose` because the two carry different risk: prose can ' +
        'hedge and a chip cannot, so a result can honestly be describable in a sentence while ' +
        'being unsafe to compress into a chip. Producer-computed; never inferred from the ' +
        'prose flag.',
    ),
    usable_for_followup: z.boolean().describe(
      'Whether this turn\'s analysis result may be used as the BASIS FOR A FOLLOW-UP — ' +
        'suggested next questions, drill-downs, and any affordance that reasons onward from ' +
        'the result. Separate from display usability: a result can be safe to show while ' +
        'being unsafe to build the next step on. Producer-computed.',
    ),
    requires_rerun: z.boolean().describe(
      'Whether a rerun is what would move the user forward from here. It licenses a consumer ' +
        'to OFFER a rerun affordance; it never licenses triggering one automatically, and a ' +
        'consumer must not treat it as permission to spend the user\'s time or budget without ' +
        'their action. Producer-computed: not derivable from `run_state` alone, because a ' +
        'stale result may or may not be worth recomputing.',
    ),
    blocked_unusable: z.boolean().describe(
      'Whether the result is unusable for EVERY purpose — the composed "show nothing derived ' +
        'from this" verdict. When true, a consumer suppresses every result-derived surface ' +
        'rather than picking through the individual usability flags. Carried explicitly, and ' +
        'not defined here as the conjunction of the other four, because the producer may ' +
        'block on grounds none of them expresses; a consumer must honour it as its own fact.',
    ),
    contradictions: z
      .array(z.string().min(1))
      .describe(
        'Disagreements the PRODUCER ITSELF detected while composing this verdict, as ' +
          'producer-owned codes a consumer maps to its own copy. This is the self-report ' +
          'channel that makes an inconsistent composition visible instead of silent — the ' +
          'estate has shipped two surfaces disagreeing about one run, and a producer that ' +
          'notices such a disagreement says so here rather than resolving it by guess. ' +
          'MAY BE EMPTY, and empty means the producer FOUND NONE — it is not evidence that ' +
          'none exist, and a consumer must not present an empty list as a consistency ' +
          'guarantee. A non-empty list does not license suppressing the verdict: the rest of ' +
          'this object still stands, and the contradictions are diagnostic.',
      ),
  })
  .strict()
  .describe(
    'ONE composed analysis-state verdict for this turn — the single wire authority for what ' +
      'the analysis says and what a surface may claim about it. Emitted per turn by CEE and ' +
      'intended to replace every per-surface derivation of the same question. Every member is ' +
      'producer-computed; a consumer reads, and does not re-derive. The `.describe()` strings ' +
      'on this shape ARE the specification a consumer may quote as licence.',
  );
export type AnalysisStateV1 = z.infer<typeof AnalysisStateV1Schema>;

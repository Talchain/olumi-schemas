import { z } from 'zod';

// ----------------------------------------------------------------------------
// DecisionRecordSchema (0.15.0; 0.16.0 additive scoring/provenance fields) —
// ROADMAP 3.1, "Minimal decision record now".
//
// Types the wire/API surface for Olumi's long-term differentiator: capture a
// prediction at decision time, then check back later against what actually
// happened. This is the data capture half of the Brier-calibration loop
// (ROADMAP 3.2 builds the scoring/calibration pass on top of records this
// schema shapes) — capture starts now, pre-MVP, even though the comparison
// loop lands later.
//
// NOT wired into OlumiResponse (or any other producer schema) yet. This is
// an exported, standalone contract — a future producer/consumer wires it in
// once the persistence + surfacing product decisions land.
//
// Persistence lives in Supabase (a separate `olumi-decision-records`-style
// store, per ROADMAP 0.4's parallel-track note) — this schema types the
// wire/API surface ONLY, not the storage schema. A Supabase migration is
// being authored in parallel (this sprint's Account 3 lane); FIELD NAMES
// MUST MATCH THIS SCHEMA EXACTLY so the API layer between them is a
// pass-through, not a translation layer.
//
// Every field that only becomes available after the decision is made (the
// analysis snapshot, the eventual outcome) is optional-forward: a record is
// valid the moment a decision + prediction + review date exist, and gains
// fields over its lifecycle without ever needing a shape migration.
// ----------------------------------------------------------------------------

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Uuid = z.string().regex(UUID_V4);

// Point-in-time analysis snapshot backing the decision, at the moment it was
// made. All fields optional-forward: a record MAY be created before a full
// analysis ran (e.g. a fast/intuitive decision), and PLoT/ISL's exact output
// shape for these values is producer-owned, not fixed here — this schema
// only pins the DECISION RECORD's view of them (display-safe summary
// figures, not a re-typed analysis envelope).
export const DecisionRecordAnalysisSummarySchema = z.object({
  leading_option: z.string().min(1).optional(),
  win_probability: z.number().min(0).max(1).optional(),
  goal_fit: z.number().optional(),
  robustness_band: z.string().min(1).optional(),
}).strict();
export type DecisionRecordAnalysisSummary = z.infer<typeof DecisionRecordAnalysisSummarySchema>;

// The choice actually made, and the graph state it was made against.
// `graph_hash` anchors the decision to a specific graph version so a later
// review can tell whether the graph has since changed underneath it.
//
// `committed_by_user` (0.16.0, additive — calibration pack lane 3a,
// docs-designs/CALIBRATION-LOOP-DESIGN-2026-07-11/05-build-slices.md):
// true when the record was created by an explicit "log this decision"
// action, distinguishing intentional commits from ambient auto-capture.
// Optional; absent means the record predates the commit action (or was
// auto-captured) — a disclosed inference, never a fabricated value.
//
// The user's own reasoning (0.57.0, additive — "Record your current view",
// approved by Paul 2026-09-24). Four optional free-text fields the record
// modal has elicited since it shipped but that had NO home in this .strict()
// contract, so they lived on one device only:
//
//   rationale        why the user holds this position (backward-looking
//                    justification — NEVER the scored claim; that is
//                    `prediction.statement`)
//   key_assumption   the assumption most likely to change the position
//   revisit_trigger  the user's own words for when to look again. A DATE the
//                    user gives is carried by `review_date`; this is the
//                    trigger TEXT, recorded verbatim whether or not a date
//                    was also read out of it
//   next_action      what the user will do next
//
// Each is `min(1)`: the empty string is not a value, so ABSENCE is the one
// and only encoding of "nothing written" (or of a record captured before
// 0.57.0) — there is no default for it to be confused with. Bounded by
// DECISION_RECORD_TEXT_MAX_CHARS, measured as JavaScript string length
// (UTF-16 code units). That is never more permissive than Postgres
// `char_length` (code points), so a value this schema admits always fits a
// store that enforces the same number in code points.
export const DECISION_RECORD_TEXT_MAX_CHARS = 1000;
const DecisionRecordText = z.string().min(1).max(DECISION_RECORD_TEXT_MAX_CHARS);
const DECISION_RECORD_REASONING_FIELDS = {
  rationale: DecisionRecordText.optional(),
  key_assumption: DecisionRecordText.optional(),
  revisit_trigger: DecisionRecordText.optional(),
  next_action: DecisionRecordText.optional(),
} as const;

export const DecisionRecordDecisionSchema = z.object({
  chosen_option_id: z.string().min(1),
  chosen_option_label: z.string().min(1),
  graph_hash: z.string().min(1),
  analysis_summary: DecisionRecordAnalysisSummarySchema.optional(),
  committed_by_user: z.boolean().optional(),
  ...DECISION_RECORD_REASONING_FIELDS,
}).strict();
export type DecisionRecordDecision = z.infer<typeof DecisionRecordDecisionSchema>;

// "Not ready to choose" (0.57.0, additive). The user recorded their current
// view WITHOUT choosing an option. This is NOT a decision and must never be
// read as one, so the rule lives in the TYPE, not in producer discipline
// (the AnalysisFactSchema pattern):
//
//   - `position: 'not_ready'` is REQUIRED on this branch, and it is the only
//     value `position` can take anywhere. A record with no `position` is a
//     chosen-option record — every record written before 0.57.0 — so no
//     existing record changes meaning.
//   - `chosen_option_id` / `chosen_option_label` are NOT DECLARED here and the
//     object is `.strict()`, so a not-ready record that names an option is an
//     unrecognised key and fails to parse. "Not ready, but option B" is a
//     contradiction the contract refuses rather than a state a consumer has
//     to adjudicate.
//   - `graph_hash` stays REQUIRED: a not-ready view is still anchored to the
//     graph it was formed against, so a later review can tell whether the
//     graph has moved underneath it.
//   - `committed_by_user` is REQUIRED and can only be `true`. Ambient
//     auto-capture records the analysis leader, so it can never produce this
//     branch; only an explicit user action can. On the chosen branch the field
//     is optional because its ABSENCE is meaningful there (pre-0.16.0 or
//     auto-captured — see the census); here that absence could only ever be a
//     producer bug, so the type does not admit it.
//
// `analysis_summary` is deliberately absent: it is the ambient-capture
// snapshot of the analysis LEADER, and a not-ready record is made by an
// explicit user action that names no option.
//
// A not-ready record makes NO PREDICTION (reconciled 2026-09-24, Paul's
// product semantics: no option, no confidence, no expectation). The
// expectation (`prediction.statement`) and the stated confidence
// (`prediction.confidence`) are claims about a CHOSEN option's outcome, so
// without a choice both would be claims about nothing. `DecisionRecordSchema`
// therefore REFUSES a `prediction` on this branch and REQUIRES one on the
// chosen branch — see the record-level refinement below. An outcome recorded
// against a not-ready record is unscored: there is no staked confidence.
export const DecisionRecordNotReadyPositionSchema = z.object({
  position: z.literal('not_ready'),
  graph_hash: z.string().min(1),
  committed_by_user: z.literal(true),
  ...DECISION_RECORD_REASONING_FIELDS,
}).strict();
export type DecisionRecordNotReadyPosition = z.infer<typeof DecisionRecordNotReadyPositionSchema>;

// Provenance of `prediction.confidence` (0.16.0, additive — calibration pack
// honesty constraint §2, docs-designs/CALIBRATION-LOOP-DESIGN-2026-07-11/
// 04-honesty-constraints.md): 'model_derived' = the analysis's own win
// probability; 'user_stated' = the user's elicited confidence. The two
// populations are NEVER blended into one calibration score — a blended
// number would be unattributable. Absent ⇒ 'model_derived' for all records
// captured before elicitation existed (disclosed inference, per lane 3a).
export const DecisionRecordConfidenceSource = z.enum([
  'model_derived',
  'user_stated',
]);
export type DecisionRecordConfidenceSourceLiteral = z.infer<typeof DecisionRecordConfidenceSource>;

// The forward-looking claim being staked at decision time — the thing the
// eventual `outcome` is scored against. `confidence` is the user/model's own
// calibration input (0=no confidence, 1=certain); optional because not every
// capture flow prompts for it.
//
// `probability_of_goal` / `probability_of_joint_goal` (0.16.0, additive —
// D-N Option-B derisk, ruled 2026-07-11: "both candidate probabilities get
// captured from day one so a Neil overrule is a recompute, never lost
// data"): the chosen option's goal-attainment probabilities as delivered at
// decision time. `probability_of_goal` = P(option meets the single goal
// threshold); `probability_of_joint_goal` = P(option meets ALL constraints
// jointly). Producer values (ISL via PLoT) recorded verbatim — the record
// never computes or rescales them. Both optional-forward: absent whenever
// no goal target existed at capture.
export const DecisionRecordPredictionSchema = z.object({
  statement: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  confidence_source: DecisionRecordConfidenceSource.optional(),
  probability_of_goal: z.number().min(0).max(1).optional(),
  probability_of_joint_goal: z.number().min(0).max(1).optional(),
}).strict();
export type DecisionRecordPrediction = z.infer<typeof DecisionRecordPredictionSchema>;

// Closed vocabulary for how a prediction landed. `abandoned` covers the
// decision being reversed/superseded before the review could meaningfully
// judge it — distinct from `worse`, which means the decision stood and the
// outcome fell short.
export const DecisionRecordOutcomeResult = z.enum([
  'better',
  'as_expected',
  'worse',
  'abandoned',
]);
export type DecisionRecordOutcomeResultLiteral = z.infer<typeof DecisionRecordOutcomeResult>;

// Filled in at review time, not at creation. `brier_component` is this
// record's individual contribution to a future aggregate Brier score
// (ROADMAP 3.2's calibration loop) — a single record's squared-error term,
// not the calibration score itself.
export const DecisionRecordOutcomeSchema = z.object({
  recorded_at: z.string().datetime({ offset: true }),
  result: DecisionRecordOutcomeResult,
  notes: z.string().min(1).optional(),
  brier_component: z.number().min(0).optional(),
}).strict();
export type DecisionRecordOutcome = z.infer<typeof DecisionRecordOutcomeSchema>;

// The record itself. `review_date` is when the user (or an automated
// prompt) should come back and compare prediction to reality — set at
// creation, independent of when `outcome` actually gets recorded (which may
// be later than, earlier than, or never, relative to this date).
//
// `decision` (0.57.0) is EITHER a chosen option (DecisionRecordDecisionSchema,
// unchanged apart from the four optional reasoning fields) OR an explicit
// "not ready to choose" (DecisionRecordNotReadyPositionSchema). The two
// branches are disjoint by construction: the first requires
// `chosen_option_id` and declares no `position`; the second requires
// `position: 'not_ready'` and declares no option. A consumer reading
// `decision.chosen_option_label` must now narrow first — which is the point:
// the type system will not let a not-ready record be rendered as a choice.
//
// `prediction` (0.57.0, reconciled 2026-09-24) is optional ON THE OBJECT and
// TIED TO THE BRANCH by the refinement: REQUIRED on a chosen record (exactly
// as before — every pre-0.57.0 record carries one), and ABSENT on a
// not-ready record (it makes no forecast). ABSENCE IS DISTINCT: it means "the
// user recorded that they are not ready to choose", never "a prediction
// nobody wrote down" — so a consumer must never default it (to an empty
// statement, a 0 confidence, or anything else). Storage mirrors it: CEE's
// `decision_records.prediction` is NULL exactly on a not-ready row, and the
// RPC returns the record through jsonb_strip_nulls, so the key is absent.
export const DecisionRecordSchema = z.object({
  record_id: z.string().min(1),
  scenario_id: Uuid,
  created_at: z.string().datetime({ offset: true }),
  decision: z.union([DecisionRecordDecisionSchema, DecisionRecordNotReadyPositionSchema]),
  prediction: DecisionRecordPredictionSchema.optional(),
  review_date: z.string().datetime({ offset: true }),
  outcome: DecisionRecordOutcomeSchema.optional(),
}).strict().superRefine((record, ctx) => {
  const notReady = 'position' in record.decision;
  if (notReady && record.prediction !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prediction'],
      message:
        "a not-ready record makes no prediction: `prediction` must be absent when decision.position is 'not_ready'",
    });
  }
  if (!notReady && record.prediction === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prediction'],
      message: 'a chosen-option record requires `prediction` (the claim its outcome is scored against)',
    });
  }
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

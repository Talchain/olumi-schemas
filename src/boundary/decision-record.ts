import { z } from 'zod';

// ----------------------------------------------------------------------------
// DecisionRecordSchema (0.15.0) — ROADMAP 3.1, "Minimal decision record now".
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
export const DecisionRecordDecisionSchema = z.object({
  chosen_option_id: z.string().min(1),
  chosen_option_label: z.string().min(1),
  graph_hash: z.string().min(1),
  analysis_summary: DecisionRecordAnalysisSummarySchema.optional(),
}).strict();
export type DecisionRecordDecision = z.infer<typeof DecisionRecordDecisionSchema>;

// The forward-looking claim being staked at decision time — the thing the
// eventual `outcome` is scored against. `confidence` is the user/model's own
// calibration input (0=no confidence, 1=certain); optional because not every
// capture flow prompts for it.
export const DecisionRecordPredictionSchema = z.object({
  statement: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
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
export const DecisionRecordSchema = z.object({
  record_id: z.string().min(1),
  scenario_id: Uuid,
  created_at: z.string().datetime({ offset: true }),
  decision: DecisionRecordDecisionSchema,
  prediction: DecisionRecordPredictionSchema,
  review_date: z.string().datetime({ offset: true }),
  outcome: DecisionRecordOutcomeSchema.optional(),
}).strict();
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

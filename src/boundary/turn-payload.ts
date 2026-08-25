import { z } from 'zod';
import {
  TurnClass,
  Stage,
  ActionType,
  Intent,
  TurnSource,
  EdgeAdjudicationVerdict,
  EdgeStrengthDirectionIntent,
  EdgeStrengthEditIntent,
} from './enums.js';
import { EffectDirection, GraphV3Schema, NodeKind, NodeV3Schema } from '../graph.js';
import { RoundParticipantRefSchema } from './collab.js';

// UUIDv4 pattern — keep loose; CEE also re-checks.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Uuid = z.string().regex(UUID_V4);

// v0.7.0 — discriminated turn payload for /orchestrate/v2/turn.
// Breaking change from v0.6.0: all payloads MUST carry a `kind` field.
// Clean cutover — no backwards-compat legacy branch. Both UI and CEE move
// together. See Docs/v5/v5-turn-shape-matrix.md for the handler coverage map.

const BaseFields = {
  turn_id: Uuid,
  scenario_id: Uuid,
  stage: Stage,
} as const;

// Selected-element reference shared by `selected_elements` (on
// `MessageTurnPayloadSchema`, below) and `selection_change` (a
// `SystemEventSchema` member, further down this file). Deliberately
// minimal (id + kind + an optional display label) — NOT the Phase 3
// `TargetRefSchema` (§0.1 in blocks.ts), which requires a non-empty
// `label`: a live canvas selection can legitimately reference an element
// the UI has no ready-made label for (e.g. mid-drag, or a just-added
// unlabelled node), and this is an UI→CEE inbound field, not a
// wire-rendered UI target. Declared here (ahead of both members that use
// it) to avoid a temporal-dead-zone reference.
export const SelectedElementRefSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1).optional(),
}).strict();
export type SelectedElementRef = z.infer<typeof SelectedElementRefSchema>;

const MAX_SELECTED_ELEMENTS = 20;

// kind: 'message' — user-originated turn with free text.
// `source` tells CEE how the text got here (composer / chip / chip_click / retry).
// `chip` carries action_type and parameters only when source is 'chip' | 'chip_click'.
// `retry_of` references the prior turn_id only when source is 'retry'.
//
// `generate_model` / `explicit_generate` — optional booleans (v0.13.1). When
// either is `true` AND the scenario has no graph (or zero nodes), CEE may
// deterministically dispatch the V5 draft_graph handler without first
// consulting the LLM tool-use router. The two names are aliases of the
// same semantic ("the user explicitly asked CEE to generate the model
// now"): clients may send either; CEE treats them as equivalent. Both
// default to `undefined` so existing clients (and any consumer of an
// older schema version that omits the field) are unaffected. The flags
// are advisory; CEE may still ignore them if the trigger preconditions
// are not satisfied (e.g., a graph already exists).
//
// `selected_elements` — optional (v0.15.0). Piggyback selection context for
// THIS turn only: what the user had selected on the canvas at send time.
// Verified gap this closes: the live V5 outbound builder
// (`src/v5/buildPayload.ts` in DecisionGuideAI) sends NO selection context
// today — a `selected_elements` field already exists on the wire, but only
// on the dead V4-era builder path (`src/services/turn-request-builder.ts`,
// shape `{node_ids?, edge_ids?}`), which the live V5 conversation flow does
// not call. This field is the V5-shaped replacement (array of typed refs,
// bounded ≤20) — the V4 field is not touched by this change; the two simply
// coexist under the same name on different schema versions/turn shapes.
// Between-turn selection awareness (the user changes their selection
// without sending a turn) is NOT this field's job — that is
// `selection_change` (below).
//
// `graph_state` — optional (0.23.0). The FULL inbound GraphV3 the client holds
// on its canvas at send time (nodes + edges — the same shape draft_graph emits,
// NOT a hash ref: on a guest first-touch there is no server model to fetch, so
// the whole graph must ride inbound). Additive + `.strict()`-safe: a turn
// WITHOUT it still parses (fail-safe — every pre-0.23.0 payload is unaffected).
//
// PURPOSE (A2 guest-template train — ROADMAP 1.188 / A1-DECISIONS D-24): on a
// FIRST-TOUCH turn a guest scenario has NO server-authored model, so CEE is
// model-blind. This carries the graph inbound so CEE can adopt-on-first-touch
// and coach/analyse against it. Ingress hazard (0.22-class landing sequence):
// an older strict CEE 422s a turn carrying an unknown field, so the UI MUST NOT
// populate `graph_state` until CEE has re-vendored ≥ 0.23.0 and accepts it.
// Order: this package publishes → CEE re-vendors (accepts + adopts) → UI sends.
//
// Cross-field refinements are applied on the discriminated-union wrapper
// below (z.discriminatedUnion requires plain ZodObject members).
export const MessageTurnPayloadSchema = z.object({
  ...BaseFields,
  kind: z.literal('message'),
  message: z.string().min(1).max(10_000),
  turn_class: TurnClass,
  source: TurnSource,
  chip: z.object({
    // 0.22.0 (S2) — FIRST-CLASS chip identity. Was smuggled untyped inside
    // `parameters` (chip_id / spark_id) with ZERO CEE readers. This promotes
    // the same discipline the `chip_click` system-event member already has
    // (typed `chip_id`, below) to the message-turn chip.
    id: z.string().min(1).optional(),
    action_type: ActionType.optional(),
    // 0.22.0 (S2, decision ①) — typed coaching / elicitation / mutation
    // INTENT, PARALLEL to `action_type` (which names a handler id). CEE routes
    // a typed chip on its `intent` instead of re-inferring intent from the
    // rendered chip copy. See `Intent` in ./enums.ts.
    intent: Intent.optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }).strict().optional(),
  retry_of: Uuid.optional(),
  generate_model: z.boolean().optional(),
  explicit_generate: z.boolean().optional(),
  selected_elements: z.array(SelectedElementRefSchema).max(MAX_SELECTED_ELEMENTS).optional(),
  graph_state: GraphV3Schema.optional(),
}).strict();

// kind: 'system_event' — UI-initiated event with no free text.
// Never renders a user bubble; CEE dispatches to a deterministic handler.
const PatchAcceptedEvent = z.object({
  kind: z.literal('patch_accepted'),
  patch_id: z.string().min(1),
}).strict();

const PatchDismissedEvent = z.object({
  kind: z.literal('patch_dismissed'),
  patch_id: z.string().min(1),
}).strict();

// `direct_graph_edit` — a manual canvas edit reported to CEE.
//
// 0.22.0 (S2, decision ②): `target_id` + `operation` are REQUIRED singulars; the
// optional `changed_*` / `operations` / `fields_changed` / `summary` fields are
// additive batch CONTEXT. Chosen over a new `graph_edited` event (decision ② rec)
// to keep one event, one owner. Before this the singular-only `.strict()` shape
// REFUSED a multi-edit payload (build → null → the turn was never sent), so CEE
// was blind to manual edits.
//
// ⚠ HONEST WIRE CONVENTION (F6, ROADMAP 1.188a — corrected 0.23.0). This schema
// does NOT itself decompose a batch: `target_id`/`operation` carry a
// REPRESENTATIVE SINGULAR, and the raw multi-edit → representative reduction is
// performed UPSTREAM by the UI's `graphEditBatchAdapter` (DecisionGuideAI,
// merged #436; pinned by `graphEditBatchAdapter.spec.ts`), NOT by anything in
// this package. The adapter's convention — stated so a consumer knows what the
// singulars MEAN: `target_id` = explicit target → else the first changed node id
// (ascending) → else the first changed edge id (ascending); `operation` =
// explicit → else `operations[0]` (ascending); `fields_changed` = the batch's
// per-field map flattened to a sorted, de-duped `string[]` UNION. The
// `changed_*`/`operations` arrays ride alongside as full context; an edit whose
// id set is empty is rejected client-side as a retryable `unencodable_graph_edit`
// rather than sent. (The prior 0.22.0 comment claimed the schema "accommodated"
// the UI's debounced batch emitter directly — it does not; that accommodation is
// the adapter's, and the wire carries the representative singular described here.
// trap-14: describe the convention the wire actually uses, not one that only
// holds via the adapter.)
const DirectGraphEditEvent = z.object({
  kind: z.literal('direct_graph_edit'),
  target_id: z.string().min(1),
  operation: z.string().min(1),
  // Batch payload (all optional — additive). `operations` is the plural of the
  // singular `operation` verb; `fields_changed` names the touched fields;
  // `summary` is a short human description of the batch.
  changed_node_ids: z.array(z.string().min(1)).optional(),
  changed_edge_ids: z.array(z.string().min(1)).optional(),
  operations: z.array(z.string().min(1)).optional(),
  fields_changed: z.array(z.string().min(1)).optional(),
  summary: z.string().min(1).max(2000).optional(),
}).strict();

// `factor_value_edit` (0.29.0) — an inspector value edit, CARRYING THE VALUE.
//
// WHY A NEW MEMBER RATHER THAN A VALUE ON `direct_graph_edit` (ROADMAP 1.346).
// `direct_graph_edit` is a BATCH NOTIFICATION whose `target_id` is documented
// above as a REPRESENTATIVE SINGULAR — "explicit target → else the first changed
// node id (ascending)". Keying a MUTATION on a representative id would mutate
// whichever node happened to sort first in a batch rather than the one the user
// edited: a defect by construction. Its consumers are notification-shaped too
// (CEE silent-acks it; the orchestrator prompt family says "acknowledge changes,
// note implications"). So the value-carrying edit gets its OWN member and
// `direct_graph_edit` keeps its existing semantics byte-identically.
//
// ⚠ SEQUENCING — READER-FIRST IS MANDATORY, NOT A PREFERENCE. Every member of
// this union is `.strict()` and the union itself is a `discriminatedUnion` on
// `kind`. A consumer pinned to 0.28.0 or earlier that receives this member fails
// the discriminator and REJECTS THE WHOLE TURN — not just this field. The UI must
// therefore NOT emit `factor_value_edit` until CEE's pin includes it. Measured
// 2026-07-28: UI 0.22.0, CEE 0.25.0. Order: publish → CEE re-vendors → CEE deploys
// → only then the UI emitter ships.
//
// SCALE CONTRACT — the field names and meanings are taken verbatim from
// `ObservedStateV3` / `normaliseFactorValue` (CEE), NOT invented here:
//   `value`     — MODEL scale. For a capped factor this is `raw_value / cap`.
//   `raw_value` — the USER-UNIT magnitude the user actually typed ("30000").
// These are NOT interchangeable, and conflating them is a live defect this
// member exists to make impossible to express silently.
//
// NO `cap` FIELD, DELIBERATELY. A cap is the factor's SCALE; changing it rescales
// every option intervention on that factor. Accepting a client-supplied cap here
// would let an inspector edit extend the scale with no consent step. Extending a
// scale keeps going through the existing consented "extend the scale" chip flow.
// NO `operator` FIELD either: an inspector edit is always an absolute set.
const FactorValueEditEvent = z.object({
  kind: z.literal('factor_value_edit'),
  // The factor node being edited. ID-ADDRESSED — never a label. A label match
  // would silently retarget on any duplicate or renamed label.
  target_id: z.string().min(1),
  value: z.number().finite().describe(
    'The edited value on the MODEL scale (for a capped factor, raw_value / cap). ' +
      'Required: an edit with no value is a `direct_graph_edit` notification, not this ' +
      'event. The server RE-DERIVES the persisted model value from `raw_value` and its ' +
      'own stored cap and never persists this number verbatim — it is the client\'s ' +
      'statement of intent, cross-checked against `raw_value`, not a trusted input.',
  ),
  raw_value: z.number().finite().optional().describe(
    'The USER-UNIT magnitude as typed (e.g. 30000 for £30,000). ABSENCE IS DISTINCT ' +
      'from any value: it means the client did not state a user-unit magnitude, and the ' +
      'server must derive one from `value` and its own stored cap. It does NOT mean zero. ' +
      'Send this whenever the user typed a magnitude — it is the honest record of the ' +
      'input, and the server prefers it over `value`.',
  ),
  unit: z.string().min(1).optional().describe(
    'Unit symbol for `raw_value` (e.g. "£", "%"). ABSENCE IS DISTINCT from any value: ' +
      'a unit-less number is treated as an AMBIGUOUS bare number against a capped factor ' +
      'and may be refused, whereas a stated unit is validated against the factor\'s own ' +
      'unit. Absence never means "no unit" — it means "the client did not say".',
  ),
  // A LITERAL, NOT A STRING, AND THE DIFFERENCE IS THE SKEW SEAM.
  //
  // This started as `z.string().min(1)` with a doc comment promising that
  // "present-and-not-'value' is REFUSED rather than coerced". That promise lived
  // only in ONE reader (CEE's dispatch). A permissive string means a future
  // producer can emit `field: 'baseline'` and have it PARSE at every pin ≥0.29.0,
  // with the verdict — refuse, coerce, or silently apply as a value edit —
  // decided by whichever version each consumer happens to be on. That is hazard 1
  // exactly: the contract validates, and the behaviour diverges downstream.
  //
  // As a literal, the wire itself refuses it. Adding `'baseline'` later becomes a
  // LOUD, VERSIONED WIDENING (a union member, a minor bump, a re-vendor per
  // consumer) instead of a value that quietly parses everywhere and means
  // different things in different places.
  field: z.literal('value').optional().describe(
    'Which `observed_state` field was edited. The ONLY accepted value is "value", and ' +
      'ABSENCE IS THE SAME as passing it — so a client may omit it entirely. It exists to ' +
      'make the edited field EXPLICIT on the wire, not to offer a choice: a future field ' +
      '(e.g. "baseline") requires widening this literal to a union in a versioned release, ' +
      'which is deliberately louder than accepting an arbitrary string here and leaving each ' +
      'consumer to decide what to do with it.',
  ),
  // 0.40.0 (PR4 evidence loop — EVIDENCE-LOOP-DERIVATION.md Q5, ratified
  // mechanism G2 §7.3): the owner's "Use this value" apply from a panel
  // reveal RIDES THIS EXISTING MEMBER — deliberately NOT a new collab-seam
  // graph-write route, which would be a second graph-write path (the
  // shared-mutation hazard the derivation names for refusal at review).
  //
  // `applied_from` is the client's ATTRIBUTION CLAIM, never a trusted input:
  // CEE verifies it against its own collab store (round closed · participant
  // belongs to it · that participant's latest belief for this target equals
  // `value`/`raw_value`) and only then stamps `observed_state.elicited_from`
  // + `source: 'panel_elicited'` on the persisted node — INV-F, the server
  // stamps only what it verified; a mismatch refuses loud. Ids only; a
  // display name is refused at parse (RoundParticipantRefSchema is .strict()).
  //
  // ⚠ SEQUENCING — READER-FIRST IS MANDATORY, exactly as for this member's
  // own 0.29.0 landing (see the member comment above): every member of this
  // union is .strict(), so a CEE pinned ≤0.39.0 that receives `applied_from`
  // REJECTS THE WHOLE TURN (derived by execution against the built v0.39.0
  // dist: unrecognized_keys at path ['event']). Order: publish 0.40.0 → CEE
  // re-vendors + deploys → only then the UI emitter sends it.
  applied_from: RoundParticipantRefSchema.optional().describe(
    'Present iff this edit applies a named participant\'s panel answer ("Use this value" ' +
      'on a reveal row). ABSENCE IS DISTINCT: it means an ordinary inspector/panel-free ' +
      'edit, never "attribution lost". When present, CEE MUST verify the claim against ' +
      'its own collab store before stamping any provenance, and MUST refuse the edit ' +
      'loudly on any mismatch — the wire never carries a provenance claim the server ' +
      'could not verify for itself.',
  ),
}).strict();

const ChipClickEvent = z.object({
  kind: z.literal('chip_click'),
  chip_id: z.string().min(1),
}).strict();

const UndoEvent = z.object({
  kind: z.literal('undo'),
}).strict();

const RedoEvent = z.object({
  kind: z.literal('redo'),
}).strict();

// `selection_change` (v0.15.0) — between-turn canvas selection awareness.
// Debounced client-side (the UI should coalesce rapid selection churn
// before emitting, not fire one event per click/drag-frame) and sent as a
// system event because it is UI-initiated with no free text and never
// renders a user bubble, same as every other member of this union.
//
// Advisory context, never a command: CEE MAY use this to inform the NEXT
// response (e.g. "the user is looking at Factor X"), but a `selection_change`
// event never itself triggers a mutation, an analysis run, or any handler
// side effect — it carries no operation, only "here is what is selected
// now". Distinct from `selected_elements` on `MessageTurnPayloadSchema`,
// which piggybacks selection onto an already-outbound message turn; this
// event exists so selection changes ALONE (no accompanying message) still
// reach CEE.
//
// `cleared` distinguishes "selection became empty" from "no selection
// information sent" — `selected: []` with `cleared: true` says the user
// explicitly deselected everything; `selected: []` alone is ambiguous with
// a client that just omits detail. Optional because most emissions are a
// non-empty selection where the distinction does not apply.
const SelectionChangeEvent = z.object({
  kind: z.literal('selection_change'),
  selected: z.array(SelectedElementRefSchema).max(MAX_SELECTED_ELEMENTS),
  cleared: z.boolean().optional(),
}).strict();

// `feedback` (0.22.0) — the typed thumbs-rating event. Paul ruled WIRE
// (design decision ⑥, ROADMAP 1.181): the V5 feedback builder silently
// REFUSED `feedback_submitted` (the dead-thumbs class — a control that did
// nothing). This member is the honest channel: CEE consumes + persists it, the
// UI emitter switches from the dead builder to this event. UI-initiated, no
// free-text bubble → a system event like every sibling of this union.
export const FeedbackRating = z.enum(['up', 'down']);
export type FeedbackRatingLiteral = z.infer<typeof FeedbackRating>;

// The class of artifact a rating is ABOUT. A small CLOSED vocabulary (not an
// open string) so a consumer keys display / telemetry off the target class.
export const FeedbackTargetKind = z.enum([
  'turn',
  'message',
  'block',
  'suggestion',
  'analysis',
]);
export type FeedbackTargetKindLiteral = z.infer<typeof FeedbackTargetKind>;

const FeedbackEvent = z.object({
  kind: z.literal('feedback'),
  // The thumbs verdict.
  rating: FeedbackRating,
  // Optional free-text the user typed alongside the thumb.
  comment: z.string().min(1).max(2000).describe(
    'User free-text feedback. MAY contain PII (names, emails, whatever the ' +
      'user typed) — consumers MUST handle per R-004: treat as sensitive, ' +
      'never log verbatim, redact before persistence/telemetry.',
  ).optional(),
  // The artifact being rated (id + its class). Required: a rating with no
  // referent is not actionable. `id` is any stable id (a turn UUID for a
  // whole-turn rating, else a block / suggestion id).
  target: z.object({
    id: z.string().min(1),
    kind: FeedbackTargetKind,
  }).strict(),
}).strict();

// `edge_adjudication` (0.34.0) — the human settles a CEE multi-pass
// disagreement on an edge. Before this member the ContestedEdgeCard verdict
// (`handleResolveContested` in DecisionGuideAI's ModelTabBody) terminated in
// the client store: the highest-signal human judgement in the product had NO
// wire shape at all (P4 transport lane, 2026-08-05).
//
// EDGE IDENTITY IS from + to NODE IDS — the canonical edge key CEE itself uses
// (`EDGE_IDENTITY_KEYS` / `findEdge(from, to)` in canonicalise-value-ops.ts).
// Client-side edge ids (`reactflow__edge-…`) are NOT stable across repos, so
// `edge_id` rides along as an optional, informative client identifier only —
// never the lookup key. Assertions bind by identity, not by a value a
// different edge could satisfy.
//
// PROVENANCE, deliberately NOT a wire field: the event KIND is the provenance
// claim (only a user acts on this surface). A client-supplied constant would
// add nothing the server could trust; CEE stamps `user_set` on the persisted
// fact. The `.strict()` reject of a `provenance` key is pinned in
// turn-payload-0.34.test.ts.
//
// CROSS-FIELD RULE (enforced by `refineEdgeAdjudication`, applied at the
// UNION-ROOT superRefine below — the same place the chip/retry_of rules live.
// It cannot live on this member: `z.discriminatedUnion` requires plain
// ZodObject options, and `SystemEventSchema.options` is load-bearing for the
// parity tests here AND for CEE's derived kind-exhaustiveness test, so the
// union must stay bare. CEE validates ingress with the ROOT schema
// (`b1.ts::validateIngress`), so the root IS the wire):
//   · `overridden` REQUIRES `resolved_strength_mean` — an override asserts a
//     number; without one the record is unactionable.
//   · `dismissed` FORBIDS it — a dismissal asserts no value.
//   · `accepted_pass1` / `accepted_pass2` MAY carry it (the accepted pass's
//     signed mean, informative — the authoritative copy lives in the edge's
//     validation metadata).
const EdgeAdjudicationEvent = z.object({
  kind: z.literal('edge_adjudication'),
  /** Source node id of the contested edge (canonical edge identity, half 1). */
  from: z.string().min(1),
  /** Target node id of the contested edge (canonical edge identity, half 2). */
  to: z.string().min(1),
  /** The client's own edge id, informative only — never the lookup key. */
  edge_id: z.string().min(1).optional(),
  verdict: EdgeAdjudicationVerdict,
  /**
   * SIGNED strength mean the adjudication commits (UI scale, matches
   * `validation.pass*.strength_mean`). Required iff verdict is `overridden`;
   * forbidden on `dismissed` — see the cross-field rule above.
   */
  resolved_strength_mean: z.number().finite().optional(),
}).strict();

/**
 * The edge_adjudication cross-field rule, exported so a consumer that parses a
 * BARE `SystemEventSchema` (rather than the root payload) can apply the same
 * verdict/value coupling instead of re-deriving it. Root-payload parsing gets
 * it automatically via the union-level superRefine.
 */
export function refineEdgeAdjudication(
  ev: z.infer<typeof EdgeAdjudicationEvent>,
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = [],
): void {
  if (ev.verdict === 'overridden' && ev.resolved_strength_mean === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'resolved_strength_mean'],
      message: 'an overridden verdict must carry the value the user asserted',
    });
  }
  if (ev.verdict === 'dismissed' && ev.resolved_strength_mean !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'resolved_strength_mean'],
      message: 'a dismissed verdict asserts no value — omit resolved_strength_mean',
    });
  }
}

// `prior_range_edit` (0.34.0) — the inspector's prior-range edit
// (`useInspectorMutations.setPriorRange`), which likewise terminated in the
// client store. Carries the USER-set bounds of the factor's prior
// (`prior.range_min` / `prior.range_max` in the graph contract's
// `PriorSchema`), id-addressed to the factor node.
//
// This member CARRIES the judgement so the server can persist it as a fact —
// whether/how confirmed ranges affect the maths is a separate, explicit design
// decision (they change ANALYSIS inputs), deliberately not smuggled in here.
//
// `range_min === range_max` is ACCEPTED: a collapsed range is a legitimate
// statement of certainty, not an error. Inverted bounds are refused via
// `refinePriorRangeEdit`, applied at the union-root superRefine (same
// plain-ZodObject constraint as edge_adjudication above) rather than left to
// each consumer.
const PriorRangeEditEvent = z.object({
  kind: z.literal('prior_range_edit'),
  /** The factor node whose prior the user bounded. ID-addressed, never a label. */
  target_id: z.string().min(1),
  range_min: z.number().finite(),
  range_max: z.number().finite(),
  /**
   * Distribution family, stated ONLY when the user chose one. Absence means
   * "the client did not say" — it never means "uniform".
   */
  distribution: z.string().min(1).optional(),
}).strict();

// `edge_strength_edit` (0.42.0) — the inspector's value-carrying edge edit,
// addressed by the canonical GraphV3 identity `(from, to)`.
//
// WHY A NEW MEMBER. `direct_graph_edit` is deliberately a value-less BATCH
// notification whose singular target is only a representative. It cannot
// truthfully carry an authoritative mutation. `chip_click` can invoke the
// existing CEE writer, but its parameter bag is intentionally open and has no
// expected-before guard; extending it would let an older reader silently strip
// the new safety fields and still write. This strict event makes the mutation
// and its stale-base guard one versioned contract.
//
// AUTHORITY. The client carries intent, never a graph, provenance, std, source,
// operator, or trusted signed mean. CEE must resolve the unique `(from, to)` in
// its persisted GraphV3, compare `expected` exactly, derive the signed target
// from `magnitude` + `direction_intent`, and route the accepted write through
// the canonical `adjust_edge_strength` writer. `preserve` always means the
// direction on that persisted edge — never a client-side guess.
//
// CONFIRMATION. `confirm_current` is a provenance-only act: it requires
// `direction_intent: 'preserve'` and the exact current magnitude
// `abs(expected.mean)`. After verification, the existing canonical writer's
// provenance semantics apply (`provenance.source: 'user_specified'`,
// `provenance_display: 'user_set'`); mean, direction and std must not change,
// and analysis must not stale when the canonical hash is unchanged. The root
// refinement below makes contradictory payloads invalid before dispatch.
//
// ZERO IS DELIBERATE. `expected.effect_direction` remains required when mean is
// zero, and explicit positive/negative direction intents remain legal at zero.
// Direction cannot be recovered from the sign of zero; dropping this field or
// forcing zero positive would erase a live negative direction. The deployed
// canonical handler currently derives zero as positive, so the later CEE writer
// train must extend that handler with an explicit direction policy; invoking it
// unchanged is NOT sufficient implementation of this contract.
//
// SEQUENCING. Every SystemEventSchema member is strict and the union is
// discriminated by kind. A pre-0.42 reader rejects this whole turn. Order:
// publish schema -> CEE re-vendors/deploys a reader -> only then UI emits.
const EdgeStrengthExpectedSchema = z.object({
  mean: z.number().finite().min(-1).max(1).describe(
    'The exact signed mean last read from the canonical persisted edge. This is an ' +
      'optimistic-concurrency assertion, not the requested value.',
  ),
  effect_direction: z.enum(['positive', 'negative']).describe(
    'The exact direction last read from the canonical persisted edge. Required even when ' +
      'mean is zero, where sign cannot recover direction.',
  ),
}).strict();

// CEE's persisted GraphV3 is the authority and its deployed node ids are open
// strings, so do not narrow this to the root package's lowercase NodeV3 id
// regex. We require exact, non-blank endpoint bytes and exclude the two
// delimiters used by the existing canonical writer's composite adapter. No
// trimming/coercion: changing an identity byte would be silent retargeting.
//
// 0.48.0: this schema is ALSO the node-id schema for `structural_delete` below.
// A node id and an edge endpoint id are the same id space (an endpoint IS a node
// id), and the constraints wanted are identical — exact bytes, no blank, no
// composite. The name is historical, from 0.42.0 when the only consumer was an
// edge endpoint. Deliberately reused rather than duplicated: a second identical
// refinement chain is a hand-maintained mirror, and the two copies would drift.
const CanonicalEdgeEndpointIdSchema = z.string().min(1)
  .refine((id) => id === id.trim(), 'edge endpoint ids must not have surrounding whitespace')
  .refine(
    (id) => !id.includes('→') && !id.includes('->'),
    'edge endpoint ids must be separate ids, not delimiter-bearing composites',
  );

const EdgeStrengthEditEvent = z.object({
  kind: z.literal('edge_strength_edit'),
  from: CanonicalEdgeEndpointIdSchema.describe(
    'Exact canonical source node id (edge identity, half 1).',
  ),
  to: CanonicalEdgeEndpointIdSchema.describe(
    'Exact canonical target node id (edge identity, half 2).',
  ),
  magnitude: z.number().finite().min(0).max(1).describe(
    'Requested absolute strength in [0, 1]. Direction is carried separately so a strength ' +
      'change cannot reverse an edge accidentally.',
  ),
  direction_intent: EdgeStrengthDirectionIntent.describe(
    '`preserve` uses the server-persisted direction; positive/negative are explicit user choices.',
  ),
  expected: EdgeStrengthExpectedSchema,
  intent: EdgeStrengthEditIntent,
}).strict();

/**
 * Cross-field rules for edge_strength_edit. CEE validates the root
 * OrchestratorTurnPayloadSchema, where this is applied automatically. Exported
 * for consumers that intentionally parse a bare SystemEventSchema.
 */
export function refineEdgeStrengthEdit(
  ev: z.infer<typeof EdgeStrengthEditEvent>,
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = [],
): void {
  const expectedDirection = ev.expected.mean < 0
    ? 'negative'
    : ev.expected.mean > 0
      ? 'positive'
      : null;

  if (expectedDirection !== null && ev.expected.effect_direction !== expectedDirection) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'expected', 'effect_direction'],
      message: 'non-zero expected.mean and expected.effect_direction must agree',
    });
  }

  if (ev.intent === 'confirm_current') {
    if (ev.direction_intent !== 'preserve') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, 'direction_intent'],
        message: 'confirm_current must preserve the canonical persisted direction',
      });
    }
    if (ev.magnitude !== Math.abs(ev.expected.mean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, 'magnitude'],
        message: 'confirm_current magnitude must exactly equal abs(expected.mean)',
      });
    }
  }
}

/**
 * The prior_range_edit cross-field rule (min ≤ max), exported for bare
 * `SystemEventSchema` consumers — see {@link refineEdgeAdjudication}.
 */
export function refinePriorRangeEdit(
  ev: z.infer<typeof PriorRangeEditEvent>,
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = [],
): void {
  if (ev.range_min > ev.range_max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'range_min'],
      message: 'range_min must not exceed range_max',
    });
  }
}

// ---------------------------------------------------------------------------
// `structural_delete` (0.48.0) — a durable, atomic REMOVAL.
//
// THE DEFECT IT CLOSES. A user deletes an option on the canvas and it returns on
// the next rerun, because no UI→CEE vocabulary has ever been able to say
// "removed". All three closed vocabularies carry add/edit verbs only:
// `SystemEventKind` had 12 members whose structural pair is `factor_value_edit` /
// `edge_strength_edit`; `ActionType` has `set_factor_value`, `add_constraint`,
// `adjust_edge_strength`; `Intent` has `add_option`. The deletion never reached
// the server, so the server's model never lost the node — the canvas and the
// persisted model simply disagreed until the next read overwrote the canvas.
//
// WHY NOT REUSE `direct_graph_edit` — THE CONTRACT HAS ALREADY RULED. Its own
// comment above declares it a BATCH NOTIFICATION whose `target_id` is a
// "REPRESENTATIVE SINGULAR ... explicit target → else the first changed node id
// (ascending)", and `factor_value_edit`'s comment states the consequence
// verbatim: "Keying a MUTATION on a representative id would mutate whichever
// node happened to sort first in a batch rather than the one the user edited: a
// defect by construction." A delete is the most destructive mutation in the
// product; keying it on a representative id would delete the wrong node. The
// contract's established answer, now applied a third time: a mutating edit gets
// its OWN member, and `direct_graph_edit` keeps its notification semantics
// byte-identically.
//
// WHY PLURAL AND ATOMIC — the one property that must not be "simplified" away.
// Unlike `factor_value_edit`/`edge_strength_edit`, which address exactly one
// entity, a canvas delete is INHERENTLY a batch: removing a node necessarily
// removes its incident edges. Applying such a removal partially leaves DANGLING
// EDGES — edges whose endpoint no longer exists — which is a graph that violates
// referential integrity and will fail or silently mis-analyse downstream. So the
// arrays are plural, and the whole event is ONE transaction: CEE applies all of
// it or none of it. Splitting this into a singular member (or fanning it out into
// N single-delete turns) reintroduces the dangling-edge window by construction.
//
// REMOVAL ONLY — ADD IS DELIBERATELY EXCLUDED. `Intent.add_option` already owns
// adding, and it works: the add persists today. A combined "structural_edit"
// covering both directions would create TWO AUTHORITIES for one concept, which is
// the defect class this estate pays for most often. The adjacent readiness
// problem ("an added option leaves the model unanalysable") is a different seam
// from transport and is not fixed by widening this member.
//
// EDGES ARE ADDRESSED BY `(from, to)`, NEVER BY AN ID — derived, not chosen.
// `EdgeV3Schema` (src/graph.ts) declares NO `id` field at all; an edge's only
// identity in the canonical graph is its endpoint pair. Both existing
// edge-addressed members say so explicitly: `edge_adjudication` notes client-side
// ids ("reactflow__edge-…") "are NOT stable across repos ... never the lookup
// key", and `edge_strength_edit` addresses edges by canonical `(from, to)`. A
// `removed_edge_ids: string[]` field would therefore be unresolvable against the
// persisted graph and could only carry a client-local id the contract forbids as
// a key — so the wire refuses that shape outright.
//
// `base_graph_hash` IS THE STALE GATE, and the name is the estate's existing one:
// `EditToolOpBatchSchema.base_graph_hash` (src/orchestrator/edit-tool-ops.ts),
// whose divergence code is `BASE_HASH_DIVERGED` and whose rule is quoted here
// because it applies unchanged — "Absent/null/empty are all forbidden: the stale
// gate is non-optional". A delete is unsafe to apply against a graph the user was
// not looking at: ids drift, and a stale delete removes something the user never
// selected. CEE MUST compare this against its own canonical hash and refuse on
// mismatch rather than applying a best-effort subset.
//
// ⚠ AND THE ONE DIFFERENCE FROM THAT PRECEDENT, stated so it is not "corrected":
// there the hash is STAMPED SERVER-SIDE because the producer is the LLM, and A5b
// reasons that "the model never echoes a hash" (a transcription error would
// produce spurious dead-ends). That argument does NOT transfer here, because the
// producer is the BROWSER, which genuinely holds the graph it rendered. A client
// echoing state it actually read is the established optimistic-concurrency idiom
// of this very union — `edge_strength_edit.expected` is "an optimistic-concurrency
// assertion, not the requested value". Client-echoed here is correct; server-
// stamped there is correct; they are different producers, not an inconsistency.
//
// DELIBERATELY UNCAPPED. `selected_elements` is bounded (≤20) because it is
// advisory piggyback context. This is not: select-all-then-delete is a legitimate
// user action, and a cap would refuse a request the server can honour perfectly
// well — an affordance terminating in refusal. Bound it only if a real DoS
// measurement demands it, and then bound it where the measurement points.
//
// NO `cascade` FLAG, and no server-side inference of extra removals. The client
// enumerates exactly what the user removed. A `cascade: true` would let one flag
// mean "also delete things I have not named", which is a mutation whose extent
// the user never saw and the wire cannot audit.
//
// ⚠ SEQUENCING — READER-FIRST IS MANDATORY, NOT A PREFERENCE. Every member of
// this union is `.strict()` and the union is a `discriminatedUnion` on `kind`, so
// a consumer pinned ≤0.47.0 that receives this member fails the DISCRIMINATOR and
// REJECTS THE WHOLE TURN (422) — not just this field. Order: publish 0.48.0 → CEE
// re-vendors + deploys a reader → only then the UI emitter ships. UI-alone would
// 422 every turn containing a delete; CEE-alone is invisible and safe. Pinned by
// `tests/boundary/turn-payload-0.48.test.ts`.
//
// AUTHORITY STAYS SERVER-SIDE. The client carries intent and the base hash only —
// never a graph, never a receipt, never a count it expects to be true afterwards.
// CEE resolves each id in its persisted GraphV3 and routes the accepted removal
// through the canonical `remove_node` / `remove_edge` PatchOperation train
// (`handleEditGraph` → `evaluateEditGraphMutations` → commit) that the coach edit
// tool already uses. This member is a TRANSPORT for a human's removal; it does
// not mint a second applier.
// ---------------------------------------------------------------------------
// `base_graph_hash` — ONE schema, shared by every structural member.
//
// DERIVED, NOT CHOSEN. Both pre-existing sites of this field name validate it
// as exactly `z.string().min(1)`: `StructuralDeleteEvent.base_graph_hash`
// (0.48.0, below) and `EditToolOpBatchSchema.base_graph_hash`
// (src/orchestrator/edit-tool-ops.ts). The 0.50.0 structural members bind to
// this same constant rather than restating the validator, so the four members
// cannot drift into two spellings of one concept — the hand-maintained-mirror
// defect this repo pays for most often. Parity is pinned by execution in
// tests/boundary/turn-payload-0.50.test.ts, not asserted in prose.
//
// ⚠ WHY THERE IS DELIBERATELY NO HEX REGEX HERE, stated so it is not "tightened"
// later by someone who assumes the omission is an oversight. The value CEE
// compares against is the ANALYSIS-AFFECTING hash — `computeAnalysisAffectingGraphHash`
// (CEE `src/orchestrator-v5/context/graph-hash.ts`), which is SHA-256 truncated
// to a 16-char hex prefix (`HASH_HEX_LENGTH = 16`, `.digest('hex').slice(0, 16)`),
// and is the only graph hash CEE ever puts on the wire. The 64-hex IDENTITY hash
// (`computeGraphIdentityHash`) has NO wire emitter and is used only for the
// server-derived atomic RPC CAS. Binding this field to the 64-hex shape would
// yield a gate that can never match — an affordance terminating in refusal.
// A width regex is nonetheless NOT added, for two reasons: (a) neither existing
// site has one, and introducing one here would make the same field name mean two
// different validations inside one union; (b) the width is a CEE implementation
// constant, and pinning it in the published contract would turn a truncation-length
// change into a cross-repo breaking change. The contract states the semantics; CEE
// remains the authority on the digest.
const CanonicalBaseGraphHashSchema = z.string().min(1);

/** A canonical GraphV3 edge reference: the endpoint pair IS the edge's identity. */
const CanonicalEdgeRefSchema = z.object({
  from: CanonicalEdgeEndpointIdSchema.describe(
    'Exact canonical source node id of the removed edge (edge identity, half 1).',
  ),
  to: CanonicalEdgeEndpointIdSchema.describe(
    'Exact canonical target node id of the removed edge (edge identity, half 2).',
  ),
}).strict();

export type CanonicalEdgeRef = z.infer<typeof CanonicalEdgeRefSchema>;

const StructuralDeleteEvent = z.object({
  kind: z.literal('structural_delete'),
  removed_node_ids: z.array(CanonicalEdgeEndpointIdSchema).describe(
    'The node ids the user removed. REQUIRED but MAY be empty — an edges-only delete is ' +
      'legitimate. Required rather than optional so absence is impossible and there is no ' +
      '"omitted vs empty" ambiguity for a consumer to resolve differently per pin.',
  ),
  removed_edges: z.array(CanonicalEdgeRefSchema).describe(
    'The edges the user removed, each addressed by its canonical (from, to) pair — edges ' +
      'have no id in GraphV3. REQUIRED but MAY be empty: a nodes-only delete is legitimate, ' +
      'and CEE removes edges orphaned by a node removal as part of the same transaction ' +
      'whether or not the client enumerated them.',
  ),
  base_graph_hash: CanonicalBaseGraphHashSchema.describe(
    'The canonical graph hash the client last read, i.e. the graph the user was actually ' +
      'looking at when they deleted. An optimistic-concurrency assertion, never a requested ' +
      'value. Absent, null and empty are all forbidden: the stale gate is non-optional, ' +
      'because a delete applied to a graph the user did not see removes something they never ' +
      'selected. CEE MUST refuse on divergence rather than applying a best-effort subset.',
  ),
}).strict();

/**
 * Cross-field rule for `structural_delete`: a delete must remove SOMETHING.
 *
 * Both arrays empty is a NO-OP that should never reach the wire — it would cost a
 * turn, a commit and a hash comparison to change nothing, and it is
 * indistinguishable from a client bug that lost the selection. Each array may be
 * empty ALONE (nodes-only and edges-only deletes are both legitimate), so this
 * cannot be expressed with `.min(1)` on either array; it is genuinely a
 * cross-field rule. Precedent for refusing an empty structural batch:
 * `EditToolOpBatchSchema.operations` is `.min(1)`.
 *
 * Lives at the union root like its three siblings because `z.discriminatedUnion`
 * requires plain ZodObject options, and exported so a consumer that parses a bare
 * `SystemEventSchema` applies the same rule instead of re-deriving it — see
 * {@link refineEdgeAdjudication}.
 */
export function refineStructuralDelete(
  ev: z.infer<typeof StructuralDeleteEvent>,
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = [],
): void {
  if (ev.removed_node_ids.length === 0 && ev.removed_edges.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'removed_node_ids'],
      message:
        'a structural_delete that removes nothing is a no-op — supply at least one ' +
        'removed node id or removed edge',
    });
  }
}

// ---------------------------------------------------------------------------
// 0.50.0 — the DIRECT-EDIT structural vocabulary: `structural_add`,
// `structural_add_edge`, `structural_rename`.
//
// WHAT THESE CLOSE. 0.48.0 gave the canvas its first REMOVAL verb and stopped
// there, deliberately. The remaining direct manipulations a user performs on the
// canvas — creating a factor, drawing an edge between two factors, and renaming
// a node — still had no wire shape, so each was either lost on the next reload
// or routed through `direct_graph_edit`, whose `target_id` is a REPRESENTATIVE
// SINGULAR and whose own contract comment calls keying a mutation on it "a defect
// by construction". These three members follow the pattern 0.48.0 established
// and re-state none of it: intent plus a `base_graph_hash` assertion, resolved
// against the server's own persisted read. Authority stays server-side.
//
// ⚠⚠ THE APPARENT CONTRADICTION WITH 0.48.0, RESOLVED RATHER THAN OVERRULED.
// `structural_delete`'s comment says, in terms, "REMOVAL ONLY — ADD IS
// DELIBERATELY EXCLUDED. `Intent.add_option` already owns adding". That sentence
// is still TRUE and is not being reversed here, because it is about a DIFFERENT
// CONCEPT wearing a similar name. Derived at the bytes (enums.ts:124-149):
// `Intent` is the authored COACHING / ELICITATION vocabulary, "DECOUPLED from
// ActionType", and its `add_option` member is "add a decision OPTION (the
// compound-transaction intent; the referee `add_option` case wires to a LIVE
// producer through this)". It adds a decision option through the coaching
// referee. `structural_add` creates a GRAPH NODE from a direct canvas gesture,
// with no LLM and no referee, and cannot express "add a decision option" at all.
// Two authorities for one concept is the defect class this estate pays for most
// often (global CLAUDE.md trap 21 — two questions under similar names); the fix
// there is to NAME THE CONCEPTS APART, which is what this paragraph does. If a
// future lane wants to fold them, that is a product decision with a referee
// seam attached, not a contract tidy-up.
//
// WHY THREE MEMBERS AND NOT ONE `structural_edit`. Same ruling as 0.48.0, applied
// a fourth time: each verb carries a different payload and a different failure
// mode, and a single member would need a nested discriminator to keep them apart
// — which is the union we already have, one level down and harder to read. The
// union is the discriminator.
//
// ⚠ SEQUENCING IS UNCHANGED AND STILL MANDATORY. Every member of this union is
// `.strict()` and the union is a `discriminatedUnion` on `kind`, so a consumer
// pinned below 0.50.0 that receives one of these fails the DISCRIMINATOR and
// REJECTS THE WHOLE TURN (422) — not just this field. Order: publish 0.50.0 →
// CEE re-vendors and deploys a reader → only then the UI emitter ships.
// UI-alone would 422 every turn carrying a direct edit; CEE-alone is invisible
// and safe.
//
// ⚠ THE ID-SPACE ASYMMETRY IS DERIVED AND DELIBERATE — do not "make it
// consistent". `structural_add` mints a NEW node id and therefore validates it
// against `NodeV3Schema.shape.id` (which carries `NODE_ID_PATTERN`), because an
// id that fails that pattern is one CEE cannot persist into GraphV3 — the
// producer's own declared semantics. `structural_rename` and
// `structural_add_edge` address EXISTING nodes and therefore use
// `CanonicalEdgeEndpointIdSchema`, whose comment states the reason verbatim:
// "CEE's persisted GraphV3 is the authority and its deployed node ids are open
// strings, so do not narrow this to the root package's lowercase NodeV3 id
// regex." Narrowing the existing-id fields would refuse live nodes; loosening
// the new-id field would mint unpersistable ones. Both directions are wrong.

/**
 * `structural_add` (0.50.0) — create ONE node from a direct canvas gesture.
 *
 * SINGULAR, unlike `structural_delete`. The plurality there is forced: removing a
 * node necessarily removes its incident edges, so a partial application leaves
 * DANGLING EDGES. Creating a node has no such cascade — a new node has no
 * incident edges by construction — so there is no atomicity argument for a batch,
 * and a singular member keeps the failure attributable to the one node the user
 * drew. Drawing a node and then an edge is two gestures and two turns.
 *
 * THE FIELD SET IS DERIVED FROM `NodeV3Schema`, NOT CHOSEN: `id`, `kind` and
 * `label` are exactly its three REQUIRED fields, so this is the minimal payload
 * from which CEE can construct a valid GraphV3 node. `id` and `label` reference
 * `NodeV3Schema.shape.*` directly rather than restating their validators, so a
 * change to the node contract cannot leave this member behind.
 *
 * EVERY OPTIONAL NodeV3 FIELD IS DELIBERATELY ABSENT — `category`,
 * `observed_state`, `goal_threshold` and the rest. Two reasons. (a) 0.48.0
 * already ruled on the adjacent problem: "the adjacent readiness problem ('an
 * added option leaves the model unanalysable') is a different seam from transport
 * and is not fixed by widening this member." (b) An optional field on the wire
 * creates absence semantics — is omitted the same as unset? — which is a debt row
 * in this repo's own absence-semantics census. A node created here is refined by
 * the value/prior/edge members that already exist.
 */
const StructuralAddEvent = z.object({
  kind: z.literal('structural_add'),
  node_id: NodeV3Schema.shape.id.describe(
    'The id for the NEW node, minted client-side so the gesture is idempotent under retry ' +
      'and the client can correlate the committed node with the shape it drew. Validated ' +
      'against NodeV3Schema.shape.id because CEE must be able to persist it. CEE MUST refuse ' +
      'an id that already exists in the persisted graph rather than overwriting that node: ' +
      'the base_graph_hash gate cannot catch a collision, because a colliding id is already ' +
      'present in the very graph the user was looking at.',
  ),
  node_kind: NodeKind.describe(
    'The node kind, from the graph contract\'s own NodeKind vocabulary. Named `node_kind` ' +
      'rather than `kind` because `kind` is the union discriminator on this member.',
  ),
  label: NodeV3Schema.shape.label.describe(
    'The user-authored label for the new node. Bounds are inherited from NodeV3Schema.shape.label.',
  ),
  base_graph_hash: CanonicalBaseGraphHashSchema.describe(
    'The canonical graph hash the client last read. An optimistic-concurrency assertion, ' +
      'never a requested value. Absent, null and empty are all forbidden: the stale gate is ' +
      'non-optional. CEE MUST refuse on divergence rather than applying a best-effort add.',
  ),
}).strict();

/**
 * `structural_add_edge` (0.50.0) — create ONE causal edge between two existing nodes.
 *
 * ADDRESSED BY `(from, to)`, NEVER BY AN ID — the same derivation 0.48.0 recorded:
 * `EdgeV3Schema` (src/graph.ts) declares NO `id` field at all, so an edge's only
 * identity in the canonical graph is its endpoint pair, and a client-local id
 * ("reactflow__edge-…") is explicitly forbidden as a lookup key.
 *
 * MAGNITUDE AND DIRECTION ARE SEPARATE, inherited from `edge_strength_edit`'s
 * ruling that they must be, "so a strength change cannot reverse an edge
 * accidentally". Here direction is the graph's own `EffectDirection` vocabulary
 * with `unknown` EXCLUDED — derived, not trimmed by taste: this member requires a
 * `magnitude`, and a stated magnitude paired with an unknown direction produces an
 * edge whose sign cannot be recovered, which is the exact failure
 * `EdgeStrengthExpectedSchema` cites when it keeps `effect_direction` required at
 * a zero mean. An edge whose direction is genuinely unknown is a different product
 * gesture and does not ride this member.
 *
 * `std` AND `exists_probability` ARE ABSENT BY CONTRACT, matching
 * `edge_strength_edit`, whose fixture note states the rule for the whole family:
 * "Client provenance/std/operator/graph are absent by contract." The server owns
 * them.
 *
 * NO `expected` TWIN, and the asymmetry with `structural_rename` below is derived,
 * not an oversight: an edge that does not yet exist has no current value to
 * assert, and `base_graph_hash` DOES cover this gesture — every field the edge
 * projection hashes (`from`, `to`, `edge_type`, `exists_probability`,
 * `effect_direction`, and strength `mean`/`std`) is analysis-affecting, so a
 * concurrent edge change moves the hash and the stale gate fires.
 *
 * SELF-EDGES (`from === to`) ARE DELIBERATELY NOT REFUSED HERE. `EdgeV3Schema`
 * permits them and no existing endpoint-addressed member forbids them, so a
 * transport-level refusal would encode a MODELLING opinion the graph contract does
 * not hold — refusing a request the server can honour. Contrast the no-op rules on
 * `structural_delete` and `structural_rename`, which refuse requests that are
 * provably meaningless rather than merely unusual.
 */
const StructuralAddEdgeEvent = z.object({
  kind: z.literal('structural_add_edge'),
  from: CanonicalEdgeEndpointIdSchema.describe(
    'Exact canonical source node id of the new edge (edge identity, half 1). Must already exist.',
  ),
  to: CanonicalEdgeEndpointIdSchema.describe(
    'Exact canonical target node id of the new edge (edge identity, half 2). Must already exist.',
  ),
  magnitude: z.number().finite().min(0).max(1).describe(
    'Absolute strength in [0, 1] for the new edge. Direction is carried separately so an ' +
      'edge cannot be created with an accidentally inverted sign.',
  ),
  effect_direction: EffectDirection.exclude(['unknown']).describe(
    'The causal direction of the new edge. `unknown` is excluded: this member states a ' +
      'magnitude, and magnitude without direction is an edge whose sign cannot be recovered.',
  ),
  base_graph_hash: CanonicalBaseGraphHashSchema.describe(
    'The canonical graph hash the client last read. An optimistic-concurrency assertion, ' +
      'never a requested value. Absent, null and empty are all forbidden: the stale gate is ' +
      'non-optional. CEE MUST refuse on divergence, and MUST refuse an endpoint that does ' +
      'not resolve in its persisted graph rather than creating a dangling edge.',
  ),
}).strict();

/**
 * `structural_rename` (0.50.0) — change ONE node's label.
 *
 * ⚠⚠ THIS MEMBER CARRIES `expected_label` BECAUSE `base_graph_hash` IS STRUCTURALLY
 * BLIND TO IT, and that is the whole reason the field exists. Derived at CEE's
 * implementation bytes (`src/orchestrator-v5/context/graph-hash.ts`, staging
 * 4a064e60): `projectNode` hashes exactly `kind, category, factor_type,
 * is_baseline, goal_threshold, goal_threshold_raw, goal_threshold_cap, intercept,
 * encoding_map` — `label` is NOT among them, and the module header says so in
 * terms: it omits "cosmetic / provenance / display fields so label-only edits do
 * not trigger" a hash change. The published keep-list in
 * `boundary/graph-hash-contract.ts` (CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields)
 * agrees, field for field.
 *
 * THE CONSEQUENCE, stated plainly because it is easy to get backwards: two users
 * renaming the same node concurrently produce NO hash divergence, so
 * `base_graph_hash` alone would let the second rename silently overwrite the first
 * — a last-writer-wins clobber on the one field the stale gate cannot see. The
 * `expected` idiom from `EdgeStrengthExpectedSchema` is exactly the right
 * template and it is applied here for exactly that reason: an "optimistic-
 * concurrency assertion, not the requested value". CEE MUST compare
 * `expected_label` against the persisted label and refuse on mismatch.
 *
 * ⚠ SO DO NOT "SIMPLIFY" THIS FIELD AWAY as redundant with the hash. It is
 * redundant for `structural_add_edge` — every edge field the projection reads is
 * analysis-affecting — and it is load-bearing here. The two members differ because
 * the hash's coverage differs, not because the authors were inconsistent.
 *
 * RENAME ONLY, NOT A GENERAL NODE EDIT. `kind` is deliberately not renameable
 * here: changing a node's kind IS analysis-affecting (it is in the projection
 * above), so it is covered by the stale gate and belongs to a different gesture
 * with a different review. One verb, one failure mode.
 */
const StructuralRenameEvent = z.object({
  kind: z.literal('structural_rename'),
  node_id: CanonicalEdgeEndpointIdSchema.describe(
    'Exact canonical id of the EXISTING node being renamed. Open-string, per the canonical ' +
      'id rule: CEE\'s persisted node ids are the authority.',
  ),
  label: NodeV3Schema.shape.label.describe(
    'The new label. Bounds are inherited from NodeV3Schema.shape.label.',
  ),
  expected_label: NodeV3Schema.shape.label.describe(
    'The exact label last read from the canonical persisted node. An optimistic-concurrency ' +
      'assertion, never a requested value, and NOT redundant with base_graph_hash: the ' +
      'analysis-affecting hash does not cover `label`, so a concurrent rename moves no hash ' +
      'and would otherwise be silently clobbered. CEE MUST refuse on mismatch.',
  ),
  base_graph_hash: CanonicalBaseGraphHashSchema.describe(
    'The canonical graph hash the client last read. Guards every analysis-affecting change ' +
      'to the graph around this node; `expected_label` guards the label itself, which the ' +
      'hash does not cover. Absent, null and empty are all forbidden.',
  ),
}).strict();

/**
 * Cross-field rule for `structural_rename`: a rename must CHANGE something.
 *
 * `label === expected_label` is a NO-OP that should never reach the wire — it costs
 * a turn, a commit and two comparisons to change nothing, and it is
 * indistinguishable from a client bug that lost the edit. This is the same ruling
 * as {@link refineStructuralDelete}'s "a delete must remove SOMETHING", applied to
 * the one member where the no-op is expressible as a cross-field equality.
 *
 * Lives at the union root like its siblings because `z.discriminatedUnion` requires
 * plain ZodObject options, and exported so a consumer that parses a bare
 * `SystemEventSchema` applies the same rule instead of re-deriving it — see
 * {@link refineEdgeAdjudication}.
 */
export function refineStructuralRename(
  ev: z.infer<typeof StructuralRenameEvent>,
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = [],
): void {
  if (ev.label === ev.expected_label) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'label'],
      message:
        'a structural_rename to the label it already has is a no-op — supply a label that ' +
        'differs from expected_label',
    });
  }
}

export const SystemEventSchema = z.discriminatedUnion('kind', [
  PatchAcceptedEvent,
  PatchDismissedEvent,
  DirectGraphEditEvent,
  FactorValueEditEvent,
  ChipClickEvent,
  UndoEvent,
  RedoEvent,
  SelectionChangeEvent,
  FeedbackEvent,
  EdgeAdjudicationEvent,
  PriorRangeEditEvent,
  EdgeStrengthEditEvent,
  StructuralDeleteEvent,
  StructuralAddEvent,
  StructuralAddEdgeEvent,
  StructuralRenameEvent,
]);
export type SystemEvent = z.infer<typeof SystemEventSchema>;

export const SystemEventTurnPayloadSchema = z.object({
  ...BaseFields,
  kind: z.literal('system_event'),
  event: SystemEventSchema,
}).strict();

// Discriminated union at the payload root. Consumers switch on `kind`.
// Cross-field message refinements (chip-only-with-chip-source,
// retry_of-only-with-retry-source) apply via .superRefine at the union level.
export const OrchestratorTurnPayloadSchema = z
  .discriminatedUnion('kind', [MessageTurnPayloadSchema, SystemEventTurnPayloadSchema])
  .superRefine((payload, ctx) => {
    if (payload.kind === 'system_event') {
      // 0.34.0 cross-field rules — root-level because discriminatedUnion
      // members must stay plain ZodObjects (see the member comments). CEE
      // validates ingress with THIS schema, so these run on the wire.
      if (payload.event.kind === 'edge_adjudication') {
        refineEdgeAdjudication(payload.event, ctx, ['event']);
      }
      if (payload.event.kind === 'prior_range_edit') {
        refinePriorRangeEdit(payload.event, ctx, ['event']);
      }
      if (payload.event.kind === 'edge_strength_edit') {
        refineEdgeStrengthEdit(payload.event, ctx, ['event']);
      }
      if (payload.event.kind === 'structural_delete') {
        refineStructuralDelete(payload.event, ctx, ['event']);
      }
      if (payload.event.kind === 'structural_rename') {
        refineStructuralRename(payload.event, ctx, ['event']);
      }
      return;
    }
    if (payload.kind !== 'message') return;
    const isChipSource = payload.source === 'chip' || payload.source === 'chip_click';
    if (payload.chip && !isChipSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chip'],
        message: "`chip` is only allowed when source is 'chip' or 'chip_click'",
      });
    }
    if (payload.retry_of && payload.source !== 'retry') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retry_of'],
        message: "`retry_of` is only allowed when source is 'retry'",
      });
    }
  });

export type MessageTurnPayload = z.infer<typeof MessageTurnPayloadSchema>;
export type SystemEventTurnPayload = z.infer<typeof SystemEventTurnPayloadSchema>;
export type OrchestratorTurnPayload = z.infer<typeof OrchestratorTurnPayloadSchema>;

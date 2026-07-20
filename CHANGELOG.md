# Changelog

All notable changes to `@talchain/schemas` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.21.0] — AUTHORED, unpublished; publish gated on single-graph ratification (Paul)

**⚠ DO NOT PUBLISH.** This version is authored as a DRAFT (schemas-0.21.0-manifest,
SINGLE-GRAPH-DESIGN-2026-07-20-v2, S2 build spec). It is one coordinated,
fully-additive bump carrying three riders (S1 graph identity + S2 typed intent +
S3 lifecycle) so three mid-flight consumers ride a SINGLE re-vendor event rather
than three independent pin-skew windows (system-map hazard 1). The one-bump
coupling is deliberate — do not split. `[Unreleased]` above (the #14 false-twin
rename) folds into this version on publish.

Publish is gated on Paul's single-graph ratification. Paul-confirmable design
choices flagged in-source:
- `CoachingIntent` as a PARALLEL enum vs extending `ActionType` (architect / S2 §4
  recommend parallel — this).
- exact `CoachingIntent` membership (12 values incl. the optional 12th
  `mitigation_help`).
- node `type` / `categories` / `state_space` + `observed_state.std` HASHED beyond
  CEE's abbreviated floor list (analysis-affecting; safe over-detect direction) —
  confirm at CEE adoption.
- `goal_constraints` hashed WHOLE-ARRAY (manifest §3) — constraint
  provenance/display sub-fields therefore participate; narrowable if preferred.

### Added — S1 graph identity handshake

- **`computeGraphHash(graph)` — the ONE canonical graph-IDENTITY hash** (new
  `src/graph-hash.ts`, exported from root + `/boundary`). Deterministic 16-hex
  SHA-256 prefix of a canonical, analysis-affecting projection; `null` when the
  graph is structurally empty (no nodes). WHITELIST projection (not blacklist) so
  two writers carrying different extra passthrough keys — the CEE layout-strip vs
  UI layout-carry asymmetry — still agree. INCLUDES nodes/edges semantics +
  options + `goal_node_id` + `goal_constraints` (the S1 §D/§F.1 defect fix: v1's
  keep-list omitted constraints, so a hard-constraint edit read FRESH). EXCLUDES
  labels/descriptions/provenance/display, layout & positions, and Monte-Carlo
  reproducibility config. Also exports `stableStringify`,
  `GRAPH_HASH_CLASSIFICATION`, `GRAPH_HASH_CLASSIFIED_SCHEMAS`. Package exported NO
  hash function before this — adopting ONE is a real new deliverable, not a
  re-export.
- **Classification-completeness guard** (`tests/graph-hash-classification.test.ts`)
  — DERIVES the field universe from the live Zod shapes and FAILS THE BUILD if any
  declared field (or nested sub-field of a HASHED object) lacks a hashed/excluded
  disposition, or if a registry key is stale. Proven fail-loud by a mutation (an
  unclassified field turns it RED) and by a positive control (trap-12/13).
- **CEE/UI byte-parity fixture** (`identityParityGraph` + `IDENTITY_PARITY_GRAPH_HASH`
  in `/fixtures`) with a committed expected constant `965d721bd37964e8`, plus a
  mutation guard (`tests/graph-hash-parity.test.ts`) asserting every INCLUDED field
  changes the hash and every EXCLUDED field does not. CEE and UI ship the mirror
  assertion against their own vendored fn — the cross-repo agreement proof.
- **`graph_hash`** on the turn payloads (message + system-event) —
  `.nullable().optional()` tri-state (string = graph rendered · null = no graph ·
  absent = old client); the null/absent distinction drives whether divergence
  enforcement engages.
- **`computed_against_hash`** on the OlumiResponse envelope and the
  `analysis_result` block (`z.string().optional()`) — the echo a client compares
  to its current canvas.
- **`GRAPH_DIVERGED`** typed code on `BoundaryErrorCode` (+ `FAILURE_USER_TEXT`).
- **`GraphWriteRequest` / `GraphWriteResult`** (new `src/boundary/graph-write.ts`)
  — the CEE write-through / CAS endpoint contract, LOAD-BEARING for guests (the
  client Supabase RPC path RLS-fails silently for guests). `base_hash` nullable
  (`null` = create/first write); result is a discriminated union (`ok {new_hash}` |
  `diverged {server_hash, code:'GRAPH_DIVERGED'}`).

### Added — S2 typed intent vocabulary + first-class chip identity

- **`CoachingIntent`** — a parallel typed coaching/elicitation intent enum (12
  values), DECOUPLED from `ActionType` (which names handler ids). Closes the
  meta-decision defect where anonymous chip text was re-inferred by regex.
- **`chip.id`** and **`chip.intent`** on the message-turn chip shape — promoting
  chip identity out of the untyped `parameters` bag and giving each chip a typed
  intent channel alongside its handler-imperative `action_type`.
- **Batched `direct_graph_edit`** system event — `target_id`/`operation` demoted
  to optional, batch fields (`changed_node_ids`, `changed_edge_ids`, `operations`,
  `fields_changed?`, `summary?`) added alongside, so CEE is no longer blind to
  batched manual canvas edits (the old singular shape had no live producer and was
  silently dropped).

### Added — S3 transactional edit lifecycle

- **`base_graph_hash`** on the `held_proposal` block (`z.string().optional()`) —
  lets the client verify a confirm-receipt applied against the graph it holds
  (kills the `zero_overlap_drop` heuristic at the held-proposal render path). S3
  otherwise rides S1's hash fields; no net-new S3 wire type (the V4 `ProposedChange`
  is vestigial on V5 and is not extended).

### Fixtures / ratchet

- Maximal-fixture registry 106 → 111 (the five graph-write entries). New optional
  fields (`graph_hash`, `chip.id`/`chip.intent`, `computed_against_hash`,
  `base_graph_hash`, batched `direct_graph_edit`) populated in their existing
  fixtures to keep the maximality guard satisfied.

## [Unreleased]

### Changed (rename only — no shape change, version untouched)

- **False-twin rename: `GoalConstraintSchema` → `LegacyGoalConstraintStubSchema`**
  (type `GoalConstraint` → `LegacyGoalConstraintStub`; fixture
  `maximalGoalConstraint` → `maximalLegacyGoalConstraintStub`; registry family
  `boundary/GoalConstraintSchema` → `boundary/LegacyGoalConstraintStubSchema`).
  The old name — and its comment "Goal constraint for V2 runs" plus the 0.18.0
  note calling it "the V2 RUN-REQUEST constraint (UI/CEE -> PLoT compute)" —
  mislabelled a never-exercised A0 stub as the live compute-seam constraint
  contract. It is not: reference manifest verified 2026-07-20 across src, dist
  (generated), tests, and all four consumers at their staging tips (CEE
  `b3d3742`, PLoT `13ecf98`, UI `66bbe03`, ISL via org-wide code search) found
  ZERO external imports of the symbol. CEE has its own producer
  `GoalConstraintSchema` (`src/schemas/assist.ts`), PLoT its own
  `GoalConstraint` interface (`src/types/engine-v3.ts` — the real compute-seam
  type), the UI consumes `DraftGoalConstraintSchema` (positive control: that
  import IS found by the same probe). Renamed rather than deleted because
  `V2RunRequestSchema.constraints` embeds it in-repo and deletion would be a
  shape change. Registry stays at 106 entries (rename, not add/remove). The
  0.18.0 entry below is left as written (historical record); its description
  of the run-stub as the live compute seam is superseded by this note.

### Added (tooling only — no schema shape changed, version untouched)

- **Published JSON-Schema for the compute-seam analysis types (A3
  drift-check lane).** `json-schema/` now carries a draft-07 JSON-Schema
  document per Zod schema exported from `src/boundary/enrichment.ts`
  (21 documents + `manifest.json`), published via the `files` array and a
  `./json-schema/*.json` exports subpath (the `./fixtures` 0.17.0
  precedent). Purpose: ISL (Python/Pydantic) hand-mirrors this contract
  with no mechanical check — these artifacts let it CI-validate/diff its
  models against the contract (derive-don't-mirror).
  - The export list is **derived by introspection**, never hand-listed: a
    new schema export in `enrichment.ts` automatically joins the set and
    the drift guard fails until `npm run generate:json-schema` output is
    committed.
  - The drift guard (`tests/json-schema.test.ts`) is **read-only and
    cannot self-heal**: only the explicit CLI regenerates. Tests include
    positive controls proving the guard sees stale/missing/orphan
    artifacts and that the documents reject broken payloads (enum, type,
    minimum, missing-required violations), not just accept good ones.
  - Known limit (recorded in the manifest): Zod refinement invariants
    (e.g. `n_seeds_flipped <= n_seeds`) are not expressible in JSON
    Schema; only the structural layer is captured.
  - New devDependencies: `zod-to-json-schema`, `ajv`. No runtime
    dependency change; no existing schema, export, or fixture touched.

## [0.20.0] — 2026-07-20 (PUBLISHED 2026-07-20: tagged `v0.20.0`, merged to `main`, vendored by CEE PR #578 on staging — the "UNPUBLISHED — Paul-gated" label this heading carried was written pre-gate and is corrected here)

The four schemas-blocked items accumulated on 20 Jul: the readiness chip
intent (META-DECISION-DIAGNOSIS-2026-07-20 §5 P0 / INTAKE-FIX-LANE F1) and
the three ROADMAP 1.120 residual fields the wave-2 inventory verified ABSENT
from the published 0.19.0 tarball (`signal_code` / `signal` /
`framing_quality` — 0 occurrences each, positive controls passed;
WAVE2-REMAINDER-LANE-2026-07-20). Strictly additive: one new enum value, five
new optional fields, no existing field changed, removed, or re-typed; every
pre-0.20.0 payload still parses. Minor per the README semver policy.
Maximal-fixture registry: unchanged at 106 (no new object schemas — the one
new export, `FramingQuality`, is a scalar vocabulary, auto-exempt).

**⚠ Landing sequence (strict-consumer hazard — same as 0.19.0).** The block
schemas and the envelope are `.strict()`: a consumer on an OLDER pin
strict-fails a payload carrying `signal_code` / `signal` /
`framing_quality`. Producers must not emit them until every strict consumer
has re-vendored ≥ 0.20.0. The enum addition has the MIRROR hazard on
ingress: CEE's B1 validates `chip.action_type` fail-closed, so the UI must
not SEND `analysis_readiness` until CEE has re-vendored ≥ 0.20.0 (an older
CEE 422s the turn). Order: **this package merges → CEE re-vendors (accepts +
routes) and DGAI re-vendors (tolerates absence) → UI sends the chip intent /
CEE emits the new fields.**

**Consumer sign-offs (all three received from the UI workstream, 20 Jul
2026, before merge):**

1. **`analysis_readiness` approved as-is** (the UI's sparks will send that
   literal). Scope rule attached: the value covers the READINESS-CLASS
   sparks only — a spark whose honest intent differs stays gated dark
   rather than borrowing this literal.
2. **`signal_code` casing: SCREAMING_SNAKE_CASE adopted** as the doc-level
   convention (platform's code-keyed families precedent: MISSING_BASE_RATE,
   GRAPH_TOO_LARGE, the PLoT critique codes; visually distinguishes codes
   from lower_snake field names, serving the signal_code ≠ signal_id
   distinction). The schema stays an open string — the vocabulary registry
   remains producer-owned and casing is not validated.
3. **`framing_quality` `ready | thin | conflict` confirmed** — `conflict`
   displaces the UI's `blocked` heuristic state; the UI retires its
   client-side derivation on consumption. **The `signal` 140 cap is
   confirmed as a WIRE BOUND, not a layout contract**: consumers clamp
   visually, and no future card redesign should require a schema change.

### Added — `analysis_readiness` joins `ActionType` (chip intent, meta-decision fix)

The 10th value of the shared handler/action-type enum, reaching
`chip.action_type` (turn-payload ingress) and `ActionSchema.action_type`
(suggested actions) through the existing references. The defect this
unblocks: the UI's pre-analysis spark chips ("Prepare first analysis" etc.)
travel as anonymous free text, and CEE's draft-shape regex misclassified a
product-authored coaching prompt as a decision brief — clarify captured it
as the working brief with 0 LLM calls, the drafter faithfully modelled the
meta-decision, and run_analysis Monte-Carlo'd it ("Check Prerequisites Then
Run leads by 99 points"). Reproduced live at the deployed tip. The
mechanism-level fix is to carry product-authored intent explicitly; the CEE
routing arm (#575) and the UI chip metadata both stalled on this value
existing (B1 ingress is fail-closed — an unknown `action_type` 422s, and
smuggling intent through the untyped `chip.parameters` record was correctly
refused). Naming: matches CEE's own coaching-arm vocabulary (coaching signal
source `'analysis_readiness'`, `readiness_blocker` signals) so the wire
value and the arm it routes to share one name; like `what_would_flip` it
names an intent, not an imperative graph operation. All nine existing
values are retained verbatim (removal would be breaking) and pinned by test.

### Added — `signal_code` + `signal` on every guidance block (ROADMAP 1.120, UI-SEM-085 residual)

`ReviewCardBlockSchema`, `CoachingBlockSchema`, `EvidenceBlockSchema` and
`ExerciseBlockSchema` gain optional `signal_code` (non-empty string — the
stable machine code naming the producer signal that generated the item,
DISTINCT from the per-instance dedupe `signal_id`) and `signal` (1–140
chars — the short producer-authored per-item display line guidance surfaces
render; the Strengthen panel's signal line is UI-derived today). Measured on
the 19-Jul live capture the UI invents `signal_code` from `block.type` on
10/10 guidance blocks ('review_card' / 'coaching' — block TYPES), which is
why nothing ever matches a real code and 'discuss'-actionability is still a
client-side heuristic. `signal_code` is deliberately an OPEN string, not a
closed enum: the vocabulary is CEE's signal registry, and a closed enum here
would be a hand-maintained mirror of a registry this package does not own.
On CoachingBlock, `signal_code` carries the housekeeping/rerun nudge codes
1.120 calls out — `coaching_kind` stays the rendering taxonomy and is not
overloaded.

### Added — `framing_quality` on `OlumiResponseSchema` (ROADMAP 1.120, UI-SEM-079)

Optional, new `FramingQuality` enum: `ready | thin | conflict`. The
producer's verdict on the user's decision framing, sitting beside 0.19.0's
`framing_question`. Today the Decision Overview card derives a
framing-quality bar client-side (blocker-severity critique + null
goal-threshold) — a quality verdict on the user's own framing, authored by
the UI. When this ships on the wire the UI heuristic retires; when absent,
no verdict is rendered (fail closed, never re-derived). Code-keyed (consumer
maps values to its own copy). Producer emission is a follow-on (the honest
source is CEE's readiness/critique machinery; prompt-estate where LLM-
assessed).

## [0.19.0] — 2026-07-19 (UNPUBLISHED — merge + publish are Paul-gated contract class)

The wave-2 producer fields (UI-TO-ORCHESTRATOR-2026-07-19 Q3 ranked asks +
the two schema asks A1 registered into task #13 + ask #20). Strictly
additive: every new field is optional, no existing field changed, removed,
or re-typed; every pre-0.19.0 payload still parses. Minor per the README
semver policy. Maximal-fixture registry: 103 → 106.

**⚠ Landing sequence (strict-consumer hazard).** The block schemas, the
envelope, and `ActionSchema` are `.strict()`: a consumer on an OLDER pin
strict-fails a payload carrying the new keys. Producers must therefore not
emit `category` / `priority` / `framing_question` / `decision_classification`
/ `detail` until every strict consumer has re-vendored ≥ 0.19.0. Order:
**this package merges → DGAI re-vendors (tolerates absence) → CEE re-vendors
and emits.** The passthrough-parent additions (`edge_e_values[].stability`,
CEE error `recovery` / `recovery_suggestion`, enrichment `decision_brief`)
have no such hazard — old consumers already tolerate them as untyped
siblings.

### Added — `category` + `priority` on every guidance block (ask 1, UI-SEM-085)

`ReviewCardBlockSchema`, `CoachingBlockSchema`, `EvidenceBlockSchema` and
`ExerciseBlockSchema` gain optional `category` (new `GuidanceCategory` enum:
`must_fix | should_fix | could_fix | technique`) and `priority` (number,
0–100). Measured on the 19-Jul live capture, the UI invented BOTH signals on
10/10 guidance blocks (`category` → `'should_fix'`, `signal_code` →
`block.type`) because no producer contract existed. `category` is code-keyed
(consumer maps values to its own copy); `priority` is a COARSE urgency score
(higher = more urgent, ties expected, producer derives it 1:1 from category)
— it is NOT a display order.

### Changed — the `priority_rank` contract is now STATED (ask 2)

No shape change. The authoritative statement lives as the block comment above
`GuidanceCategory` in `boundary/blocks.ts`: `priority_rank` is an ASCENDING
ordinal (lower = shown first), positive integers, UNBOUNDED, band prefix
meaningful (1–9 lifecycle-urgent / 10–99 review cards / 100–199 coaching /
200+ prompts), unique only within a band. The UI's `100 - priority_rank`
inversion is wrong for this scale and can now be retired.

### Added — `decision_brief` joins `CEE_UI_ENRICHMENT_KEEP_LIST` (ask 3)

11 → 12 keys, and `AnalysisEnrichmentSchema` types the field open
(shape owned by PLoT, #200 leader band). The UI-side consumer (DGAI
#291/#292) shipped contract-pinned and has never fired because a conforming
CEE projection strips this one key. The persisted brief carries `seed` /
`graph_hash` / `lineage`; CEE's deep internal-key strip removes them before
the CEE→UI hop — the new contract test pins exactly that (positive control:
the staging capture's persisted copy really carries all three).
**Paired change:** CEE's `P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP` must add the
same key in the CEE re-vendor PR (its contract test binds the two lists).

### Added — `framing_question` on `OlumiResponseSchema` (ask 4, UI-SEM-078)

Optional, 1–240 chars. The explicit producer channel for "Olumi's framing
question" — the UI currently promotes a guidance item and derives a question
client-side (verified leak: a CEE rerun nudge rendered under the framing
label). When present the UI renders it verbatim; when absent the slot stays
empty. Producer emission is a follow-on (the draft prompt is PMS-managed).

### Added — `decision_classification` on `OlumiResponseSchema` (ask 5, UI-SEM-077)

Optional `DecisionClassificationSchema`: `stakes` (`low|medium|high`),
`reversibility` (`reversible|partially_reversible|irreversible`), `horizon`
(the user's own timeframe wording, ≤ 60 chars), `risk` (appetite:
`averse|balanced|seeking`). Every dimension optional — partial classification
is honest; consumers render "not set" for absent dimensions and never
default. Enum dimensions are code-keyed. Producer emission is a follow-on
(same PMS vehicle as `framing_question`).

### Changed — `Stage` is declared the canonical `stage_indicator` vocabulary (ask 6, UI-SEM-020)

No shape change. `frame | analyse | decide | review` (British `analyse`) is
the complete vocabulary, versioned by this package; consumers must derive
their stage type from `Stage` / `Stage.options`, never re-declare it (a
consumer's hand-declared union drifted and silently disabled stage-adaptive
ordering). Pinned by test.

### Added — typed recovery on the CEE error envelope (ask 7, routed from DGAI #383)

`CeeTypedErrorSchema` gains optional `recovery_suggestion` (string — the
PINNED flat field name the UI reads first, ending its three-name passthrough
sniffing) and optional `recovery` (new `CeeErrorRecoverySchema`:
`{hints: string[], suggestion: string, example?: string}` — the object CEE's
`buildCeeErrorResponse` has emitted untyped since the draft pipeline
shipped). Passthrough parent: additive with no consumer hazard.

### Added — `edge_e_values[].stability`, the canonical shared band type (ask 8)

New `EnrichmentEdgeEValueStabilitySchema`, referenced optionally from
`EnrichmentEdgeEValueSchema`. Types the per-edge flip-stability band A3's
seed-sweep emits (previously it rode the passthrough parent untyped, so a
malformed band survived every schema parse — PLoT added a local interim
guard whose invariants this schema restates as the cross-repo source of
truth, verified against PLoT staging `enrichment-egress-guard.ts` + the F12
fixtures): non-negative integer counts with `n_seeds_flipped ≤ n_seeds`,
ordered finite endpoints (`band_min ≤ band_median ≤ band_max`), non-negative
`band_width`, and `seed_flip_means` with exactly one finite-or-null cell per
seed.

### Added — `detail` on `ActionSchema` (ask 20, the held-proposal confirm chip)

Optional, min 1. The R8 confirm chip's `label` was the entire ~300-char
mutation sentence (the UI renders producer strings verbatim and authors no
copy, so only the producer can shorten it). The contract split: `label` is
the SHORT display string; `detail` carries the FULL producer text behind it
verbatim. The CEE producer pair (short chip label + full changeset
description in the held-proposal card body) lands in the CEE wave-2 PRs.

## [0.18.0] — 2026-07-18 (UNPUBLISHED — merge + publish are Paul-gated contract class)

Strictly-additive: one new optional field on an existing schema, one new
exported schema. No existing field changed, removed, or re-typed; every
pre-0.18.0 payload still parses. Minor per the README semver policy ("new
schemas, new optional fields → minor").

### Added — `goal_constraints` on the draft_graph block

`DraftGraphBlockSchema` gains an optional `goal_constraints` array, and a new
`DraftGoalConstraintSchema` describes its elements (exported from `/boundary`).

**The defect this unblocks.** A brief carrying a hard constraint ("first-year
budget cannot exceed £50,000") is correctly extracted by CEE's deterministic
regex extractor (`cee.compound_goal.integrated constraint_count:1
from_regex:1`) and survives to the draft dispatcher, which then rebuilds the
wire block as exactly `{nodes, edges, node_count, edge_count}`. CEE could not
simply thread the field through: this block is `.strict()`, so an undeclared
key yields `unrecognized_keys`, which CEE's `validateEgress` converts into a
whole-response `EGRESS_CONTRACT_VIOLATION` fallback. The contract had to
declare the field first. Net effect today: a user's stated hard constraint
never reaches the client on the drafting path, leaving the entire downstream
constraint chain (CEE's `CEE_CONSTRAINT_INFEASIBLE_GATE`, PLoT's constraint
compilation, ISL's constraint tracking) unreachable from a natural draft.

**`.strict()` is retained.** The fix for a dropped field at this seam is to
DECLARE it, never to loosen the block to passthrough — a regression test pins
that an unknown key alongside `goal_constraints` still fails.

**Not a twin of `GoalConstraintSchema`.** `boundary/run.ts` already exports a
`GoalConstraintSchema`, and it is a DIFFERENT payload at a different seam: the
V2 run-request constraint (`{id, label, bound: lt|lte|gt|gte|eq, value}`,
`.strict()`, no node binding, no provenance). The draft-time constraint is
node-bound (`node_id`), uses the two-way ASCII `operator` (`>=` / `<=`), and
carries extraction provenance the compute path has no concept of
(`source_quote` / `confidence` / `provenance`). Neither is a superset of the
other, and reshaping the run-request one would be a BREAKING change to
`V2RunRequestSchema` (major bump, blast radius = the PLoT compute path). They
are therefore kept distinct and deliberately differently NAMED, with a
cross-reference on each — a same-named twin is a defect class this programme
has paid for before.

**Shape fidelity.** Field-level validators mirror CEE's producer schema
(`src/schemas/assist.ts` `GoalConstraintSchema`) exactly, with two documented
deviations:

- `source_quote` is NOT re-capped at 200 chars. CEE truncates at extraction;
  the cap is CEE ingestion policy, not a wire invariant, and this contract
  must never be the thing that fails a draft response.
- The element is `.passthrough()`, not `.strict()`. CEE's regex path emits
  `provenance_unit_normalised` (from the percent→fraction rewrite in
  `normaliseConstraintUnits`), which is absent from CEE's own schema; CEE's
  structural-parse is validation-only (the parsed result is discarded, so
  nothing is stripped) and the key reaches the wire. A strict element would
  have turned every percent constraint into an egress violation — the exact
  failure mode this change exists to remove. The field is nonetheless
  DECLARED, so it is typed rather than riding as an anonymous unknown key.

Mirroring CEE's validators adds no new rejection surface: CEE's Stage-4
structural-parse substep already runs `DraftGraphOutput.parse()` — embedding
those same validators — over this very array and hard-fails the turn with a
400 `CEE_GRAPH_INVALID` before egress.

Registry: **102 → 103 entries** (`boundary/DraftGoalConstraintSchema`). The
maximal fixture populates every optional including `deadline_metadata` and
`provenance_unit_normalised`, at both the bare-block site and the
`OlumiResponseSchema.draft_graph` omit-projection the UI actually reads —
these are distinct schema identities to the maximality walker, and only the
second proves the field survives on the real egress projection.

18 new tests (900 → 918). Written RED-first: before the schema change they
failed with the production error verbatim — `unrecognized_keys:
['goal_constraints']`.

## [0.17.0] — 2026-07-15

> **Publication-state correction (2026-07-18).** This section was previously
> headed `[Unreleased]` with the bump "deferred to the orchestrator". It in
> fact shipped: `package.json` was set to 0.17.0 in the same commit (f18217b),
> tag `v0.17.0` exists, and publish run 29428237394 shows `Publish to GitHub
> Packages: success` + `Create release tag: success`. Only `Trigger
> propagation` failed (the known missing-PAT step that reds every publish
> while the publish itself succeeds) — which is why the run reads as a
> failure at a glance. The same applies to the `[0.15.0]` and `[0.16.0]`
> sections below, still labelled "DRAFT — not published": both are tagged and
> both show `Publish to GitHub Packages: success` (runs 29084981289 and
> 29162653316 respectively), failing only on the same propagation step. Those
> headings are left as the original lanes wrote them, but they should not be
> read as current truth.

### Added — maximal-fixture contract library + completeness ratchet (W2E-1)

New `@talchain/schemas/fixtures` subpath (`src/fixtures/index.ts`, wired in
the package.json `exports` map): a maximal fixture for every cross-service
wire-format family — every optional field populated with clearly-synthetic
`FIXTURE_`-prefixed values, passthrough objects carrying an unknown-key
survival probe. Consumer repos import `MAXIMAL_FIXTURES` and deep-compare
`schema.parse(fixture)` against the fixture to make silent field drops
(the older-pin hazard that has cost coaching, evidence, and enrichment
fields) a test failure instead of a production loss.

The registry holds **102 entries**.

Guard rails in this repo (`tests/fixtures/`):

- **Completeness ratchet** — enumerates every non-enum Zod schema exported
  from the root / `boundary` / `orchestrator` entry points; each must have a
  registered fixture (identity-matched, so re-exports are covered) or an
  explicit documented exclusion (currently: the CEE-internal `orchestrator`
  namespace). A new exported schema without a fixture fails CI here first.
- **Maximality walker** (`src/fixtures/maximality.ts`, exported from
  `@talchain/schemas/fixtures` so consumers can audit their own pins) —
  the ratchet above checks schema *identity* membership only, so it is
  satisfied by an empty fixture, and the dominant drift path (a new optional
  field on an EXISTING schema — the shape of every historical coaching /
  evidence / enrichment loss) tripped nothing. The walker introspects each
  schema's `_def` recursively and fails on any optional/nullable field never
  populated, any empty array/record/set/map whose schema allows contents, and
  any un-exercised union branch. Gaps aggregate by schema identity (a field
  exercised anywhere counts). Handles nested optionals, discriminated-union
  variants, records, tuples, intersections, effects/refinement wrappers, and
  depth-capped lazy/recursive schemas. Fields that genuinely cannot be
  populated require an explicit documented `MAXIMALITY_EXCLUSIONS` entry
  (currently empty) — never a silent skip; stale exclusions are rejected.
  Both drift paths are pinned as permanent negative controls, and an
  anti-vacuity assertion pins the reached surface so the guard cannot rot
  into a no-op.
- **Round-trip zero-strip suite** — every fixture parses with zero field
  loss; the package's single `.default()` mutation (`EdgeV3Schema.edge_type`
  → `'directed'`) is explicitly documented and pinned as the ONLY one.
- **Union coverage** — `maximalOlumiResponse.blocks` must carry one block of
  every `BlockSchema` union member (introspected, so a new block type fails
  until covered); every `SystemEventSchema` member has a fixture variant.
- **Dist export guard** — the built `dist/fixtures/index.js` and the
  `./fixtures` exports-map wiring are asserted against the shipped artefact.

## [0.16.0] — 2026-07-11 (DRAFT — not published; merge + publish are Paul-gated contract class)

Strictly-additive minor bump: three optional fields + one closed enum on the
standalone `DecisionRecordSchema` family, nothing else touched. Zero fields
removed, renamed, or tightened; every object schema stays `.strict()`. Every
0.15.0-shaped payload parses unchanged (pinned by the existing decision-record
suite plus a dedicated 0.15.0-compat block in
`tests/boundary/decision-record.test.ts`).

### Added — goal-attainment probabilities on `prediction` (D-N Option-B derisk)

`DecisionRecordPredictionSchema` gains optional `probability_of_goal` and
`probability_of_joint_goal` (both `number`, bounded [0,1]): the chosen
option's goal-attainment probabilities as delivered at decision time —
`probability_of_goal` = P(option meets the single goal threshold),
`probability_of_joint_goal` = P(option meets ALL constraints jointly).
Producer values (ISL via PLoT) recorded verbatim; optional-forward, absent
whenever no goal target existed at capture.

Why now: Paul ruled calibration scoring **Option B** (score the
goal-attainment probability against whether the goal was actually hit;
Neil ratifies async) with the explicit derisk that *both candidate
probabilities get captured from day one so a Neil overrule is a recompute,
never lost data*. The CEE capture-addendum lane then verified the capture
CANNOT ship on 0.15.0: `DecisionRecordSchema` is `.strict()` at every level,
so the additive fields are hard-rejected at every layer — the capture
addendum is blocked on exactly this bump.

### Added — `prediction.confidence_source` provenance enum (calibration honesty §2)

New closed enum `DecisionRecordConfidenceSource` =
`'model_derived' | 'user_stated'`, carried as optional
`prediction.confidence_source`. From the calibration design pack's binding
honesty constraint (CALIBRATION-LOOP-DESIGN-2026-07-11/04 §2): model-derived
and user-stated confidence populations are NEVER blended into one calibration
score. Absent ⇒ `'model_derived'` for all records captured before elicitation
existed — a disclosed inference (lane 3a), not a fabricated value.

### Added — `decision.committed_by_user` (calibration pack lane 3a)

Optional `boolean` on `DecisionRecordDecisionSchema`: true when the record
was created by an explicit "log this decision" action, distinguishing
intentional commits from ambient auto-capture. Specified alongside
`confidence_source` in the same 0.16.0 lane of the calibration pack's build
slices (05, slice 3 lane 3a).

### Considered and NOT added (proposed-only — awaiting the design gate)

`target_ref` / `proposer` on `HeldProposalBlockSchema`: the contested-edge
pack (CONTESTED-EDGE-DESIGN-2026-07-11, 03 §5–6 + 06 E3) parks both for "the
first planned 0.16.0-class bump" **as a decision flagged for Paul/Neil**, with
no ratified shapes. They are described as PROPOSED in the 0.16.0 PR body and
deliberately kept out of the schema until that gate passes — `.strict()` on
the block means a premature field hard-rejects whole blocks at older-pinned
consumers during any rollout window.

## [0.15.0] — 2026-07-09 (DRAFT — not published; extends across the full sprint wave)

### Added — `ui_directive` block kind (additive; seamlessness R4 keystone)

New member of the `BlockSchema` discriminated union: `UiDirectiveBlockSchema`
(`type: "ui_directive"`), plus the closed `UiDirectiveVerb` enum
(`highlight` | `focus` | `open_inspector`, v1). Fills a verified-absent
channel — today a CEE response has no way to tell the UI "look here" /
"open this" without inventing a graph mutation or a free-text instruction.

Fail-closed dispatch contract: unknown `targets[].id` values are silently
skipped by consumers, never an error. Advisory UX only — never a state
mutation; a consumer that ignores every `ui_directive` block loses only
presentation polish. `targets` reuses the existing `TargetRefSchema` shape
(§0.1) rather than a bespoke ref type. `duration_ms` is bounded 500–10000ms;
`note` is an optional short display-safe caption (≤140 chars). Rate
expectation (documented, not schema-enforced): ≤3 per response.
`annotate` / `start_tour` verbs considered and deliberately deferred to a
future minor bump once their payload shapes are actually needed.

### Added — `selection_change` inbound system-event (additive)

New member of the `SystemEventSchema` discriminated union (7th member):
`{ kind: 'selection_change', selected: SelectedElementRef[] (≤20), cleared?:
boolean }`, plus the shared `SelectedElementRefSchema` (`{id, kind, label?}`)
it introduces. Debounced client-side; carries between-turn canvas selection
awareness ("here is what the user has selected now") with no accompanying
message. Advisory context only — never a command; CEE may use it to inform
the next response but it triggers no mutation, run, or handler side effect.
`cleared: true` with an empty `selected` distinguishes an explicit
deselect-all from a client simply omitting detail.

### Added — `selected_elements` on the V5 message turn payload (additive)

Optional `selected_elements: SelectedElementRef[]` (≤20, reusing the
`SelectedElementRefSchema` introduced alongside `selection_change` above) on
`MessageTurnPayloadSchema`. Verified gap: DecisionGuideAI's live V5 outbound
builder (`src/v5/buildPayload.ts`) sends no selection context on message
turns today — a same-named `selected_elements` field already exists on the
wire, but only on the dead V4-era builder (`src/services/turn-request-
builder.ts`, shape `{node_ids?, edge_ids?}`) that the live V5 conversation
flow never calls. This is the V5-shaped piggyback field for the CURRENT
turn's selection; `selection_change` (above) covers selection awareness
between turns with no message attached.

### Added — `DecisionRecordSchema` (additive; ROADMAP 3.1, "Minimal decision record now")

New standalone module `src/boundary/decision-record.ts`, exported but **NOT
wired into `OlumiResponseSchema`** or any other producer schema yet — this
is the data-capture contract for Olumi's long-term differentiator (predict
at decision time, review later, score against a future Brier-calibration
pass, ROADMAP 3.2).

`DecisionRecordSchema`: `{ record_id, scenario_id, created_at, decision:
{chosen_option_id, chosen_option_label, graph_hash, analysis_summary?},
prediction: {statement, confidence?}, review_date, outcome? }`. Every field
that only becomes available after the decision is made
(`decision.analysis_summary`, `outcome`) is optional-forward, so a record
is valid the moment a decision + prediction + review date exist and gains
fields over its lifecycle without a shape migration. `outcome.result` is a
closed enum (`better` | `as_expected` | `worse` | `abandoned`);
`outcome.brier_component` is one record's contribution to a future
aggregate calibration score, not the score itself.

Persistence lives in Supabase (coordinated separately, this sprint) — this
schema types the wire/API surface only. **Coordination note:** the
matching Supabase migration is authored in parallel; field names must
match this schema exactly.

### Added — optional `reasoning` on `OlumiResponseSchema` (additive)

Formalises the `_reasoning` wire sidecar shipped behind
`CEE_REASONING_CAPTURE_ENABLED` (ROADMAP 1.42, CEE PR #387, live on staging
9 Jul 2026, currently flag-off/dormant). Verbatim Sonnet-5 extended-thinking
text, captured byte-for-byte (Paul's explicit ruling — never summarised or
redacted). Display-only, for a collapsed-by-default progressive-disclosure
surface. **By explicit product ruling this field is NOT claim-safety-caged**
— the egress forbidden-phrase / mutation-language guards do not scrub it.
May be absent even with the capture flag on (model-adaptive: Sonnet-5 does
not always emit a `thinking` block; `redacted_thinking` is never captured).

Consumer-migration note: on the wire today CEE emits the underscore-prefixed
`_reasoning` sidecar, not this field. Consumers keep reading `_reasoning`
until CEE's producer migrates to emitting `reasoning` under both pins — a
coordinated follow-up, **not part of this PR**.

### Added — `held_proposal` block kind (additive; durable fix for ROADMAP 1.43)

New member of the `BlockSchema` discriminated union: `HeldProposalBlockSchema`
(`type: "held_proposal"`), plus `HeldProposalMutationClass` (`structural` |
`tunable`) and `HeldProposalReasonCode` (the `held`-reachable subset of CEE's
graph-management reason-code vocabulary).

Replaces the interim wire shape for a Graph Management held mutation batch —
today a `type:"error"` / `error_code:"INTERNAL_ERROR"` block whose
`details.blocker_readable` leaks internal doctrine prose (e.g. "§6
structural-vs-tunable doctrine is pending sign-off") into a field a literal
error renderer would show as a failure on a healthy hold. `held_proposal`
carries a display-safe `summary`, a code-keyed `reason_code` (not free
prose), `mutation_class`, a stable `proposal_id`, and `confirm_action_id` /
`decline_action_id` refs into the response's top-level `suggested_actions` —
never candidate/operation internals (T4.0 §5 redaction contract unchanged).

Evidenced from the live GM flip-and-verify wire captures
(`acceptance-evidence/gm-live-flip/journey/T2-gm-propose-response.json`,
`T4-gm-propose-2-response.json`) and CEE's
`src/orchestrator-v5/handlers/edit-graph-referee-gate.ts` /
`src/orchestrator-v5/graph-management/{referee,classify-mutation,reason-codes}.ts`
at `origin/staging` 2026-07-09.

Consumer-migration plan: CEE emits `held_proposal` behind the existing
`CEE_GRAPH_MANAGEMENT_MODE=live` gate (additive dispatch change, no new
flag); UI adds `held_proposal` to `KNOWN_OLUMI_TOP_LEVEL_KEYS` / block
renderer union + a held-proposal card component; pins bump CEE-first per
`ROLLOUT.md`, UI second.

### Paul-gate

This is a **draft PR only**. Do NOT merge, do NOT publish to GitHub
Packages, do NOT bump any consumer's `@talchain/schemas` pin. All six
changes above (`reasoning`, `held_proposal`, `ui_directive`,
`selection_change`, `selected_elements`, `DecisionRecordSchema`) are
strictly additive (zero existing fields removed, renamed, or tightened) —
verified by diff against `origin/main` — and the full test suite plus
`tsc` build stay green (745 tests: 674 baseline + 71 new across the four
latest additions). Merge + publish + pin-bump remain Paul-gated per this
repo's `CLAUDE.md`. **One Paul approval covers the whole wave** — the six
additions are reviewed and gated together, not as separate PRs.

## [0.14.0] — 2026-07-08

### Added — typed analysis-enrichment envelope (opt-in; transport unchanged)

New module `src/boundary/enrichment.ts` types the PLoT→CEE→UI analysis
`enrichment` payload that was previously an untyped
`z.record(z.string(), z.unknown())` passthrough — the platform's dominant
silent-data-loss seam.

- `AnalysisEnrichmentSchema` — the envelope. Parses BOTH seam projections:
  the full PLoT `/v2/run` response persisted byte-for-byte by CEE
  `run_analysis`, and the reduced CEE→UI keep-list projection on
  `analysis_result` blocks. All fields optional; the envelope and every
  nested object use `.passthrough()` (unknown keys always survive).
- Component schemas: `EnrichmentOptionComparisonEntrySchema` (incl. the
  PR #204 doctrine-B `goal_fit_basis` annotation),
  `EnrichmentFactorSensitivityEntrySchema` (incl. `zero_reason`,
  `evpi_status: 'below_resolution'`, open `confidence_source`),
  `EnrichmentRobustnessSchema` (incl. lane-W5 `display_verdict` /
  `display_verdict_reason`; `recommendation_stability` documented
  deprecated/no-longer-emitted), `EnrichmentFlipThresholdSchema`,
  `EnrichmentEdgeEValueSchema`, `EnrichmentInferenceWarningSchema`
  (incl. `CONSTRAINT_GOALFIT_MODELLED_BASIS`), `EnrichmentCritiqueSchema`,
  `EnrichmentM1CoachingSchema`, `EnrichmentDecisionReviewSchema`,
  `EnrichmentConstraintResultSchema`,
  `EnrichmentConditionalProbabilitySchema`, plus status vocabularies
  (`constraints_status` covers the PR #205 'unavailable' gating).
- `CEE_UI_ENRICHMENT_KEEP_LIST` — the CEE→UI 11-key safe-transport
  keep-list, exported as the single source of truth for cross-repo
  contract tests.
- Helpers `parseAnalysisEnrichment` / `isAnalysisEnrichment`.

Every field is evidenced from a live staging capture
(`fixtures/enrichment/plot-to-cee.run-analysis.staging.json`, mirrored
from the CEE repo) or from current staging producer code (provenance
tags [F1]–[F6] in the module header). Dispositions for dead/legacy
fields (`results`, `conditional_probabilities`, `semantic_severity`,
`recommendation_stability`) are documented on the schema rather than
silently typed or dropped.

**Purely additive.** The transport fields
(`AnalysisResultBlock.enrichment` et al.) remain
`z.record(z.string(), z.unknown())` — no existing consumer's validation
behaviour changes until it opts in via
`AnalysisEnrichmentSchema.safeParse(...)`.

Also adds `contract-tests/` (wire-shape contract-test pack + per-repo
installation notes — reference specs, adopted via per-repo lanes) and
`docs/enrichment-v1/` (schema-pin rollout plan; PLoT V2-read residual
spec). These folders are documentation/reference only and are not part
of the published package (`files: ["dist"]`).

## [0.13.1] — 2026-05-27

### Added — explicit draft_graph generate flags on MessageTurnPayload

Adds two optional boolean fields to `MessageTurnPayloadSchema`:

- `generate_model?: boolean`
- `explicit_generate?: boolean`

When either is `true` on a `kind: 'message'` turn and the scenario has
no graph (or zero nodes), CEE may deterministically dispatch the V5
`draft_graph` handler without first consulting the LLM tool-use router.

The two names are aliases of the same semantic ("the user explicitly
asked CEE to generate the model now"); clients may send either; CEE
treats them as equivalent. Both default to `undefined`.

Purely additive. Existing clients are unaffected. The schema remains
`.strict()`; the new keys are simply now accepted instead of rejected.
No discriminated-union refinement uses these fields — they are advisory
to CEE, not contract-binding cross-field invariants.

## [0.13.0] — 2026-05-15

### Added — V5 Phase 3 block types per Analysis tab data contract v1.3

Adds the four new V5 Phase 3 block types to the boundary `BlockSchema`
discriminated union, encoding the field shapes from the frozen contract
committed at
`Docs/v5/v5-analysis-tab-data-contract-v1_3.md` in the CEE repo
(PR #177, SHA-256
`24905122025585da88ba3f9423bc8300ff5985736984814fce9fac334dd1df69`).

Schemas only. No composer wiring. No prompts. No existing block changes.
`FactBlock` and `GraphPatchBlock` remain unchanged per contract §1.5 / §1.6.

- `ReviewCardBlockSchema` — emitted by the `decision_review` enricher
  after `run_analysis`. Hero-eligible (`priority_rank` REQUIRED).
  `card_kind` ∈ `narrative | bias | flip_threshold | evidence_priority
  | pre_mortem | assumption | robustness | scenario_context`.
- `CoachingBlockSchema` — emitted by the coaching pass and `draft_graph`
  structured-output threading. Hero-eligible.
  `coaching_kind` ∈ `orientation | widening | bias_signal | strengthen
  | assumption_check | calibration_prompt`.
- `EvidenceBlockSchema` — emitted by the evidence-ranking module.
  Hero-eligible. Includes `factor_label` + `factor_ref` plus the strict
  v1.3 §1.3 consistency rule (`factor_ref` MUST match the first entry
  in `target_refs` with `kind: 'factor'`). The rule is enforced by:
  - `EvidenceBlockSchema` itself — the natural import name carries
    the full v1.3 contract (`.superRefine` on the underlying
    ZodObject). Composer code that imports the obvious name cannot
    silently bypass §1.3.
  - `BlockSchema` — a union-level `.superRefine` applies the same
    rule when a block's `type === 'evidence'`. The discriminated
    union itself uses an internal `EvidenceBlockObjectSchema`
    (bare ZodObject, NOT exported) because `z.discriminatedUnion`
    only accepts `ZodObject` members.
- `ExerciseBlockSchema` — emitted by on-demand handler invocation
  (pre-mortem / outside view / devil's advocacy / consider opposite).
  NOT hero-eligible (no `priority_rank` field).
  `exercise_kind` ∈ `pre_mortem | outside_view | devils_advocacy
  | consider_opposite`.

### Added — shared Phase 3 schemas

- `ActionIntent` — 15-value strict union per §0.4. Replaces freeform
  `string` typings from earlier sketches.
- `TargetRefKind` — 7-value union (`factor | option | edge | goal | risk
  | constraint | outcome`). v1.3 adds `outcome` to the v1.2 set.
- `TargetRefSchema` — `{ id, label, kind }` per §0.1. Strict shape.
- `Phase3BlockFreshness` — `'fresh' | 'stale' | 'pending' | 'failed'`
  per §0. DISTINCT from the analysis-ready freshness verdict
  (`fresh | stale | unknown | none`) used on the existing
  `analysis_ready` envelope field — Phase 3 blocks use `pending` /
  `failed` for in-flight / error states.
- `Phase3BlockSeverity` — `'info' | 'warning' | 'critical'` per §1.1 /
  §1.3. DISTINCT from the existing system `Severity` (`info | warn
  | error`) used for `ErrorBlock` / telemetry.

### Common metadata (§0)

All four Phase 3 blocks carry: `block_id` (UUID, enforced via
`z.string().uuid()`), `signal_id` (REQUIRED for dedupe), `created_at`
(ISO 8601, enforced via `z.string().datetime({ offset: true })`),
`source_handler`, `graph_hash_at_generation` (REQUIRED for
analysis-derived blocks, optional for draft / pre-analysis / exercise
blocks), `freshness`.

### Copy-length constraints (§0.2)

Schemas enforce title ≤ 80 chars, body ≤ 300 chars, action_label ≤ 40
chars as a defence-in-depth gate so a composer regression surfaces as
a boundary Zod failure rather than being silently truncated by the
Analysis tab.

### Tests

`tests/boundary/blocks-phase3a.test.ts` — 132 new cases covering valid
fixtures, missing-required-field cases, unknown-kind / unknown-source
rejection, strict-mode extra-field rejection, copy-length boundary,
union exhaustiveness, discriminated-union routing, broad pre-existing-
block-type routing regression (all 8 existing block types), strict
format enforcement on common metadata (UUID `block_id` + ISO 8601
`created_at`), the EvidenceBlock `factor_ref` ↔ `target_refs`
consistency rule (with the union-level vs ZodObject-only bifurcation
documented), and a drift guard asserting GraphPatchBlock remains free
of Phase 3 metadata.

### Consumer compatibility note

`BlockSchema` is now a `ZodEffects<ZodDiscriminatedUnion>` rather than a
plain `ZodDiscriminatedUnion` (because the §1.3 consistency rule is
applied at the union level via `.superRefine`). Consumers that parse
via `.parse()` / `.safeParse()` are unaffected. Consumers that
introspect `.options` / `.discriminator` / similar internals on the
discriminated union are now reading through a `ZodEffects` wrapper; if
this becomes a need, a separate raw-union export can be added in a
follow-up. None of the current in-tree consumers introspect.

### Out of scope

- No composer wiring (CEE PR 2 will land that).
- No persistence-by-graph-hash logic (CEE PR 3 will land that).
- No prompt edits, no Analysis tab UI changes.

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

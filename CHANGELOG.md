# Changelog

All notable changes to `@talchain/schemas` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.41.0] — 2026-08-14

**The canonical-mutation hop's contract half: an apply may CITE the evidence that
motivated it.** One optional member, on one existing shape.

### Added

- `RoundParticipantRefSchema.evidence_event_id` — `Uuid.optional()`.

**Additive. Not breaking.** The existing two-member shape stays byte-valid, so the
journey-witnessed apply path is unchanged when nothing cites anything. The minor bump
follows this repo's 0.x policy (MINOR is the compatibility boundary), not the size of
the diff.

### Why one member and not three

`RoundParticipantRefSchema` is the SHARED attribution ref: `observed_state.elicited_from`
(graph) and `factor_value_edit.applied_from` (turn payload) are the same shape. So a
single optional member serves both ends of the hop — the owner's citation on the way in,
and the server-stamped record on the way out. Minting a second, evidence-shaped ref would
be a second authority on "which collab record may change this graph" (trap 21) on the one
seam where being wrong writes a forged attribution into somebody's model.

`authored_by` and `stance` are deliberately NOT carried. The evidence body is a
participant's own words and its author has a display name; neither may persist into
`scenarios.graph`, where the R-2 redaction routine cannot reach them. Both resolve at
render from round data, exactly as `display_label` already does. An id is also the only
form that stays VERIFIABLE — a body copied onto the wire is an unfalsifiable assertion,
which is why `applied_from` never carried a display name either.

### The asymmetry is intentional

The cited evidence need NOT be authored by `participant_id`. Applying Grace's number
BECAUSE ADA CHALLENGED IT is the most valuable case the collaboration feature has, and an
author-equality constraint would forbid exactly it. Do not "tidy" this into a constraint.

### Adoption

`state: declared` — nothing produces or consumes it at this version. Consumers move only
when their own vendored pin moves. **Deploy order is load-bearing** (hazard 1): a
`.strict()` consumer on 0.40.0 REFUSES an unknown member rather than dropping it, so no
producer may emit `evidence_event_id` until its own pin carries it — schemas → CEE
(vendor + code) → UI (vendor + code).

## [0.40.0] — 2026-08-13

**The PR4 evidence-loop minor: apply an ATTRIBUTED panel value to the model (design of record:
`olumi-docs/PHASE0-EVIDENCE-2026-07-28/pr4-two-person-witness-2026-08-12/EVIDENCE-LOOP-DERIVATION.md`
Q5/Q6). ADDITIVE — nothing required, nothing renamed, no EXISTING field narrowed; every payload that
parsed at 0.39.0 still parses IDENTICALLY, proven in-repo by `tests/contracts/additivity-0.40.test.ts`,
which replays the COMPLETE 0.39.0 maximal-fixture corpus (all 159 families, serialised mechanically
from the built dist at `76fe0ed9`) through the 0.40.0 schemas and asserts byte-identical parse output.
UI/CEE/PLoT all vendor 0.39.0 today (derived at each staging tip, 13 Aug 2026) — one aligned
three-pin re-vendor wave follows this release.**

⚠ **ONE PRECISE EXCEPTION TO "ADDITIVE", measured at both built dists (schemas #39 review, 13 Aug) —
read this before writing any re-vendor lane's brief.** `ObservedStateSchema` is `.passthrough()`, so at
0.39.0 the key `elicited_from` was admissible carrying **any** value. At 0.40.0 it is TYPED, so a
non-conforming value now REFUSES the whole `observed_state` — and through `NodeV3`, the whole
`GraphV3`. Confirmed refusals at 0.40.0 that parsed at 0.39.0: a legacy string, an object carrying
`display_name`, and `null`. Discriminating control: the identical payload with the key RENAMED parses
byte-identically at both versions, so it is the key name and not the fixture.

**Why this is a note and not a defect: reachability was measured at ZERO** — `elicited_from` and
`applied_from` occur 0 times across the UI, CEE, PLoT and ISL staging tips (contrast control
`observed_state`: 874 / 2292 / 1337 / 584), 0 times in every open PR, and 0 times across 830 parsed
JSON captures. No stored graph or live payload can carry a non-conforming value today. **A re-vendor
lane therefore does NOT need to migrate stored graphs — but it must not be told, as this entry
originally said, that nothing could possibly reject.**

*(The in-repo 159-family corpus is structurally blind to this class: `.passthrough()` admits keys no
corpus enumerates — check what a corpus EXCLUDES, not only what it covers.)*

### 1. `RoundParticipantRefSchema` — the shared attribution ref (`/boundary`, re-exported at root)

```ts
{ round_id: Uuid, participant_id: AuthoredBy }  // .strict()
```

WHICH round, WHOSE stated value. `participant_id` consumes 0.39.0's `AuthoredBySchema` **by object
identity** (one authorship axis, 2.682 — no near-identical twin; pinned by test). **Ids only,
deliberately:** display names resolve at render from round data and are NEVER persisted into the
graph — a display name inside `scenarios.graph` would sit beyond the R-2 redaction routine's reach.
The `.strict()` reject of a `display_name` key is pinned by test.

### 2. `observed_state.elicited_from` (optional, `ObservedStateSchema`)

The server-stamped attribution for a value applied from a panel round. **Absence is DISTINCT:**
"not applied from a panel round" (every pre-0.40.0 value, every non-panel write) — never
"attribution lost". Producer rule: CEE stamps `elicited_from` and `source: 'panel_elicited'`
TOGETHER, only after verifying the claim against its own collab store (INV-F — the server stamps
only what it verified). Census rows answered `distinct` at both new declaration sites.

- **Skew, derived by execution against the built v0.39.0 dist (not asserted):** a 0.39.0 consumer
  ⚠ **and 0.40.0 therefore REFUSES a non-conforming `elicited_from` that 0.39.0 admitted** — see the
  measured exception at the top of this entry (reachability zero today, so no migration is owed).
  PARSES a payload carrying `elicited_from` and retains the key (`.passthrough()`), validating
  nothing about it — and an INVALID ref (display name, non-UUID round) also parses at 0.39.0,
  which is exactly the hole 0.40.0's typed declaration closes. Consumers that project fields
  explicitly still drop it (hazard 1) — hence the aligned re-vendor wave.

### 3. `factor_value_edit.applied_from` (optional, `FactorValueEditEvent`)

The client's attribution CLAIM on an apply-from-reveal edit ("Use this value" on a reveal row).
The apply rides the EXISTING value-edit member — deliberately NOT a new collab-seam graph-write
route (a second graph-write path is the shared-mutation hazard; the ratified mechanism is
G2 §7.3). **Never trusted:** CEE verifies round-closed · participant-in-round · latest-belief-
equals-value against its own store and refuses loud on mismatch.

- **⚠ Reader-first sequencing is MANDATORY, derived by execution against the built v0.39.0 dist:**
  every `SystemEventSchema` member is `.strict()`, so a CEE pinned ≤0.39.0 receiving
  `applied_from` **rejects the whole turn** (`unrecognized_keys` at path `['event']`; the control —
  the same turn minus the field — parses). Order: publish 0.40.0 → CEE re-vendors + deploys →
  only then the UI emitter ships. Same sequencing class as this member's own 0.29.0 landing and
  `graph_state`'s 0.23.0 landing.

### 4. `OBSERVED_STATE_SOURCE_LITERALS` + `KnownObservedStateSource` — the source vocabulary, declared

Until now the `observed_state.source` union lived only in the CONSUMERS, twice, as hand-maintained
mirrors of each other: CEE `src/schemas/cee-v3.ts` `ObservedStateV3.source` (a closed 7-member
enum, self-described "the narrowest validator in the chain", derived at staging `335a9380`) and the
UI's `src/canvas/domain/valueProvenance.ts` `SOURCE_CLASSES` (11 literals, a strict superset,
derived at staging `f04e756d`) — CEE's own comment names the UI file as "the acknowledged
cross-repo source of this list". 0.40.0 declares the union of those corpora **plus
`panel_elicited`** (12 literals) in the contract, so both mirrors can become derivations at their
re-vendor PRs.

- **The WIRE field stays `z.string()`, deliberately** — narrowing would be breaking (not a MINOR),
  and a gating vocabulary refuses every literal it is missing (the trap-12d short-list failure).
  The enum is a consumer-side vocabulary, never a wire gate; the distinction is pinned by test,
  with a positive control proving the enum CAN refuse.
- **Skew for `source: 'panel_elicited'` at 0.39.0 pins, derived at the consumer bytes:** parses
  everywhere (free string); UI `classifyValueProvenance` returns null → honest neutral;
  UI `isReviewedByUser` counts the factor unconfirmed (conservative, honest); PLoT has ZERO reads
  of the field (swept at `b9f6b5a7`). The one refusal — CEE's own internal `ObservedStateV3.source`
  enum — sits inside the only service that would ever STAMP the literal, so it cannot fire before
  CEE's own leg widens that enum in the same re-vendor PR. Safe by construction, not by luck.

### Consumer legs this release names (none built here — this repo publishes, it never edits a consumer)

1. **CEE re-vendor:** widen `ObservedStateV3.source` (or derive from `KnownObservedStateSource`);
   the verify+stamp leg in `set-factor-value.ts` (derivation element 4).
2. **UI re-vendor:** `valueProvenance.ts` kind `'panel'` + reveal-row apply affordance
   (elements 2/6); the emitter ships LAST (reader-first, above).
3. **PLoT re-vendor:** pin alignment only — no behavioural leg (zero reads, derived).

**The four-car train unblocking proof-PR2 (science provenance) and proof-PR4 (the collaborative
slice): 2.964's claim-provenance triple · 2.701's deferred ui_directive enum · 2.698-S2's
`run_delta` block · the 2.686 U-S0 collab types. FULLY ADDITIVE — no existing field is renamed,
retyped, narrowed or removed; every payload that parsed at 0.38.0 still parses IDENTICALLY,
proven in-repo by `tests/contracts/additivity-0.39.test.ts`, which replays the COMPLETE 0.38.0
maximal-fixture corpus (all 133 families, serialised mechanically from the built dist at
`371e18c8`) through the 0.39.0 schemas and asserts byte-identical parse output.**

### 1. `DskClaimProvenanceSchema` + `dsk_claim_provenance` on CoachingBlock AND ReviewCardBlock (ROADMAP 2.964)

One strict nested object, the three claim members REQUIRED, so the triple is atomic by
construction (the 0.37.0 `dsk_provenance` doctrine — CEE #830 — applied to CLAIM provenance;
never flat siblings):

```ts
dsk_claim_provenance?: {
  claim_id: string;           // /^DSK-(B|T)-\d{3}$/ — the claim arms only; DSK-P-/DSK-TR- cannot masquerade
  claim_title: string;        // min(1)
  evidence_strength: 'strong' | 'medium' | 'weak' | 'mixed';
  protocol_id?: string;       // /^DSK-P-\d{3}$/ — INSIDE the object, never travels without its claim anchor
}
```

- `evidence_strength` reuses ONE shared `DskEvidenceStrength` instance with 0.37.0's
  `DskProtocolProvenanceSchema` (identity-pinned by test — derive, don't mirror; the vocabulary
  belongs to the DSK bundle's schema).
- **Absence = "not grounded in a cited DSK claim"** — no badge, never inferred, never defaulted
  (census rows answered `distinct` at both declaration sites).
- Reader-first safe (the `action_prompt` precedent): a UI on an older pin strict-fails a block
  carrying the key, so **CEE must not emit until both strict consumers re-vendor ≥ 0.39.0.**
  CEE's attach map (two lineage-bearing mint hops, bias cards gated on 2.965) is the producer's
  train — this field is the contract precondition 2.964 names.

### 2. `UiDirectiveSource` + `UiDirectiveBlock.source` (ROADMAP 2.701's deferred enum; UI-DIRECTIVE-0.38-DESIGN §2.3)

```ts
source?: 'ladder' | 'gate' | 'composer'
```

P4 gesture-source provenance: deterministic fact-derived (`ladder`), advice-gate deterministic
mapping (`gate`), or LLM-proposed on gesture-less turns (`composer`, the §3-hybrid slot).
Absence ⇔ emitted by a producer that does not stamp it — never null, no default, and a consumer
MUST NOT infer `ladder` from absence.

- **NO NEW VERBS — deliberately.** The wave-2 design's own §2 verdict is encoded as what this
  car does not do: `activate_tab` is ruled DO NOT ADD (`open_panel` already IS tab activation);
  `annotate`/`start_tour` still need their own payload shapes; the §2.2 right-panel target
  extensions carry an unfired named trigger. The verb enum is pinned unchanged by test.
- Scope note, stated honestly: row 2.701's "future enums ride 0.39.0" names no member list; the
  §2.3 `source` field is the ONLY designed, non-speculative ui_directive-family schemas item in
  the estate's corpus. The §3-hybrid composer policy itself remains CEE's to ship (recommended,
  Paul-ratifiable at its merge report) — this optional field is safe contract surface either way.

### 3. `RunDeltaSchema` + `OlumiResponse.run_delta` (ROADMAP 2.698-S2; RUN-DELTA-DESIGN-2026-08-08)

The run-over-run delta block, one per completed rerun, beside `analysis_ready`. Carries the §b
attribution case enum (`C0_identical | C1_attributable | C2_unpaired | C3_engine_drift |
C4_budget_drift`), the pair-provenance record every member of which derives from PRODUCER ECHOES
(`seed_equal`, `hash_equal`, `builds_equal: 'equal'|'unequal'|'unknown'`, `n_equal`), and the S2
first tier: leader line, per-option win-probability lines, flip-threshold band lines (each with
`noise_verdict: 'signal'|'within_noise'|'not_noise_qualified'`), and the `edit_list`.

- **Fabrication rules live in the type system** (`refineRunDelta`, exported): `C1_attributable`
  fails to parse without seed_equal ∧ ¬hash_equal ∧ builds_equal='equal' ∧ n_equal;
  `C0_identical` requires all four equalities; `edit_list` only on a ¬hash_equal pair and never
  empty (hash and list derive from one whitelist and cannot disagree). C2/C3/C4 deliberately
  carry NO cross-rule: their conditions can co-occur and the design states no precedence — the
  classifier's precedence is CEE's derivation obligation (trap 13c).
- **Shape provenance, flagged per the design's own gap:** the design specifies semantics
  (the §b quadruple + case table, §a first-tier quantities, §c card copy slots) but not Zod
  literals; field names/literals here are the minimal derivation of what the S3 card consumes.
  Deliberately NOT carried: any free-text attribution sentence (the sentence builder takes the
  case enum BY IDENTITY), per-edit attribution, later-tier quantity rows.
- Absence semantics `distinct` throughout (leader ids = no ENTITLED claim on that side; flip
  medians = not measured on that side; edit_list = prior fact predates edit tracking).

### 4. Collab elicitation + disagreement types (ROADMAP 2.686 U-S0; 2.968 build-list item 1)

New `boundary/collab.ts`: `ElicitationRound` / `ElicitationEvent` (discriminated on kind:
`belief_submitted | belief_revised | declined | clarification_requested`) / `ElicitationBelief` /
`ElicitationProvenance` (method `elicited_nl | elicited_numeric | derived`, `elicitation_version`
required) / `ElicitationTarget` / `Disagreement` / `DisagreementType`
(`structure | evidence | goals | risk_tolerance`) / `DisagreementStatus` (incl.
`accepted_as_difference` first-class) / the position-kind union (`exists | absent | reversed`
census kinds + `attributed_value` + `preference` + `doubt`) / `DisagreementParty` /
`DisagreementSubject` / `AuthoredBySchema` (`'owner' | 'assistant' |` participant UUID — ONE
authorship axis, co-designed with 2.682).

The ratified 8-Aug rulings are PARSE RULES, not prose: `doubt` and `declined` are VALUELESS BY
CONSTRUCTION (their union arms declare no value member — the analysis-fact doctrine);
`.strict()` everywhere, so a smuggled `recommended`/`winner`/aggregate member fails to parse
(spread-not-consensus); `parties[]` is 2.146's list of positions with provenance.

- **Neil-gate structural omissions (deliberate, land additively WITH their rulings/slices):**
  `elicited_range` is NOT DECLARED (G2 names it reserved-unpopulated pre-Neil — a strict parent
  makes premature population a parse failure, stronger than a reserved field);
  `internal_combined` is nowhere on the wire; `impact_on_analysis` (derived-or-absent, computing
  slice S3) and `suggested_resolution` (U-S2 facilitation) ship with their producing slices.
- **Scope forks, flagged:** the packet/reveal RESPONSE shapes appear in the unified plan's U-S0
  item 6 but not in the 2.968 build-list item 1 — the narrower later list is taken; they ride
  the CEE routes' train. Participant ids constrained to UUID (derived from the estate id style;
  makes the reserved literals collision-free) — widens in a versioned minor if CEE mints
  non-UUID ids. `graph_version_ref` stays an OPAQUE string resolving to `model_versions.id`
  (the unified plan's version anchor; a row id, never a hash).

### Notes

- **Adoption order (hazard 1):** every new object family is `.strict()` and both block carriers
  are strict, so consumers on ≤0.38.0 pins REJECT blocks carrying `dsk_claim_provenance` /
  `source` — producers must not emit until UI and CEE re-vendor ≥ 0.39.0 (reader-first, merge
  order schemas → consumers → producers). `run_delta` rides the strict `OlumiResponseSchema`:
  same rule. The collab types have no producer yet (the U-S0 CEE slice is the first).
- No `contracts/adoption-manifest.json` rows added (same call as 0.37.0/0.38.0);
  `contracts/manifest.sha256` unchanged; `SCHEMA_SHA` regenerated (version + new exports).
- `json-schema/` is byte-identical (it derives from the enrichment family only, untouched here).
- Census: 13 new optionality-bearing fields, ALL answered `distinct` with refs to their own
  schemas' absence-semantics comments (counts: distinct 40 → 53); the census was not weakened.
- Fixture registry: 133 → 159 (+26), incl. union-branch variants for the valueless arms.

## [0.38.0] — 2026-08-06

**Three independent additive cars, batched by the release seam. Fully additive on the wire — no
field is renamed, retyped, narrowed or removed; every payload that parsed at 0.37.0 still parses.
One deliberate TYPE-level consequence for TypeScript consumers is called out under car 1.**

**Release discipline note: this train must NOT merge until the 0.37.0 DSK legs are consumed
(UI #606 + CEE #833 merged — the one-train rule).**

### 1. `EnrichmentOutcomeStatsSchema` — honest-absence outcome stats (ROADMAP 2.646)

`mean` / `p10` / `p50` / `p90` are now **`.optional()`** (they were REQUIRED, byte-identical
0.31.0→0.37.0), and the block gains:

```ts
percentiles_source?: 'samples' | 'unavailable'
```

WHY: the required-four could not model ISL's honest-absence shape. On a degenerate run
(`OutcomeDistributionV2`, ISL `src/models/response_v2.py` @ `c25836f7`) the summary stats are
omitted while the REQUIRED accounting triple survives — `n_samples`, `n_valid_samples: 0`,
`validity_ratio: 0.0` is a measurement ("we sampled and got nothing usable"). PLoT's 2.581
partial carry (`src/routes/v2/run.ts` @ `c03e36fe`) forwards that block partially — what is
honest survives, what was not measured stays ABSENT, never `0`, never `null` — so the
required-four raised a TRUE `ENRICHMENT_CONTRACT_MISMATCH` on every degenerate option.

- **Absence semantics (census rows answered `distinct`):** an absent stat means NOT MEASURABLE
  FROM THE SAMPLE POPULATION; a present value (including 0) is a real measurement. The wire
  discriminator is `percentiles_source`, landing in this same train.
- **Never defaulted, pinned by test:** ISL's Python-side default is `'samples'`, but PLoT
  deliberately does not re-apply it and neither does this contract — an absent
  `percentiles_source` stays absent (a `.default('samples')` here would manufacture a
  provenance claim no producer made). Consumers MUST NOT read absence as `'samples'`.
- **⚠ TYPE-level consequence for TS consumers (deliberate):** `EnrichmentOutcomeStats.mean/p10/
  p50/p90` infer as `number | undefined` after a pin bump. Consumer code that read them as
  `number` must branch on presence (or on `percentiles_source`) — that forced branch IS the fix
  the row orders; do not restore requiredness to silence it, and do not `?? 0` it.

### 2. `DraftGoalConstraint.value_frame` — constraint frame attestation (ROADMAP 2.266 schemas-train half; reinforced by 2.298)

```ts
value_frame?: 'level' | 'delta'   // the canonical GoalThresholdFrame enum (0.31.0), reused
```

`goal_constraints[].value` carries the SAME unattested level-vs-delta frame problem that made
the goal probability a structural zero before 0.31.0 — witnessed live at ~100× consequence
(witness-2258: the auto-materialised `auto_goal_threshold` constraint evaluated level-vs-uplift,
`goal_fit 0.0054` where the honest answer was ≈0.55). Two honesty gates are suppressed pending
exactly this attestation: PLoT's auto-synthesis `'level'` refusal ("goal_constraints carry no
frame field … PLoT cannot convert it and will not guess", `run.ts` @ `c03e36fe`) and ISL's
frame-blind constraint check (ISL's `GoalConstraint` is frameless with `extra: 'ignore'` —
`robustness_v2.py` @ `c25836f7`).

- **This field is the PRECONDITION for reinstating those suppressed gates, not the delivery.**
  Producer adoption rides separate trains: CEE stamps it as a CODE CONSTANT at its constraint
  mint sites (never LLM-derivable), PLoT forwards it, ISL declares + converts at its comparison
  site.
- **Fail closed on absence:** absence means UNATTESTED — consumers must not compute joint-goal
  figures from an unattested constraint value, and must never default the field.
- **No per-constraint baseline member** (the rows specify none): the conversion baseline is a
  property of the TARGET NODE (`observed_state.baseline`; CEE's enricher-minted
  `goal_baseline`/`goal_baseline_raw` ride NodeV3 passthrough). A per-constraint copy would be a
  second source of truth that can diverge from the node's.
- **Derive-don't-mirror:** the field reuses the `GoalThresholdFrame` instance — one frame
  vocabulary, two attestation sites; an identity pin REDs if it is ever replaced by a copy.

### 3. `exercise_kind` += `'opportunity_cost'`, `'implementation_intentions'` (DSK selector design 2026-08-06, slice E1)

Appended enum members; nothing moves. Vocabulary for DSK protocols P-004 / P-006, which
currently CANNOT be emitted (no member ⇒ CEE's strict parse drops the block). The emitting
slices (O1 / S1) are Paul-gated product rulings and ship separately with their own trains.

- **Deliberately left out:** S1's `ActionType` member `'confirm_decision'` and its
  `HandlerFactSchema` arm. The HandlerFact arm is shaped machinery whose result object could
  change with Paul's ruling; and this repo's only precedent for reserving an ActionType member
  ahead of the wire carrying it (`what_changed`, PR #17, 22 Jul) was explicitly Paul-approved.
  S1 has no ruling yet, so its members wait for it.

### Notes

- **Adoption order (hazard 1):** consumers on ≤0.37.0 pins silently pass `percentiles_source` /
  `value_frame` through untyped (`.passthrough()` shapes) and reject the two new
  `exercise_kind` members at strict parses — dark-but-honest, never a wrong number. The CEE pin
  bump (0.35.0 → 0.38.0 at CEE `c80cfead`) silently adopts everything in 0.36/0.37/0.38 and owes
  a semantic delta measurement across the skipped versions (2.618's standing lesson).
- No `contracts/adoption-manifest.json` rows added (same call as the 0.37.0 `dsk_provenance`
  car); `contracts/manifest.sha256` is unchanged, `SCHEMA_SHA` regenerated (version +
  json-schema docs).
- Census: 6 new optionality-bearing fields, all answered `distinct` with producer refs
  (counts: distinct 34 → 40); the census was not weakened.

## [0.37.0] — 2026-08-06

**Leg 1 of 3 of DSK protocol provenance (ROADMAP 2.490 slice 2; merge order schemas → UI → CEE —
the reader lands before the producer). Fully additive — one new exported schema and one new
OPTIONAL field on `ExerciseBlockSchema`; no existing field is renamed, retyped, narrowed or
removed.**

### Added — `boundary/DskProtocolProvenanceSchema` + `ExerciseBlock.dsk_provenance` (optional)

One strict nested object, all three members REQUIRED, so the triple is atomic by construction:

```ts
dsk_provenance?: {
  protocol_id: string;        // /^DSK-P-\d{3}$/ — DSKObjectBase.id narrowed to the P (protocol) arm
  protocol_title: string;     // min(1)
  evidence_strength: 'strong' | 'medium' | 'weak' | 'mixed';
}
```

**Why one nested object and not three sibling optionals:** CEE #830 (2.491/2.456) shipped an
attestation that validated a DSK claim id EXISTED without checking the text under it RESOLVED TO
that id. Three sibling optionals reproduce that shape — an id could travel alone, an authority
claim with nothing to check it against. As one `.strict()` object no partial form parses, so
absence ("not attributed", the `pre_mortem` case) is the only alternative to a complete,
verifiable triple. No `superRefine` is used, so `ExerciseBlockSchema` stays a bare `ZodObject` and
CEE's `.shape`-derived egress guard keeps working (pinned by test).

Domains are the bundle's DECLARED ones (CEE `src/dsk/types.ts` `DSKObjectBase` /
`EVIDENCE_STRENGTHS`), not the two values bundle v1.0.0 happens to use.

### Notes

- Adoption order: **UI (reader) re-vendors 0.37.0 before CEE (producer) ships the field.** The
  deployed consumers' `ExerciseBlockSchema` is `.strict()`, so a producer emitting the field ahead
  of a reader re-vendor is a parse failure, not a silent drop.
- `npm pack` of this release is byte-identical to the tarballs pre-vendored on the two consumer
  branches (sha256 `835ab4b8381e1280f239de0d408c2da6790ab9f93a0a14ce6e5a389acd4dd369`), so those
  pins survive the merge unchanged — CHANGELOG.md is not in the published tarball.
- This entry and 0.36.0's were added on the PR branch by the merging reviewer; both release lanes
  had omitted the CHANGELOG.

## [0.36.0] — 2026-08-05

*(Entry written retroactively on 2026-08-06 by the 0.37.0 reviewer — the release shipped without
one.)*

**Editable-field table revision 2: the edge `validation` row (ROADMAP 2.474 panel leg, PR #35,
tagged `v0.36.0`).** Additive revision of `orchestrator/editable-fields.ts` and its tests only —
no wire schema changed shape. `provenanceOwnedSegments()`'s premise that `validation` had no human
setter was false (three human write sites at UI `ModelTabBody.tsx`); the table was re-derived
accordingly.

**Disposition: consumed by NOBODY — adopt 0.37.0 directly and skip this version.** Measured
2026-08-06 at each consumer's `staging` tip: UI and CEE pin `talchain-schemas-0.35.0.tgz`, PLoT
pins `0.31.0.tgz`. 0.37.0 is a direct descendant of the 0.36.0 release commit (`ef901f5`), so
vendoring 0.37.0 carries everything 0.36.0 added; no reason a consumer cannot skip 0.36.0 was
found.

## [0.35.0] — 2026-08-05

**The schemas leg of the coach structural-edit tool (Option A, ROADMAP 2.474), carrying
design-review amendments A1 / A3 / A5c / A5d / A6. Fully additive — no existing schema, export or
generated artefact changes shape.**

**⚠ Version note: 0.34.0 was NOT free.** Open PR #33 (`p4/transport-events-0.34`, head `b8838691`,
base `main`, `mergeable_state: clean`) already sets `package.json` to `0.34.0`. Two open PRs
claiming one release would make the publish workflow's `npm view @talchain/schemas@$VERSION` switch
silently skip the second one's publish while reporting green. Derived rather than assumed, per this
repo's own rule that the version note in `CLAUDE.md` has been wrong five times running.

### Added — `orchestrator/editable-fields.ts`: the CLASSED field-parity table (A6 + the J3 ruling)

`EDITABLE_FIELD_TABLE` — 42 rows, one per human- or AI-editable graph field, each carrying its
wire path, its root segment, its class, the inspector setters and non-inspector write sites that
reach it, and a one-line reason. Plus the derived accessors every consumer binds through
(`aiEditableFieldRoots`, `aiEditableObservedSubkeys`, `provenanceOwnedSegments`,
`invariantCoupledSegments`, `editableFieldUiSetters`, `fieldsOfClass`, `lookupEditableField`).

**Why classed and not a flat allowlist.** The "14 AI-editable roots vs 26 inspector setters" gap
does not decompose into "fields the AI is missing"; naive parity would be a shipped defect in two
of its four parts. Measured at UI `dae8908f` and CEE `ac62fd4d`:

| class | count | what it means |
|---|---|---|
| `grant` | 22 (17 already at parity, **5 genuinely new**) | the AI should hold the field |
| `invariant_coupled` | 7 | belongs to a set that must move together; owed a TYPED OP in a later leg, never a raw grant |
| `deferred_derivation` | 1 | **not granted, not denied** — the decision is pending a named derivation the row carries |
| `provenance_owned` | 7 | parity **DENIED, permanently** — "AI ≤ human" is satisfied by ≤ |
| `ai_only` | 5 | the AI holds it and no human field setter reaches it — the asymmetry runs both ways |

The five genuine grants: node `observed_state.std`, `state_space`, `probability`, `impact`; edge
`label`.

**`deferred_derivation` is the fifth class, added by orchestrator ruling on judgement J3 (5 Aug
2026), and the rule it encodes is general: a field is not granted on low confidence that it means
anything.** Edge `confidence` is human-writable but absent from `EdgeV3Schema`, so nothing
establishes that a write to it reaches any computation — granting an AI write to a field with no
known reader manufactures a lever that moves nothing while looking like it moves something. The row
carries the derivation that would settle it (`open_question`: who READS `edge.confidence` — engine
or client-only?), a required non-empty field on this class so a deferral cannot be a parking space,
and the screen rejects such a field with **its own reason** rather than the generic "no row in the
table", which would be a false statement about a field that has one. If the reader manifest comes
back empty the row LEAVES the table: a write-only field is not an editable field.

**Both 12d halves ship, because neither catches the other's defect.** Derivation proves the
consumers AGREE with the table and is structurally blind to the table being SHORT;
`tests/orchestrator/editable-fields.test.ts` therefore also carries a hand-written corpus that
spells the real setter and field names out, re-typed from the UI tip rather than derived, plus a
pinned content digest with a positive control (trap 13) proving it can see a dropped row.

**Pin-skew rider.** `requireEditableFieldTableRevision(n)` throws with both revisions named when a
consumer's pin carries an older table — the silently-narrower-allowlist failure made loud. Both
consumers are BEHIND today and neither carries this table — re-derived at each repo's own staging
tip on 5 Aug 2026: **CEE `7c3dca4a` pins 0.33.0** (it re-vendored in #819, so the earlier
"both pin 0.32.0" reading was already stale when written) and **UI `dae8908f` pins 0.32.0**. Both
must re-vendor 0.35.0 before either leg can bind. Never quote a pin without naming the branch and
the sha you read it at — this sentence went stale inside one session.

### Fixed before merge — two blockers found by adversarial review, both measured

- **The table was SHORT by `observed_state.interventions`, and that revoked a live capability.**
  CEE's `ALLOWED_OBSERVED_SUBKEYS` carries it; the derived accessor dropped it; and the op screen
  therefore REJECTED `data/interventions/<factor_id>` — the spelling the producer actually emits
  for an option-configure edit. Worse than the omission: the equality test had the sub-key
  **filtered out** with a note rationalising it, so the guard agreed by narrowing the comparison
  instead of by fixing the list. **That is trap 12d firing inside the change built to encode trap
  12d.** The row is added, the carve-out is deleted, the screen accepts both sanctioned spellings,
  and a hand-written list of LIVE WIRE SPELLINGS now guards them from the producer's side rather
  than the table's.
- **Nested provenance smuggling through an add value was OPEN.** The add screen inspected
  top-level keys only, so `add_node` with `{ observed_state: { source: 'user' } }` was ACCEPTED —
  probed, not inferred — and nothing downstream catches adds. Now recursive, mirroring CEE's
  `collectObjectKeys`. The interventions subtree is deliberately excluded, with a positive control
  proving the screen does not over-reach: `source` **is** an `InterventionV3` field
  (`cee-v3.ts:284`) meaning how the intervention was determined — a different field wearing the
  same name as node provenance, which CEE exempts for exactly that reason.

### Added — `orchestrator/edit-tool-ops.ts`: the tool op-batch (A1 / A3 / A5c / A5d)

`EditToolOperationSchema` is the canonical `PatchOperation` vocabulary — `{ op, path, value }` over
CEE's own six op kinds — so the tool enters the existing `handleEditGraph` → referee → commit train
rather than minting a second producer vocabulary (A1: a tool emitting referee envelopes directly
would need a new applier, i.e. 2.380's parity defect built on purpose). `.strict()` throughout, so
an unknown key is a rejection rather than a silent strip.

The schema is deliberately NARROWER than CEE's, never wider, and **the narrowing is the classed
table**: every update key is screened against it, with `provenance_owned` and `invariant_coupled`
producing their own precise reasons before the closed-allowlist reason. That makes the table
load-bearing in the contract rather than documentation the referee happens to agree with.

Two fields CEE's shape has that this one omits, each closing a seam:
- **`old_value`** — the producer reads it to fill a receipt's "was" half. An LLM-authored "was"
  value is a fabricated number in a trust surface (the 2.461 class); the executor reads the real
  previous value from the persisted graph, exactly as A5b requires for hashes.
- **`value` on remove ops** — never read by the producer, so declaring it optional would accept a
  silently-ignored payload. Both omissions keep an `EditToolOperation` assignable to a
  `PatchOperation`, because both fields are optional there.

**ADD values are screened too, which is strictly tighter than the referee and closes a real hole:**
`checkFieldSafety` screens only `update_node_field` / `update_edge_field`, and `add_node` projects
to a payload of just `{id, kind, label}` — so every other key on an add value bypasses the field
screen and reaches the applier. A producer could stamp `observed_state.source` on a NEW node and
never meet the provenance guard.

`EditToolOpBatchSchema` — the envelope: `batch_id` (uuid), server-stamped `base_graph_hash`
(absent/empty forbidden — the stale gate is non-optional), the operations, and A5c
`target_bindings` binding each existing-entity op to its target by **id AND label echo** (trap 19:
bind by identity, never by a predicate another object could satisfy). Coverage is exact — an
unbound update, a binding on an add, a duplicate binding and an out-of-range index all reject — and
A5d's id lifecycle is pre-caught: `remove_node X; add_node X` in one batch rejects with a precise
reason, because the referee's working view never subtracts removes.

`countEnvelopeFanOut(ops)` — **A3's root cause made computable.** The pipeline gate counts OPS (15)
while the referee caps ENVELOPES (`PROPOSAL_CAP` 8), and a multi-field update fans out one envelope
PER FIELD, so a 5-op batch can be whole-batch rejected after passing a 15-op gate. This package
exports the COUNT and deliberately NOT the number: A3 requires the cap stated once, derived from
CEE's own constant.

**Panel ops are a documented extension point, deliberately NOT open.** A7 makes right-panel
enumeration a blocking input and it does not exist yet; when it lands, panel ops join the same
discriminated union with the same verdict vocabulary. A test pins the union to exactly the six
graph kinds today, so opening it is a deliberate, RED-forcing act.

### Notes
- `contracts/adoption-manifest.json` gains one row, state `declared` — neither consumer reads the
  table yet, and `declared` is what the evidence licenses.
- Three new `open_objects` census keys (`EditToolOperationSchema` add-node/add-edge values and the
  nested strength): the add payloads carry GraphV3 node/edge data, whose own schemas are
  `.passthrough()`. The openness is structural; the add-value screen closes it behaviourally.
- Baseline before this change, measured in a fresh blobless clone at `4526cf58`: 41 files / 1410
  tests. After: 43 files / 1486 tests.

## [0.34.0] — 2026-08-05

**P4 transport — make human judgement reach the server (wiring only; no member feeds compute).**
Lane evidence: `PHASE0-EVIDENCE-2026-07-28/lane-p4-transport-2026-08-05.md` in the workspace root.

### Added
- `SystemEventSchema` members `edge_adjudication` (the ContestedEdgeCard verdict — edge identity
  as from+to node ids, verdict enum, optional signed `resolved_strength_mean`) and
  `prior_range_edit` (the inspector prior-range edit — `target_id`, finite `range_min`/`range_max`,
  optional `distribution`). Both `.strict()`. ⚠ READER-FIRST: a consumer pinned below 0.34.0
  REJECTS the whole turn on either kind — publish → CEE re-vendors + deploys → only then the UI
  emitters ship.
- Cross-field rules at the `OrchestratorTurnPayloadSchema` root superRefine (members must stay
  plain ZodObjects — `SystemEventSchema.options` is load-bearing for the parity tests and CEE's
  kind-exhaustiveness test): `overridden` requires `resolved_strength_mean`, `dismissed` forbids
  it; `range_min <= range_max`. Exported helpers `refineEdgeAdjudication` / `refinePriorRangeEdit`
  for bare-SystemEventSchema consumers.
- `EdgeAdjudicationVerdict` enum (`accepted_pass1 | accepted_pass2 | overridden | dismissed` —
  the UI's `UserAction` minus the unresolved `pending`).
- `HandlerFactSchema` members `feedback`, `edge_adjudication`, `prior_range_edit` with strict
  results (`FeedbackResultSchema` — R-004: `comment_present` boolean, NEVER the comment text;
  `EdgeAdjudicationResultSchema` / `PriorRangeEditResultSchema` — server-stamped
  `provenance: 'user_set'` literal). These persist judgements CEE previously acked and dropped
  (the `feedback` event committed with `handler_facts: []`).
- Adoption-manifest rows (declared) for both new event members.

## [0.33.0] — 2026-08-04

**One additive change: seam-specific critique schemas (Lane 3 Car 2, ROADMAP 2.293 — the
critique seam's typed-layer split).**

### Added
- `TransportedCritiqueSchema` / `TransportedCritique` (`boundary/enrichment.ts`): the CEE→UI
  browser-transport critique row — `user_message` REQUIRED, `message` deliberately NOT declared,
  matching CEE's `projectCritiquesForTransport` allow-list exactly. One schema was claiming two
  intentionally-different projections: the inbound (PLoT→CEE) row requires `message`, the
  projected (CEE→UI) row never carries it, so a surviving projected critique failed the very
  envelope whose doc claims to parse "the reduced CEE→UI keep-list projection".
- `AnalysisEnrichmentSchema.critiques` now accepts inbound OR transported rows
  (`z.union([EnrichmentCritiqueSchema, TransportedCritiqueSchema])`, inbound tried first). The
  inbound schema is byte-for-byte unchanged — the producer seam is NOT loosened, and nothing
  from 0.32.0's `ui_directive`/`ui_target` work is touched.
- Maximal fixture `maximalTransportedCritique` (no `message` key by design) + registry entry;
  the envelope's maximal fixture now exercises both union arms.

## [0.32.0] — 2026-08-04

**One additive change: `ui_directive` panel verbs (Lane 2, capability pillar P3 — UI
agency).** The `verb` enum gains `open_panel` and `open_section`; the block gains an
optional `ui_target` (a closed discriminated union: `{kind:'tab', id:<5 OutputsDock tab
ids>}` | `{kind:'model_section', id:<5 ModelTabBody section ids>}`, both branches
`.strict()`); and a cross-field consistency rule ties them together in BOTH directions
(panel verbs REQUIRE the verb-matching `ui_target` and an empty `targets`; graph verbs
FORBID `ui_target`). The rule is applied at the `BlockSchema` union level AND on the
public `UiDirectiveBlockSchema` (now a `ZodEffects`, mirroring `EvidenceBlockSchema`);
the bare object stays module-internal (mirroring `EvidenceBlockObjectSchema`).

**Additive analysis:** no field removed, no type narrowed, no required field added to any
existing shape — every pre-0.32.0 wire payload parses byte-identically. The new key is
optional on a still-`.strict()` object (0.18.0 precedent). **Strict-consumer landing
hazard, stated as ever:** consumers on OLDER pins strict-REJECT any block carrying the
new verbs or `ui_target` — producers must not emit them until every strict consumer has
re-vendored ≥ 0.32.0. Merge/deploy order for this train: schemas → DecisionGuideAI →
olumi-assistants-service; CEE only emits the new verbs from code that ships WITH its
re-vendor. PLoT does not read the Block union (verified at its staging tip `d011b99`) and
is not part of this train.

**Both target vocabularies are CLOSED enums bound to surfaces with a live renderer** at
the DecisionGuideAI staging tip this change was derived against (`6d5db185`): tab ids from
`uiStore.ts` `OutputTab`; section ids from the five `ModelTabBody.tsx` `makeSectionProps`
call sites. A schema-legal target with no renderer is a dead end (the `constraint`
TargetRefKind defect class, ROADMAP 2.457(b)) — extend these enums only in the same train
as the renderer that honours the new id.

New exports: `UiDirectivePanelTabId`, `UiDirectiveModelSectionId`,
`UiDirectiveUiTargetSchema` (+ types). Maximal-fixture
registry: +3 entries (two panel-verb block variants — the cross-field rule makes
`ui_target` and non-empty `targets` mutually exclusive, so one fixture cannot be maximal —
plus the `UiDirectiveUiTargetSchema` entry). Absence census: +1 row
(`ui_target`, verdict `distinct` with the discriminator schema-enforced in this same
train; unresolved count unchanged at 380). The block's two pre-existing census rows
(`duration_ms`, `note`) migrate anchor `boundary/UiDirectiveBlockSchema.*` →
`boundary/BlockSchema|type=ui_directive.*` — the derived key form every
effects-wrapped union member already uses (see the `type=evidence` rows); verdicts
unchanged.

## [0.31.0] — 2026-08-01

**Five additive changes, five different rows, one release train.** Four new optional
fields, one required→optional relaxation, and one keep-list entry. Keep-list **16 → 17
keys**. No exported schema is added or removed; maximal-fixture registry unchanged at 126.
**Purely additive: no field is removed, no type is narrowed, no required field is added.**

The five are batched deliberately rather than shipped separately: all three TS consumers
vendor this package as a **sha256-pinned tarball**, so every release costs a re-vendor PR
in each consumer. Batching halves that churn (the explicit rationale in ROADMAP 2.258 and
in the critiques-transport brief). **They are otherwise independent — no consumer needs to
adopt more than the one it cares about, and absence of any of them is safe everywhere.**

| # | change | driving row |
|---|---|---|
| 1 | `NodeV3Schema.goal_threshold_frame?: 'level' \| 'delta'` | ROADMAP 2.258 |
| 2 | `'critiques'` joins `CEE_UI_ENRICHMENT_KEEP_LIST` | critiques-transport brief, step 1 |
| 3 | `ObservedStateSchema.declared_scale?` + `DECLARED_SCALE_BOUNDS` | ROADMAP 2.193 |
| 4 | `CoachingBlockSchema.action_prompt?: string` | ROADMAP 2.225 |
| 5 | `EnrichmentFlipThresholdSchema.no_flip_in_range?` + `direction` relaxed | ROADMAP 2.228 / PLoT #300 |

### 1. `goal_threshold_frame` — attesting the frame, because no value guard can test it

ROADMAP 2.258: the goal probability has never been meaningful. CEE mints `goal_threshold`
as an absolute **LEVEL**; ISL's goal samples are **CHANGES FROM BASELINE**. Nobody
converts. The engine answers *"P(revenue CHANGE ≥ X)"* for a user who asked *"P(revenue
LEVEL ≥ X)"* — and the answer is a **structural zero**: 0 in nine of ten live instances,
every one `status: computed`, `n_valid_samples: 10000`, on decisions whose options
separate cleanly at 58/32/9% win probability. **The zero was forced by construction, not
discovered.**

**Why this had to be a contract field rather than a guard.** The existing validator
refuses `<= 0` and `>= 1`, and `0.8` is a perfectly sensible *value*. The defect lives in
the threshold's **frame**, and a frame is not a property any value check can see. Two
independent silences were each individually "correct", which is why nothing fired.

Stamped by CEE at its single mint site as a **CODE CONSTANT** — never LLM-derivable, and
never to be placed in a drafting prompt's output surface. Consumers **fail closed**: no
frame, or no baseline for the conversion, means **no goal probability at all**. A missing
number is honest; a confident wrong one is not, which is why PLoT #299 was reverted on
staging rather than left serving *"< 1%"*.

**The deploy order is the safety property, not a preference:** schemas 0.31.0 → ISL
converter deploy-verified on staging → **only then** PLoT re-lands #299. Re-landing the
plumbing first resurrects the untruth. CEE's stamp may land at any time — an older-pinned
PLoT strips the key, which degrades to dark-but-honest, never to a wrong number.

⚠ **PLoT does not forward this field, and will not by default.** Verified at PLoT tip
`9beb4229`: `toISLNode` (`translator-v3.ts:233-242`) is a six-field constructor and
`ISL_DECLARED_OBSERVED_STATE_FIELDS` is a ten-member allow-list — neither carries the key,
and **neither fails loud when the contract gains a field**. PLoT must *add* forwarding
(extend `toISLNode`, or carry a request-level scalar beside `goal_threshold`), which rides
the 2.258 PLoT stint and is a precondition for the ISL converter being reachable at all.
Until then a stamped frame is structurally deleted at the V3→ISL boundary — safe, because
ISL fails closed, but not the same thing as arriving.

Kept a **scalar enum on purpose**. ROADMAP 2.215 will want to record *how* the frame was
established; that arrives as a new optional **sibling** key on this `.passthrough()` node,
which is additive. Widening this field into an object would be breaking — the sibling path
is what lets 2.215 land without a second contract train.

### 2. `critiques` joins the CEE→UI keep-list — a pipeline killed at its last link

**The shape was already typed.** `EnrichmentCritiqueSchema` and
`AnalysisEnrichmentSchema.critiques` predate this release; **the only thing 0.31.0 changes
is one keep-list entry.** (Stated plainly because "type `critiques` on the enrichment
contract" was the brief's wording, and a reader could reasonably expect new fields here.)

The producer is real at both ends and has been for months: PLoT emits populated rows and
CEE buckets them with Paul-approved display copy dated 2026-04-30. The death was CEE's
strip loop dropping the key silently, one hop before the browser — the same shape as
0.30.0's VOI family.

**Transport is licensed; sanitisation is not waived.** CEE's D-bucket suppression and its
Tier-A/B ban scans must still run **before** transport, pinned by a planted-D-bucket
absence test **with a positive control**. And unlike the 0.30.0 family, a critique carries
`affected_option_ids` — **option identity** — so CEE's withheld-claim projection must be
*verified* against a withheld turn rather than assumed inert.

### 3. `declared_scale` — because no derivation from the current value can be sound

ROADMAP 2.159 found normalised factors accepting out-of-range values end-to-end (a live
`1.5` on a `[0,1]` factor). The #766 adversarial review then proved current-value
classification **unsound in both directions**: a `0` or `1` is a legal raw count *and* a
legal proportion, so the classifier cannot be built. 2.193 is the agreed fix path —
**declare** the scale instead of guessing it.

The vocabulary is **derived, not invented**: `unit_interval` / `ratio` / `raw_count` are
the classes CEE's `SCALE_DISCIPLINE` prompt already distinguishes at draft time (bounded
percentage · a ratio that may exceed 100% · a small unitless count left raw). That
knowledge exists upstream today and is discarded before the wire.

`DECLARED_SCALE_BOUNDS` ships beside it so the **bound is derived from the declaration in
one place** rather than re-implemented in CEE's validator and again in the UI's input hint.
Two hand-written copies of a server rule is the estate's dominant defect class, and
avoiding it is the literal complaint 2.193 raised.

Both ends are typed `number | null`, where `null` means unbounded on that side. `min` is
nullable even though every member is `0` today: `ratio` is non-negative only under the
**multiplier convention** this table assumes (1.0 = parity), and a signed-return convention
(-0.2 for a 20% loss) is unbounded below. Widening the type now is free — the table has
zero consumers; widening after publication would break every consumer that narrowed on it.
The *values* still assert the multiplier convention, and a producer using signed returns
must declare `raw_count`, not `ratio`.

**This is the one field in the release whose absence fails OPEN**, and deliberately:
absence means UNDECLARED, which is every stored graph. Reading absence as `unit_interval`
would be the unsound guess 2.193 exists to retire *and* would refuse legal values on
existing graphs. Backfill is a separate stored-graphs decision.

**0.31.0 does not close 2.159.** It ships the declaration only; the enforcement is CEE's
authority. A test in this release pins that the schema still accepts `1.5` on a declared
`unit_interval`, so the release cannot be misread as having fixed the bound.

### 4. `action_prompt` — the turn text, so the UI stops inventing one

`action_intent` names *what* to do and `action_label` names *what the button says*; neither
says *what to send*. So a UI wanting a remedy chip had to compose the turn itself,
inventing an interpretation of a signal only the producer understood. The live bias
coaching cards are the worked example — grounded, quoting the user's own brief, and
impossible for the UI to restate without paraphrasing evidence it did not generate.

**Verbatim means verbatim**: the consumer dispatches the string unmodified. Absence means
the producer authored no prompt and the consumer renders **no dispatching chip** — it must
not fall back to composing one, because that fallback *is* the defect.

Bound: `min(1).max(300)`. **Derived, not picked** — `action_label` takes the caption bound
(40) because it is a caption; `action_prompt` is producer-authored prose that becomes a
turn, so it takes this file's existing bound for producer-authored prose on the same
blocks (`PHASE3_BODY_MAX`). Declared as its own named constant because the two are equal
by derivation, not by definition.

**Scope: `CoachingBlockSchema` only.** `ReviewCardBlockSchema` and `EvidenceBlockSchema`
also carry `action_intent`/`action_label` and deliberately do **not** get `action_prompt`
here — extending it is additive and should ride evidence of a real producer, not symmetry.

### 5. `no_flip_in_range`, and `direction` becomes optional

**`no_flip_in_range` ends consumer string-matching.** `flip_reason` is an open,
producer-owned `z.string()`, so a consumer asking "was there simply no flip?" had to match
tokens like `no_effect_within_bounds` — a hand-maintained mirror of a vocabulary this
package does not own. The day a producer renames or adds a token, every matcher silently
reclassifies a no-flip row as a flip row, and **the drift reads as green**. The 2.228 work
added a new token to exactly this vocabulary. `flip_reason` is **not** narrowed by this
release and must not be: the boolean ends the *matching*, not the field.

It is a **tri-state, and the asymmetry is load-bearing**: absence = NOT ATTESTED (every row
on the wire today), `false` = attested that a flip exists, `true` = attested no flip in
range. **A consumer must not read `!== true` as "there is a flip."**

**`direction` relaxes from required to optional.** A row with no flip has no direction to
report, but the field was required — so PLoT (#300) must emit a `'none'` **placeholder**, a
value meaning "not applicable" wearing the costume of a real direction.

The deprecation path is explicit and **consumer-paced**: (1) now, the field is optional and
`'none'` still parses, so **no producer breaks on release day**; (2) once consumers read
`no_flip_in_range` instead of string-matching, PLoT stops emitting the placeholder and omits
the key; (3) the placeholder retires at the consumers' pace — it is **not** removed from the
vocabulary by this release and no consumer is obliged to migrate on any schedule. From
today: treat absence and `'none'` as the **same state**, and never let either reach a
rendered surface as a direction.

**PLoT #300 merged during review** (tip `9beb4229`): `no_flip_in_range` is already emitted,
and `direction` is widened to `'increase' | 'decrease' | 'none'`. PLoT's own
`m1-review-types.ts:301-325` names this release as what lets the `'none'` placeholder
retire. So step 1 of the path above is already satisfied producer-side — this release is
what unblocks step 2.

### Additive analysis, stated at the bytes

The published JSON-Schema artifacts changed in exactly two files, and the whole diff is:

```
EnrichmentFlipThresholdSchema.json   + "no_flip_in_range": { "type": "boolean" }
                                     -   "direction"   (removed from required[])
AnalysisEnrichmentSchema.json        same two changes, nested
```

One property added; one entry **removed from `required`**, which widens acceptance. Nothing
was removed from `properties` and no type was narrowed. The other three fields
(`goal_threshold_frame`, `declared_scale`, `action_prompt`) do not appear because the
published `json-schema/` surface is the **enrichment family only** — `NodeV3Schema`,
`ObservedStateSchema` and `CoachingBlockSchema` are not part of it.

⚠ **The `check:compat` gate does not cover these changes.** Its single wired seam is
`isl-response-v2`; it passes here having diffed a different contract entirely. Recording
that rather than quoting a green tick as though it were proof — the additive evidence above
is the artifact diff, the absence-parses tests, and the maximal-fixture ratchet.

### Absence-semantics census

Five new rows (`counts.unresolved` 379 → 380 — one genuinely new optional field, which is
the sanctioned way that ratchet moves). Verdicts are seeded only where the schema's own
comment makes them unambiguous:

- **`distinct`** — `goal_threshold_frame`, `declared_scale`, `no_flip_in_range`. Each has
  an absence that no value can express, and each is **DEBT, not a fix**: the resolution
  rides its own train.
- **`same`** — `direction`. The schema states the equivalence outright: absence and the
  `'none'` placeholder are the same state, which is the whole point of the relaxation.
- **`unresolved`** — `action_prompt`. Not guessed. `.min(1)` means no empty value is
  representable, so neither `distinct` nor `same` is evidenced, and an unevidenced verdict
  is worse than `unresolved` because it stops the next reader looking.

The census **surfaced `direction` on its own** — the field became optionality-bearing, so
the gate demanded a row. That is the instrument doing exactly what it was built for.

### Adoption

Five manifest rows, **all `declared`**, including `critiques`. `critiques` is *not*
`produced_dark` despite PLoT genuinely emitting it: that state requires a named producer
test that fails if the producer stops emitting, and no such test is named at a pinned sha
here. The 4 populated rows in the staging capture are **transport evidence, not a producer
test** — the distinction this manifest exists to enforce.

**Lock-step obligation:** CEE's `P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP` must gain `critiques`
in its re-vendor PR. Until it does, CEE's element-for-element parity test against this list
is **deliberately out of step, and that RED is the intended signal.**

## [0.30.0] — 2026-07-29

**The VOI family joins `CEE_UI_ENRICHMENT_KEEP_LIST` — `factor_evppi`, `decision_evpi`,
`p_win_sensitivity`, `correlation_model`.** Keep-list **12 → 16 keys**. New exported schema
`EnrichmentFactorEvppiEntrySchema`; maximal-fixture registry **125 → 126**. **Purely
additive: no existing key is renamed, reordered out, or dropped, and no existing field's
type changes.** This is slice 1a of V7-C; design of record
`V7C-EVPPI-RANKING-DESIGN-2026-07-30.md`.

### The defect this closes — the chain broke at the last link

ISL computes Strong–Oakley regression EVPPI per non-lever uncertain factor and emits it at
the top level of `ISLResponseV2` (`factor_evppi`, plus `decision_evpi`, `p_win_sensitivity`
and `correlation_model`). PLoT forwards all four **verbatim** as top-level keys of the
`/v2/run` response and always requests them (`include_voi: true`). CEE stores the PLoT
envelope byte-for-byte on the `run_analysis` fact. **And then CEE's transport keep-list
stripped all four, one hop before the browser** — so a consumer could not read them at any
pin, and no UI surface for them could ever have fired.

That last clause is the point worth keeping. A producer-side probe at ISL, at PLoT, or at
CEE's persisted fact would have found the field present at every hop it looked at, and a
prior review recorded exactly that conclusion — *"envelope reaches the UI"* — which was
false on the live path. **A chain that is whole everywhere except its last link reads as
whole from every vantage point except the consumer's.** The keep-list is that last link,
which is why it lives here, exported, rather than as a constant in one service.

### Why the whole family and not `factor_evppi` alone

`p_win_sensitivity` is **suppressed — absent, not null — under active correlation**, and the
thing that says so is `correlation_model.suppressed_attributions`. Transporting a field whose
absence carries a verdict *without* transporting the verdict is the two-states-one-byte defect
by construction: the consumer sees a missing key and cannot tell "suppressed for a reason" from
"never computed". `decision_evpi` travels for the same class of reason — it is the cap the
per-factor values are clamped against, and the only unit-safe band candidate
(`evppi / decision_evpi` is dimensionless) lives in a later slice. One train, not three.

Transport is **claim-inert**: the claim cage is the READER. Only `factor_evppi` has a licensed
surface in this train, and only as a **ranking with a below-resolution band — no magnitudes**.
`evppi` and `decision_evpi` are in OUTCOME units (`units: 'outcome'`), which is exactly why
rendering the number needs a goal-unit ruling that does not exist yet; pp figures from
`p_win_sensitivity` stay barred by the PP_TOKEN doctrine.

### The absence rule, in the type system rather than in prose

`EnrichmentFactorEvppiEntrySchema` carries `FACTOR_EVPPI_ABSENCE_RULE` as a `.describe()`, so
it ships in `dist/` and in the published `json-schema/` artifact instead of living in a comment
no consumer can reach at runtime — the same mechanism as `SWITCH_PROBABILITY_ABSENCE_RULE`
(0.28.0) and `ABSENCE_FAIL_CLOSED_RULE`:

> A factor ABSENT from this array was not assessed — a lever an option intervenes on, or a row
> whose estimator failed (disclosed as `FACTOR_EVPPI_PARTIAL` on `inference_warnings`). Absent
> is NEVER zero and MUST NOT be imputed, ranked, or rendered as "no value".

ISL **omits levers entirely**. On a ranking surface, imputing `{evppi: 0}` for a graph factor
missing from the array does not produce a harmless zero — it produces a **rendered rank** for a
factor nobody assessed. `status: 'below_resolution'` (`evppi <= noise_floor`, the permutation
null) is the separate, real state: *indistinguishable from noise at this run's resolution*,
which is a demotion, never "zero value" and never "not worth resolving".

### Typing choices, and what each one buys

- Only `factor_id` is **required** on a row. Every other field is optional and the object is
  `.passthrough()`, so a producer build that omits an audit leg cannot make a real persisted
  fact fail to parse. There is **no `factor_label` on the wire** — a consumer that cannot
  resolve `factor_id` to a canvas label must drop the row, not render an id-shaped name.
- `decision_evpi` is a plain `z.number()` even though ISL declares `ge=0`. This envelope's
  additive guarantee is that the only NEW rejections are malformed *known* keys; a float that
  lands at `-1e-17` is a real persisted fact, not a malformed one. The producer constraint is
  documented on the field, not enforced as a transport gate.
- `status` and `units` are typed OPEN (`z.string()`), not enums. An unknown status is a row a
  consumer drops — a display decision — never a parse failure that takes the whole envelope
  with it.
- `p_win_sensitivity` and `correlation_model` are typed OPEN (`z.record` array / passthrough
  object) because their shapes are owned by ISL and are not yet evidenced field-by-field.
  Typing them tighter would invent fields no producer emits.

### Tests

- `tests/boundary/enrichment.test.ts` — the 16-key drift pin, **plus a new purely-additive
  assertion** that names the pre-0.30.0 twelve and the added four as sets, so a future bump
  cannot smuggle a removal through a re-sorted literal.
- `contract-tests/cee-to-ui.contract.test.ts` — the family transports verbatim in producer
  order, parses, survives the deep internal-key strip, and **carries no option identity**
  (walked over the real values, with a positive control proving the walker can see one). That
  last test is the derived basis for CEE passing these keys through a **withheld-claim** turn
  unchanged: the leading-option egress guard has nothing to catch.
- A **trap-13 positive control**: the same input projected at the 0.19.0–0.29.0 keep-list is
  asserted to strip all four. Without it, "the keys arrive" is an assertion that cannot see the
  absence it claims to have fixed.
- **Provenance stated in the test file, deliberately:** the checked-in staging capture
  (2025-12) predates the VOI family and carries none of these keys, so the overlay is
  **synthesised from ISL's typed model**. These are SHAPE pins, not live-wire pins. The
  live-wire claim belongs to a staging probe, and nothing here should be read as evidence the
  bytes arrived.

### Sequencing

Enrichment transport is `z.record(z.string(), z.unknown())` at the block level and the typed
envelope is `.passthrough()` throughout, so **additive enrichment keys pass every pinned
validator**: there is no outage window and no forced landing order between CEE and the UI. The
CEE half (the same four keys added to `P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP`) and the UI reader
can land in either order after this publishes. Changing this list here does **not** change CEE
behaviour — CEE's own contract test is what binds the two constants.

### Also in this release

The `enrichment.ts` provenance header stopped enumerating the keep-list keys. That sentence was
a hand-maintained mirror of a constant 700 lines below it, and it had been stale since 0.19.0
(it never gained `decision_brief`). It now points at the constant. A provenance header is not
exempt from the estate's dominant defect class.

## [0.29.0] — 2026-07-28

**`SystemEventSchema` gains `factor_value_edit` — the inspector value edit, carrying the
value.** Maximal-fixture registry **124 → 125**. **Additive, new union member, nothing is
removed or changed.** This is the contract half of ROADMAP 1.346 (core-loop integrity); the
CEE reader and the UI emitter are separate, ORDERED trains — see the sequencing section,
which is a hard constraint, not advice.

### The defect this closes — measured, not inferred

A live probe on 2026-07-28 (UI `92f5406f`, CEE `cb54320e`) made two inspector value edits on
two factors of a drafted graph and captured every request. **Neither edit produced a single
network request, and CEE's `graph_hash` did not move on either** (`c9eacbc8538cc254` →
`c9eacbc8538cc254`). A chat edit on the *same* factor, as a positive control, moved it
(→ `677ca064fa393a81`) and moved every downstream number. The user was shown "Model changed
since this analysis. Re-run to update.", reran, and got byte-identical results under a green
"Analysis reflects the current model." strip.

The reason is on the wire, in this package. The only event that reported a canvas edit was
`direct_graph_edit`, and it carries **field NAMES only** (`fields_changed: string[]`) — never
a value. So even a mounted, working emitter could only have told CEE that *something called
`observedState` changed*, never what it changed to.

### Why a NEW member and not a `value` field on `direct_graph_edit`

`direct_graph_edit`'s own doc comment (0.23.0, F6) states that its `target_id` is a
**REPRESENTATIVE SINGULAR**: "explicit target → else the first changed node id (ascending) →
else the first changed edge id". It is a BATCH NOTIFICATION whose singular fields are a
reduction performed upstream by the UI's `graphEditBatchAdapter`. Keying a **mutation** on a
representative id would mutate whichever node happened to sort first in a batch rather than
the one the user edited — a defect by construction, not a risk. Its consumers are
notification-shaped to match (CEE silent-acks it; the orchestrator prompt family says
"acknowledge changes, note implications").

So the value-carrying edit gets its own member, and `direct_graph_edit` is **byte-identical**
to 0.28.0. That is pinned, not merely asserted:
`tests/boundary/turn-payload-0.29.test.ts::'direct_graph_edit still REFUSES a value'`.

### Added

- **`factor_value_edit`** on `SystemEventSchema` (`src/boundary/turn-payload.ts`), `.strict()`
  like every sibling:
  - `target_id: z.string().min(1)` — **required, ID-ADDRESSED.** Never a label; a label match
    silently retargets on a duplicate or renamed label.
  - `value: z.number().finite()` — **required**, on the **MODEL scale** (for a capped factor,
    `raw_value / cap`). An edit with no value is a `direct_graph_edit` notification, not this
    event. The server re-derives the persisted model value from its own stored cap and never
    persists this number verbatim.
  - `raw_value?: z.number().finite()` — the **USER-UNIT** magnitude as typed (30000 for
    £30,000).
  - `unit?: z.string().min(1)` — unit symbol for `raw_value`.
  - `field?: z.literal('value')` — which `observed_state` field was edited. **A LITERAL, not
    a string, and the difference is a skew seam.** A permissive string would let a future
    producer emit `field: 'baseline'` that PARSES at every pin ≥0.29.0, with the verdict
    (refuse / coerce / apply as a value edit) decided by whichever version each consumer is
    on — hazard 1 in a single field. As a literal the WIRE refuses it, and adding a second
    field later becomes a loud versioned widening. Pinned by a reject test.
- `'factor_value_edit'` in the `SystemEventKind` convenience enum (`src/boundary/enums.ts`).
  That enum is a hand-maintained mirror of the union — trap-12 — and the existing
  set-equality gate in `tests/boundary/turn-payload-0.22.test.ts` is what makes it fail loud.
- Maximal fixture `boundary/SystemEventSchema#factor_value_edit`, every optional populated.
  The numbers are internally consistent on purpose (`raw_value: 30000`, cap 100000 →
  `value: 0.3`) because that ratio is exactly the cross-check CEE runs.
- `contracts/adoption-manifest.json` row, state **`declared`** — no producer, no consumer,
  both test references `null`. It cannot honestly be more: the CEE reader and the UI emitter
  are unmerged, and a row naming a test nobody can run is the drift the manifest exists to
  catch.

### The scale vocabulary is BORROWED, not invented

`value` / `raw_value` / `unit` are taken verbatim from CEE's `ObservedStateV3` and
`normaliseFactorValue` (`raw_value` = user-unit magnitude, `value` = `raw_value / cap`). The
same probe found the live UI writing a display magnitude (300000) straight into the 0–1 model
field, which is precisely the confusion that arises when a boundary invents parallel names.
The `.describe()` text on each field states the rule so it ships in `dist/` rather than living
in a comment no consumer can read.

### Not added, deliberately

- **No `cap`.** A cap is the factor's SCALE, and changing it rescales every option
  intervention on that factor. Accepting a client-supplied cap would let an inspector edit
  extend a scale with no consent step; extending a scale keeps going through the existing
  consented "extend the scale" chip flow. Enforced by a reject test, so re-adding it is a
  conscious act with a RED to justify.
- **No `operator`.** An inspector edit is always an absolute set. Deltas stay in the NL lane.
- **No batch shape.** One event, one factor. Batching a value-carrying mutation reintroduces
  the representative-target ambiguity that motivated the split.

### ⚠ Sequencing — READER-FIRST IS MANDATORY

Every member of this union is `.strict()` and the union is a `discriminatedUnion` on `kind`.
**A consumer pinned below 0.29.0 that receives this member fails the discriminator and
REJECTS THE WHOLE TURN** — not just the unknown field. Consumer pins measured 2026-07-28 at
each repo's own `staging` tip: **UI 0.22.0, CEE 0.25.0, PLoT 0.22.0** (PLoT never sees turns).

Required order, and shipping it out of order 400s every inspector edit:

1. Publish `0.29.0` (merge to `main` here).
2. CEE re-vendors + **deploys** the reader.
3. **Only then** the UI emitter ships.

### Absence semantics — all three new optionals ANSWERED

`counts.unresolved` is **unchanged at 365**: the debt ratchet did not move, because no new
field landed as `unresolved`.

- `factor_value_edit.field` → **`same`**. Absence == `"value"`, and now trivially so: the
  field is `z.literal('value')`, so `"value"` is the ONLY value it can take. The equivalence
  is enforced by the type rather than promised by a doc comment — absence cannot absorb a
  future `"baseline"` edit because the wire will not carry one.
- `factor_value_edit.raw_value` → **`distinct`**. Absent is not `0`; `0` is a legitimate edit
  (the probe's second trial set a factor `0 → 7500`). Recorded as DEBT: the honest fix is a
  discriminated input mode rather than two optional numbers related by convention.
- `factor_value_edit.unit` → **`distinct`**. Absence flips *which guard fires* on the same
  digits — a stated unit range-checks as `value_exceeds_cap`, a bare number as
  `bare_number_outside_cap`. A consumer defaulting a unit for absence would silently change
  the verdict.

### Additive/breaking analysis

- **Runtime, as a validator:** additive. Every payload valid under 0.28.0 is valid under
  0.29.0 — a new union member widens what parses and narrows nothing.
- **Runtime, as a reader:** **NOT transparent, and this is the one to read.** Unlike an
  optional field on an existing member, a new member is only inert while nobody emits it. The
  moment a producer does, every consumer below 0.29.0 hard-rejects the turn. The mitigation is
  ordering, not the schema.
- **Compile-time: NOTHING GOES RED, and an earlier draft of this entry claimed otherwise.**
  `SystemEvent` and `SystemEventKindLiteral` both widen. It is *true* that an exhaustive
  `switch` over `event.kind` without a `default` would become a compile error on re-vendor —
  but **CEE has no such switch**, so no such error fires. Measured, not assumed: re-vendoring
  0.29.0 into CEE with no code change gives `pnpm typecheck` **0 errors**. (This package's own
  0.21.0 entry recorded the same finding for a different union — "zero `assertNever` / `: never`
  exhaustiveness checks" in CEE — so the absence is long-standing, not new.)
  **A new kind therefore falls SILENTLY through to the generic acknowledgement path** in
  `dispatch.ts` — which is exactly the failure this release exists to fix, one kind later.
  CEE closes it on its side in the same train with a derived exhaustiveness guard over
  `SystemEventKind.options`; a consumer that re-vendors without one inherits the silent
  fallthrough. **Do not read a widened union as a self-announcing change.**
- **Nothing auto-adopts.** All three TS consumers pin checked-in `file:` tarballs; adoption is
  a re-vendor PR in each consumer's repo.

## [0.28.0] — 2026-07-27

**`EnrichmentRobustnessEdgeSchema.switch_probability` becomes OPTIONAL.** The
contract forbade an honest omission, so a producer fabricated a number instead.
One field, one `.optional()`, plus the absence semantics attached to the field
itself. Unblocks `plot-lite-service#278`.

### The defect this unblocks

`switch_probability` is P(flipping this edge switches the recommended option) —
**higher means MORE fragile**. `classifyEdgeSeverity` (>0.7 `critical`, >0.5
`error`) and the doctrine-013 `visible` gate both derive from it monotonically.

ISL emits `robust_edges` as bare `"from->to"` **strings**, which carry no
measurement at all. Because this schema declared `switch_probability:
z.number()` **required** — and it types **both** `fragile_edges[]` and
`robust_edges[]` — PLoT's `normalizeRobustEdge` had only two dishonest options,
and took the first: `switch_probability: 1`, commented *"Robust edges have 100%
stability"*. On this scale, a `1` is the **maximum of the fragility scale**. An
edge ISL called *robust* shipped as maximally fragile, under a name whose
intended reading (`stability`) is the inverse of what the field means.

plot-lite-service#278 implemented the honest fix — omit rather than invent —
and **measured the consequence**: every `/v2/run` response then failed its own
egress contract, stamping `enrichment_contract_ok: false` plus a user-visible
`ENRICHMENT_CONTRACT_MISMATCH` warning on the wire (4 issue paths on the golden
fixture). It correctly refused both quietly fabricating and unilaterally
relaxing a shared contract from a consumer repo, reverted, and reported the
blocker with the honest assertion present and `it.skip`ped.

### The required-ness was never a live invariant

It was a **latent disagreement**, and it only bit the day a producer became
honest. Verified at the bytes, plot-lite-service `dd144f77`:

- `src/integrations/isl/types/plot-types.ts` → `NormalizedEdgeInfoV3.switch_probability?: number`,
  documented *"OPTIONAL: omitted when the source edge carries no
  switch_probability (absent ≠ 0). When omitted, `severity` and `visible` are
  omitted too."* — PLoT has **published it as optional all along**.
- `robustness-analysis.ts` `normalizeFragileEdge` **already omits** it when ISL
  sends no finite value, and the legacy string arm of `normalizeFragileEdges`
  omits it too. So a legacy-format *fragile* edge would have tripped the
  identical guard — the divergence was live for fragile edges before anyone
  touched robust edges.
- In **this very file**, `EnrichmentM1CoachingSchema.top_fragile_edge.switch_probability`
  has been `z.number().optional()`. The same quantity was optional one schema
  away and required here.

### Changed

- **`EnrichmentRobustnessEdgeSchema.switch_probability`: `z.number()` →
  `z.number().optional().describe(…)`.** One schema types both
  `robustness.fragile_edges[]` and `robustness.robust_edges[]`, so both arrays
  are unblocked by the single change.
- **The absence rule is attached with `.describe()`, not left in a comment** —
  the same mechanism as `ABSENCE_FAIL_CLOSED_RULE` (F6). A doc comment cannot
  reach a consumer; a `.description` ships in `dist/` **and** lands in the
  published `json-schema/EnrichmentRobustnessEdgeSchema.json`. (This release
  also **corrects** this repo's standing claim that those documents are "what
  ISL's Pydantic drift check consumes" — they are not; ISL re-derives its own
  artifact from this repo at a pinned commit. See the second commit on this
  branch.) The sentence names **both** wrong readings, because this field has
  been fabricated in each direction:

  > Absence means NOT COMPUTED — never 0 and never 1. A measured 0 is a real
  > measurement and must be preserved. Higher means MORE fragile, so reading
  > absence as 1 fabricates the maximum of the scale. Consumers MUST branch on
  > presence, never coalesce, and MUST omit anything derived from it.

- `severity`'s doc now states it is absent **together with** `switch_probability`
  — a severity derived from a substituted probability is a fabricated verdict.

### Not changed, deliberately

- **`edge_id` / `from_id` / `to_id` stay REQUIRED.** They are edge *identity*,
  derivable by the producer from the edge id in every arm (`parseEdgeId`), and
  PLoT sets all three unconditionally in both the string and the object arm.
  "Absent because not computed" is not a real state for them. Pinned by a test
  so the relaxation cannot creep.
- **No range or finiteness constraint added.** `z.number()` accepts `±Infinity`
  (JSON cannot carry it, so it is wire-unreachable) and the schema has never
  constrained `switch_probability` to `[0,1]`. Adding either would be *stricter*
  validation — the breaking axis — and is out of scope for an unblock. Named
  here rather than left for a later grep.
- **Nothing else in the family was relaxed.** The complete derived manifest of
  every remaining REQUIRED field in the enrichment module, and why each is left,
  is in the PR body. The one worth a follow-up is
  `EnrichmentOutcomeStatsSchema.mean/p10/p50/p90` (all required `z.number()`)
  against plot-lite-service `dd144f77`
  `intervention-normaliser.ts:964-967`, which writes `mean: dn(...) ?? null` —
  **`null`, not omission**, which this schema rejects. Whether those bytes reach
  `option_comparison[].outcome` on the enrichment wire is **UNVERIFIED here**,
  and the fix shape would be `.nullable()` not `.optional()`, so it is queued
  rather than guessed.

### Additive/breaking analysis

**Additive for every producer; potentially breaking for a consumer that assumed
presence — which is why this is a MINOR (the breaking axis at 0.x), not a patch.**

- **Runtime, as a validator:** strictly more permissive. Every payload that
  parsed under 0.27.0 still parses. Nothing that was rejected is now rejected
  differently.
- **Runtime, as a reader:** the accept-set moves in a direction an **older
  reader cannot follow**. A 0.27.0-or-earlier validator handed a payload that
  omits the field rejects it, by construction. That is the compatibility
  boundary, and it is what MINOR exists to declare — a patch bump would have
  told `compareHealthManifest` that 0.27.0 and 0.27.1 share a release line and
  are compatible, which is precisely the claim that is false.
  **Measured caveat, stated because it cuts against the argument:** *no
  validator on the live path fail-closes today* (see the pin table), so nothing
  actually rejects at current pins. The version must describe the **contract**,
  not the current leniency of its readers — especially when CEE's stated plan is
  to move its shadow validator to `enforce`.
- **Compile time:** `EnrichmentRobustnessEdge['switch_probability']` becomes
  `number | undefined`. Any consumer that imports the type and does unguarded
  arithmetic on it gets a `tsc` error on re-vendor. That is the type system
  doing its job — the error marks exactly the sites that would have read a
  fabricated number.
- **Nothing auto-adopts.** All three TS consumers pin a checked-in `file:`
  tarball, so this release changes no consumer until that consumer opens its own
  re-vendor PR.

### Consumer pins, measured 2026-07-27 at each repo's own `staging` tip

| Consumer | tip | pin | Must re-vendor to benefit? |
|---|---|---|---|
| PLoT `plot-lite-service` | `dd144f77` | `file:./vendor/talchain-schemas-0.22.0.tgz` | **Yes — this is the blocked producer.** |
| CEE `olumi-assistants-service` | `6cfb0e57` | `file:./vendor/talchain-schemas-0.25.0.tgz` | Not to avoid a break — **but see the shadow-validation window below.** |
| UI `DecisionGuideAI` | `201f1075` | `file:./vendor/talchain-schemas-0.22.0.tgz` | No. Verified negative: the UI imports none of the enrichment schemas and its own local fragile-edge types already declare the field optional. |
| ISL `Inference-Service-Layer` | `1716f9bb` | n/a — not a `@talchain/schemas` consumer | No. Its Pydantic model is **already** `switch_probability: Optional[float]`, so this moves the two contracts *into* agreement. |

Three different release lines live at once (0.22.0 / 0.25.0 / 0.22.0) — the
standing skew hazard, unchanged by this release.

**No validator on the path fail-closes today**, which is worth stating plainly
rather than leaving as an unexamined worry: PLoT's egress guard is fail-open by
design, CEE's `validateEnrichmentShadow` is default-`off`/shadow-only/swallowing
(`enforce` is not implemented), and the UI never parses the enrichment with this
schema at all. So an omitting producer causes **no rejection anywhere** at
today's pins.

**The one real ordering effect is CEE's enforcement-readiness window.** If
`CEE_ENRICHMENT_VALIDATION=shadow` is live on staging while CEE is still on
0.25.0 and PLoT has started omitting, CEE emits a
`v5.enrichment.schema_mismatch` event per analysis — which is exactly the metric
gating its stage-3 move to `enforce` (its own criterion: 7 consecutive days /
200 staging analyses at a zero mismatch rate). Omission mid-window resets that
clock. **Check that env var on staging before PLoT deletes the fabrication**; if
shadow is on, re-vendor CEE first.

**Note for whoever re-vendors PLoT:** the `vendor/` + egress-guard apparatus
exists on PLoT **`staging`**, which is where #278 landed. PLoT `main` is a
divergent production branch still carrying a registry pin
(`"@talchain/schemas": "0.1.0"`) and no `vendor/` directory. The re-vendor
targets `staging`.

### Adoption manifest

**No row added, and the reason is the row's own definitions.** The manifest
tracks whether a field has a verified producer and consumer; its four states
describe *adoption of a field's presence*. This change **removes** a presence
obligation from a field that has had real producers and consumers since 0.14.0.
`enforced` literally reads *"the field may be made required"* — recording that
against a field being made optional would be a false entry, and `declared`
("no verified producer and no verified consumer") is simply untrue. The checker
has no completeness rule that would require a row
(`scripts/check-adoption-manifest.mjs` validates only the rows present). A
mis-stated row is worse than no row.

## [0.27.0] — 2026-07-27

**`AnalysisFactSchema` — the dishonest state, made unrepresentable.** A
subject-scoped discriminated union replacing the flat-`status`-beside-a-value-map
shape. Closes Codex contract step-2 finding **F3** (P1). Maximal-fixture registry
**116 → 124**. **Additive, optional, CEE-internal; nothing is removed.**

### The defect, in one line

A flat `status` field plus a separate option-keyed value map cannot enforce
status/value honesty: `status: 'suppressed'` and a still-present plausible number
in `win_probabilities` **both parse**, because nothing in the type system relates
the two. A guard withholds a metric in one field while the number it withheld
rides along in another, and a consumer reads the number and states it. No
producer discipline closes that — the contract cannot see it.

### Added

- **`root/AnalysisFactSchema`** (also re-exported from `/orchestrator`) — a
  `z.discriminatedUnion('status', …)` over three `.strict()` branches:
  - **`ComputedFactSchema`** — `value` **required** (`z.number().finite()`,
    because `NaN`/`Infinity` is a failed computation wearing a `computed`
    label), plus `units`, `method_id` and `population` **required**. A number
    whose unit, method and sample population are unstated is the shape that
    produced the 1.52 sign-inversion class and the pre/post-noise mixing.
  - **`UnavailableFactSchema`** — `reason_code` required; **`value` is not
    declared at all**.
  - **`SuppressedFactSchema`** — `guard {id, version, reason_code,
    evidence_fact_ids[]}` required; **`value` is not declared at all**.

  Because the withholding branches do not declare `value` **and** are
  `.strict()`, a suppressed or unavailable fact carrying a number is an
  **unrecognized key** and fails to parse. That mutual exclusion is the entire
  point of the shape: not a convention a producer must remember, a parse error.
- **Identity on every branch, required**: `fact_id`, `analysis_id`, `metric_id`
  and `subject {kind, id}` over the closed vocabulary
  `option | node | edge | goal | scenario`. `fact_id` is **producer-owned and
  minted before commit — it is NOT a database row id**; `storage_fact_row_id` is
  a separate optional slot so the two identities can never be conflated. (Why it
  cannot be the row id, at CEE `820f3e83`: `supabase-store.ts:565`'s select list
  omits `v5_handler_facts.id`, `append_turn_atomic` returns the TURN row id,
  claims are composed before those ids exist, and one handler row carries many
  metrics.)
- **`population` is the 0.26.0 GENERATED `PopulationRefSchema`, imported** — not
  a second hand-written population shape. Asserted by **object identity**
  (`ComputedFactSchema.shape.population === PopulationRefSchema`), because a
  twin would pass every behavioural test that used only valid values and would
  silently re-open F4 inside the fact.
- **`RunAnalysisResult.analysis_facts?: AnalysisFact[]`** — the attachment point.
  Optional in its entirety; an empty array is a legitimate, *different* claim
  from absence.
- `tests/contracts/analysis-fact.test.ts` (66 tests) — 17 discriminating
  negatives, 2 honestly non-discriminating, 2 with no counterpart in the old
  shape, positive controls per branch, and a permanent **BLIND CONTROL**
  reconstruction of the flat shape asserting it accepts what the union rejects.
- Two `contracts/adoption-manifest.json` rows, both **`declared`** —
  `analysis_facts` and `analysis_facts[].population`. The second is the row
  0.26.0's changelog said it owed to "S1's `ComputedFact`".

### What is NOT in this change

- **Nothing is removed.** `win_probabilities` and every other legacy map on
  `RunAnalysisResultSchema` is **RETAINED** for the compatibility window.
  **Disclosed limit, pinned by a test rather than glossed:** the union makes the
  dishonest state unrepresentable *within a fact*; it does not delete the map, so
  a producer emitting both can still contradict a suppressed fact via the map.
  Removing the maps is a later change train, gated on a verified consumer.
- **No UI-wire placement.** The union goes nowhere near `OlumiResponseSchema` in
  this release. When it does, it goes at a **NEW TOP-LEVEL key**: at UI tip
  `6d3f4611`, `responseParser.ts` quarantines unknown TOP-LEVEL keys into a
  `__additive__` sidecar *before* strict validation (safe against an
  un-re-vendored 0.22.0 UI), whereas an unknown key inside an existing strict
  NESTED object is a `schema_mismatch` **hard fail**. That slice carries the UI
  re-vendor in its train.
- **No `identity_unresolved` member** — it is a property of the *attempt*, not of
  a metric (design of record §2), and belongs on an `AnalysisAttempt`.
- **No `assumptions` / `provenance{build, schema_hash, trace_id, seed,
  sample_count}`** — no producer today. Declaring contract for a producer that
  writes nothing is precisely the non-adoption failure the adoption manifest
  exists to record.
- **No closed enum for `metric_id` / `reason_code` / guard `id`.** Those
  vocabularies live with the producers (ISL/PLoT/CEE); a closed enum here would
  be a hand-maintained mirror of a registry this package does not own, and would
  reject codes a newer producer legitimately emits. Contrast `population`, whose
  registry **is** checked in here and therefore **is** enforced — the difference
  is ownership, and it is stated at each member.

### Why MINOR, and the skew analysis

Per the semver policy table in `README.md`, **a new schema plus a new optional
field is a MINOR**. 0.x means minor is also the breaking axis, so this moves the
release line `0.26` → `0.27` and readers must declare `0.27` before a writer on
it is promoted — ordinary reader-first ordering, not a break.

**It carries no break, by construction rather than by survey.** Measured at
`e048e353` and across all 23 remote branch tips,
`git grep -nE 'AnalysisFact|analysis_facts|SuppressedFact|UnavailableFact|ComputedFact'`
returns exactly **one** hit and it is prose (`CHANGELOG.md:64`, 0.26.0's own note
about the row it owed). Nothing declares these shapes, nothing produces them,
nothing consumes them. The one existing schema touched — `RunAnalysisResultSchema`
— gains one **optional** member and loses nothing, and it never crosses the UI
wire: it is the CEE-internal persisted handler-fact payload, an
`ORCHESTRATOR_INTERNAL` fixture-coverage exclusion.

**All three consumers vendor `file:` tarballs, so nothing auto-adopts 0.27.0.**
Adoption is a re-vendor PR in each consumer's own lane, per that repo's
`vendor/README.md`.

### Maximal-fixture registry 116 → 124 (+8), and why the count is structural

`AnalysisFactSchema` needs **one fixture per branch** for the maximality walker to
see all three, and the three branch schemas are exported in their own right — a
fixture registered against `ComputedFactSchema` does not exercise the *union's*
branch coverage, because they are different schema objects. So: 3 union branches
+ 3 branch schemas + `SuppressionGuardSchema` + `AnalysisFactSubjectSchema`. The
fixture **values** are shared between the union entries and the branch entries —
eight registry rows, five fixture objects. The reason is recorded in
`tests/fixtures/completeness.test.ts`'s ledger alongside the previous entries.
**No baseline was bumped to make anything pass.**

## [0.26.0] — 2026-07-27

**`PopulationRefSchema` — generated from `contracts/population-registry.json`, so
the registry it claims to enforce is the registry it actually enforces.**
Closes Codex contract step-2 finding **F4** (P1, ACCEPTANCE). Maximal-fixture
registry **114 → 116**.

### Added

- **`root/PopulationRefSchema`** (+ `POPULATION_IDS`, `POPULATION_STAGES`, and the
  `PopulationRef` / `PopulationId` / `PopulationStage` types) — a discriminated
  union on `id`, **generated** into `src/contracts/generated-population-ref.ts` by
  `scripts/generate-population-ref.mjs`. Each registry id is pinned to the stage,
  parent and transform **the registry gives it**, so the accepted `(id, stage)`
  pairs are exactly the registry's. `parent_id` / `transform_id` stay optional —
  the registry already owns the lineage — but are literal-pinned, so a producer
  need not restate them and may not restate them wrong.
- **`npm run generate:population-ref` / `:check`**, the latter wired into
  `check:contracts` and added as its own `pr.yml` step. It is a
  **regeneration-diff check**: the artefact must be byte-identical to what the
  generator produces from the registry, so a hand-edit **or** a registry change
  without a regeneration fails loud (`E_STALE`). The generator also refuses to
  emit an empty union (`E_NO_POPULATIONS`), a malformed id (`E_BAD_ID`), an
  out-of-enum stage (`E_BAD_STAGE`), or any string it cannot safely place in a TS
  literal (`E_UNSAFE_LITERAL` — the id grammar does not cover `stages`).
- `tests/contracts/population-ref.test.ts` (32 tests) and four negative registry
  fixtures under `tests/contracts/negative/population-ref/`, one per generator
  rule, per the S0 "a rule with no negative fixture is an unproven rule" bar.

### Why this is a bump at all, and why MINOR

Per the semver policy table above, **a new schema is a MINOR**. The 0.x breaking
axis is also the minor, so this moves the release line `0.25` → `0.26` and
readers must declare `0.26` before a writer on it is promoted — ordinary
reader-first ordering, not a break.

**It carries no break.** A schema tightening is breaking for any producer already
emitting a mismatched pair; there can be none, because **`PopulationRefSchema`
did not exist in any published version** — no consumer could import it, so no
producer was ever validated by the loose shape this replaces. Nothing on the wire
emits a `{id, stage}` population reference today either: the pinned ISL artifact
emits `metric_populations` as the two-value label enum `{model_only,
noise_inflated}`, which is exactly what the registry's `wire_labels` mapping
exists to translate. Blast radius is nil by construction rather than by survey.

### Not in this change, deliberately

- **No wire-label → ref helper.** ISL emits labels, not ids, so a translation
  helper is real work — but it belongs in the change train of the producer that
  needs it, per the registry's own rule that an id enters with its producer.
  Shipping it now would be the non-adoption failure this scaffolding exists to
  prevent.
- **No `contracts/adoption-manifest.json` row.** This declares a *vocabulary*, not
  a wire field. The row belongs to the `population` field itself, which lands with
  S1's `ComputedFact`.
- `not_yet_emitted.populations` is excluded from the union by design: those ids
  have no producer, so licensing them on the wire would license a value nothing
  is allowed to emit.

## [0.25.1] — 2026-07-26

**Hygiene and honesty. No schema, type, enum, or wire-field change of any kind** —
`git diff --stat` touches no `src/**` file except the GENERATED
`src/contracts/generated-constants.ts`. Maximal-fixture registry unchanged at
**114**. ROADMAP 1.221 + the minimal arm of 1.216.

**WHY A VERSION BUMP AT ALL, when nothing in the contract moved.**
`contracts/adoption-manifest.json` is inside `files`, so it ships in the
tarball, and its sha256 is exported as `CONTRACT_MANIFEST_SHA`. Landing the
manifest correction without a bump would leave **two different byte-sets behind
one version string** — the precise ambiguity `schema_sha` /
`contract_manifest_sha` exist to detect (CEE's vendored `0.25.0` tarball is
sha256-pinned at `5d7f5679…`; a re-pack from `main` would no longer match it).
Per the README semver policy, contract metadata and documentation with no
schema change is a **patch**.

### Changed — `constraint_verdict` adoption row: `declared` → `enforced`

CEE PR **#712** (merged + deployed, `cee@staging` `820f3e83b`) writes
`result.constraint_verdict` from the single stamp site in the `run_analysis`
handler and reads it through `mayNameLeadingOptionForFact` →
`readMayNameLeadingOptionFromResult`, retiring the interim
`enrichment.__cee_claim_safety` stamp. The row now carries a named producer
test and a named consumer test.

**The first row in this manifest to reach `enforced`**, and it was held to the
bar that keeps `assistant_text` at `produced_dark`: both references are the
right KIND of test, not transport pins. The consumer reference is deliberately
the **positive control** (`evaluated_feasible` keeps the leader id, the
enrichment blobs and the brief on the wire) — the reader fails CLOSED, so the
withholding cases cannot discriminate and only the permitting case can.

⚠ The referenced test files were verified by hand at `820f3e83b`; **CI does not
check this** (pr.yml does not set `OLUMI_ESTATE_ROOT`, so the checker reports
file existence as `SKIPPED`). Recorded in the row's `notes`.

### Added — `CLAUDE.md`

The workspace-root `CLAUDE.md` has pointed at `olumi-schemas/CLAUDE.md` as the
home of the contract-evolution rules for months; the file did not exist, and
the 0.25.0 lane had to re-derive the gate from `package.json` + `pr.yml`. It now
exists, with every claim derived from the repo bytes: the real gate command
sequence, what the typecheck **excludes**, the S0 conventions (adoption-manifest
states and the producer/consumer test-KIND rule, population registry, health
manifest, compat gate, negative-fixture and maximal-fixture requirements), the
publish model, version discipline, and this repo's three hazards.

### Fixed — stale README claims

- **"All object schemas use `.passthrough()`" was false**, and most wrong
  exactly where it mattered most. Replaced with a per-namespace
  **Unknown-key policy** section derived by introspecting `_def.unknownKeys` on
  every object schema reachable from each entry point: `/orchestrator` is
  **100% `.strict()`** (40 exported object schemas, zero passthrough);
  `/boundary` splits 45 strict / 27 passthrough by role (producer-owned
  envelopes and block types strict, the PLoT enrichment family and the graph
  types passthrough); root is 17 passthrough / 9 strict / 9 strip.
- **"Push to `main` — CI publishes and opens PRs in consuming repos" was
  false.** It has never opened a PR in a consuming repo — see below. Replaced
  with the re-vendor path.
- The install instructions now say what the three services actually do: pin a
  checked-in `file:` tarball, not a registry version.
- Development section names `npm test` as the gate and states that
  `tsconfig.json` excludes `tests` and `fixtures`, so **no test file is
  typechecked**.

### Fixed — `Trigger propagation` is a standing red, now labelled as one

`continue-on-error: true` on the `Trigger propagation` step of `publish.yml`,
with a comment block naming the facts, plus an obsolescence header on
`propagate.yml`. Measured across **all 29 runs** of the publish workflow: the
step is **18 × `failure`, 6 × `skipped`, 5 × absent — it has never once
succeeded**, because `secrets.OLUMI_SCHEMAS_PAT` was never created (the repo
has **no Actions secrets at all**). Lint, build, test, publish and tag all
succeed *before* it, so every real release has been reported as `failure` while
having fully succeeded — the broken-alarm class.

It is also **obsolete**: `propagate.yml` runs
`npm install @talchain/schemas@<v> --save-exact`, but all three consumers vendor
`file:` tarballs (UI 0.22.0, PLoT 0.22.0, CEE 0.25.0 at their staging tips), so
running it would rewrite the `file:` pin and trip CEE's tarball-sha guard.
**Rework is NOT attempted here** — tracked as ROADMAP 1.216.

## [0.25.0] — 2026-07-26

**Arch step 2 — the first CONTRACT FOR A FACT, and the retirement of a live
interim.** Strictly additive: one new optional field on an existing schema, two
new exported schemas, no field removed, no enum member removed, no required
field added to an existing object. Minor per the README semver policy.
Maximal-fixture registry unchanged at **114** (the new schema is nested inside
`RunAnalysisResultSchema`, which is already an `ORCHESTRATOR_INTERNAL`
fixture-coverage exclusion; the new one is recorded the same way).

**⚠ VERSION NOTE FOR THE S1 LANE.** The 0.24.0 entry below told S1 its
generated types would land as `0.25.0`. This release has taken `0.25.0`, so
**S1's types land as `0.26.0`**. Nothing else about the adoption order changes.
That note was an expectation recorded in a changelog, not a reservation any
tooling enforces — re-read `package.json` at the tip you are on rather than
trusting either note.

### Added — `RunAnalysisResult.constraint_verdict` (T1 claim safety, G-CEE-1)

- **`constraint_verdict?: ConstraintVerdict`** on `RunAnalysisResultSchema`
  (`orchestrator/handler-results.ts`) — OPTIONAL, and it stays optional. The
  fact about an analysis that answers "given the hard constraints the user
  ratified, and what the producer was able to score, may a leading option be
  NAMED as the answer?".
- **`ConstraintVerdictSchema` / `ConstraintVerdict`** — `.strict()`, two
  members, mirroring CEE's `PersistedClaimSafety` interface verbatim:
  `may_name_leading_option: boolean` and
  `constraint_verdict_state: ConstraintVerdictState`.
- **`ConstraintVerdictStateSchema` / `ConstraintVerdictState`** — the closed
  five-state vocabulary: `not_applicable`, `evaluated_feasible`,
  `evaluated_infeasible`, `unevaluated`, `identity_unresolved`. Five and not a
  boolean because "we could not tell" is a third answer, and collapsing it
  either way states something false to the user.

### Why this exists — it replaces an interim that is live today

CEE PR #710 (merged, `cee@staging` 39fa4eeb) needed to persist this verdict on
the run_analysis fact and could not: `RunAnalysisResultSchema` is `.strict()`,
and adding the field needed a package release that was blocked behind V5-CI-01.
It stamped the value into the fact's untyped `enrichment` record under a
CEE-namespaced key, `__cee_claim_safety`, and left a TARGET note naming exactly
this field. This release is that unblock.

The defect being closed is not hypothetical. On staging `1c078f0` the same HTTP
response printed *"no option can be put forward yet"* directly above *"The
MacBook Pro leads by a margin of about 52 percentage points"* — the withhold and
the claim disagreeing inside one payload, because two surfaces derived the
verdict independently from different inputs.

### Skew analysis — zero blast radius on publish

All three consumers vendor `@talchain/schemas` as `file:` tarball pins, so
nothing auto-bumps and no consumer sees this field until it re-vendors
deliberately. The field is optional, so a producer on 0.22/0.23 that never
writes it still validates, and every fact persisted before this release parses
unchanged (asserted, not asserted-about, in
`tests/orchestrator/constraint-verdict-0.25.test.ts`).

**Follow-through is owned by the CEE lane**, not by this package: re-vendor
0.25.0, write the verdict to `result.constraint_verdict`, point the readers at
it, and delete `CEE_CLAIM_SAFETY_ENRICHMENT_KEY` with its two helpers and the
§6b clause of `scripts/validate-handler-ownership.sh`. **An open question ships
with it:** facts already persisted carry the interim key and not the typed
field. The interim reader fails CLOSED on absence, so those rows stay correct
(they lose leader-presuming cards) — but whether to keep that reader for
historic rows or migrate them is a CEE decision, deliberately not taken here.

### Deliberate non-guarantees (pinned by tests so they are not added by reflex)

- **The two members are not cross-validated.** `may_name_leading_option` always
  equals the producer's frozen `MAY_NAME_LEADING_OPTION[state]` lookup, so this
  package could enforce coherence. It does not: that table is CEE doctrine, and
  a copy here would be a rule requiring simultaneous change in two repos, where
  a skewed pin would reject verdicts a newer CEE legitimately emits — the
  hand-maintained-mirror defect class.
- **The producer's `codes`, `constraints` and `leaderInfeasibility` are not
  declared.** The producer deliberately does not persist them. Declaring them
  would be contract for a producer that writes nothing into it.

### Contracts

- **Adoption manifest row** (`contracts/adoption-manifest.json`), state
  **`declared`**, removal date 2026-09-30. Deliberately not `produced_dark`: a
  producer and a consumer are both live in `cee@staging`, but they read and
  write the interim key, so nothing produces or consumes
  `result.constraint_verdict` itself yet and any stronger state would be a false
  claim. `contracts/manifest.sha256` and `src/contracts/generated-constants.ts`
  regenerated (`CONTRACT_MANIFEST_SHA`, plus `SCHEMA_SHA` /
  `SCHEMA_PACKAGE_VERSION` for the version bump).
  **⚠ SUPERSEDED — that state was true at this release and is not current.** CEE
  #712 adopted the field on 2026-07-26 and **0.25.1 moved the row to
  `enforced`**. This bullet is left as the historical record; read
  `contracts/adoption-manifest.json` at the tip for the live state.

### Tests

- `tests/orchestrator/constraint-verdict-0.25.test.ts` (25 tests) — RED-first
  against 0.24.0, where `.strict()` rejected the field outright. Fourteen
  **negative fixtures** (unknown state, wrong casing, stringly-typed and numeric
  booleans, missing members, an extra member, camelCase members, null, array,
  bare string) each proven to be REJECTED, with a **positive control** asserting
  the same fixture minus the malformation is accepted — without it every
  rejection would have passed vacuously on 0.24.0, which is exactly what the
  RED run showed. Plus a path-precision assertion, union-level rejection, and
  the optionality and interim-coexistence proofs.
- `tests/orchestrator/__fixtures__/handler-fact-fixtures.ts` — the canonical
  `run_analysis` regression fixture now exercises the field.

## [0.24.0] — 2026-07-26

**Arch step 2, sub-step S0 — the enforcement scaffolding, shipped BEFORE the fields
it governs.** Strictly additive: one new exported schema (`HealthManifestSchema`),
three generated constants, no field removed, no enum member removed, no required
field added to an existing object. Maximal-fixture registry **113 → 114**
(`root/HealthManifestSchema`).

**⚠ VERSION-NUMBER NOTE FOR THE S1 LANE.** The design's adoption order says S1
"publishes generated 0.24 types". S0 has taken `0.24.0`, so S1's types land as
`0.25.0`. Nothing else about the ordering changes.

### Added

- **Adoption manifest** — `contracts/adoption-manifest.json` + `contracts/repo-map.json`,
  enforced by `scripts/check-adoption-manifest.mjs` (`npm run check:adoption`).
  One row per contract field subject to adoption tracking. Fails on: `enforced`
  without both test references; a test reference into an undeclared repo; a
  malformed reference; a removal date that has passed while the row is still dark;
  a stale `contracts/manifest.sha256`.
  Seeded with the estate's **already-failed** fields in their measured state —
  `framing_question`, `framing_quality` and `decision_classification` are all
  `declared` with **no producer**, verified 2026-07-26 against `cee@staging`.
- **Population registry** — `contracts/population-registry.json`, enforced by
  `scripts/check-population-registry.mjs` (`npm run check:populations`). Seeded
  from what ISL actually ships at build `7d144c7`, not from the design's imagined
  shape: ISL emits a closed two-value label enum (`model_only` / `noise_inflated`),
  so each registry entry carries a `wire_labels` mapping that CI checks against the
  pinned ISL artifact **in both directions**. A registry that drifts from its
  producer fails here.
- **Health manifest** — `HealthManifestSchema` / `HealthManifest`,
  `HEALTH_MANIFEST_FIELDS`, `releaseLine()`, `parseHealthManifest()`,
  `compareHealthManifest()`, plus generated `SCHEMA_SHA`, `CONTRACT_MANIFEST_SHA`
  and `SCHEMA_PACKAGE_VERSION`. The four fields every service exposes on its health
  endpoint. Per-service wiring is not in this package — see the PR body.
- **Two-sided compat gate** — `compat/README.md` (spec) + `scripts/check-compat-gate.mjs`
  (`npm run check:compat`), wired end-to-end over one real seam (`isl-response-v2`),
  diffing **request and response directions separately** because their break rules
  are opposite. Rejects pins that are not immutable commit shas, and unsanitized
  artifacts. Three further seams named as follow-up in `compat/README.md`.
- **RED-first proof** — `tests/contracts/s0-gates.test.ts` (35 tests): every rule has
  a negative fixture that must fail with its specific error code, plus positive
  controls so the checkers cannot pass by rejecting everything.

### Changed

- `npm test` and `prepublishOnly` now run `npm run check:contracts` first.
- PR workflow runs the four S0 gates before build/test.

## [0.23.0] — 2026-07-23

The A2 guest-template-train gating batch (ROADMAP 1.188). **Strictly additive:**
no field removed, no enum member removed, no required field added to an existing
object — every pre-0.23.0 payload still parses (proven by a full `dist/**/*.d.ts`
surface diff vs `v0.22.0`: additions only). Minor per the README semver policy.
Maximal-fixture registry unchanged at **113** (the one new field rides an
existing `MessageTurnPayloadSchema` fixture; no new registry entry).

**⚠ LANDING SEQUENCE (dominant risk R-1, same 0.22.0-class strict-consumer
hazard).** `MessageTurnPayloadSchema` is `.strict()`: an older CEE fail-closed
ingress validator **422s** a turn carrying a field its pin does not know. Order:
**this package publishes → CEE re-vendors ≥ 0.23.0 (accepts + adopts
`graph_state`) → UI populates `graph_state`.** The UI MUST NOT send `graph_state`
until CEE's deployed service accepts it.

### Added — inbound `graph_state` on the message turn (ROADMAP 1.188c, A1-DECISIONS D-24)

- **`graph_state?: GraphV3`** on `MessageTurnPayloadSchema`
  (`boundary/turn-payload.ts`) — OPTIONAL, `.strict()`-safe, the FULL inbound
  `GraphV3Schema` (nodes + edges) the client holds on its canvas at send time.
  NOT a hash ref: on a guest first-touch there is no server-authored model to
  fetch, so the whole graph must ride inbound. Lets CEE adopt-on-first-touch and
  coach/analyse against a guest's model instead of behaving model-blind. Fail-safe:
  a turn WITHOUT `graph_state` parses exactly as before. The maximal
  `MessageTurnPayloadSchema#chip` fixture now populates it (registry stays 113).

### Changed — F6 honesty comment (ROADMAP 1.188a; trap-14, no behaviour change)

- **`direct_graph_edit` doc-comment** rewritten to describe the ACTUAL
  representative-singular convention the wire uses. The 0.22.0 comment claimed the
  schema "accommodated" the UI's debounced batch emitter directly; it does not —
  the batch → representative-singular reduction is performed UPSTREAM by the UI's
  `graphEditBatchAdapter` (DecisionGuideAI #436). The comment now states that
  convention verbatim (target = explicit → first changed node asc → first changed
  edge asc; operation = explicit → `operations[0]` asc; `fields_changed` = the
  batch field-map flattened to a sorted de-duped `string[]` union; empty id set →
  retryable `unencodable_graph_edit`). **No schema/field/type change** — comment
  only.

### Verified present (0.22.0 identity handshake — no re-add)

- **`graph_hash`** — `OlumiResponseSchema` (`boundary/olumi-response.ts:191`),
  `z.string().min(1).optional()`. Present since 0.22.0.
- **`computed_against_hash`** — `AnalysisResultBlockSchema`
  (`boundary/blocks.ts:68`), `z.string().min(1).optional()`. Present since 0.22.0.

### ⚠ NOT in this package — `model_graph_hash` (byte-corrected 0.23.0)

- **`model_graph_hash` is ABSENT** from the entire contract at `v0.22.0` (grep:
  zero occurrences in `src/`). The Arch-Review-2 / A1-DECISIONS-D-27 assertion that
  "0.22 already SHIPPED `graph_hash`/`computed_against_hash`/`model_graph_hash`" is
  **byte-false for the third field** — only the first two shipped. **Deliberately
  NOT added here:** its shape is spec'd only in a CEE-ask proposal
  (`GUEST-TEMPLATE-CEE-ASK … §5.2/§6`) and it may be redundant with the existing
  `graph_hash` — baking a possibly-duplicate field into a publish-once contract is
  the exact "a wrong field forces a re-publish" hazard. The successor CEE
  adopt-on-first-touch lane must confirm whether it needs a NEW distinct field or
  can echo `graph_hash`; if distinct, it rides a later additive batch.

### Deferred riders (named — not blockers)

- **schemas #16** (A3 F6 constraint-margin / scale-provenance) — OPEN + `isDraft:
  true`, authored against a pre-0.22.0 base (its registry note says 106→108 vs
  current 113); A3 left the version/merge call to the orchestrator. Needs A3's
  rebase + de-draft before folding; not merged here.
- **ISL DownsideV2** (CVAR) — Neil-pending doctrine; explicitly out of scope.
- **Canonical graph-hash serialization-input builder** (ROADMAP 1.188b) — a second
  hashing implementation here is the "two same-named hash twins" defect
  `graph-hash-contract.ts` exists to prevent; not built.
- **typed `feedback` event** and **Group-A response types** — already shipped in
  0.22.0 (`FeedbackEvent` in `turn-payload.ts`; `boundary/group-a.ts`); nothing to
  add.

## [0.22.0] — 2026-07-22 (PUBLISHED 2026-07-22: tagged `v0.22.0` = `e04b900`, published to GitHub Packages + merged to `main` — the Publish run's `Publish to GitHub Packages` + `Create release tag` steps are green; only the known-benign `Trigger propagation` step is red (missing PAT, per platform trap-7). The "⚠ HELD (A1-sequenced landing train; NOT yet published)" status this heading carried was written pre-landing and is corrected here (ROADMAP 1.188a). The consumer re-vendor ORDER below remains the live guidance.)

The S2+S3 Phase-1 batch (ROADMAP 1.179) riding the row-1.181 absorption batch.
`0.21.0` was published off `release/0.21.0-additive` as the additive `what_changed`
release (`main` never carried a `[0.21.0]` CHANGELOG entry — the known main-vs-release
divergence); **0.22.0 publishes from `main`** and is therefore ALSO the first VERSIONED
release of the two items that sat under `[Unreleased]` on main, deliberately excluded
from 0.21.0: schemas **#13** (compute-seam JSON-Schema tooling) + **#14** (the
`GoalConstraintSchema` → `LegacyGoalConstraintStubSchema` false-twin rename) — both
documented in their original sub-sections below. Strictly additive: no field removed,
no enum member removed, no required field added to an existing object; every pre-0.22.0
payload still parses. Minor per the README semver policy. Maximal-fixture registry:
**106 → 113** (+7 — see the itemised list under each Added section).

**⚠ LANDING SEQUENCE — the strict-consumer hazard (dominant risk R-1; same class as
0.19.0/0.20.0, but this is a BIG batch — trace every field producer→validator→consumer
at each hop).** The block schemas, the turn payload, and the enrichment envelope are
`.strict()`/typed: a consumer pinned to an OLDER version silently DROPS an unknown new
field, and on INGRESS a fail-closed validator (CEE's B1) 422s a turn carrying a field
its pin does not know. Therefore:

1. **Producers must not EMIT the new response/receipt fields** (`graph_hash`,
   `computed_against_hash`, `feedback` events, the Group-A response fields, the F6
   constraint-margin/provenance fields) until every strict consumer on that hop has
   re-vendored ≥ 0.22.0.
2. **The UI must not SEND the new ingress fields** (`chip.id`, `chip.intent`, the batched
   `direct_graph_edit` fields, the `feedback` system event) until CEE has re-vendored
   ≥ 0.22.0 and routes/accepts them — an older CEE 422s the turn (mirror hazard on the
   `Intent` enum + the `feedback` kind, exactly as the `analysis_readiness` enum add in
   0.20.0). Order: **this package publishes → CEE re-vendors (accepts + routes) → UI
   re-vendors → UI sends the new intents/feedback / producers emit the new fields.**
3. **`#13`/`#14` FIRST-SHIP absorption warning.** 0.22.0 is the first published version
   carrying #13/#14 from `main`. The CEE re-vendor (row 1.181) and the UI re-vendor
   (A2's twin row) must redo the import adjustments the F2-B re-pack lane recorded for
   the rename surface + #13 types. The UI re-vendor is A2's row-1.181 twin — **~113 tsc
   deltas** from the `GoalConstraintSchema`→`LegacyGoalConstraintStubSchema` rename
   surface; budget for it, do not treat "typecheck clean" as free.
4. **The S1 identity handshake is a THREE-HOP trace.** `graph_hash` (OlumiResponse) and
   `computed_against_hash` (AnalysisResultBlock) are inert until the CEE producer stamps
   them (using its `computeAnalysisAffectingGraphHash` — the runtime hash lives CEE-side,
   NOT in this package; see `graph-hash-contract.ts`) AND the UI client verifies its own
   canonical hash against them and raises the `GRAPH_DIVERGED` divergence state. Ship the
   fields, then the CEE producer, then the UI verifier — a half-wired hop reads as no
   handshake (fail-closed), never a false freshness verdict.

### Added — S2 intent vocabulary + first-class chip identity (ROADMAP 1.179, decision ①)

- **`Intent`** (`boundary/enums.ts`) — a NEW PARALLEL literal set, DECOUPLED from
  `ActionType` (decision ①: not a wider `ActionType`; keeps the handler-id space clean
  and lets one intent fan out to several handlers). Members: `elicit_options`,
  `add_option`, `challenge_frame`, `challenge_assumption`, `outside_view`, `pre_mortem`,
  `elicit_risks`, `estimate_help`, `mitigation_help`, `define_success`, `discuss`. The
  three UI literals authored-but-invalid against `ActionType` and silently stripped today
  (`add_option`, `challenge_assumption`, `discuss`) get their typed home here. **Reserved
  headroom (R-6, ROADMAP 1.183):** `framework_request` / `research_request` are documented
  as anticipated future members (NOT added yet) so the capability layer needs no second
  contract shape — only two literals appended.
- **First-class `chip.id` + typed `chip.intent`** on the message-turn `chip`
  (`turn-payload.ts`). Chip identity (`chip_id`/`spark_id`) was smuggled untyped inside
  `chip.parameters` with zero CEE readers; `id` promotes the discipline the `chip_click`
  system-event member already has. `intent` carries the typed `Intent` parallel to
  `action_type`. Both optional/additive.
- Enum-scalar, no fixture impact (registry unchanged for `Intent`); the chip fields are
  exercised by the existing message-chip fixture.

### Added — batched `direct_graph_edit` (decision ②)

- The `direct_graph_edit` system event gains optional `changed_node_ids[]`,
  `changed_edge_ids[]`, `operations[]`, `fields_changed[]`, `summary` (`turn-payload.ts`).
  The singular `{target_id, operation}` pair stays **REQUIRED** (decision ② — "keep
  singular for back-compat": an older consumer requires them, so a new producer keeps
  sending a representative pair). Closes the blindness where the UI's debounced batch
  emitter (`useGraphEditEvents.ts`) was refused by the singular-only `.strict()` shape
  (build → null → the turn was never sent). Chosen over a new `graph_edited` event.

### Added — typed `feedback` system event (decision ⑥ — Paul ruled WIRE)

- A `feedback` member on `SystemEventSchema` (`turn-payload.ts`) + `feedback` in the
  `SystemEventKind` parity list: `{ kind, rating: 'up'|'down', comment?, target: {id, kind} }`.
  Replaces the dead-thumbs class (the V5 feedback builder silently refused
  `feedback_submitted`). `FeedbackRating` + `FeedbackTargetKind` (closed vocab:
  `turn|message|block|suggestion|analysis`) exported. Registry **+1**
  (`boundary/SystemEventSchema#feedback` fixture variant).

### Added — S1 graph-identity handshake fields + canonical hash CONTRACT

- **`graph_hash`** on `OlumiResponseSchema` (turn response / receipt) +
  **`computed_against_hash`** on `AnalysisResultBlockSchema` (analysis result) +
  **`GRAPH_DIVERGED`** in `BoundaryErrorCode` (+ `FAILURE_USER_TEXT`). Optional/additive.
- **`graph-hash-contract.ts`** carries the ONE canonical keep-list DOCUMENTATION —
  `CANONICAL_GRAPH_HASH_KEEP_LIST` = nodes + edges + options + goal_node_id +
  **goal_constraints** (the CORRECTED floor; the single-graph design's own list omitted
  `goal_constraints`, so a hard-constraint edit would not move the hash → analysis read
  FRESH after a constraint change, S1 §D — pinned by a regression test). A
  classification-completeness test DERIVES the GraphV3 field set from the schema so a new
  graph field fails the build until classified (derive-don't-mirror). **No hashing
  function is implemented here** — the runtime hash is CEE's
  `computeAnalysisAffectingGraphHash`; shipping a second same-named digest is exactly the
  hash-twin defect this programme keeps paying for (trap-12). The reserved canonical name
  is `computeCanonicalGraphHash`. Enum/const, no registry impact.

### Added — Group-A compute-seam response surfaces (ROADMAP 1.181; A3 byte-verified dossier)

- **`SequentialAnalysisResponseSchema`**, **`CounterfactualResponseSchema`**,
  **`OptimiseResponseSchema`** (+ `OptimiseUtilitySchema` and the closed ISL/PLoT enums)
  in `boundary/group-a.ts` — typed contract for A3's three live Group-A endpoints
  (ISL `/api/v1/analysis/sequential`, ISL `/api/v1/causal/counterfactual`, PLoT SCM-lite
  `/v1/optimise`). Authored + reviewed against A3's byte-verified dossier and validated
  against the POST-FIX optimise wire captures (deployed build `51abbc8`). Honesty rails
  carried per the dossier:
  - **Optimise is the PLoT SCM-lite surface** (discriminator: top-level key `schema`,
    NOT the ISL `schema_version`; carries `method`/`action_semantics`). `method` and
    `action_semantics` are **MANDATORY, structurally-required disclosure markers**.
    `utility` is `.strict()` with only `expected` — a **deliberate deviation** from the
    repo passthrough convention that makes the killed-bands guarantee STRUCTURAL: a
    re-introduced `p10/p50/p90` band FAILS validation (the fabricated bands were removed
    producer-side; they must never ride again).
  - **Counterfactual**: NO `lower < upper` refinement — a degenerate CI
    (`lower == upper == point_estimate`) is CORRECT abduction semantics under pinned
    context; consumers must not widen it.
  - Closed enums include ALL source members incl. valid-but-unwitnessed ones
    (`sensitivity_to_timing:'medium'`, `UncertaintyLevel:'medium'`, `ConfidenceLevel:'high'`,
    `RobustnessLevel:'robust'`); `ResponseMetadata.config_details` kept OPEN.
  - Every object `.passthrough()` (except the strict `utility`), consistent with
    `enrichment.ts`. Registry **+4** (Sequential, Counterfactual, Optimise, OptimiseUtility).

### Added (F6 — constraint margin + scale/decision-grade provenance; schemas #16 absorbed)

Additive typing on the analysis-enrichment boundary (`src/boundary/enrichment.ts`),
incorporated from open PR #16 (`a3-constraint-margin-provenance`) into this batch —
fully compatible (additive, enrichment-only). These fields ride PLoT's constraint path;
before this they rode the `.passthrough()` and any malformed value was silently accepted.

- **`EnrichmentConstraintMarginSchema`** — per-option, per-constraint graded breach
  margin. Mirrors PLoT's shipped `ConstraintMargin` (`src/types/engine-v3.ts` @ staging
  tip `ea10656`): `{ constraint_id, failure_margin_median? (finite ≥ 0), near_miss_fraction?
  ([0,1]), margin_precision? ('exact'|'lower_bound') }`. Wired onto
  `option_comparison[].constraint_margins`.
- **`EnrichmentScaleProvenanceSchema`** — constraint-threshold normalisation-scale
  provenance: `{ source, range_unified, threshold_clamped? ('low'|'high'), decision_grade }`.
  Wired onto `constraint_results[].scale_provenance`.
- **`constraints_decision_grade?: boolean`** on the option-comparison entry.
- Fail-closed **ABSENCE RULE** frozen verbatim on `scale_provenance`,
  `constraints_decision_grade`, and the inner `decision_grade`; `margin_precision` carries
  the sibling "absent = precision unknown" rule.
- **⚠ CONTRACT-AHEAD:** `scale_provenance`/`decision_grade`/`range_unified`/
  `threshold_clamped`/`constraints_decision_grade` are NOT yet emitted by PLoT at
  `ea10656` (only `ConstraintMargin` is evidenced); typed ahead of the producer, made
  safe by the fail-closed ABSENCE RULE. Registry **+2**; JSON-Schema regenerated
  (`json-schema/`, 22 → 24 documents, picked up by the derive-don't-mirror generator).

### Changed (rename only — no shape change) — FIRST VERSIONED in 0.22.0 (was under `[Unreleased]` on `main`)

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

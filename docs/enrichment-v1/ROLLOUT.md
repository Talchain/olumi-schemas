# @talchain/schemas — pin & rollout plan (enrichment v1, 0.14.0)

Owner: Brief F (contract & data alignment). Status: PROPOSED — merge of the
`claude-contract/enrichment-v1` PR and every pin bump below is Paul-gated.
Adoption lanes are dispatched by the orchestrator; nothing here is executed
from the schemas repo.

## Verified current pins (2026-07-08)

| Repo | staging | prod (`main`) | Pin mechanism |
|---|---|---|---|
| CEE `olumi-assistants-service` | **0.13.0** (`file:./vendor/talchain-schemas-0.13.0.tgz`) | **none** (no `@talchain/schemas` dependency on `main`) | vendored tarball |
| PLoT `plot-lite-service` | **0.13.1** (`file:./vendor/talchain-schemas-0.13.1.tgz`) | **0.1.0** (registry pin) | vendored tarball (staging) |
| UI `DecisionGuideAI` | **0.13.1** (`file:./vendor/talchain-schemas-0.13.1.tgz`) | **0.2.0** (registry pin) | vendored tarball (staging) |
| ISL `Inference-Service-Layer` | n/a (Python/Pydantic — mirrored by hand) | n/a | n/a |

## The 0.13.0 vs 0.13.1 skew — exact mechanics (verified in code)

- 0.13.1's only delta is two optional keys on `MessageTurnPayloadSchema`:
  `generate_model` / `explicit_generate`. The schema is `.strict()`, so a
  consumer on **0.13.0 REJECTS** any `kind:'message'` turn carrying either
  key (CEE B1 `validateIngress` → `INGRESS_CONTRACT_VIOLATION` 422,
  fail-closed; verified: CEE `src/validators/b1.ts` +
  `src/orchestrator/route-v2-preflight.ts`, whose strip-list covers only
  `graph_state` / `analysis_state` / `user_id` / `selected_elements` — NOT
  the generate flags).
- Why it has not detonated yet: the UI's live V5 payload builder
  (`DecisionGuideAI src/v5/buildPayload.ts`) does **not** emit either flag
  today. The flag-bearing payload family exists in
  `src/services/turn-request-builder.ts` (`generate_model: true` on
  explicit_generate turns) on a separate send path. The landmine fires the
  moment the V5 wire starts carrying the flags — which is exactly what
  0.13.1 was minted to enable.
- Conclusion: **CEE must be ≥ 0.13.1 BEFORE any UI change emits
  `generate_model`/`explicit_generate` on `/orchestrate/v2/turn`.**

## Staging bump ordering

0.14.0 is a superset of 0.13.1 (both additive; 0.14.0 adds only the opt-in
enrichment envelope — no transport field changes, no strictness changes).
CEE can therefore defuse the skew and adopt the envelope in ONE bump.

1. **Publish 0.14.0** (after the Paul-gated merge of
   `claude-contract/enrichment-v1` → `main` here):
   `npm run prepublishOnly && npm pack` → `talchain-schemas-0.14.0.tgz`;
   publish to GitHub Packages as usual. Keep the tarball — every staging
   consumer vendors it.
2. **CEE lane (FIRST consumer — closes the skew):**
   - add `vendor/talchain-schemas-0.14.0.tgz`; flip the `file:` pin;
     `npm install`; update the dep-audit SHA manifest (repo gate:
     the pre-push dep-audit allowlists the tarball by SHA — skipping this
     fails the gate);
   - run the real gate (`tsc -p tsconfig.build.json` per that repo's
     CLAUDE.md, plus its test suite);
   - install the CEE contract tests (`contract-tests/README.md` §CEE lane),
     including the keep-list drift bolt.
   - Risk note: CEE code imports only names that exist in 0.13.0; 0.14.0
     adds names and accepts two extra ingress keys. No behavioural change
     until code opts in.
3. **PLoT lane:** same tarball+manifest mechanics 0.13.1 → 0.14.0; add the
   producer-side `AnalysisEnrichmentSchema.safeParse` assertion + the
   ISL→PLoT contract test (README §PLoT lane).
4. **UI lane:** same mechanics 0.13.1 → 0.14.0; add the CEE→UI contract
   test. ONLY AFTER step 2 is deployed to staging may the UI start emitting
   `generate_model`/`explicit_generate` on the V5 wire.
5. **ISL:** no TS pin. The Pydantic mirror only matters if ISL starts
   consuming enrichment types; today the obligation runs the other way
   (ISL emissions are pinned by the ISL→PLoT contract test).

Sequencing rule for any future minor: **consumers of a field bump before
producers emit it; validators (CEE B1) bump before senders (UI).**

## Staging → prod schema path

Prod is not merely skewed — it is on a different generation
(PLoT 0.1.0 / UI 0.2.0 registry pins; CEE `main` has no schemas dependency
at all). Any prod promotion that carries V5/enrichment code therefore
CANNOT cherry-pick: it needs the full staging pin state to travel with the
promotion.

Required before ANY prod promotion of a schemas-consuming service:
1. A clean, non-"do-not-merge" release series of `@talchain/schemas` on
   `main` here (0.14.0 must land via a normal reviewed merge — this PR).
2. Per service, promote the whole staging branch state (code + vendored
   tarball + lockfile + SHA manifest) — never the pin alone: prod code on
   0.1.0/0.2.0-era imports does not compile against 0.14.0 names and vice
   versa.
3. Promotion order mirrors staging: CEE (validator) → PLoT → UI, with the
   ISL deploy already carrying the V2 wire the PLoT build expects
   (`isl_version`/build assertion — see PLOT-V2-READ-FIX-SPEC.md).
4. Do NOT delete the old registry pins until all three services' prod
   branches are on the vendored-tarball mechanism.

## Envelope evolution rules (0.14.x+)

- The envelope is passthrough + all-optional: adding a typed field is a
  MINOR; making any field required, narrowing a vocabulary, or removing a
  key is a MAJOR (consumers validate real persisted facts, not just live
  wire).
- Open-vocabulary fields (`confidence_source`, `flip_direction`,
  inference-warning `code`, ...) stay `z.string()` until the producer
  commits to a closed set in ITS types AND old persisted payloads are out
  of scope.
- `CEE_UI_ENRICHMENT_KEEP_LIST` changes only in lock-step with CEE
  `compose.ts` (the CEE-side drift bolt enforces this).

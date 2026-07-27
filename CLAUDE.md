# @talchain/schemas — contract-evolution rules

The shared Zod contract for the Olumi estate. Every claim below was derived from
this repo's bytes (and, where it concerns a consumer, from that repo's own
`staging` tip) on **2026-07-26 at `c938c8f`**, and the gate / publish-model
sections were re-derived on **2026-07-27 at `bc995b22`** (ROADMAP 1.226 — two of
this file's own numbers had already gone stale by then; see "The gate").
Universal working practice lives
in `~/.claude/CLAUDE.md`; the estate map lives in the workspace-root
`CLAUDE.md`.

**Read the gate scripts and `package.json` at the tip you are on. This file is a
hand-maintained mirror and will drift — that is the estate's dominant defect
class, and a file describing gates is not exempt from it.**

---

## ⚠ Three hazards that are specific to this repo

**1. `main` IS the integration branch, and there is no `staging`.** Every other
repo in the estate integrates on `staging` and has a stale `main`. This one is
inverted: `git ls-remote --heads` shows no `staging` branch at all, and
`contracts/repo-map.json` records `main` as this repo's `authoritative_ref`.
Any habit imported from the other four repos ("push to staging by default") is
wrong here.

**2. Merging to `main` AUTO-PUBLISHES.** `.github/workflows/publish.yml` runs on
every push to `main` and publishes to GitHub Packages, tags the release, and
fires a propagation dispatch. There is no manual release step. See
[Publish model](#publish-model) for exactly what gates it.

**3. `main` is UNPROTECTED.** `gh api repos/Talchain/olumi-schemas/branches/main/protection`
returns HTTP 404 "Branch not protected" (re-measured 2026-07-27). Nothing stops a
direct push, and a direct push to `main` *is* a release — publish.yml's own
lint/build/test steps run **after** the push, so they cannot prevent it, only
report on it. **Work on a branch and open a PR.** The PR workflow is the only
pre-merge gate that exists. The one-line fix is drafted and waiting for Paul —
see [Closing hazard 3](#closing-hazard-3--branch-protection-pauls-call).

---

## The gate

Derived from `.github/workflows/pr.yml` and `package.json` at `bc995b22` + the
1.226 branch.

```bash
npm ci
npm run check:adoption                     # S0 · contracts/adoption-manifest.json
npm run check:populations                  # S0 · contracts/population-registry.json
npm run check:compat                       # S0 · compat/seams/**
npm run generate:contract-constants:check  # S0 · src/contracts/generated-constants.ts is current
npm run generate:population-ref:check      # S0 · src/contracts/generated-population-ref.ts matches the registry
npm run build                              # tsc (emits dist/)
npm run typecheck:tests                    # tsc -p tsconfig.test.json (the TEST tree — see below)
npm test                                   # check:contracts && build && typecheck:tests && vitest run
```

**`npm test` alone reproduces the whole PR gate.** `test` is
`npm run check:contracts && npm run build && npm run typecheck:tests && vitest run`,
and `check:contracts` is `check:adoption && check:populations && check:compat &&
generate:contract-constants:check && generate:population-ref:check`. The pr.yml steps above are that same set
unrolled, run first so a contract break is reported as itself rather than as a
downstream type error. Run the steps individually anyway when you want the
failure attributed to one gate.

**Baseline at `5766fc9` (main, 2026-07-27): 36 test files, 1274 tests, green** —
measured in a fresh blobless clone before any edit. Record your own baseline
before you touch anything; do not inherit this number. The one this file carried
before it (`35 / 1269` at `bc995b22`) was one release stale within a day, and the
one before that (`33 / 1161`) was two.

### The two tsconfigs, and which one covers what

| config | script | covers |
|---|---|---|
| `tsconfig.json` | `build`, `lint` | `src/**` only — 43 files, `rootDir: ./src`, emits `dist/` |
| `tsconfig.test.json` | `typecheck:tests` | everything else: `tests/`, `contract-tests/`, `fixtures/`, `scripts/*.mjs`, `vitest.config.ts` |

`npm run lint` is `tsc --noEmit` against the **build** config, so it adds no
coverage over `build`, and **pr.yml still does not run `lint`** (publish.yml and
`prepublishOnly` do). The build config's `exclude` is the load-bearing part:

```jsonc
"include": ["src/**/*"],
"exclude": ["node_modules", "dist", "tests", "fixtures"]
```

**Until ROADMAP 1.226 (2026-07-27) that was the whole story, and it meant no test
file was typechecked by anything.** `tsc --listFilesOnly` loaded 43 files, every
one under `src/`; `tests/`, `contract-tests/` and `fixtures/` were transpiled by
vitest (esbuild) with types stripped and never checked. Measured cost of that
blind spot when it was finally opened: **14 type errors across 3 test files**,
one of which had made a test's own stated purpose vacuous. This is the same hole
that produced CEE PR #710's red ratchet — a production type change broke 36 test
call sites while the author's local gate was honestly green, because CEE's build
tsconfig also excludes tests.

`tsconfig.test.json` closes it. Two design points, both deliberate:

- **Its `include` is derived, not mirrored** — `["**/*.ts", "**/*.mts", "**/*.cts", "**/*.mjs"]`,
  not a hand-listed set of directories. A new `e2e/` or `tests-integration/` is
  covered the moment it exists. A per-directory list is the estate's dominant
  defect class and its drift would read as green.
- **`tests/contracts/test-typecheck-coverage.test.ts` proves the coverage**, and
  it lives in the **test suite**, not the workflow. Narrowing `include`, widening
  `exclude`, or deleting the pr.yml step turns `npm test` red. It carries a
  positive control (trap 13): the set-difference must demonstrate it can see a
  missing file before its clean result counts. It also refuses JavaScript test
  files, which vitest would run and `checkJs: false` would never check.

`allowJs: true` is there to **type** `scripts/*.mjs` (imported by
`tests/json-schema.test.ts`), not to check it — `checkJs` stays off. Without it
that import is implicitly `any` and everything derived from it is unchecked.

`typecheck:tests` needs `dist/` to exist, because a few tests import `../dist/**`
and typecheck against the built `.d.ts`. `npm test` and pr.yml both order `build`
before it. **Run `npm run build` first if you invoke it on its own.**

---

## S0 conventions (arch step 2)

Landed in 0.24.0 (PR #20). Design of record:
`CONTRACT-INTENT-FACTS-DESIGN-2026-07-26.md`. Four mechanisms, three checker
scripts, one exported schema.

### Adoption manifest — `contracts/adoption-manifest.json`

One row per contract field subject to adoption tracking. Enforced by
`scripts/check-adoption-manifest.mjs`.

The four states, quoted from the manifest's own `states` block — **read them
there, not here, and set the state the definitions license, never the state a
lane asserted**:

| state | definition |
|---|---|
| `declared` | the field exists in the contract; no verified producer and no verified consumer |
| `produced_dark` | a producer emits it behind a flag/dark, with a producer test; no verified consumer |
| `consumed_dark` | a consumer reads it behind a flag/dark, with a consumer test; no verified producer |
| `enforced` | both sides verified by named tests; the field may be made required |

**The test-KIND distinction is the load-bearing rule, and it is what separates
this manifest from a checkbox:**

- A **producer test** must FAIL if the producer stops emitting the field. *A
  test asserting the field is OPTIONAL on the wire is not a producer test.*
- A **consumer test** must FAIL if the consumer stops USING the value. *A test
  asserting the field survives parsing is a transport test* — it passes just as
  happily when the value is parsed and thrown away. Transport-only evidence
  goes in `notes`, never in `producer_test` / `consumer_test`.

`assistant_text` is in the manifest as the **positive control** and is
deliberately NOT `enforced` despite overwhelming adoption, precisely because
neither available test is the right kind. Hold your own rows to that bar.

Other rules the checker enforces: `E_STATE_WITHOUT_TESTS` (enforced without
both refs) · `E_UNKNOWN_REPO` (a repo key absent from `contracts/repo-map.json`)
· `E_BAD_TEST_REF` (a ref not shaped `<repo>:<path>::<test name>`; the path may
not contain whitespace) · `E_DEADLINE_PASSED` (the dead-man's switch — a row in
a dark state may not outlive its `n_minus_1_removal_date`; enforced rows are
exempt) · `E_SCHEMA` · `E_MANIFEST_SHA_STALE`.

**⚠ CI does not verify that a referenced test file exists.** File-existence
checking only runs when `OLUMI_ESTATE_ROOT` is set, and pr.yml does not set it —
the checker prints `test-file existence: SKIPPED` and passes. So an `enforced`
row can name tests that do not exist. **Verify the refs yourself at a pinned
consumer sha** (`gh api repos/Talchain/<repo>/contents/<path>?ref=<sha>`) **and
record that sha in the row's `notes`.** Do not mutate
`repo-map.json`'s `authoritative_ref_head_at_seed` to do it — that field is a
seed-time record, as its name says; per-row evidence belongs in the row.

**After ANY manifest edit, regenerate in this order** (the constants generator
*reads* `contracts/manifest.sha256`, so running it first bakes the stale sha):

```bash
node scripts/check-adoption-manifest.mjs --write-sha   # rewrites contracts/manifest.sha256
npm run generate:contract-constants                    # rewrites src/contracts/generated-constants.ts
```

### Population registry — `contracts/population-registry.json`

`scripts/check-population-registry.mjs`. Namespaced+versioned ids, closed
`stage` enum, `parent_id` / `transform_id` integrity. The anti-mirror rule is
`wire_labels`: the mapping from the label a producer actually puts on the wire
to the registry id is asserted **total and injective against the pinned ISL
artifact in both directions**, so the day ISL adds a third label this repo's CI
fails. `not_yet_emitted.populations` is deliberately empty — an id enters the
registry in the same change train as the producer that emits it.

**The registry has a second consumer as of 0.26.0: it GENERATES the wire schema.**
`scripts/generate-population-ref.mjs` turns each entry into a `z.literal` id
paired with its registry-owned literal stage/parent/transform, assembled into the
discriminated `PopulationRefSchema` in `src/contracts/generated-population-ref.ts`
(Codex F4 — the hand-written alternative, a free-string `id` beside an
independent `stage` enum, accepts a REAL id with the WRONG stage, which is a
validator that passes everything). `generate:population-ref:check` is a
**regeneration-diff** check, so a hand-edit of the artefact and a registry change
without a regeneration fail identically. **Edit the registry, then run
`npm run generate:population-ref` — never edit the generated file.**

### Analysis facts — `src/contracts/analysis-fact.ts` (0.27.0)

`AnalysisFactSchema`, a `z.discriminatedUnion('status', …)` on `computed |
unavailable | suppressed`, attached optionally as
`RunAnalysisResult.analysis_facts?`. **The rule it encodes, and the reason to
copy the pattern:** `ComputedFact` requires `value`; `UnavailableFact` and
`SuppressedFact` **do not declare `value` at all** and every branch is
`.strict()`, so a withheld metric carrying a number is an unrecognized key and
fails to parse. A flat `status` field beside an optional `value` (or beside a
separate value map, which is what `win_probabilities` is) parses the
contradiction happily. **Where a rule can live in the type system, it must not
live in producer discipline.**

`population` on the computed branch is the **0.26.0 generated
`PopulationRefSchema`, imported** — pinned by an object-IDENTITY assertion in
`tests/contracts/analysis-fact.test.ts`, because a hand-written twin would pass
every behavioural test that used only valid values.

**Nothing is removed by 0.27.0** — the legacy maps are retained for the
compatibility window, and the test file asserts the resulting gap
(`DISCLOSED LIMIT — the legacy map can still contradict a suppressed fact`)
rather than letting a reader assume it closed.

### Health manifest — `src/contracts/health-manifest.ts`

The four fields every Olumi service exposes at the **top level** of its health
response: `schema_write_version`, `schema_read_versions`, `schema_sha`,
`contract_manifest_sha`. Plus `releaseLine()`, `parseHealthManifest()`,
`compareHealthManifest()`, and the generated `SCHEMA_SHA` /
`CONTRACT_MANIFEST_SHA` / `SCHEMA_PACKAGE_VERSION`.

`@talchain/schemas` is 0.x, so **MINOR is the breaking axis**:
`releaseLine('0.24.1') === '0.24'`. `compareHealthManifest(reader, writer)` is
fatal only when the reader has not declared the writer's release line — that is
reader-first deploy ordering, mechanised.

### Two-sided compat gate — `compat/`

`scripts/check-compat-gate.mjs`. Request and response directions are diffed
**separately** because their break rules are opposite (full matrix in
`compat/README.md`). Both pins must be immutable commit shas (`E_MOVING_PIN`
rejects `main` / `staging` / `HEAD` / tags), artifacts are credential-scanned
(`E_UNSANITIZED`), and an empty seam set fails (`E_NO_SEAMS`) rather than
passing vacuously. One seam is wired today — `isl-response-v2`. Three more are
named with their blockers at the bottom of `compat/README.md`; each is additive
(drop a directory under `compat/seams/`, no runner change).

### Negative fixtures are mandatory

`tests/contracts/s0-gates.test.ts` proves every rule twice: the real checked-in
artifact passes, AND a deliberately-broken fixture in
`tests/contracts/negative/` fails **with its specific error code**. A coverage
test asserts no fixture on disk is unexercised. **If you add a rule to any of
the three checker scripts, add its negative fixture in the same change — a rule
with no negative fixture is an unproven rule.** Mutation-check it: delete the
rule and watch the suite go red, in a throwaway worktree **outside** this repo
root.

### Maximal-fixture ratchet

`tests/fixtures/completeness.test.ts` enumerates every Zod schema exported from
the three entry points and fails unless each has a registered maximal fixture in
`src/fixtures/index.ts` or an explicit documented exclusion in
`FIXTURE_COVERAGE_EXCLUSIONS`. `src/fixtures/maximality.ts` goes further and
fails on optional fields never populated anywhere, empty collections and
unexercised union branches — this is what catches *the dominant drift shape*,
a new optional field on an EXISTING schema. Scalar vocabularies (enum/literal)
are auto-exempt. **Adding an exported schema without a fixture or a reasoned
exclusion fails CI here, before any consumer can silently drop the field.**

### Per-service wiring instructions are NOT in this repo

If you are wiring the health manifest into a service, the concrete recipe —
which file, which handler, which keys, per service — exists only in **the body
of PR #20** (<https://github.com/Talchain/olumi-schemas/pull/20>). The repo
holds the pieces, not the recipe: `contracts/repo-map.json` declares the repo
keys and each repo's authoritative ref, `compat/README.md` is the compat spec
plus the named follow-up seams, and `src/contracts/health-manifest.ts` documents
what the four fields mean and how they compare. The 0.24.0 CHANGELOG entry says
so explicitly: *"Per-service wiring is not in this package — see the PR body."*

---

## Publish model

`.github/workflows/publish.yml`, on push to `main`: install → `lint` → `build`
→ `test` → **Check if version exists** → publish → tag → trigger propagation.

**The version check is the release switch.** It runs
`npm view @talchain/schemas@$PACKAGE_VERSION`; if the version already exists in
the registry, the publish, the tag AND the propagation dispatch are **all
skipped** and the job is green. So:

- **Bump the version in `package.json` ⇒ a release happens on merge.**
- **Leave it ⇒ nothing is published**, and `main` carries content the published
  tarball of that version does not have. That is fine for repo-only files
  (`CLAUDE.md`, `.github/**`) and dangerous for anything under `files`
  (`dist`, `json-schema`, `contracts`) — two different byte-sets under one
  version string is the exact failure `schema_sha` / `contract_manifest_sha`
  exist to catch.

Confirmed empirically: run `30008998214` (a docs-only merge, no bump) is
**success** with publish/tag/propagation all `skipped`; run `30217037375`
(the 0.25.0 release) publishes and tags successfully and then fails.

### Closing hazard 3 — branch protection, PAUL'S CALL

**Not applied. This is written down so it is one line when he wants it, and so
no lane applies it on his behalf.** Nothing below has been executed against the
live repo; `main` is still unprotected as of 2026-07-27.

The check context to require is **`build-and-test`** — derived, not assumed: the
job id in `.github/workflows/pr.yml` carries no `name:`, and the check-run
reported on the head commits of PRs #22, #23 and #24 is literally
`name=build-and-test`.

```bash
gh api -X PUT repos/Talchain/olumi-schemas/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["build-and-test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

To undo, one line: `gh api -X DELETE repos/Talchain/olumi-schemas/branches/main/protection`.

**Rationale, and the tradeoff it buys.** In every other repo in the estate a
push to the integration branch is just a push; here `publish.yml` fires on push
to `main`, so **a direct push IS a release** — it publishes to GitHub Packages,
tags it, and (once ROADMAP 1.216 is done) propagates it. publish.yml's own
lint/build/test steps run *after* the push has already landed, so they can only
report on a bad release, never prevent one. Requiring `build-and-test` moves the
only real gate this repo has to *before* the thing it is meant to gate. Three
choices inside the command are deliberate and are the part worth a second's
thought: `enforce_admins: true` is what actually closes the hazard — with it
`false`, an admin (which is everyone who can push here) can still push straight
to `main` and publish, so the protection would be decorative; the cost is that an
emergency release means running the `DELETE` above first, which is the intended
friction. `required_pull_request_reviews: null` because a single-human programme
cannot approve its own PRs and requiring reviews would deadlock releases outright.
`strict: true` requires a branch to be current with `main` before merging, which
costs a rebase on a stale PR and buys the guarantee that the green tick was
earned against the bytes that will actually be published.

### ⚠ `Trigger propagation` is a KNOWN standing red — and its model is obsolete

The final step of publish.yml **has never once succeeded.** Across all 29
publish runs (measured 2026-07-26 via `gh run view`), `Trigger propagation` is
**18 × `failure`, 6 × `skipped`** (the no-bump merges) and 5 × absent (very
early runs that never reached it). It fails because
`secrets.OLUMI_SCHEMAS_PAT` was never created — the repo has **no Actions
secrets at all** (`gh api …/actions/secrets` → `total_count: 0`). The publish
and the tag succeed *before* it. Every real release is therefore marked
`failure` while having fully succeeded — the broken-alarm class: a red everyone
learns to ignore is a red nobody will check. It now carries
`continue-on-error: true` plus an honest comment naming the facts (ROADMAP
1.216, minimal arm).

Separately, and more importantly: **`propagate.yml`'s model is wrong for every
consumer.** It runs `npm install @talchain/schemas@<version> --save-exact`, a
registry-install model. **All three consumers vendor via `file:` tarballs**
(measured 2026-07-26 at each repo's `staging` tip: UI `file:./vendor/talchain-schemas-0.22.0.tgz`,
PLoT the same 0.22.0, CEE `file:./vendor/talchain-schemas-0.25.0.tgz`). Running
the current matrix against CEE would **rewrite the `file:` pin** and trip CEE's
tarball-sha guard. **Never run propagation as written.** Full rework is tracked
as ROADMAP 1.216.

### The adoption path is RE-VENDORING, not propagation

Each consumer carries `vendor/README.md` with its own step-by-step procedure
(`npm pack` the published version, drop the tarball in `vendor/`, rewrite the
`.sha256` manifest, update the `file:` reference, reinstall, delete the old
tarball, update that README). Follow the consumer's README, in the consumer's
repo, as a separate PR in that repo's lane. **This repo publishes; it never
edits a consumer.** And note the corollary: **a consumer's vendored tarball is
sha256-pinned, so you must never hand-edit a file inside it** — a
`contracts/adoption-manifest.json` correction is a PR *here* plus a re-vendor
*there*, never an edit in place.

---

## Version discipline

Semver policy table lives in `README.md`. On top of it:

- **0.x ⇒ MINOR is the breaking axis** (see `releaseLine()`). A minor bump is
  what consumers treat as a compatibility boundary; patch is same-line.
- **Any version bump changes `SCHEMA_SHA`** — the generator hashes
  `<name>@<version>` before the json-schema bytes. So every bump must be
  followed by `npm run generate:contract-constants`, or
  `generate:contract-constants:check` fails the PR gate.
- Allocated so far, and it matters because a lane has now been told the wrong
  number **five** times: **0.24.0 = S0 scaffolding**, **0.25.0 =
  `RunAnalysisResult.constraint_verdict`**, **0.26.0 = `PopulationRefSchema`
  (Codex F4)**, **0.27.0 = `AnalysisFactSchema` (Codex F3)**, **0.28.0 =
  `EnrichmentRobustnessEdgeSchema.switch_probability` optional (PLoT #278
  unblock)**. The 0.24.0 CHANGELOG told the S1 lane its generated types would be
  `0.25.0`; 0.25.0 was taken, the note was corrected to `0.26.0`, 0.26.0 was
  taken and the note moved to `0.27.0`, 0.27.0 was taken and it moved to
  `0.28.0`, and **0.28.0 has now been taken too — S1's types land at `0.29.0`
  or later.** Before taking it, the 0.28.0 lane derived that nothing had claimed
  it (2026-07-27, at `5766fc9`): `git ls-remote --heads` shows no branch matching
  `s1` or `0.28`, the newest tag is `v0.27.0`, and the only two open PRs (#15,
  #16) are still the same stale drafts on 0.21.0 / 0.20.0. **That derivation is
  the procedure — these notes are expectations recorded in a changelog, not
  reservations any tooling enforces, and this bullet has now been wrong five
  times running.** Re-read `package.json` at the tip you are on, and check the
  open PRs, rather than trusting any note including this one.
- Every release gets a CHANGELOG entry under its own heading, with the
  additive/breaking analysis stated explicitly.

## Adding or changing a field

1. Edit or add the schema in `src/`. Match the **namespace's** unknown-key
   policy — see the README's "Unknown-key policy"; it is not uniform, and
   `/orchestrator` is 100% `.strict()`.
2. Export it from the namespace `index.ts` and, if it is a new shape, register a
   maximal fixture (or a documented exclusion) in `src/fixtures/index.ts`.
3. Add tests in `tests/`. They **are** typechecked as of 1.226 — run
   `npm run build && npm run typecheck:tests`, and note that `noUnusedLocals`
   applies there too (it is inherited from the build config, deliberately).
4. Add an `contracts/adoption-manifest.json` row if the field is subject to
   adoption tracking — with the state its evidence licenses today, which for a
   brand-new field is `declared` or `produced_dark`, never `enforced`.
5. Regenerate: `--write-sha`, then `npm run generate:contract-constants`.
6. Bump `package.json` per the semver policy and write the CHANGELOG entry.
7. `npm test` green, PR, and let the orchestrator merge. Merging publishes.
8. Adoption in each consumer is a **re-vendor PR in that consumer's repo**.

## Cross-boundary discipline

The estate's dominant risk is schema-version skew: each repo pins its own
version and a consumer on an older pin **silently drops** fields it does not
know. As of 2026-07-26 the live pins are **UI 0.22.0, PLoT 0.22.0, CEE 0.25.0** —
three different lines at once. Before changing any field that crosses a
boundary, trace producer → validator → consumer, open the schema at each hop,
and check each repo's `package.json` pin. Never assume parity.

**Re-measured 2026-07-27** at each repo's own `staging` tip (the pins had not
moved, the shas had): UI `201f1075` → **0.22.0**, PLoT `dd144f77` → **0.22.0**,
CEE `6cfb0e57` → **0.25.0**. ⚠ And note what a pin does NOT tell you: PLoT
`main` carries a *registry* pin `"@talchain/schemas": "0.1.0"` with no `vendor/`
directory at all. `main` is a divergent production branch here, not a descendant
of what is deployed on staging — **name the branch when you quote a pin.**

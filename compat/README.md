# Two-sided compat gate — spec + skeleton

Arch step 2, sub-step S0. Design of record: `CONTRACT-INTENT-FACTS-DESIGN-2026-07-26.md`.

Runner: `scripts/check-compat-gate.mjs` · `npm run check:compat`

## Why two-sided

A one-sided gate checks that new responses still parse for old readers. That is half
the seam. The other half is that old **writers** are still accepted by the new service —
and the two halves have *opposite* break rules:

| | RESPONSE direction (service writes, consumer reads) | REQUEST direction (consumer writes, service reads) |
|---|---|---|
| adding an optional field | safe | safe |
| adding a **required** field | safe | **BREAK** — every existing writer is rejected |
| removing a field | **BREAK** — the reader loses data it uses | safe (unless strict parsing) |
| widening an enum | advisory — readers must tolerate | safe |
| narrowing an enum | **BREAK** | **BREAK** — a value writers still send is refused |
| making a guaranteed field optional | **BREAK** — readers have no null path | safe |
| changing a type | **BREAK** | **BREAK** |

`request-field-newly-required` in `tests/contracts/negative/seams/` is the fixture that
makes this concrete: a response-only gate calls that change safe. It is not.

## Rules the gate enforces beyond the matrix

**Never a moving branch tip.** Both `baseline` and `candidate` must carry a
`pinned_ref` that is an immutable commit sha (7 or 40 hex). `main`, `staging`, `HEAD`,
`latest` and tags are rejected with `E_MOVING_PIN`. A gate whose subject can change
underneath it records an opinion about nothing.

**Sanitized fixtures.** Every committed artifact is scanned for keys matching
`api_key | authorization | password | secret | token | bearer | cookie | email | user_id`
and fails with `E_UNSANITIZED`. Compat artifacts are checked in; nothing that looks
like a credential rides along.

**No vacuous pass.** An empty seams directory fails with `E_NO_SEAMS` rather than
reporting success over zero seams.

## Seam layout

```
compat/seams/<seam-id>/
  seam.json                      declares operations + both pins
  baseline/openapi.pinned.json   what deployed peers are pinned to
  candidate/openapi.pinned.json  the build proposed for deployment
```

`seam.json` names, per operation, the `request_schema` and `response_schema` component
names; the gate diffs each in its own direction.

## What ships in this PR

**One seam, wired end-to-end over real artifacts: `isl-response-v2`**
(`POST /api/v1/robustness/analyze/v2`, `RobustnessRequestV2` / `ISLResponseV2`).

It is seeded with a real, already-merged ISL change replayed through the gate:

- baseline `3aea011c…` — openapi.json at the merge-base of `Talchain/Inference-Service-Layer#114`
- candidate `7d144c7f…` — ISL staging HEAD, the sha its live `/health` reports

The gate's verdict on that pair, which is the correct one:

```
POST /api/v1/robustness/analyze/v2 [request]  RobustnessRequestV2 — 0 advisory finding(s)
POST /api/v1/robustness/analyze/v2 [response] ISLResponseV2 — 1 advisory finding(s)
  · response: ISLResponseV2.sample_population_provenance added (optional) — additive
```

## Named follow-up — the remaining three seams

Deliberately **not** built here. Building four seams at once would mean three of them
had no real artifact pair to run against, which is how a gate becomes decoration.

| seam | writer → reader | what it needs before it can be wired |
|---|---|---|
| `cee-response-v2` | CEE → UI | CEE publishes an OpenAPI/JSON-Schema for `OlumiResponseSchema` egress. It has `openapi.yaml` + `openapi/`; confirm it covers the v5 turn response before pinning. |
| `plot-response` | PLoT → CEE | PLoT emits no published schema artifact for the coaching/analysis envelope. Needs one generated before a pin exists. |
| `ui-request` | UI → CEE | request-direction only; pin CEE's request schemas and diff UI's pinned `@talchain/schemas` version against them. |

Each is additive: drop a directory under `compat/seams/`, and `npm run check:compat`
picks it up with no change to the runner.

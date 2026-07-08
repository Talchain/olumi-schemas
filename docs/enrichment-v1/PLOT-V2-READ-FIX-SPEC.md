# PLoT ISL-V2 read alignment — residual fix spec (handoff for a PLoT lane)

Owner: Brief F. Status: SPEC ONLY — implementation lands via a PLoT
orchestrator lane. Evidence base: plot-lite-service staging **524c488**
(2026-07-08), ISL staging build **9a22a1a**, and the real wire capture
mirrored at `contract-tests/fixtures/isl-to-plot.v2-envelope.staging-capture.json`.

## 1. What the brief flagged vs. what is ALREADY FIXED

The brief (written against the 6-Jul snapshot) listed PLoT reads of
V1-shaped ISL fields the V2 wire never emits. **Most of those fixes have
since LANDED on PLoT staging** via `src/integrations/isl/v2-envelope.ts`
(lanes PLoT-W4 / PLoT-H) — do not re-implement them:

| Brief item | Status on staging 524c488 |
|---|---|
| top-level `edge_e_values` read | FIXED — `getIslEdgeEValues` reads nested `robustness.edge_e_values` (legacy top-level kept as fixture fallback only) |
| top-level `sensitivity` read | FIXED — `getIslEdgeSensitivity` reads nested `robustness.edge_sensitivity` (build 9a22a1a+); NO legacy fallback, `EDGE_SENSITIVITY_UNAVAILABLE_V2_WIRE` warning covers older ISL builds |
| top-level `computed_at` read | FIXED — `getIslComputedAt` reads top-level `timestamp` (V1 `computed_at` fallback for fixtures only) |
| `factor_sensitivity[].value_of_information` read | KNOWN-DEAD & DOCUMENTED — live V2 never emits it; public VOI comes from the graph heuristic; the read is retained only for legacy fixtures (run.ts ~644) |
| `factor_evpi` consumption | LANDED — `mapIslFactorEvpi` feeds `evpi_percentage_points`/`evpi_status` under `FLAGS.ISL_FACTOR_EVPI_INTERNAL` (staging/test ON, **prod OFF** — decision P-5 pending) |
| top-level `validation_status` read | PARTIALLY RESIDUAL — see §2.2 |

A PLoT lane picking this up should FIRST re-verify against its then-current
staging head; the contract test in `contract-tests/isl-to-plot.contract.test.ts`
pins the wire truth.

## 2. Residual fixes (the actual work)

### 2.1 `isl_version` / build assertion (NEW — the brief's outstanding ask)

PLoT pins the request side (`?response_version=2` +
`X-ISL-Response-Version: 2`, `client.ts:87,127`) but asserts NOTHING about
the response generation: a mis-deployed or rolled-back ISL silently
degrades to empty science (the exact failure mode that motivated this
workstream).

Spec:
- After each successful `robustness/analyze` call, read the envelope's
  `build` (string, e.g. `9a22a1a`), `engine_version`, and `version` fields
  (all present on the live capture).
- Maintain a per-deploy expectation: `ISL_MIN_WIRE_GENERATION` — the
  minimum ISL build/date whose wire PLoT's readers assume (today:
  `9a22a1a` for nested `robustness.edge_sensitivity`; `f3f5d92` suffices
  for `robustness.edge_e_values` + `timestamp` + `factor_evpi`).
- On mismatch/absence: emit ONE structured warning
  (`event: 'isl_wire_generation_unverified'`, carrying build + missing
  markers) and, when a wire-location probe fails (e.g. `robustness`
  present but `edge_e_values` absent AND the request asked for e-values),
  degrade the relevant per-feature status honestly instead of emitting
  computed-empty.
- Do NOT hard-fail the run on version mismatch — absence of enrichment is
  degraded-but-usable; fail-closed stays reserved for the analysis core.
- Surface the assertion result in `_meta.evidence` (fields
  `isl_build` — already present — plus new `isl_wire_generation_ok:
  boolean`).

### 2.2 Retire the dead `validation_status` reads on live paths

- `src/cee/orchestrator.ts:683-724` maps `isl.validation_status`
  ('identifiable'/'uncertain'/'cannot_identify') into CEE-facing
  confidence factors. The live V2 wire NEVER emits `validation_status`
  (pinned by the contract test; `isl-types.ts:655` already marks it
  `@deprecated DEAD ON THE LIVE V2 WIRE`). Today this branch silently
  never fires.
- Spec: replace the `validation_status` input with the V2 identifiability
  source PLoT already computes (`identifiability.status` from B1.5), or
  delete the mapping and its `VALID_VALIDATION_STATUS` guard. Do not keep
  a read that can never fire — it invites the next stale-doc regression.
- The `/v1/run` route reads (`isl_validation?.status`,
  `routes/v1/run.ts:1075,1349`) are a legacy V1 surface — out of scope
  unless the V1 routes are themselves retired.

### 2.3 Fix the dead `sensitivity_count` diagnostic

`run.ts:857` (`buildISLResponseSummary`) counts top-level
`islResult.sensitivity` — structurally 0 on every live response, so the
consolidated ISL log permanently reports `sensitivity_count: 0` even when
`robustness.edge_sensitivity` is populated. One-line fix: count
`getIslEdgeSensitivity(islResult)?.length ?? 0`. Misleading-telemetry
class, not wire-affecting — but it is exactly the signal an operator
would check when diagnosing "empty science", so it must not lie.

### 2.4 Decide P-5 (prod flag for ISL factor EVPI)

`FLAGS.ISL_FACTOR_EVPI_INTERNAL` is ON for staging/test, OFF for prod.
The heuristic fallback is known to flatten to 0 when
`marginal_switch_probability` is uniformly 0 (live scenario 327bc417,
2026-07-07). Paul-gated product decision; the lane should package the
staging evidence, not flip the flag.

## 3. Verification for the lane

1. Install `contract-tests/isl-to-plot.contract.test.ts` per the README —
   it pins every location claim in §1 and fails if ISL moves a field.
2. Re-capture the ISL fixture against the then-deployed ISL build (method
   in plot-lite-service `tests/fixtures/isl-v2-live-20260707/PROVENANCE.md`;
   do NOT use the reserved staging scenarios).
3. For §2.1: add a unit test feeding an envelope with `build` absent and
   one with nested fields missing; assert the warning + honest degradation.
4. Run the repo's own gates (`npm run typecheck`, prepush scripts) — not
   ad-hoc tsc.

# Wire-shape contract-test pack (enrichment v1)

One runnable spec per producer/consumer pair on the analysis data plane.
Each spec fails when a consumer reads a field the producer does not emit
(and pins the reverse for load-bearing fields) — the silent-empty /
silent-drop defect class that this workstream exists to retire.

These specs RUN IN THIS REPO (`npx vitest run contract-tests`) against
checked-in fixtures, as proof they are runnable and as the reference
implementation. **Adoption in the service repos lands via separate
orchestrator lanes, not from here.** The per-repo installation notes are
at the top of each spec and summarised below.

| Seam | Spec | Fixture (evidence class) |
|---|---|---|
| ISL → PLoT | `isl-to-plot.contract.test.ts` | `fixtures/isl-to-plot.v2-envelope.staging-capture.json` — REAL wire capture, isl-staging build 9a22a1a, 2026-07-07 (mirrored from plot-lite-service `tests/fixtures/isl-v2-live-20260707/`) |
| PLoT → CEE | `plot-to-cee.contract.test.ts` | `../fixtures/enrichment/plot-to-cee.run-analysis.staging.json` — REAL capture (mirrored from CEE `tests/fixtures/cross-service/v5-turn.run-analysis.staging.json`); plus `plot-to-cee.doctrine-b.code-derived.json` — CODE-DERIVED (post-PR #202–#205 vocabulary; replace with a live capture when available) |
| CEE → UI | `cee-to-ui.contract.test.ts` | keep-list projection derived in-test from the real PLoT→CEE capture, mirroring CEE `compose.ts` `toSafeTransportEnrichment` |

## What each spec pins

- **isl-to-plot** — V2 envelope field LOCATIONS: `robustness.edge_e_values`,
  `robustness.edge_sensitivity`, top-level `timestamp`, top-level
  `factor_evpi[]` (+ `evpi_status`), `options[]`; and the dead V1-era
  locations pinned ABSENT (top-level `edge_e_values` / `sensitivity` /
  `validation_status` / `computed_at`,
  `factor_sensitivity[].value_of_information`).
- **plot-to-cee** — envelope parses against `AnalysisEnrichmentSchema`;
  CEE's load-bearing reads (`analysis_status`,
  `option_comparison[].option_id/win_probability`,
  `factor_sensitivity[].factor_id`, `robustness.fragile_edges`,
  `meta.computed_at`) exist; `results` pinned NOT emitted (CEE prefers it
  on read — a producer starting to emit it must be a deliberate event);
  PR #205 suppressed-variant withholds constraint numbers.
- **cee-to-ui** — the 11-key keep-list (`CEE_UI_ENRICHMENT_KEEP_LIST`,
  exported by `@talchain/schemas` ≥ 0.14.0 as the single source of truth)
  projection parses; UI no-fallback reads survive projection; internal
  carriers (`_meta`, `meta`, `downstream_calls`, `graph*`, `seed`,
  `isl_engine`, `[REDACTED]` values, ...) never ship at any depth;
  `m1_coaching` stays deferred.

## Per-repo installation notes

All three installations require the repo to pin `@talchain/schemas`
**≥ 0.14.0** (vendored tarball; see `docs/enrichment-v1/ROLLOUT.md` for the
pin ordering — CEE must move 0.13.0 → 0.14.0 first).

### PLoT lane (`plot-lite-service`)
1. Copy `isl-to-plot.contract.test.ts` → `tests/contract/`.
2. Point the fixture path at the repo's own
   `tests/fixtures/isl-v2-live-20260707/isl-staging-capture.json`
   (same bytes as the mirror here).
3. Swap the schema import to `@talchain/schemas/boundary`.
4. Add one producer-side assertion in the existing
   `tests/enrichment-emission-contract.test.ts`: `buildResponse` output
   `safeParse`s against `AnalysisEnrichmentSchema`.
5. Refresh the ISL fixture whenever the deployed ISL build changes
   materially (capture method: that fixture dir's `PROVENANCE.md`).

### CEE lane (`olumi-assistants-service`)
1. Copy `plot-to-cee.contract.test.ts` and `cee-to-ui.contract.test.ts`
   → `tests/contract/`.
2. Point fixtures at the repo's own
   `tests/fixtures/cross-service/v5-turn.run-analysis.staging.json`.
3. Swap schema imports to `@talchain/schemas/boundary`.
4. Add the drift bolt: assert
   `P0B_SAFE_TRANSPORT_ENRICHMENT_KEEP` (compose.ts) equals
   `CEE_UI_ENRICHMENT_KEEP_LIST` (schemas) element-for-element.
5. Optional but recommended: validate a freshly captured staging envelope
   in the cross-service capture harness with
   `AnalysisEnrichmentSchema.safeParse` and fail on `success: false`.

### UI lane (`DecisionGuideAI`)
1. Copy `cee-to-ui.contract.test.ts` → `src/__tests__/contract/` (adapt
   the runner import if the repo uses jest — the spec body is
   runner-agnostic).
2. Replace the local projection helper with a captured turn response:
   parse `blocks[type==='analysis_result'].enrichment` directly.
3. Swap the schema import to `@talchain/schemas/boundary`.
4. Optional hardening: in `extractPhase3FromV5Response` / debug bundle
   code paths, log (never throw on) `parseAnalysisEnrichment` failures so
   schema drift becomes a console signal in staging.

## Fixture hygiene

- Files marked REAL CAPTURE must never be hand-edited; refresh by
  re-capturing (methods documented in the source repos).
- Files marked CODE-DERIVED are stop-gaps for vocabulary the existing
  captures predate; replace with captures when the corresponding staging
  path is exercised (tracked in `STATUS.md`).
- The scenarios reserved on staging (1909b083-…, def3cb31*, 8e0bf73d*)
  must NOT be used for new captures — create fresh scenarios.

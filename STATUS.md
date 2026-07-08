# STATUS — Brief F: contract & data alignment (claude-contract/enrichment-v1)

Updated: 2026-07-08. Owner: Brief F lane (self-driven, dispatch delegated
8 Jul). Branch: `claude-contract/enrichment-v1` off `origin/main` (3d31281,
v0.13.1). Draft PR: **#5** (https://github.com/Talchain/olumi-schemas/pull/5,
draft, head 935e905). NEVER merge from this lane — contract changes are
Paul-gated.

## Deliverable state

| # | Deliverable | State |
|---|---|---|
| 1 | Typed enrichment envelope (additive) | **DONE** — `src/boundary/enrichment.ts`, v0.14.0, exported via `/boundary`. Transport fields untouched (`z.record` stays); envelope is opt-in `.passthrough()`/all-optional. 23 new tests; full suite 614 green (`npm test`). |
| 2 | Wire-shape contract-test pack | **DONE (reference form)** — `contract-tests/` with one spec per seam (ISL→PLoT, PLoT→CEE, CEE→UI), 32 tests green (`npx vitest run contract-tests`), per-repo installation notes in its README. Per-repo adoption = orchestrator lanes. |
| 3 | Pin/rollout plan (incl. 0.13.0/0.13.1 skew, prod 0.2.0/0.1.0) | **DONE** — `docs/enrichment-v1/ROLLOUT.md`. |
| 4 | PLoT V2-read fix spec | **DONE (residual form)** — `docs/enrichment-v1/PLOT-V2-READ-FIX-SPEC.md`. NOTE: most of the brief's V2-read items ALREADY LANDED in PLoT staging (`v2-envelope.ts`, lanes W4/H) since the brief snapshot; the spec covers verification + the true residuals (isl wire-generation assertion, dead `validation_status` reads, dead `sensitivity_count` diagnostic, P-5 flag decision). |

## Key verified facts (evidence in code/fixtures, 2026-07-08)

- Pins: CEE staging **0.13.0**, PLoT staging **0.13.1**, UI staging
  **0.13.1** (all vendored `file:` tarballs). Prod (`main`): CEE **no
  schemas dep at all**, PLoT **0.1.0**, UI **0.2.0** (registry pins).
- Skew mechanics: CEE B1 (`validators/b1.ts` + `route-v2-preflight.ts`)
  strict-parses the turn payload after stripping ONLY
  graph_state/analysis_state/user_id/selected_elements → a `kind:'message'`
  turn carrying `generate_model`/`explicit_generate` 422s on 0.13.0.
  Latent (not detonating) because the UI's live V5 builder
  (`src/v5/buildPayload.ts`) does not emit the flags yet; the flag-bearing
  builder (`services/turn-request-builder.ts`) exists on another path.
- Enrichment truth: CEE persists the PLoT `/v2/run` envelope byte-for-byte
  (run-analysis.ts, F.6); CEE→UI wire reduces to the 11-key P0B keep-list
  (compose.ts) with deep internal-key strip. Envelope typed from the real
  staging capture (mirrored to `fixtures/enrichment/`) + staging producer
  code at PLoT 524c488 / CEE e122f16 (incl. #203/#204/#205 goal-fit
  doctrine B vocabulary and lane-W5 display_verdict).
- `results` is NOT emitted by current PLoT `/v2/run` but is PREFERRED by
  CEE's readResultRecords and keep-listed → typed inbound-tolerant,
  disposition documented (producers must not start emitting it casually;
  contract test pins it).
- `semantic_severity` is a V1-route critique field, NOT a V2
  inference_warnings field — documented instead of invented (brief item
  corrected).
- ISL→PLoT wire pinned from the REAL 9a22a1a capture (mirrored to
  `contract-tests/fixtures/`): nested `robustness.edge_e_values` /
  `robustness.edge_sensitivity`, top-level `timestamp` + `factor_evpi[]`;
  dead V1 locations pinned absent.

## Open items / follow-ups for the orchestrator

1. Paul-gated review + merge of the draft PR; then publish 0.14.0 and
   vendor tarballs per ROLLOUT.md (CEE first — closes the skew).
2. Adoption lanes: CEE (pin bump + contract tests + keep-list drift bolt),
   PLoT (pin bump + producer safeParse + ISL contract test + residual spec
   items), UI (pin bump + projection contract test).
3. Replace the CODE-DERIVED doctrine-B fixture with a live capture once a
   constraint-bearing doctrine-B run is exercised on staging (do not use
   reserved scenarios 1909b083*/def3cb31*/8e0bf73d*).
4. CEE PR #369 (ContextPack analysis-projection widening) is CEE-internal
   (context projection, not wire shape) — no envelope impact found; re-check
   at adoption time if it lands with wire-visible changes.
5. After adoption lanes land: retire the "untyped passthrough" hazard notes
   in the repo CLAUDE.md files (orchestrator harvest point).

## Session log

- 2026-07-08: worktree from origin/main; producer-shape survey (PLoT/CEE/UI/ISL
  staging heads 524c488/e122f16/eeea43d2/3773f76); envelope + tests
  (3fa8aa7); contract pack (5d1f008); rollout + PLoT spec + STATUS (this
  commit). All pushes foreground + ls-remote verified.

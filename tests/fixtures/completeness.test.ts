// ============================================================================
// W2E-1 completeness ratchet.
//
// Enumerates EVERY Zod schema exported from the package's three entry points
// (root, /boundary, /orchestrator) and fails unless each one either:
//   (a) has at least one registered maximal fixture (matched by object
//       identity, so re-exports of the same schema under multiple names /
//       namespaces are satisfied by a single entry), or
//   (b) is explicitly excluded in FIXTURE_COVERAGE_EXCLUSIONS with a
//       documented reason.
//
// Scalar vocabularies (ZodEnum / ZodNativeEnum / ZodLiteral) are auto-exempt:
// they have no fields to silently drop, which is the hazard this library
// exists to detect.
//
// THIS IS THE RATCHET: adding a new exported schema without a maximal
// fixture (or a conscious, reasoned exclusion) fails CI in THIS repo before
// any consumer can silently drop the new fields.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import * as rootNs from '../../src/index.js';
import * as boundaryNs from '../../src/boundary/index.js';
import * as orchestratorNs from '../../src/orchestrator/index.js';
import {
  MAXIMAL_FIXTURES,
  FIXTURE_COVERAGE_EXCLUSIONS,
} from '../../src/fixtures/index.js';

interface ExportedSchema {
  key: string; // `<namespace>/<ExportName>`
  schema: z.ZodTypeAny;
}

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return value instanceof z.ZodType;
}

/** Scalar vocabularies cannot silently drop fields — auto-exempt. */
function isScalarVocabulary(schema: z.ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodNativeEnum ||
    schema instanceof z.ZodLiteral
  );
}

function collectExportedSchemas(): ExportedSchema[] {
  const namespaces: Record<string, Record<string, unknown>> = {
    root: rootNs as unknown as Record<string, unknown>,
    boundary: boundaryNs as unknown as Record<string, unknown>,
    orchestrator: orchestratorNs as unknown as Record<string, unknown>,
  };
  const out: ExportedSchema[] = [];
  for (const [nsName, ns] of Object.entries(namespaces)) {
    for (const [exportName, value] of Object.entries(ns)) {
      if (isZodSchema(value) && !isScalarVocabulary(value)) {
        out.push({ key: `${nsName}/${exportName}`, schema: value });
      }
    }
  }
  return out;
}

const exported = collectExportedSchemas();
const registeredSchemas = new Set(MAXIMAL_FIXTURES.map((e) => e.schema));

describe('completeness ratchet — every exported schema family has a maximal fixture', () => {
  it('enumerates a non-trivial export surface (sanity)', () => {
    // If this ever drops to a handful, the enumeration itself broke and the
    // ratchet would pass vacuously — fail loudly instead.
    expect(exported.length).toBeGreaterThan(50);
  });

  it('every exported non-enum schema has a maximal fixture or a reasoned exclusion', () => {
    const missing = exported
      .filter(
        ({ key, schema }) =>
          !registeredSchemas.has(schema) &&
          !(key in FIXTURE_COVERAGE_EXCLUSIONS),
      )
      .map(({ key }) => key);
    expect(
      missing,
      `Schemas lacking a maximal fixture AND lacking a documented exclusion:\n  ${missing.join('\n  ')}\n` +
        'Add a MAXIMAL_FIXTURES entry (every optional field populated) or an ' +
        'explicit FIXTURE_COVERAGE_EXCLUSIONS reason in src/fixtures/index.ts.',
    ).toEqual([]);
  });

  it('has no stale exclusions (every exclusion key matches a real exported schema)', () => {
    const exportedKeys = new Set(exported.map((e) => e.key));
    const stale = Object.keys(FIXTURE_COVERAGE_EXCLUSIONS).filter(
      (key) => !exportedKeys.has(key),
    );
    expect(stale).toEqual([]);
  });

  it('has no exclusion that shadows a registered fixture (each key exactly one disposition)', () => {
    const keyToSchema = new Map(exported.map((e) => [e.key, e.schema]));
    const shadowed = Object.keys(FIXTURE_COVERAGE_EXCLUSIONS).filter((key) => {
      const schema = keyToSchema.get(key);
      return schema !== undefined && registeredSchemas.has(schema);
    });
    expect(shadowed).toEqual([]);
  });

  it('every exclusion carries a non-empty documented reason', () => {
    for (const [key, reason] of Object.entries(FIXTURE_COVERAGE_EXCLUSIONS)) {
      expect(reason, `Exclusion ${key} must document a reason`).toBeTruthy();
      expect(reason.length, `Exclusion ${key} reason too thin`).toBeGreaterThan(20);
    }
  });

  it('every registry entry points at a schema actually exported by the package', () => {
    const exportedSchemaObjects = new Set(exported.map((e) => e.schema));
    const orphans = MAXIMAL_FIXTURES.filter(
      (e) => !exportedSchemaObjects.has(e.schema),
    ).map((e) => e.family);
    expect(
      orphans,
      'Registry entries whose schema is not exported from any entry point (fixture drifted off the public surface)',
    ).toEqual([]);
  });

  it('the registry size matches the documented count', () => {
    // P2 guard: the PR body / CHANGELOG quote a registry size. It was stated as
    // 100 while the registry actually held 102 — a small drift, but this
    // package's entire pitch is that its counts are trustworthy. Pin it so the
    // number in the docs and the number in the code cannot silently diverge:
    // changing the registry now forces updating this line AND the CHANGELOG.
    // 0.18.0: 102 -> 103 (boundary/DraftGoalConstraintSchema).
    // 0.19.0: 103 -> 106 (root/CeeErrorRecoverySchema,
    //   boundary/EnrichmentEdgeEValueStabilitySchema,
    //   boundary/DecisionClassificationSchema).
    // 0.22.0: 106 -> 113 (+7): schemas #16 F6 —
    //   boundary/EnrichmentConstraintMarginSchema,
    //   boundary/EnrichmentScaleProvenanceSchema; the typed feedback event —
    //   boundary/SystemEventSchema#feedback; and the Group-A response surfaces
    //   (ROADMAP 1.181) — boundary/SequentialAnalysisResponseSchema,
    //   boundary/CounterfactualResponseSchema, boundary/OptimiseResponseSchema,
    //   boundary/OptimiseUtilitySchema.
    // 0.24.0: 113 -> 114 (+1): arch step 2 S0 — root/HealthManifestSchema, the
    //   four contract-identity fields every service exposes on its health endpoint.
    // 0.26.0: 114 -> 116 (+2): arch step 2 S0, Codex F4 — root/PopulationRefSchema
    //   is a discriminated union generated from contracts/population-registry.json,
    //   so it needs ONE FIXTURE PER BRANCH for the maximality guard to see every
    //   branch: #model_only (root population, no lineage fields) and
    //   #auto_noise_sqrt2 (derived, both lineage fields populated). Two entries,
    //   one schema identity.
    // 0.27.0: 116 -> 124 (+8): arch step 2 slice 4, Codex F3 — the
    //   subject-scoped discriminated AnalysisFact union. The count is
    //   STRUCTURAL, not generous: the union (root/AnalysisFactSchema) needs one
    //   entry PER BRANCH for the maximality walker to see all three, and the
    //   three branch schemas are exported in their own right — a fixture
    //   registered against ComputedFactSchema does not exercise the UNION's
    //   branch coverage, because they are different schema objects. So:
    //   3 union branches + root/ComputedFactSchema + root/UnavailableFactSchema
    //   + root/SuppressedFactSchema + root/SuppressionGuardSchema +
    //   root/AnalysisFactSubjectSchema. The fixture VALUES are shared between
    //   the union entries and the branch entries — eight registry rows, five
    //   fixture objects. The orchestrator re-exports are identity-matched by
    //   the ratchet and need no further entries.
    // 0.29.0: 124 -> 125 (+1): ROADMAP 1.346 — boundary/SystemEventSchema#
    //   factor_value_edit, the value-carrying inspector edit. One new BRANCH on
    //   an already-registered union, so exactly one row: the union needs an
    //   entry per branch or the maximality walker reports
    //   `unexercised-union-branch` for it.
    // 0.30.0: 125 -> 126 (+1): V7-C slice 1a — boundary/
    //   EnrichmentFactorEvppiEntrySchema, the per-factor EVPPI row that joins
    //   the CEE→UI keep-list. Exactly one row: the four VOI envelope keys are
    //   FIELDS on the already-registered AnalysisEnrichmentSchema (their
    //   coverage rides that fixture, which now populates all four), and only
    //   the entry shape is a newly-exported schema of its own.
    // 0.32.0: 126 -> 129 (+3): ui_directive panel verbs (Lane 2, P3). Two
    //   panel-verb VARIANTS of the already-registered UiDirectiveBlockSchema
    //   (#open_panel / #open_section) — the verb/ui_target cross-field rule
    //   makes `ui_target` and non-empty `targets` mutually exclusive, so ONE
    //   fixture cannot be maximal for this block; maximality aggregates by
    //   schema identity, and the variants populate `ui_target` and exercise
    //   BOTH of its union branches. Plus boundary/UiDirectiveUiTargetSchema,
    //   a newly-exported schema of its own.
    // 0.33.0: 129 -> 130 (+1): TransportedCritiqueSchema (Lane 3 Car 2, 2.293
    // seam split — the CEE→UI transported critique row).
    // 0.34.0: 130 -> 132 (+2): P4 transport — SystemEventSchema variants
    //   #edge_adjudication and #prior_range_edit (the two human-judgement
    //   signals that previously terminated in the browser). The three new
    //   handler facts/results are ORCHESTRATOR_INTERNAL exclusions, same
    //   grounds as every sibling fact schema.
    // 0.39.0: 133 -> 159 (+26): the four-car train.
    //   Car 1 (+1): boundary/DskClaimProvenanceSchema (the coaching/review-
    //   card claim triple rides the two existing block fixtures).
    //   Car 3 (+5): RunDeltaSchema + its four exported line/provenance
    //   shapes (attribution case / builds / noise / band vocabularies are
    //   enums, auto-exempt).
    //   Car 4 (+20): ten collab schemas (AuthoredBy, ElicitationProvenance/
    //   Target/Round/Belief/Event, DisagreementPosition/Party/Subject/
    //   Disagreement) + three ElicitationEventSchema kind variants + four
    //   DisagreementPositionSchema branch variants + three
    //   DisagreementSubjectSchema branch variants — discriminated unions
    //   whose valueless arms (declined / doubt) CANNOT ride one maximal
    //   fixture, so branch coverage is spread across variants, the
    //   ui_directive precedent.
    // 0.40.0 (+1): RoundParticipantRefSchema — the PR4 evidence-loop
    //   attribution ref shared by observed_state.elicited_from and
    //   factor_value_edit.applied_from.
    // 0.42.0 (+1): boundary/SystemEventSchema#edge_strength_edit — one new
    //   branch on the existing strict union, with its own maximal exemplar.
    // 0.43.0 (+2): the strict canonical committed-graph block and its
    //   discriminator-free response receipt projection.
    // 0.44.0 (+2): EnrichmentConditionalWinnerSchema and its nested
    //   EnrichmentConditionalBucketSchema — the conditional-winners transport
    //   key (ROADMAP 2.177).
    // 0.45.0 (+1): boundary/ModelBuildingNoticesSchema — the aggregate-only,
    //   response-only model-construction notice carrier. Its nested group is
    //   deliberately internal; the kind enum is scalar and auto-exempt.
    // 0.46.0 (+12): the composed analysis-state verdict. The count is
    //   STRUCTURAL, not generous. `run_state` is a SEVEN-branch discriminated
    //   union on a single (non-array) field, so one fixture exercises exactly
    //   one branch and the maximality walker would report six
    //   `unexercised-union-branch` gaps — hence seven
    //   boundary/AnalysisStateV1Schema#<kind> variants against one schema
    //   identity (the UiDirectiveBlockSchema#open_panel precedent). Plus the
    //   four composed sub-shapes exported in their own right
    //   (AnalysisBlockerSchema, AnalysisReadinessSchema,
    //   AnalysisLeaderClaimSchema, AnalysisRobustnessSchema) and
    //   boundary/AnalysisRunStateSchema, which is exported and so needs a row
    //   to satisfy THIS ratchet even though its branch coverage comes from the
    //   seven variants above. The three `kind`/`cause` vocabularies are enums
    //   and auto-exempt.
    // 0.48.0 (+1): boundary/SystemEventSchema#structural_delete — one more
    //   branch variant against the existing SystemEventSchema identity, exactly
    //   as every prior system-event member added one. The nested
    //   CanonicalEdgeRefSchema needs no row of its own: it is internal (not
    //   exported from a namespace entry point) and is exercised non-empty by
    //   this fixture's `removed_edges`.
    // 0.49.0 (+1): boundary/EnrichmentObjectiveRankingSchema — the ROADMAP
    //   2.1192 ranking-provenance block, exported from the boundary entry
    //   point and therefore needing its own row. `NodeV3Schema.goal_direction`
    //   adds NO row: it is a field on an already-registered family, and it is
    //   populated on the existing maximal node fixture.
    expect(MAXIMAL_FIXTURES.length).toBe(180);
  });

  it('family keys are unique', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const { family } of MAXIMAL_FIXTURES) {
      if (seen.has(family)) dupes.push(family);
      seen.add(family);
    }
    expect(dupes).toEqual([]);
  });
});

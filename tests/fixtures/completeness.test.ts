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
    // Unreleased (F6): 106 -> 108 (boundary/EnrichmentConstraintMarginSchema,
    //   boundary/EnrichmentScaleProvenanceSchema).
    expect(MAXIMAL_FIXTURES.length).toBe(108);
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

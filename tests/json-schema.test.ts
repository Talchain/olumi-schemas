// ============================================================================
// JSON-Schema artifact tests (A3 drift-check lane).
//
// Guards the published json-schema/ directory — the machine-readable
// draft-07 derivation of src/boundary/enrichment.ts that ISL's Pydantic
// drift check consumes (derive-don't-mirror).
//
// Three properties, each with its own positive control:
//   1. DRIFT GUARD: regenerating in-memory is byte-identical to the
//      committed files. The comparison path is READ-ONLY (the library never
//      writes; only the explicit CLI `npm run generate:json-schema` does),
//      so the check cannot self-heal — proven below by byte-comparing the
//      committed directory before/after running the check, and the guard
//      itself is proven able to SEE drift against a tampered temp copy.
//   2. VALIDATION POSITIVE CONTROL: every generated document validates its
//      maximal fixture (presence), and REJECTS deliberately-broken variants
//      (enum violation, type violation, minimum violation, missing required
//      field). A generator that only produces files proves nothing.
//   3. EXPORT WIRING: package.json publishes the directory (files +
//      exports subpath), mirroring the ./fixtures precedent (0.17.0).
//
// Build-first requirement: the generation library imports dist (same
// convention as tests/exports.test.ts); `npm test` runs build first.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

import {
  generateJsonSchemaDocuments,
  diffAgainstDirectory,
  listComputeSeamSchemaExports,
  MANIFEST_FILE,
} from '../scripts/json-schema-lib.mjs';
import * as enrichmentDist from '../dist/boundary/enrichment.js';
import { getMaximalFixture } from '../dist/fixtures/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const artifactDir = join(repoRoot, 'json-schema');

function readCommittedBytes(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of readdirSync(artifactDir).sort()) {
    out.set(file, readFileSync(join(artifactDir, file), 'utf8'));
  }
  return out;
}

const ajv = new Ajv({ strict: false, allErrors: true });

function compileDocument(name: string) {
  const doc = JSON.parse(
    readFileSync(join(artifactDir, `${name}.json`), 'utf8'),
  ) as object;
  return ajv.compile(doc);
}

describe('json-schema artifacts — derivation completeness', () => {
  it('derives every Zod schema exported from the compute-seam module (no hand list)', () => {
    const names = listComputeSeamSchemaExports();
    // The compute-seam family ISL mirrors: spine presence, not an exhaustive
    // mirror (the derived list is the source of truth).
    for (const required of [
      'AnalysisEnrichmentSchema',
      'EnrichmentRobustnessSchema',
      'EnrichmentFactorSensitivityEntrySchema',
      'EnrichmentOptionComparisonEntrySchema',
      'EnrichmentInferenceWarningSchema',
      'EnrichmentFlipThresholdSchema',
      'EnrichmentEdgeEValueStabilitySchema',
      'EnrichmentConstraintResultSchema',
      'EnrichmentConditionalProbabilitySchema',
      'EnrichmentConfidenceTier',
      'EnrichmentConfidenceProvenanceSchema',
    ]) {
      expect(names, `derived set must include ${required}`).toContain(required);
    }
    // Non-schema exports must NOT leak into the artifact set.
    expect(names).not.toContain('CEE_UI_ENRICHMENT_KEEP_LIST');
    expect(names).not.toContain('parseAnalysisEnrichment');
    // One document per schema + the manifest.
    const files = generateJsonSchemaDocuments();
    expect(files.size).toBe(names.length + 1);
    expect(files.has(MANIFEST_FILE)).toBe(true);
  });

  it('manifest lists exactly the derived exports, in sorted order', () => {
    const manifest = JSON.parse(
      readFileSync(join(artifactDir, MANIFEST_FILE), 'utf8'),
    ) as { schemas: Array<{ export: string; file: string }> };
    const listed = manifest.schemas.map((s) => s.export);
    expect(listed).toStrictEqual(listComputeSeamSchemaExports());
  });
});

describe('json-schema artifacts — drift guard (no self-heal)', () => {
  it('committed artifacts are byte-identical to regeneration', () => {
    expect(diffAgainstDirectory(artifactDir)).toStrictEqual([]);
  });

  it('the check is read-only: committed bytes are untouched by running it', () => {
    const before = readCommittedBytes();
    generateJsonSchemaDocuments();
    diffAgainstDirectory(artifactDir);
    const after = readCommittedBytes();
    expect([...after.keys()]).toStrictEqual([...before.keys()]);
    for (const [file, bytes] of before) {
      expect(after.get(file), file).toBe(bytes);
    }
  });

  it('POSITIVE CONTROL: the guard SEES stale, missing, and orphan artifacts', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'schemas-json-schema-'));
    try {
      cpSync(artifactDir, tmp, { recursive: true });
      // Stale: corrupt one committed byte.
      const target = join(tmp, 'EnrichmentInferenceWarningSchema.json');
      writeFileSync(target, `${readFileSync(target, 'utf8')} `, 'utf8');
      // Missing: delete one document.
      rmSync(join(tmp, 'EnrichmentRobustnessSchema.json'));
      // Orphan: plant a file the generator does not produce.
      writeFileSync(join(tmp, 'NotGenerated.json'), '{}\n', 'utf8');

      const problems = diffAgainstDirectory(tmp);
      expect(problems.some((p) => p.startsWith('STALE: EnrichmentInferenceWarningSchema.json'))).toBe(true);
      expect(problems.some((p) => p.startsWith('MISSING: EnrichmentRobustnessSchema.json'))).toBe(true);
      expect(problems.some((p) => p.startsWith('ORPHAN: NotGenerated.json'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('json-schema artifacts — validation positive controls', () => {
  it('PRESENCE: every object-schema document validates its maximal fixture', () => {
    let exercised = 0;
    for (const name of listComputeSeamSchemaExports()) {
      const entry = getMaximalFixture(`boundary/${name}`);
      if (!entry) continue; // enums/scalar vocabularies have no fixture (registry policy)
      // Identity check: the fixture registry entry is for THIS schema object.
      expect(entry.schema, name).toBe(
        (enrichmentDist as Record<string, unknown>)[name],
      );
      const validate = compileDocument(name);
      const ok = validate(entry.fixture);
      expect(ok, `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
      exercised += 1;
    }
    // Vacuousness guard: the loop must actually have validated the family.
    expect(exercised).toBeGreaterThanOrEqual(15);
  });

  it('enum documents accept a member and reject a non-member', () => {
    const validate = compileDocument('EnrichmentConfidenceTier');
    expect(validate('strong')).toBe(true);
    expect(validate('FIXTURE_not_a_tier')).toBe(false);
  });

  it('REJECTION: enum violation — inference warning severity outside info|warning', () => {
    const validate = compileDocument('EnrichmentInferenceWarningSchema');
    const good = getMaximalFixture('boundary/EnrichmentInferenceWarningSchema')!.fixture as Record<string, unknown>;
    expect(validate(good)).toBe(true);
    expect(validate({ ...good, severity: 'fatal' })).toBe(false);
  });

  it('REJECTION: type violation — factor_id as number', () => {
    const validate = compileDocument('EnrichmentFactorSensitivityEntrySchema');
    const good = getMaximalFixture('boundary/EnrichmentFactorSensitivityEntrySchema')!.fixture as Record<string, unknown>;
    expect(validate(good)).toBe(true);
    expect(validate({ ...good, factor_id: 42 })).toBe(false);
  });

  it('REJECTION: minimum violation — negative n_seeds on the stability band', () => {
    const validate = compileDocument('EnrichmentEdgeEValueStabilitySchema');
    const good = getMaximalFixture('boundary/EnrichmentEdgeEValueStabilitySchema')!.fixture as Record<string, unknown>;
    expect(validate(good)).toBe(true);
    expect(validate({ ...good, n_seeds: -1 })).toBe(false);
  });

  it('REJECTION: missing required field — flip threshold without factor_id', () => {
    const validate = compileDocument('EnrichmentFlipThresholdSchema');
    const good = getMaximalFixture('boundary/EnrichmentFlipThresholdSchema')!.fixture as Record<string, unknown>;
    expect(validate(good)).toBe(true);
    const { factor_id: _dropped, ...broken } = good;
    expect(validate(broken)).toBe(false);
  });

  it('REJECTION: envelope-level shape violation — factor_sensitivity as object', () => {
    const validate = compileDocument('AnalysisEnrichmentSchema');
    const good = getMaximalFixture('boundary/AnalysisEnrichmentSchema')!.fixture as Record<string, unknown>;
    expect(validate(good)).toBe(true);
    expect(validate({ ...good, factor_sensitivity: { not: 'an array' } })).toBe(false);
  });
});

describe('json-schema artifacts — package export wiring (fixtures precedent)', () => {
  it('package.json publishes json-schema/ via files + exports subpath', () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as { files: string[]; exports: Record<string, unknown> };
    expect(pkg.files).toContain('json-schema');
    expect(pkg.exports['./json-schema/*.json']).toBe('./json-schema/*.json');
  });
});

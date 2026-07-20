// ============================================================================
// JSON-Schema generation library for the compute-seam analysis contract
// (A3 drift-check lane).
//
// PURPOSE: ISL (Python/Pydantic) hand-mirrors the analysis-enrichment
// contract with no mechanical check — the exact "hand-maintained mirror"
// defect class this programme keeps paying for. This module derives
// machine-readable JSON-Schema (draft-07) documents from the Zod source of
// truth (src/boundary/enrichment.ts, via the built dist) so ISL can CI-diff
// or CI-validate its Pydantic models against the published contract instead
// of trusting the mirror.
//
// DERIVE, DON'T MIRROR: the export list is NOT hand-listed. Every Zod schema
// exported from dist/boundary/enrichment.js is discovered by instanceof
// introspection, so a new compute-seam schema export automatically joins the
// generated set — and the drift-guard test then FAILS LOUD until
// `npm run generate:json-schema` is re-run and the output committed.
//
// READ-ONLY BY CONSTRUCTION: this module performs NO filesystem writes.
// `diffAgainstDirectory` only compares. The ONLY writer is the explicit CLI
// (scripts/generate-json-schema.mjs). The drift check therefore cannot
// self-heal: a stale committed artifact is a test failure, never a silent
// regeneration.
//
// BUILD-FIRST REQUIREMENT: imports the built dist (same convention as
// tests/exports.test.ts) — `npm test` runs `npm run build` first.
//
// KNOWN LIMIT (documented, deliberate): Zod refinements/superRefine
// invariants (e.g. EnrichmentEdgeEValueStabilitySchema's
// `n_seeds_flipped <= n_seeds`) are not expressible in the emitted JSON
// Schema; only the structural layer (types, enums, required, minimums) is
// captured. The manifest records this so the ISL consumer never mistakes
// structural conformance for full-invariant conformance.
// ============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import * as enrichment from '../dist/boundary/enrichment.js';

/** Module the schemas are derived from — recorded in every manifest entry. */
export const SOURCE_MODULE = 'src/boundary/enrichment.ts';

/** Name of the manifest document inside the output directory. */
export const MANIFEST_FILE = 'manifest.json';

const GENERATED_COMMENT =
  'GENERATED from src/boundary/enrichment.ts by scripts/generate-json-schema.mjs ' +
  '— do not edit by hand; run `npm run generate:json-schema` to regenerate.';

/**
 * Every Zod schema exported from the compute-seam module, discovered by
 * introspection (sorted for deterministic output). Non-schema exports
 * (functions, the keep-list array, erased types) are excluded by the
 * instanceof filter, never by a hand-maintained list.
 */
export function listComputeSeamSchemaExports() {
  return Object.entries(enrichment)
    .filter(([, value]) => value instanceof z.ZodType)
    .map(([name]) => name)
    .sort();
}

/**
 * Generate the full artifact set as a Map of filename -> exact file bytes
 * (UTF-8 string, 2-space indent, trailing newline). Pure: no I/O.
 */
export function generateJsonSchemaDocuments() {
  const files = new Map();
  const names = listComputeSeamSchemaExports();

  for (const name of names) {
    const doc = zodToJsonSchema(enrichment[name], {
      name,
      target: 'jsonSchema7',
      $refStrategy: 'none',
    });
    doc.$comment = GENERATED_COMMENT;
    files.set(`${name}.json`, `${JSON.stringify(doc, null, 2)}\n`);
  }

  const manifest = {
    $comment: GENERATED_COMMENT,
    description:
      'Machine-readable JSON-Schema (draft-07) for the compute-seam analysis ' +
      'types, derived from the Zod contract. Consumers (ISL Pydantic drift ' +
      'check) validate/diff against these documents instead of hand-mirroring.',
    source: SOURCE_MODULE,
    target: 'jsonSchema7',
    generator: 'zod-to-json-schema',
    limits:
      'Zod refinement/superRefine invariants (e.g. n_seeds_flipped <= n_seeds ' +
      'on EnrichmentEdgeEValueStabilitySchema) are not expressible in JSON ' +
      'Schema; only the structural layer is captured here.',
    schemas: names.map((name) => ({
      export: name,
      file: `${name}.json`,
      definition: `#/definitions/${name}`,
    })),
  };
  files.set(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);

  return files;
}

/**
 * Compare freshly-generated output against a directory of committed
 * artifacts. Returns a list of human-readable problems (empty = in sync).
 * READ-ONLY: never writes, so the drift check cannot self-heal.
 */
export function diffAgainstDirectory(dir) {
  const expected = generateJsonSchemaDocuments();
  const problems = [];

  for (const [file, content] of expected) {
    let actual;
    try {
      actual = readFileSync(join(dir, file), 'utf8');
    } catch {
      problems.push(
        `MISSING: ${file} — run \`npm run generate:json-schema\` and commit the output`,
      );
      continue;
    }
    if (actual !== content) {
      problems.push(
        `STALE: ${file} differs byte-wise from regenerated output — ` +
          'run `npm run generate:json-schema` and commit the output',
      );
    }
  }

  let onDisk = [];
  try {
    onDisk = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    problems.push(`MISSING: output directory ${dir} does not exist`);
  }
  for (const file of onDisk) {
    if (!expected.has(file)) {
      problems.push(
        `ORPHAN: ${file} is committed but no longer generated — ` +
          'run `npm run generate:json-schema` (it removes orphans) and commit',
      );
    }
  }

  return problems;
}

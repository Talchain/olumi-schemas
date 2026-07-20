#!/usr/bin/env node
// ============================================================================
// The ONLY writer of json-schema/ (A3 drift-check lane).
//
// Explicit CLI regeneration: `npm run generate:json-schema` (which builds
// dist first). The drift-guard test (tests/json-schema.test.ts) only ever
// COMPARES via scripts/json-schema-lib.mjs — it cannot regenerate, so a
// stale artifact fails loud instead of self-healing.
//
// Discipline (global CLAUDE.md trap 15 — "your own script is not exempt"):
// absolute paths only, every write is re-read and byte-verified, and the
// script exits non-zero if any verification fails.
// ============================================================================

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateJsonSchemaDocuments } from './json-schema-lib.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'json-schema');

mkdirSync(outDir, { recursive: true });

const files = generateJsonSchemaDocuments();
let failures = 0;

for (const [file, content] of files) {
  const target = join(outDir, file);
  writeFileSync(target, content, 'utf8');
  // Verify the write landed — a generator that cannot fail is theatre.
  const readBack = readFileSync(target, 'utf8');
  if (readBack !== content) {
    console.error(`VERIFY FAILED: ${target} does not match intended bytes`);
    failures += 1;
  } else {
    console.log(`wrote ${target} (${Buffer.byteLength(content)} bytes)`);
  }
}

// Remove orphans: committed .json files no longer generated.
for (const file of readdirSync(outDir).filter((f) => f.endsWith('.json'))) {
  if (!files.has(file)) {
    unlinkSync(join(outDir, file));
    console.log(`removed orphan ${join(outDir, file)}`);
  }
}

if (failures > 0) {
  console.error(`generate-json-schema: ${failures} write verification(s) FAILED`);
  process.exit(1);
}
console.log(`generate-json-schema: ${files.size} files verified in ${outDir}`);

// Verifies the fixtures entry point as consumers actually receive it:
// built dist output + the package.json `exports` subpath wiring. Same
// build-first requirement as tests/exports.test.ts (npm test runs build).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as fixturesDist from '../../dist/fixtures/index.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('package exports — fixtures entry (dist/fixtures/index.js)', () => {
  it('exposes the registry, exclusions, and lookup helper', () => {
    expect(fixturesDist.MAXIMAL_FIXTURES).toBeDefined();
    expect(fixturesDist.MAXIMAL_FIXTURES.length).toBeGreaterThan(80);
    expect(fixturesDist.FIXTURE_COVERAGE_EXCLUSIONS).toBeDefined();
    expect(fixturesDist.getMaximalFixture('boundary/OlumiResponseSchema')).toBeDefined();
  });

  it('exposes the headline named fixtures', () => {
    expect(fixturesDist.maximalOlumiResponse).toBeDefined();
    expect(fixturesDist.maximalAnalysisEnrichment).toBeDefined();
    expect(fixturesDist.maximalGraphV3).toBeDefined();
    expect(fixturesDist.maximalDecisionRecord).toBeDefined();
    expect(fixturesDist.maximalMessageTurnPayloadChip).toBeDefined();
  });

  it('package.json maps the "./fixtures" subpath to the built entry', () => {
    const pkg = JSON.parse(
      readFileSync(join(here, '..', '..', 'package.json'), 'utf8'),
    ) as { exports: Record<string, { import: string; types: string }> };
    expect(pkg.exports['./fixtures']).toStrictEqual({
      import: './dist/fixtures/index.js',
      types: './dist/fixtures/index.d.ts',
    });
  });

  it('dist round-trip sanity: every dist-registered fixture parses with zero loss', () => {
    for (const entry of fixturesDist.MAXIMAL_FIXTURES) {
      const parsed = entry.schema.parse(entry.fixture);
      expect(parsed, entry.family).toStrictEqual(
        entry.expectedParseOutput ?? entry.fixture,
      );
    }
  });
});

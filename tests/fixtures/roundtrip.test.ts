// ============================================================================
// W2E-1 round-trip (zero-strip) suite.
//
// For every registered maximal fixture: `schema.parse(fixture)` must
// deep-equal the fixture — any stripped key, injected default, or coerced
// value fails. This is the in-repo half of silent-drop detection; consumer
// repos run the same loop against their own pinned schemas.
//
// Where a Zod `.default()` legitimately mutates the parse output, the entry
// carries an explicit `expectedParseOutput` and is asserted (and counted)
// here — every default-mutation case in the package is documented, never
// silently tolerated.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { BlockSchema, OlumiResponseSchema, SystemEventSchema } from '../../src/boundary/index.js';
import {
  MAXIMAL_FIXTURES,
  getMaximalFixture,
  maximalOlumiResponse,
  maximalAnalysisEnrichment,
} from '../../src/fixtures/index.js';
import { AnalysisEnrichmentSchema } from '../../src/boundary/enrichment.js';

const PROBE = 'FIXTURE_passthrough_probe';

describe('round-trip — every maximal fixture parses with zero field loss', () => {
  for (const entry of MAXIMAL_FIXTURES) {
    it(`${entry.family}`, () => {
      const parsed = entry.schema.parse(entry.fixture);
      expect(parsed).toStrictEqual(entry.expectedParseOutput ?? entry.fixture);
    });
  }
});

describe('documented default mutations', () => {
  it('exactly the known .default() cases carry expectedParseOutput (extend this list consciously)', () => {
    const mutating = MAXIMAL_FIXTURES.filter(
      (e) => e.expectedParseOutput !== undefined,
    ).map((e) => e.family);
    // The ONLY .default() in the package as of 0.16.0 is
    // EdgeV3Schema.edge_type → 'directed'. Adding a new .default() to any
    // schema must add a documented entry here — this assertion forces that.
    expect(mutating).toStrictEqual(['root/EdgeV3Schema#default-edge_type']);
  });

  it('the edge_type default mutation is exactly the documented gain', () => {
    const entry = getMaximalFixture('root/EdgeV3Schema#default-edge_type');
    expect(entry).toBeDefined();
    const fixture = entry!.fixture as Record<string, unknown>;
    const expected = entry!.expectedParseOutput as Record<string, unknown>;
    expect(fixture.edge_type).toBeUndefined();
    expect(expected.edge_type).toBe('directed');
    // the mutation is ADDITIVE only — no other key differs.
    const { edge_type: _ignored, ...expectedRest } = expected;
    expect(expectedRest).toStrictEqual(fixture);
  });
});

describe('union coverage — no union member lacks a maximal exemplar', () => {
  it('maximalOlumiResponse.blocks carries one block of EVERY BlockSchema union member', () => {
    // BlockSchema is a ZodEffects (superRefine) wrapping the discriminated
    // union — unwrap to introspect the member list so a NEW block type added
    // to the union fails this test until the maximal response carries it.
    const effectsDef = (BlockSchema as unknown as { _def: { schema: z.ZodTypeAny } })._def;
    const union = effectsDef.schema as z.ZodDiscriminatedUnion<
      'type',
      z.ZodDiscriminatedUnionOption<'type'>[]
    >;
    const memberTypes = union.options
      .map((option) => (option.shape.type as z.ZodLiteral<string>).value)
      .sort();
    expect(memberTypes.length).toBeGreaterThanOrEqual(14); // sanity: introspection did not break

    const response = OlumiResponseSchema.parse(maximalOlumiResponse);
    const carried = [...new Set(response.blocks.map((b) => b.type))].sort();
    expect(carried).toStrictEqual(memberTypes);
  });

  it('every SystemEventSchema union member has a registered fixture variant', () => {
    const kinds = SystemEventSchema.options
      .map((option) => (option.shape.kind as z.ZodLiteral<string>).value)
      .sort();
    expect(kinds.length).toBeGreaterThanOrEqual(7); // sanity
    for (const kind of kinds) {
      expect(
        getMaximalFixture(`boundary/SystemEventSchema#${kind}`),
        `system event kind '${kind}' lacks a registered fixture variant`,
      ).toBeDefined();
    }
  });
});

describe('passthrough probes — unknown-key survival (the silent-drop mechanism)', () => {
  it('the enrichment envelope preserves unknown keys at every probed level', () => {
    const parsed = AnalysisEnrichmentSchema.parse(
      maximalAnalysisEnrichment,
    ) as Record<string, unknown>;
    expect(parsed[PROBE]).toBe(true);
    const robustness = parsed.robustness as Record<string, unknown>;
    expect(robustness[PROBE]).toBe(true);
    const factorEntry = (parsed.factor_sensitivity as Record<string, unknown>[])[0];
    expect(factorEntry[PROBE]).toBe(true);
  });

  it('fixtures are deep-frozen (consumers cannot mutate shared fixture state)', () => {
    expect(Object.isFrozen(maximalOlumiResponse)).toBe(true);
    expect(
      Object.isFrozen((maximalOlumiResponse as { blocks: unknown[] }).blocks),
    ).toBe(true);
    expect(Object.isFrozen(maximalAnalysisEnrichment)).toBe(true);
  });
});

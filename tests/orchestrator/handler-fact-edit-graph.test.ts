/**
 * @talchain/schemas 0.12.0 — `EditGraphHandlerFactSchema` contract tests.
 *
 * Adds a new member `'edit_graph'` to the `HandlerFact` discriminated
 * union (the LLM-driven counterpart to the deterministic D1 mutation
 * facts). These tests pin its shape, its bounds, and the
 * backward-compatibility guarantee for every existing variant.
 *
 * Fixtures live alongside in `__fixtures__/handler-fact-fixtures.ts`
 * — the canonical regression set for HandlerFact union compatibility.
 */

import { describe, it, expect } from 'vitest';
import {
  HandlerFactSchema,
  EditGraphHandlerFactSchema,
  EditGraphResultSchema,
  EditGraphEditKindSchema,
  EditGraphImpactSchema,
  EditGraphAffectedEntitySchema,
} from '../../src/orchestrator/index.js';
import type { EditGraphHandlerFact, HandlerFact } from '../../src/orchestrator/index.js';
import {
  HANDLER_FACT_FIXTURES,
  KNOWN_FACT_TYPES,
} from './__fixtures__/handler-fact-fixtures.js';

// ----------------------------------------------------------------------------
// Group 1 — happy path + strict mode
// ----------------------------------------------------------------------------

describe('EditGraphHandlerFactSchema — happy path', () => {
  it('parses a fully-populated valid edit_graph fact', () => {
    const fact = HANDLER_FACT_FIXTURES.edit_graph;
    const result = EditGraphHandlerFactSchema.safeParse(fact);
    expect(result.success).toBe(true);
    if (result.success) {
      // type-narrows correctly via the discriminator
      expect(result.data.fact_type).toBe('edit_graph');
      expect(result.data.fact_version).toBe(1);
      expect(result.data.result.status).toBe('applied');
    }
  });

  it('parses through the union as the edit_graph variant', () => {
    const fact = HANDLER_FACT_FIXTURES.edit_graph;
    const parsed: HandlerFact = HandlerFactSchema.parse(fact);
    expect(parsed.fact_type).toBe('edit_graph');
    if (parsed.fact_type === 'edit_graph') {
      expect(parsed.result.edit_kind).toBe('parameter_update');
      expect(parsed.result.impact).toBe('low');
      expect(parsed.result.rerun_recommended).toBe(false);
    }
  });

  it('rejects an unknown fact_type discriminator literal', () => {
    const fact = {
      fact_type: 'edit_graph_v2',
      fact_version: 1,
      noop: false,
      result: HANDLER_FACT_FIXTURES.edit_graph.result,
    };
    const result = HandlerFactSchema.safeParse(fact);
    expect(result.success).toBe(false);
  });
});

describe('EditGraphHandlerFactSchema — strict mode', () => {
  it('rejects an unknown field on result', () => {
    const fact = {
      ...HANDLER_FACT_FIXTURES.edit_graph,
      result: {
        ...HANDLER_FACT_FIXTURES.edit_graph.result,
        extra_field: 'should not be allowed',
      },
    };
    const result = EditGraphHandlerFactSchema.safeParse(fact);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field at the top level', () => {
    const fact = {
      ...HANDLER_FACT_FIXTURES.edit_graph,
      extra_top_level_field: 'should not be allowed',
    };
    const result = EditGraphHandlerFactSchema.safeParse(fact);
    expect(result.success).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Group 2 — bounds (safe_summary + affected_entities)
// ----------------------------------------------------------------------------

describe('EditGraphHandlerFactSchema — safe_summary bounds', () => {
  const baseResult = HANDLER_FACT_FIXTURES.edit_graph.result;

  it('rejects an empty safe_summary', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, safe_summary: '' });
    expect(r.success).toBe(false);
  });

  it('accepts an 80-character safe_summary (boundary)', () => {
    const eighty = 'a'.repeat(80);
    const r = EditGraphResultSchema.safeParse({ ...baseResult, safe_summary: eighty });
    expect(r.success).toBe(true);
  });

  it('rejects an 81-character safe_summary (overflow)', () => {
    const eightyOne = 'a'.repeat(81);
    const r = EditGraphResultSchema.safeParse({ ...baseResult, safe_summary: eightyOne });
    expect(r.success).toBe(false);
  });
});

describe('EditGraphHandlerFactSchema — affected_entities bounds', () => {
  const baseResult = HANDLER_FACT_FIXTURES.edit_graph.result;
  const entity = { kind: 'factor' as const, label: 'X' };

  it('accepts an empty affected_entities array', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, affected_entities: [] });
    expect(r.success).toBe(true);
  });

  it('accepts 8 entries (boundary)', () => {
    const eight = Array.from({ length: 8 }, () => entity);
    const r = EditGraphResultSchema.safeParse({ ...baseResult, affected_entities: eight });
    expect(r.success).toBe(true);
  });

  it('rejects 9 entries (overflow)', () => {
    const nine = Array.from({ length: 9 }, () => entity);
    const r = EditGraphResultSchema.safeParse({ ...baseResult, affected_entities: nine });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown entity kind', () => {
    const r = EditGraphResultSchema.safeParse({
      ...baseResult,
      affected_entities: [{ kind: 'mystery', label: 'X' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown field on an entity', () => {
    const r = EditGraphResultSchema.safeParse({
      ...baseResult,
      affected_entities: [{ kind: 'factor', label: 'X', extra: 'nope' }],
    });
    expect(r.success).toBe(false);
  });
});

describe('EditGraphAffectedEntitySchema — kind reuses canonical NodeKind plus edge', () => {
  // Pin the entity-kind vocabulary against the canonical NodeKind enum
  // PLUS the literal 'edge'. Catches any silent drift between this
  // schema and `src/graph.ts`'s NodeKind, and ensures the +1 ('edge')
  // stays deliberate.

  it.each([
    'goal',
    'factor',
    'outcome',
    'risk',
    'action',
    'decision',
    'option',
    'constraint',
  ] as const)('accepts canonical NodeKind value: %s', (kind) => {
    const r = EditGraphAffectedEntitySchema.safeParse({ kind, label: 'X' });
    expect(r.success).toBe(true);
  });

  it("accepts 'edge' (the +1 over NodeKind for edge mutations)", () => {
    const r = EditGraphAffectedEntitySchema.safeParse({ kind: 'edge', label: 'X' });
    expect(r.success).toBe(true);
  });

  it.each(['node', 'goal_node', 'risk_factor', 'mystery'])(
    "rejects %s (not a NodeKind value, not 'edge')",
    (kind) => {
      const r = EditGraphAffectedEntitySchema.safeParse({ kind, label: 'X' });
      expect(r.success).toBe(false);
    },
  );
});

describe('EditGraphAffectedEntitySchema — label safety boundary', () => {
  // Schema enforces SHAPE only:
  //   - .min(1) (matches CompareOptionsResultSchema.options[].label
  //     convention).
  //   - no .max() — no existing label-length convention in the schemas
  //     package.
  //   - no content-form check — labels are display text supplied by
  //     the emitting service; sanitisation, truncation, and raw-ID
  //     removal are emitter responsibilities.
  //
  // The tests below codify the boundary so a future tranche choosing
  // to push these checks into the schema (or rely on emitters more
  // deeply) has a single place to flip.

  it('rejects an empty label (.min(1) enforced)', () => {
    const r = EditGraphAffectedEntitySchema.safeParse({
      kind: 'factor',
      label: '',
    });
    expect(r.success).toBe(false);
  });

  it('PERMITS a very long label (no .max() in schema; emitter caps in PR B)', () => {
    const longLabel = 'A'.repeat(500);
    const r = EditGraphAffectedEntitySchema.safeParse({
      kind: 'factor',
      label: longLabel,
    });
    expect(r.success).toBe(true);
  });

  it('PERMITS an identifier-looking label (raw-ID detection is emitter responsibility)', () => {
    // Schema cannot tell `fac_delivery_cost` apart from a legitimate
    // user-provided label by shape alone. The emitter (PR B) MUST
    // resolve the entity ID to its display label via
    // `sanitiseUserFacingText` / `resolveLabel` before constructing
    // the fact. This test documents the schema's permissive behaviour
    // so reviewers don't expect content-checking at the Zod layer.
    const r = EditGraphAffectedEntitySchema.safeParse({
      kind: 'factor',
      label: 'fac_delivery_cost',
    });
    expect(r.success).toBe(true);
  });
});

describe('EditGraphHandlerFactSchema — safe_summary safety boundary', () => {
  // safe_summary already has min(1) + max(80) bounds (Group 2). The
  // tests below document that content-form checking (raw-ID
  // detection, jargon check) is NOT in the schema. Consumers that
  // quote safe_summary verbatim (state-query guard, recent_changes
  // projector) rely on the emitter having already sanitised the
  // string. PR B must enforce this.

  const baseResult = HANDLER_FACT_FIXTURES.edit_graph.result;

  it('PERMITS an identifier-looking safe_summary (emitter must sanitise)', () => {
    const r = EditGraphResultSchema.safeParse({
      ...baseResult,
      safe_summary: 'Updated fac_delivery_cost.',
    });
    expect(r.success).toBe(true);
  });

  it('PERMITS jargon-laden safe_summary (emitter must guard against Phase 2A jargon list)', () => {
    // Phase 2A's CEE-side jargon-guard rejects 'legacy', 'repair',
    // 'normalise', 'envelope', 'wrapped', 'gpt-', 'claude'. The
    // schema does NOT — emitter responsibility.
    const r = EditGraphResultSchema.safeParse({
      ...baseResult,
      safe_summary: 'Repaired the legacy envelope.',
    });
    expect(r.success).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Group 3 — enum + numeric field invariants
// ----------------------------------------------------------------------------

describe('EditGraphHandlerFactSchema — enum membership', () => {
  const baseResult = HANDLER_FACT_FIXTURES.edit_graph.result;

  it.each(['parameter_update', 'option_configuration', 'structural'] as const)(
    'accepts edit_kind=%s',
    (edit_kind) => {
      const r = EditGraphResultSchema.safeParse({ ...baseResult, edit_kind });
      expect(r.success).toBe(true);
    },
  );

  it('rejects an invalid edit_kind', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, edit_kind: 'cosmetic' });
    expect(r.success).toBe(false);
  });

  it.each(['applied', 'noop'] as const)('accepts status=%s', (status) => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, status });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, status: 'partial' });
    expect(r.success).toBe(false);
  });

  it.each(['low', 'moderate', 'high'] as const)('accepts impact=%s', (impact) => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, impact });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid impact', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, impact: 'extreme' });
    expect(r.success).toBe(false);
  });
});

describe('EditGraphHandlerFactSchema — operations_count', () => {
  const baseResult = HANDLER_FACT_FIXTURES.edit_graph.result;

  it('accepts 0 (matches noop)', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, operations_count: 0 });
    expect(r.success).toBe(true);
  });

  it('rejects negative', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, operations_count: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer', () => {
    const r = EditGraphResultSchema.safeParse({ ...baseResult, operations_count: 1.5 });
    expect(r.success).toBe(false);
  });
});

describe('EditGraphHandlerFactSchema — graph_hash_before/after', () => {
  const baseResult = HANDLER_FACT_FIXTURES.edit_graph.result;

  it('accepts null for both', () => {
    const r = EditGraphResultSchema.safeParse({
      ...baseResult,
      graph_hash_before: null,
      graph_hash_after: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejects when graph_hash_before is omitted (required even if null)', () => {
    const { graph_hash_before, ...rest } = baseResult;
    void graph_hash_before;
    const r = EditGraphResultSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('rejects when graph_hash_after is omitted', () => {
    const { graph_hash_after, ...rest } = baseResult;
    void graph_hash_after;
    const r = EditGraphResultSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Group 4 — cross-field invariants are NOT enforced (PR B's responsibility)
// ----------------------------------------------------------------------------

describe('EditGraphHandlerFactSchema — cross-field invariants are emitter-enforced', () => {
  const baseResult = HANDLER_FACT_FIXTURES.edit_graph.result;

  // The schema deliberately permits these combinations — emitter/consumer
  // tests in CEE (PR B) must catch them. Existing GraphEditResultBaseSchema
  // (set_factor_value etc.) similarly leaves status/noop coupling to
  // emitters. Document the boundary here so a future tranche doesn't
  // bikeshed adding Zod refinements to PR A's surface.

  it('PERMITS noop=true with status=applied (emitter must guard)', () => {
    const r = EditGraphHandlerFactSchema.safeParse({
      ...HANDLER_FACT_FIXTURES.edit_graph,
      noop: true,
      result: { ...baseResult, status: 'applied' },
    });
    expect(r.success).toBe(true);
  });

  it('PERMITS status=applied with operations_count=0 (emitter must guard)', () => {
    const r = EditGraphResultSchema.safeParse({
      ...baseResult,
      status: 'applied',
      operations_count: 0,
    });
    expect(r.success).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Group 5 — backward-compatibility: every existing variant still parses
// ----------------------------------------------------------------------------

describe('HandlerFactSchema — backward-compatibility regression set', () => {
  it('every known fact_type has a fixture', () => {
    for (const name of KNOWN_FACT_TYPES) {
      expect(HANDLER_FACT_FIXTURES[name]).toBeDefined();
      expect(HANDLER_FACT_FIXTURES[name].fact_type).toBe(name);
    }
    // and the fixture map has nothing extra beyond KNOWN_FACT_TYPES
    expect(Object.keys(HANDLER_FACT_FIXTURES).sort()).toEqual(
      [...KNOWN_FACT_TYPES].sort(),
    );
  });

  it.each(KNOWN_FACT_TYPES)(
    'fixture %s parses cleanly through HandlerFactSchema with discriminator preserved',
    (name) => {
      const fixture = HANDLER_FACT_FIXTURES[name];
      const parsed = HandlerFactSchema.parse(fixture);
      // discriminator preserved; no accidental type widening from the
      // 0.12.0 union addition
      expect(parsed.fact_type).toBe(name);
      expect(parsed.fact_version).toBe(1);
    },
  );

  it('round-trips every fixture (parse then re-validate)', () => {
    for (const name of KNOWN_FACT_TYPES) {
      const original = HANDLER_FACT_FIXTURES[name];
      const parsed = HandlerFactSchema.parse(original);
      // re-parse the parsed object — ensures the parse output is itself
      // schema-valid (catches any silent transformation regression)
      expect(() => HandlerFactSchema.parse(parsed)).not.toThrow();
    }
  });
});

// ----------------------------------------------------------------------------
// Group 6 — sub-schema exports are usable in isolation (PR B will need them)
// ----------------------------------------------------------------------------

describe('Edit-graph sub-schema exports', () => {
  it('EditGraphEditKindSchema is exported and parses each literal', () => {
    expect(EditGraphEditKindSchema.parse('parameter_update')).toBe('parameter_update');
    expect(EditGraphEditKindSchema.parse('option_configuration')).toBe('option_configuration');
    expect(EditGraphEditKindSchema.parse('structural')).toBe('structural');
  });

  it('EditGraphImpactSchema is exported and parses each literal', () => {
    expect(EditGraphImpactSchema.parse('low')).toBe('low');
    expect(EditGraphImpactSchema.parse('moderate')).toBe('moderate');
    expect(EditGraphImpactSchema.parse('high')).toBe('high');
  });

  it('EditGraphAffectedEntitySchema validates a single entity', () => {
    const ok = EditGraphAffectedEntitySchema.safeParse({ kind: 'option', label: 'Option A' });
    expect(ok.success).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Group 7 — type-level smoke: inferred type compiles
// ----------------------------------------------------------------------------

describe('EditGraphHandlerFact — inferred type', () => {
  it('compiles when assigning a fixture to the inferred type', () => {
    const fact: EditGraphHandlerFact = HANDLER_FACT_FIXTURES.edit_graph as EditGraphHandlerFact;
    expect(fact.fact_type).toBe('edit_graph');
  });
});

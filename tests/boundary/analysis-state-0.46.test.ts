/**
 * 0.46.0 — AnalysisStateV1, the composed analysis-state verdict.
 * Analysis-state authority migration, STEP 2 (contract only).
 *
 * WHAT THIS SUITE IS FOR, precisely (claim-type matters):
 *   * every `run_state` branch ROUND-TRIPS — parses, and parses to the bytes
 *     it was given, bound to its branch BY DISCRIMINATOR IDENTITY rather than
 *     by "it parsed" (trap 19: a value predicate another branch could satisfy
 *     proves nothing about which branch was reached);
 *   * an UNKNOWN `kind` is REFUSED. The union must fail loud on a state it
 *     does not understand — a discriminated union that silently accepted one
 *     would hand a consumer a verdict nothing in the estate can interpret;
 *   * the ABSENCE arm holds: a response with no `analysis_state` parses
 *     exactly as before, which is what makes this step shippable ahead of any
 *     consumer;
 *   * the three DISCLOSED LIMITS are PINNED as limits. A gap recorded in the
 *     suite is honest; a gap invisible to it is how a reader comes to assume
 *     it closed.
 *
 * WHAT IT IS NOT. These are TRANSPORT tests. They assert the shape crosses the
 * wire; none of them is producer or consumer adoption evidence, and the
 * adoption-manifest row says so (`producer_test`/`consumer_test` are null).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  AnalysisStateV1Schema,
  AnalysisRunStateSchema,
  ANALYSIS_RUN_STATE_KINDS,
  AnalysisRunStateKindSchema,
  AnalysisStaleCauseSchema,
  AnalysisDegradedCauseSchema,
  AnalysisBlockerSchema,
  AnalysisLeaderClaimSchema,
  AnalysisRobustnessSchema,
  OlumiResponseSchema,
} from '../../src/boundary/index.js';
import {
  maximalOlumiResponse,
  maximalAnalysisStateNeverRun,
  maximalAnalysisStateRunning,
  maximalAnalysisStateBlocked,
  maximalAnalysisStateRefused,
  maximalAnalysisStateCompleteCurrent,
  maximalAnalysisStateCompleteStale,
  maximalAnalysisStateUnknownDegraded,
} from '../../src/fixtures/index.js';

/** The seven registered variants, keyed by the kind each one must reach. */
const VARIANTS: ReadonlyArray<readonly [string, unknown]> = [
  ['never_run', maximalAnalysisStateNeverRun],
  ['running', maximalAnalysisStateRunning],
  ['blocked', maximalAnalysisStateBlocked],
  ['refused', maximalAnalysisStateRefused],
  ['complete_current', maximalAnalysisStateCompleteCurrent],
  ['complete_stale', maximalAnalysisStateCompleteStale],
  ['unknown_degraded', maximalAnalysisStateUnknownDegraded],
];

// ============================================================================
// Vocabulary — derived on both sides, never mirrored
// ============================================================================

describe('AnalysisStateV1 · run_state vocabulary', () => {
  /**
   * ANTI-MIRROR (the ANALYSIS_FACT_STATUSES precedent). The exported kind list
   * and the union's actual branch discriminators are two statements of one
   * vocabulary. Derive BOTH at run time and compare, so adding a branch without
   * adding its kind — or vice versa — fails loud instead of drifting quietly.
   */
  it('the exported kind list EQUALS the union\'s actual discriminator literals', () => {
    const derivedFromUnion = AnalysisRunStateSchema.options.map((option) => {
      const shape = (option as z.ZodObject<z.ZodRawShape>).shape;
      const literal = shape.kind as z.ZodLiteral<string>;
      return literal.value;
    });
    expect(derivedFromUnion).toStrictEqual([...ANALYSIS_RUN_STATE_KINDS]);
    expect(AnalysisRunStateKindSchema.options).toStrictEqual([...ANALYSIS_RUN_STATE_KINDS]);
  });

  it('carries exactly seven branches, including the new `refused` state', () => {
    expect(AnalysisRunStateSchema.options).toHaveLength(7);
    expect([...ANALYSIS_RUN_STATE_KINDS]).toContain('refused');
  });

  it('the two cause vocabularies are closed and distinct', () => {
    expect(AnalysisStaleCauseSchema.options).toStrictEqual([
      'graph_changed',
      'options_changed',
    ]);
    expect(AnalysisDegradedCauseSchema.options).toStrictEqual([
      'store_unreadable',
      'legacy_fact',
      'no_graph_this_turn',
      'refusal_unverified',
    ]);
  });

  it('every registered variant is covered by this suite (no branch left untested)', () => {
    expect(VARIANTS.map(([kind]) => kind)).toStrictEqual([...ANALYSIS_RUN_STATE_KINDS]);
  });
});

// ============================================================================
// Round-trips, one per branch
// ============================================================================

describe('AnalysisStateV1 · per-branch round-trips', () => {
  for (const [kind, fixture] of VARIANTS) {
    it(`round-trips the ${kind} variant, bound to that branch by discriminator`, () => {
      const parsed = AnalysisStateV1Schema.parse(fixture);
      // Bound BY IDENTITY: assert the branch actually reached, not merely that
      // something parsed. A value predicate another branch could satisfy (e.g.
      // "usable_for_prose is false") would pass for four of these seven.
      expect(parsed.run_state.kind).toBe(kind);
      // And parses to the bytes it was given — no coercion, no injected default.
      expect(parsed).toStrictEqual(fixture);
    });
  }

  it('the union itself accepts every branch when parsed standalone', () => {
    for (const [kind, fixture] of VARIANTS) {
      const runState = (fixture as { run_state: unknown }).run_state;
      const parsed = AnalysisRunStateSchema.parse(runState);
      expect(parsed.kind).toBe(kind);
      expect(parsed).toStrictEqual(runState);
    }
  });
});

// ============================================================================
// The union fails loud on a kind it does not know
// ============================================================================

describe('AnalysisStateV1 · an unknown run_state kind is REFUSED', () => {
  const base = maximalAnalysisStateCompleteCurrent as Record<string, unknown>;

  /**
   * POSITIVE CONTROL (trap 13): an absence assertion is vacuous unless the
   * probe can first see a PRESENCE. Each rejection below is paired with this —
   * the identical construction with a KNOWN kind is accepted, so a rejection is
   * evidence about the kind and not about a broken fixture.
   */
  it('POSITIVE CONTROL: the same construction with a known kind is ACCEPTED', () => {
    const ok = { ...base, run_state: { kind: 'never_run' } };
    expect(AnalysisStateV1Schema.safeParse(ok).success).toBe(true);
  });

  const unknownKinds = [
    // A plausible near-miss a producer could invent.
    'complete',
    // The old vocabulary a migrating producer might still emit.
    'stale',
    // Case drift.
    'NEVER_RUN',
    // Empty and whitespace.
    '',
    ' never_run',
  ];

  for (const kind of unknownKinds) {
    it(`rejects run_state.kind = ${JSON.stringify(kind)}`, () => {
      const bad = { ...base, run_state: { kind } };
      expect(AnalysisStateV1Schema.safeParse(bad).success).toBe(false);
      expect(AnalysisRunStateSchema.safeParse({ kind }).success).toBe(false);
    });
  }

  it('rejects a run_state with NO discriminator at all', () => {
    const bad = { ...base, run_state: { computed_at: '2026-08-16T10:05:00.000Z' } };
    expect(AnalysisStateV1Schema.safeParse(bad).success).toBe(false);
  });
});

// ============================================================================
// Strictness — a branch cannot carry another branch's fields
// ============================================================================

describe('AnalysisStateV1 · every branch is strict', () => {
  /**
   * THE HEADLINE HONESTY CASE. `refused` declares no timestamp, and the branch
   * is .strict() — so a refusal carrying `computed_at` FAILS TO PARSE rather
   * than quietly handing a consumer a currency signal the refusal is
   * explicitly declining to give. The rule lives in the type system, not in
   * producer discipline (the AnalysisFactSchema doctrine).
   */
  it('a refused state carrying computed_at FAILS TO PARSE', () => {
    const bad = {
      kind: 'refused',
      reason_code: 'FIXTURE_DECLINED',
      computed_at: '2026-08-16T10:05:00.000Z',
    };
    expect(AnalysisRunStateSchema.safeParse(bad).success).toBe(false);
    // Control: the same branch without the smuggled timestamp is accepted.
    expect(
      AnalysisRunStateSchema.safeParse({ kind: 'refused', reason_code: 'FIXTURE_DECLINED' })
        .success,
    ).toBe(true);
  });

  it('a never_run state carrying a started_at FAILS TO PARSE', () => {
    expect(
      AnalysisRunStateSchema.safeParse({
        kind: 'never_run',
        started_at: '2026-08-16T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('a complete_current state carrying a stale cause FAILS TO PARSE', () => {
    expect(
      AnalysisRunStateSchema.safeParse({
        kind: 'complete_current',
        computed_at: '2026-08-16T10:05:00.000Z',
        cause: 'graph_changed',
      }).success,
    ).toBe(false);
  });

  it('the composed object rejects an unknown top-level member', () => {
    const bad = { ...maximalAnalysisStateCompleteCurrent, usable_for_export: true };
    expect(AnalysisStateV1Schema.safeParse(bad).success).toBe(false);
  });

  it('every composed member is REQUIRED — dropping one fails', () => {
    for (const member of [
      'run_state',
      'readiness',
      'leader_claim',
      'robustness',
      'usable_for_prose',
      'usable_for_chips',
      'usable_for_followup',
      'requires_rerun',
      'blocked_unusable',
      'contradictions',
    ]) {
      const bad: Record<string, unknown> = { ...maximalAnalysisStateCompleteCurrent };
      delete bad[member];
      expect(
        AnalysisStateV1Schema.safeParse(bad).success,
        `${member} must be required`,
      ).toBe(false);
    }
  });

  it('a stale cause outside the closed vocabulary FAILS TO PARSE', () => {
    expect(
      AnalysisRunStateSchema.safeParse({
        kind: 'complete_stale',
        computed_at: '2026-08-16T09:30:00.000Z',
        cause: 'user_edited',
      }).success,
    ).toBe(false);
  });
});

// ============================================================================
// Absence arms
// ============================================================================

describe('AnalysisStateV1 · the optional-absence arm', () => {
  it('an OlumiResponse WITHOUT analysis_state still parses (old payloads unaffected)', () => {
    const legacy: Record<string, unknown> = { ...maximalOlumiResponse };
    delete legacy.analysis_state;
    const parsed = OlumiResponseSchema.parse(legacy);
    expect('analysis_state' in parsed).toBe(false);
    expect(parsed).toStrictEqual(legacy);
  });

  it('an OlumiResponse WITH analysis_state round-trips it intact', () => {
    const parsed = OlumiResponseSchema.parse(maximalOlumiResponse);
    expect(parsed.analysis_state).toStrictEqual(maximalAnalysisStateCompleteCurrent);
    // The hosted variant is complete_current: the only kind under which a
    // leader claim may be permitted.
    expect(parsed.analysis_state?.run_state.kind).toBe('complete_current');
    expect(parsed.analysis_state?.leader_claim.permitted).toBe(true);
  });

  it('absence is NOT defaulted — no never_run is fabricated', () => {
    const legacy: Record<string, unknown> = { ...maximalOlumiResponse };
    delete legacy.analysis_state;
    const parsed = OlumiResponseSchema.parse(legacy);
    expect(parsed.analysis_state).toBeUndefined();
  });

  it('a blocker may be model-level: all four scope members are optional', () => {
    const modelLevel = {
      code: 'FIXTURE_NO_GOAL',
      category: 'FIXTURE_structural',
      message: 'FIXTURE the model has no goal.',
      repairability: 'FIXTURE_user_defines_goal',
    };
    const parsed = AnalysisBlockerSchema.parse(modelLevel);
    expect(parsed).toStrictEqual(modelLevel);
    for (const key of ['option_id', 'option_label', 'factor_id', 'factor_label']) {
      expect(key in parsed, `${key} must not be fabricated`).toBe(false);
    }
  });

  it('a permitted leader claim needs neither withheld_reason nor separation', () => {
    const parsed = AnalysisLeaderClaimSchema.parse({ permitted: true });
    expect(parsed).toStrictEqual({ permitted: true });
    expect(parsed.withheld_reason).toBeUndefined();
    expect(parsed.separation).toBeUndefined();
  });

  it('an empty robustness object parses — neither question need be answered', () => {
    expect(AnalysisRobustnessSchema.parse({})).toStrictEqual({});
  });
});

// ============================================================================
// The two-states-one-byte case, declared rather than hidden
// ============================================================================

describe('AnalysisStateV1 · robustness absence is NOT robustness emptiness', () => {
  /**
   * Census row `boundary/AnalysisRobustnessSchema.factors_that_flip_leader` is
   * `distinct` for exactly this reason: ABSENT means the flip analysis was not
   * computed, `[]` means it WAS computed and nothing flips the leader. Both are
   * reachable and they are opposite claims. There is no discriminator on the
   * wire — that is DEBT, recorded, and its fix rides its own train. This test
   * pins that BOTH states survive the parse distinguishably, so a future change
   * that collapses one into the other turns red here.
   */
  it('absent and empty are both reachable AND distinguishable after parsing', () => {
    const notComputed = AnalysisRobustnessSchema.parse({ aggregate_level: 'FIXTURE_high' });
    const computedNoFlips = AnalysisRobustnessSchema.parse({
      aggregate_level: 'FIXTURE_high',
      factors_that_flip_leader: [],
    });

    expect('factors_that_flip_leader' in notComputed).toBe(false);
    expect('factors_that_flip_leader' in computedNoFlips).toBe(true);
    expect(computedNoFlips.factors_that_flip_leader).toStrictEqual([]);
    // The whole point: the two objects must NOT be equal.
    expect(notComputed).not.toStrictEqual(computedNoFlips);
  });

  it('factor ids are identity-bound: an empty-string id is refused', () => {
    expect(
      AnalysisRobustnessSchema.safeParse({ factors_that_flip_leader: [''] }).success,
    ).toBe(false);
  });
});

// ============================================================================
// DISCLOSED LIMITS — recorded in the suite, not left to assumption
// ============================================================================

describe('AnalysisStateV1 · DISCLOSED LIMITS (the parser does NOT enforce these)', () => {
  /**
   * These tests assert what the contract does NOT do. They exist so the gaps
   * are visible in a green suite rather than invisible to it, and they are the
   * first questions for the one-shot external adjudication this contract is
   * earmarked for. If a later train encodes any of these rules, the
   * corresponding test flips and MUST be rewritten as an enforcement test —
   * that flip is the intended signal, not a breakage.
   */
  it('L1: permitted:true alongside withheld_reason PARSES (contradiction not refused)', () => {
    const contradictory = {
      permitted: true,
      withheld_reason: 'FIXTURE_INSUFFICIENT_SEPARATION',
    };
    expect(AnalysisLeaderClaimSchema.safeParse(contradictory).success).toBe(true);
  });

  it('L2: the usability booleans are NOT cross-checked against run_state', () => {
    // blocked_unusable true under a current, complete run is incoherent, and
    // parses. The composed booleans are producer-computed facts the contract
    // carries; it does not adjudicate between them.
    const incoherent = {
      ...maximalAnalysisStateCompleteCurrent,
      blocked_unusable: true,
      usable_for_prose: true,
    };
    expect(AnalysisStateV1Schema.safeParse(incoherent).success).toBe(true);
  });

  it('L3: an empty contradictions array is "found none", not a guarantee', () => {
    // Nothing in the contract distinguishes "the producer looked and found no
    // contradictions" from "the producer did not look". Both emit [].
    const parsed = AnalysisStateV1Schema.parse(maximalAnalysisStateCompleteCurrent);
    expect(parsed.contradictions).toStrictEqual([]);
    const withContradiction = AnalysisStateV1Schema.parse(
      maximalAnalysisStateUnknownDegraded,
    );
    expect(withContradiction.contradictions.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// The .describe() strings ARE the spec — pin the load-bearing licence
// ============================================================================

describe('AnalysisStateV1 · the licence a consumer may quote', () => {
  /**
   * This contract is earmarked for external adjudication BEFORE any UI
   * consumer migrates, and what gets adjudicated is the `.describe()` text. A
   * describe string is therefore load-bearing product doctrine, not a comment:
   * pin the clauses a consumer will quote, so deleting or softening one turns
   * the suite red rather than quietly widening what a surface may claim.
   */
  const describeOf = (schema: z.ZodTypeAny): string => {
    const description = schema.description;
    expect(description, 'field must carry a .describe()').toBeTruthy();
    return description as string;
  };

  it('EVERY field of every composed member carries a .describe()', () => {
    const shapes: ReadonlyArray<readonly [string, z.ZodRawShape]> = [
      ['AnalysisStateV1Schema', AnalysisStateV1Schema.shape],
      ['AnalysisBlockerSchema', AnalysisBlockerSchema.shape],
      ['AnalysisLeaderClaimSchema', AnalysisLeaderClaimSchema.shape],
      ['AnalysisRobustnessSchema', AnalysisRobustnessSchema.shape],
    ];
    const undescribed: string[] = [];
    for (const [name, shape] of shapes) {
      for (const [field, schema] of Object.entries(shape)) {
        // The four composed members are described on their own schema, not at
        // the reference site — check those via `shapes` above instead.
        if (
          name === 'AnalysisStateV1Schema' &&
          ['run_state', 'readiness', 'leader_claim', 'robustness'].includes(field)
        ) {
          continue;
        }
        if (!(schema as z.ZodTypeAny).description) undescribed.push(`${name}.${field}`);
      }
    }
    expect(undescribed).toStrictEqual([]);
  });

  it('the leader-claim licence names BOTH conditions and the data/designation rule', () => {
    const licence = describeOf(AnalysisLeaderClaimSchema.shape.permitted);
    // Both halves of the conjunction, and the run-state condition beside it.
    expect(licence).toContain('MAY RENDER ONLY WHEN');
    expect(licence).toContain('complete_current');
    // The data-vs-designation doctrine: withholding drops the designation and
    // keeps the numbers. A consumer that hides the numbers has over-applied it.
    expect(licence).toContain('DESIGNATION');
    expect(licence.toLowerCase()).toContain('win probabilities');
  });

  it('the two robustness fields each state their OWN scope, so copy cannot borrow', () => {
    const aggregate = describeOf(AnalysisRobustnessSchema.shape.aggregate_level);
    const perFactor = describeOf(AnalysisRobustnessSchema.shape.factors_that_flip_leader);
    expect(aggregate).toContain('SCOPE: THE RESULT AS A WHOLE');
    expect(perFactor).toContain('SCOPE: INDIVIDUAL FACTORS');
    // And each disclaims the other's question explicitly.
    expect(aggregate).toContain('factors_that_flip_leader');
    expect(perFactor).toContain('aggregate_level');
  });

  it('the refused state describes what it withholds', () => {
    const refusedBranch = AnalysisRunStateSchema.options.find((option) => {
      const shape = (option as z.ZodObject<z.ZodRawShape>).shape;
      return (shape.kind as z.ZodLiteral<string>).value === 'refused';
    });
    expect(refusedBranch).toBeDefined();
    const licence = describeOf(
      (refusedBranch as z.ZodObject<z.ZodRawShape>).shape.kind as z.ZodTypeAny,
    );
    expect(licence).toContain('DECLINED TO ANALYSE');
    expect(licence.toLowerCase()).toContain('not vouched for');
  });
});

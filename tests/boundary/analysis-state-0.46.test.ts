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
    // 0.47.0: the booleans are lowered to a coherent never_run pairing — the
    // cross-checks now (correctly) refuse a never_run that claims usability,
    // and this control's job is only to prove a KNOWN kind parses.
    const ok = {
      ...base,
      run_state: { kind: 'never_run' },
      usable_for_prose: false,
      usable_for_chips: false,
      usable_for_followup: false,
      requires_rerun: false,
    };
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

  it('L2 (NARROWED in 0.47.0): the pairs the producer CAN emit still parse un-adjudicated', () => {
    // The original L2 test pinned `blocked_unusable: true` under
    // `complete_current` as PARSING. That flip was the intended signal
    // (see this block's header): 0.47.0 derived at the producer's bytes
    // (CEE c5e24307, ROADMAP 2.1259) that the pair is unreachable, and the
    // parser now refuses it — see the CROSS-CHECK enforcement block below.
    // What REMAINS open is pinned here: pairs the producer could coherently
    // emit under a future wiring stay un-adjudicated by the parser.
    //
    // never_run + blocked_unusable is the coherent future encoding of CEE's
    // `scenario_claims_analysis_no_fact` contradiction (a scenario claims an
    // analysis exists while no fact is selectable) — refusing it would make
    // that contradiction unsayable. It PARSES.
    expect(
      AnalysisStateV1Schema.safeParse({
        ...maximalAnalysisStateNeverRun,
        blocked_unusable: true,
      }).success,
    ).toBe(true);
    // unknown_degraded + blocked_unusable is a registered fixture (a refusal
    // reported but uncorroborated, composed with the producer's own
    // contradiction self-report). It PARSES.
    expect(
      AnalysisStateV1Schema.safeParse(maximalAnalysisStateUnknownDegraded).success,
    ).toBe(true);
    // unknown_degraded + usable_for_chips is REACHABLE at the producer: a
    // hash-proven fresh verdict whose fact carries a non-UTC computed_at
    // string maps to unknown_degraded(legacy_fact) while the chip predicate
    // (which reads freshness, not the timestamp format) stays true. It PARSES.
    expect(
      AnalysisStateV1Schema.safeParse({
        ...maximalAnalysisStateUnknownDegraded,
        blocked_unusable: false,
        usable_for_prose: true,
        usable_for_chips: true,
        usable_for_followup: true,
      }).success,
    ).toBe(true);
    // refused × the five booleans stays open: today's producer pairs every
    // refusal with a blocked readiness and a freshness clamp, but both are
    // CEE policy (the clamp is scheduled to retire at migration step 6), not
    // contract structure. Today's ACTUAL refusal emission — blocked_unusable
    // true with a stale prior fact surfacing requires_rerun — PARSES.
    expect(
      AnalysisStateV1Schema.safeParse({
        ...maximalAnalysisStateRefused,
        blocked_unusable: true,
        requires_rerun: true,
      }).success,
    ).toBe(true);
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
// 0.47.0 CROSS-CHECKS — the pairs the producer provably cannot emit are REFUSED
// ============================================================================

describe('AnalysisStateV1 · 0.47.0 cross-checks refuse producer-unreachable pairs', () => {
  /**
   * Every rule here refuses ONLY a combination derived UNREACHABLE at the
   * producer's bytes (CEE `c5e24307`, ROADMAP 2.1259 — file:line derivation in
   * the 0.47.0 CHANGELOG entry). Each refusal asserts the NAMED issue at the
   * named path (identity-bound, trap 19 — "it failed" could be any rule), and
   * each is paired with a positive control drawn from the producer's real
   * output domain, so a refusal is evidence about the rule and not about a
   * broken fixture (trap 13).
   */
  const namedIssueAt = (
    value: unknown,
    ruleName: string,
    path: string,
  ): boolean => {
    const result = AnalysisStateV1Schema.safeParse(value);
    if (result.success) return false;
    return result.error.issues.some(
      (issue) => issue.message.includes(ruleName) && issue.path.join('.') === path,
    );
  };

  it('CC-A: run_state.kind "blocked" with blocked_unusable=false is REFUSED', () => {
    // Structural at the producer: the same `status === 'blocked'` that selects
    // the blocked run-state branch forces blockedUnusable true in the same
    // canonical object. A payload asserting otherwise cannot come from CEE.
    expect(
      namedIssueAt(
        { ...maximalAnalysisStateBlocked, blocked_unusable: false },
        'analysis_state_blocked_requires_blocked_unusable',
        'blocked_unusable',
      ),
    ).toBe(true);
    // POSITIVE CONTROL: the coherent blocked verdict parses.
    expect(AnalysisStateV1Schema.safeParse(maximalAnalysisStateBlocked).success).toBe(true);
    // POSITIVE CONTROL for the deliberate NON-rule: a blocked model whose
    // prior fact is stale surfaces requires_rerun=true beside
    // blocked_unusable=true — a REACHABLE emission, so it must parse.
    expect(
      AnalysisStateV1Schema.safeParse({
        ...maximalAnalysisStateBlocked,
        requires_rerun: true,
      }).success,
    ).toBe(true);
  });

  it('CC-B: blocked_unusable=true under complete_current is REFUSED (THE ROADMAP 2.1259 PAIR)', () => {
    // Isolated: the other usability booleans are lowered so ONLY CC-B can
    // fire — this proves CC-B bites on its own, not through CC-D.
    expect(
      namedIssueAt(
        {
          ...maximalAnalysisStateCompleteCurrent,
          blocked_unusable: true,
          usable_for_prose: false,
          usable_for_chips: false,
          usable_for_followup: false,
        },
        'analysis_state_complete_forbids_blocked_unusable',
        'blocked_unusable',
      ),
    ).toBe(true);
    expect(
      AnalysisStateV1Schema.safeParse(maximalAnalysisStateCompleteCurrent).success,
    ).toBe(true);
  });

  it('CC-B: blocked_unusable=true under complete_stale is REFUSED (same proof shape)', () => {
    expect(
      namedIssueAt(
        {
          ...maximalAnalysisStateCompleteStale,
          blocked_unusable: true,
          usable_for_prose: false,
        },
        'analysis_state_complete_forbids_blocked_unusable',
        'blocked_unusable',
      ),
    ).toBe(true);
    expect(
      AnalysisStateV1Schema.safeParse(maximalAnalysisStateCompleteStale).success,
    ).toBe(true);
  });

  it('CC-C: never_run claiming any usability or a rerun is REFUSED (four paths, individually)', () => {
    for (const field of [
      'usable_for_prose',
      'usable_for_chips',
      'usable_for_followup',
      'requires_rerun',
    ]) {
      expect(
        namedIssueAt(
          { ...maximalAnalysisStateNeverRun, [field]: true },
          'analysis_state_never_run_forbids_usability',
          field,
        ),
        `${field} must be refused under never_run`,
      ).toBe(true);
    }
    expect(AnalysisStateV1Schema.safeParse(maximalAnalysisStateNeverRun).success).toBe(true);
  });

  it('CC-D: blocked_unusable=true claiming prose/chips/followup is REFUSED — rerun deliberately allowed', () => {
    // Host on unknown_degraded (its fixture carries blocked_unusable=true and
    // CC-B does not apply there), so CC-D is proven to bite on its own.
    for (const field of ['usable_for_prose', 'usable_for_chips', 'usable_for_followup']) {
      expect(
        namedIssueAt(
          { ...maximalAnalysisStateUnknownDegraded, [field]: true },
          'analysis_state_blocked_unusable_forbids_usability',
          field,
        ),
        `${field} must be refused beside blocked_unusable`,
      ).toBe(true);
    }
    // POSITIVE CONTROL for the carve-out: requires_rerun beside
    // blocked_unusable PARSES (reachable: blocked status + stale prior fact).
    expect(
      AnalysisStateV1Schema.safeParse({
        ...maximalAnalysisStateUnknownDegraded,
        requires_rerun: true,
      }).success,
    ).toBe(true);
  });

  it('CC-E: usable_for_chips=true with requires_rerun=true is REFUSED (mutually exclusive at the producer)', () => {
    expect(
      namedIssueAt(
        { ...maximalAnalysisStateCompleteCurrent, requires_rerun: true },
        'analysis_state_chips_forbid_rerun',
        'requires_rerun',
      ),
    ).toBe(true);
    // POSITIVE CONTROLS: each boolean alone, in its real emission.
    expect(
      AnalysisStateV1Schema.safeParse(maximalAnalysisStateCompleteCurrent).success,
    ).toBe(true); // chips=true, rerun=false
    expect(
      AnalysisStateV1Schema.safeParse(maximalAnalysisStateCompleteStale).success,
    ).toBe(true); // chips=false, rerun=true
  });

  it('CC-F: usable_for_chips=true under complete_stale is REFUSED', () => {
    // requires_rerun lowered so CC-E cannot fire — CC-F proven on its own.
    expect(
      namedIssueAt(
        {
          ...maximalAnalysisStateCompleteStale,
          usable_for_chips: true,
          requires_rerun: false,
        },
        'analysis_state_stale_forbids_chips',
        'usable_for_chips',
      ),
    ).toBe(true);
  });

  it('the cross-checks run when analysis_state is hosted on OlumiResponse', () => {
    // The refinement must survive the `.optional()` hosting seam — a wrapper
    // that validated standalone but not in situ would be a guard watching the
    // wrong door.
    const hosted = {
      ...maximalOlumiResponse,
      analysis_state: {
        ...maximalAnalysisStateCompleteCurrent,
        blocked_unusable: true,
        usable_for_prose: false,
        usable_for_chips: false,
        usable_for_followup: false,
      },
    };
    expect(OlumiResponseSchema.safeParse(hosted).success).toBe(false);
    expect(OlumiResponseSchema.safeParse(maximalOlumiResponse).success).toBe(true);
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
    // 0.47.0: the public schema is the bare object plus the cross-check
    // refinement (ZodEffects), so the field shape lives on the inner object.
    const analysisStateInner = AnalysisStateV1Schema.innerType();
    const shapes: ReadonlyArray<readonly [string, z.ZodRawShape]> = [
      ['AnalysisStateV1Schema', analysisStateInner.shape],
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

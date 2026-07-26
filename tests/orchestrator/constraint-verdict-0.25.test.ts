// ============================================================================
// 0.25.0 — `RunAnalysisResultSchema.constraint_verdict`, the TYPED home for the
// constraint verdict CEE currently persists as an untyped interim.
//
// WHAT THIS REPLACES. CEE PR #710 (`fix(cee): read ONE persisted constraint
// verdict; alarm on the residue`, merged into cee@staging at 39fa4eeb) needed
// to persist "may a leading option be named" on the run_analysis fact. It could
// not: `RunAnalysisResultSchema` is `.strict()`, so the field it wanted did not
// exist and could not be added without a package release. It therefore stamped
// the value into the fact's untyped `enrichment` record under a CEE-namespaced
// key, `__cee_claim_safety` (`src/orchestrator/context/constraint-feasibility.ts`,
// `CEE_CLAIM_SAFETY_ENRICHMENT_KEY`), and left a TARGET note naming exactly this
// field:
//
//     TARGET: `RunAnalysisResultSchema.constraint_verdict`. Delete this key and
//     its two helpers when V5-CI-01 unblocks the release.
//
// The interim's own guard (`scripts/validate-handler-ownership.sh` §6b) pins it
// to ONE key precisely so it stays a known, bounded exception rather than
// eroding the "enrichment is byte-for-byte PLoT pass-through" invariant.
//
// WHY THE SHAPE IS MIRRORED, NOT DESIGNED. The two members below are the
// producer's `PersistedClaimSafety` interface verbatim — same names, same types,
// same order. Nothing is added: `ConstraintVerdict` in CEE also carries `codes`,
// `constraints` and `leaderInfeasibility`, and the producer deliberately does
// NOT persist them ("a second copy of a label is a second thing to drift").
// Declaring them here would be inventing contract for a producer that writes
// nothing into it — the exact failure S0's adoption manifest exists to catch.
//
// RED-FIRST. Every test in the first block below FAILS on 0.24.0: `.strict()`
// rejects `constraint_verdict` outright. Reverting the `handler-results.ts`
// change turns this file red again.
// ============================================================================
import { describe, it, expect } from 'vitest';

import {
  ConstraintVerdictSchema,
  ConstraintVerdictStateSchema,
  RunAnalysisResultSchema,
  RunAnalysisHandlerFactSchema,
  HandlerFactSchema,
  type ConstraintVerdict,
  type ConstraintVerdictState,
  type RunAnalysisResult,
} from '../../src/orchestrator/index.js';

const SCENARIO_UUID = '11111111-1111-4111-8111-111111111111';

/** The minimum a `RunAnalysisResult` needs, so each test varies ONE thing. */
function baseResult(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scenario_id: SCENARIO_UUID,
    leading_option_id: 'opt_a',
    summary: 'Option A leads with 64% win probability.',
    ...extra,
  };
}

/**
 * The five verdict states, transcribed from the producer's
 * `ConstraintVerdictState` union (cee@staging 39fa4eeb,
 * src/orchestrator/context/constraint-feasibility.ts), together with the
 * leading-option answer its frozen `MAY_NAME_LEADING_OPTION` table declares.
 *
 * The boolean column is here as DOCUMENTATION and as the raw material for the
 * "both pairings parse" test below — NOT as an invariant this package enforces.
 * See the `coherence is NOT enforced` block for why.
 */
const PRODUCER_STATES: ReadonlyArray<[ConstraintVerdictState, boolean]> = [
  ['not_applicable', true],
  ['evaluated_feasible', true],
  ['evaluated_infeasible', false],
  ['unevaluated', false],
  ['identity_unresolved', false],
];

// ---------------------------------------------------------------------------
// RED-first: the strict schema accepted none of this on 0.24.0.
// ---------------------------------------------------------------------------
describe('RED-first — `constraint_verdict` is accepted where `.strict()` rejected it', () => {
  it('RunAnalysisResultSchema parses a result carrying constraint_verdict', () => {
    const parsed = RunAnalysisResultSchema.parse(
      baseResult({
        constraint_verdict: {
          may_name_leading_option: false,
          constraint_verdict_state: 'identity_unresolved',
        },
      }),
    );
    expect(parsed.constraint_verdict).toEqual({
      may_name_leading_option: false,
      constraint_verdict_state: 'identity_unresolved',
    });
  });

  it('the value survives a full HandlerFact round-trip (it is persisted, not dropped)', () => {
    // `handler_facts.payload` is JSONB: the fact is serialised, stored, and
    // re-parsed on a later turn. A field that parses but does not round-trip is
    // exactly the silent-drop hazard this package exists to detect.
    const fact = {
      fact_type: 'run_analysis' as const,
      fact_version: 1 as const,
      noop: false,
      result: baseResult({
        constraint_verdict: {
          may_name_leading_option: true,
          constraint_verdict_state: 'evaluated_feasible',
        },
      }),
    };
    const viaUnion = HandlerFactSchema.parse(JSON.parse(JSON.stringify(fact)));
    expect(viaUnion).toEqual(fact);
    expect(RunAnalysisHandlerFactSchema.parse(fact)).toEqual(fact);
  });

  it('every one of the producer’s five states is accepted', () => {
    for (const [state, mayName] of PRODUCER_STATES) {
      const parsed = RunAnalysisResultSchema.parse(
        baseResult({
          constraint_verdict: {
            may_name_leading_option: mayName,
            constraint_verdict_state: state,
          },
        }),
      );
      expect(parsed.constraint_verdict?.constraint_verdict_state).toBe(state);
    }
  });

  it('the enum vocabulary is EXACTLY the producer’s five — no more, no fewer', () => {
    // A drift guard in both directions. A sixth state added here without a
    // producer is a field nothing writes; a state removed here silently rejects
    // a verdict CEE still emits.
    expect([...ConstraintVerdictStateSchema.options].sort()).toEqual(
      PRODUCER_STATES.map(([s]) => s).sort(),
    );
  });

  it('the field is OPTIONAL — a 0.22/0.23-era result with no verdict still parses', () => {
    // The blast-radius claim in the release notes, asserted rather than
    // asserted-about. Every already-persisted fact predates the field.
    const parsed = RunAnalysisResultSchema.parse(baseResult());
    expect(parsed.constraint_verdict).toBeUndefined();
    expect('constraint_verdict' in parsed).toBe(false);
  });

  it('coexists with the interim key, which rides `enrichment` and is untouched here', () => {
    // During the swap window CEE may carry both. `enrichment` is
    // `z.record(z.unknown())`, so the interim stamp keeps parsing exactly as it
    // does today — this release neither blesses nor breaks it.
    const parsed = RunAnalysisResultSchema.parse(
      baseResult({
        enrichment: {
          __cee_claim_safety: {
            may_name_leading_option: true,
            constraint_verdict_state: 'evaluated_feasible',
          },
        },
        constraint_verdict: {
          may_name_leading_option: true,
          constraint_verdict_state: 'evaluated_feasible',
        },
      }),
    );
    expect(parsed.enrichment?.__cee_claim_safety).toBeDefined();
    expect(parsed.constraint_verdict?.may_name_leading_option).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE FIXTURES. S0's standard: a validator that passes everything is worse
// than none, because it reads as a guarantee. Each case below must be REJECTED.
// ---------------------------------------------------------------------------
describe('negative fixtures — a malformed verdict is still rejected', () => {
  /** Every rejection case, as `[why, the exact malformed verdict value]`. */
  const MALFORMED: ReadonlyArray<[string, unknown]> = [
    ['an unknown verdict state', { may_name_leading_option: false, constraint_verdict_state: 'infeasible' }],
    ['a state with plausible-but-wrong casing', { may_name_leading_option: true, constraint_verdict_state: 'EVALUATED_FEASIBLE' }],
    ['the empty string as a state', { may_name_leading_option: true, constraint_verdict_state: '' }],
    ['a stringly-typed boolean', { may_name_leading_option: 'true', constraint_verdict_state: 'evaluated_feasible' }],
    ['a numeric boolean', { may_name_leading_option: 1, constraint_verdict_state: 'evaluated_feasible' }],
    ['a null boolean', { may_name_leading_option: null, constraint_verdict_state: 'evaluated_feasible' }],
    ['a missing state', { may_name_leading_option: true }],
    ['a missing boolean', { constraint_verdict_state: 'evaluated_feasible' }],
    ['an extra member (the inner object is strict too)', {
      may_name_leading_option: true,
      constraint_verdict_state: 'evaluated_feasible',
      codes: ['NOT_DECISION_GRADE'],
    }],
    ['camelCase members — the producer persists snake_case', {
      mayNameLeadingOption: true,
      constraintVerdictState: 'evaluated_feasible',
    }],
    ['an empty object', {}],
    ['null', null],
    ['an array', [{ may_name_leading_option: true, constraint_verdict_state: 'evaluated_feasible' }]],
    ['a bare string', 'evaluated_feasible'],
  ];

  for (const [why, verdict] of MALFORMED) {
    it(`rejects ${why}`, () => {
      const result = RunAnalysisResultSchema.safeParse(
        baseResult({ constraint_verdict: verdict }),
      );
      expect(result.success, `${why} was ACCEPTED — the validator is decorative`).toBe(false);
    });
  }

  it('the rejection reaches the right path, not some unrelated field', () => {
    // Anti-vacuity: without this, every case above could be passing because the
    // fixture is malformed somewhere else entirely.
    const result = RunAnalysisResultSchema.safeParse(
      baseResult({ constraint_verdict: { may_name_leading_option: true, constraint_verdict_state: 'nope' } }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((i) => i.path.join('.'))).toContain(
      'constraint_verdict.constraint_verdict_state',
    );
  });

  it('a malformed verdict is rejected through the discriminated union too', () => {
    // The persistence path parses via `HandlerFactSchema`, not the result
    // schema directly. A union that widened the branch would let a bad verdict
    // through the door the runtime actually uses.
    const result = HandlerFactSchema.safeParse({
      fact_type: 'run_analysis',
      fact_version: 1,
      noop: false,
      result: baseResult({
        constraint_verdict: { may_name_leading_option: true, constraint_verdict_state: 'nope' },
      }),
    });
    expect(result.success).toBe(false);
  });

  it('POSITIVE CONTROL — the same fixture minus the malformation is ACCEPTED', () => {
    // Proves the rejections above discriminate, rather than the base fixture
    // being invalid for an unrelated reason.
    expect(
      RunAnalysisResultSchema.safeParse(
        baseResult({
          constraint_verdict: {
            may_name_leading_option: true,
            constraint_verdict_state: 'evaluated_feasible',
          },
        }),
      ).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The deliberate NON-guarantee, pinned so nobody adds it by reflex.
// ---------------------------------------------------------------------------
describe('coherence between the two members is NOT enforced — by decision', () => {
  it('accepts a pairing the producer’s table would never emit', () => {
    // `may_name_leading_option` is always `MAY_NAME_LEADING_OPTION[state]` at
    // the producer, so this package COULD cross-validate. It deliberately does
    // not: that table is CEE doctrine, and copying it here would create a
    // second copy of a rule that must be changed in two repos at once — the
    // hand-maintained-mirror defect class (CLAUDE.md trap 12). A skewed pin
    // would then reject verdicts a newer CEE legitimately emits, and the
    // failure would surface as a parse error three hops from its cause.
    //
    // The contract's job here is the SHAPE. The meaning stays with its single
    // owner, `deriveConstraintVerdict`.
    expect(
      ConstraintVerdictSchema.safeParse({
        may_name_leading_option: true,
        constraint_verdict_state: 'evaluated_infeasible',
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Type-level surface. These are compile-time assertions; `npm run build` /
// `npm run lint` is what actually enforces them.
// ---------------------------------------------------------------------------
describe('type surface', () => {
  it('ConstraintVerdict / ConstraintVerdictState are exported and structurally correct', () => {
    const verdict: ConstraintVerdict = {
      may_name_leading_option: false,
      constraint_verdict_state: 'unevaluated',
    };
    const state: ConstraintVerdictState = verdict.constraint_verdict_state;
    // `RunAnalysisResult['constraint_verdict']` must be the verdict type, optional.
    const result: RunAnalysisResult = {
      scenario_id: SCENARIO_UUID,
      leading_option_id: null,
      summary: 'Withheld.',
      constraint_verdict: verdict,
    };
    expect(state).toBe('unevaluated');
    expect(result.constraint_verdict).toBe(verdict);
  });
});

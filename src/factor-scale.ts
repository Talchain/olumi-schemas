import { z } from 'zod';

// ----------------------------------------------------------------------------
// declared_scale — 0.31.0 additive (ROADMAP 2.193; the fix path for 2.159)
// ----------------------------------------------------------------------------

/**
 * The DECLARED scale of a factor's `value`. 0.31.0 additive.
 *
 * WHY THIS EXISTS. ROADMAP 2.159 found normalised factors accepting
 * out-of-range values end-to-end (a `1.5` on a `[0,1]` factor accepted and
 * persisted). The #766 review then proved that no derivation from the CURRENT
 * VALUE can be sound in either direction — a `0` or `1` is a legal raw count
 * AND a legal proportion, so a classifier cannot be built. The conclusion of
 * record (2.193): the scale must be DECLARED by the producer that knows it,
 * never inferred by a consumer that does not.
 *
 * VOCABULARY DERIVED, NOT INVENTED. These three members are the classes CEE's
 * draft/edit prompt `SCALE_DISCIPLINE` already distinguishes at draft time —
 * the knowledge exists upstream today and is thrown away before the wire:
 *   * `unit_interval` — a proportion or a cap-normalised magnitude. Admissible
 *     `[0, 1]`. Covers BOTH SCALE_DISCIPLINE's bounded-percentage rule
 *     ("3% churn -> value 0.03") and its normalisation rule (cost / revenue /
 *     headcount expressed as `raw_value / cap`).
 *   * `ratio` — a ratio that can meaningfully exceed 100% (NRR, growth, ROI).
 *     Admissible `[0, +inf)`; `1.0` is parity. SCALE_DISCIPLINE's own test is
 *     "can this metric meaningfully exceed 100%?" — a `yes` lands here.
 *   * `raw_count` — a magnitude left un-normalised in `unit` (SCALE_DISCIPLINE
 *     permits this for small unitless counts). Admissible `[0, +inf)`.
 *
 * PRODUCER: CEE, stamped by the draft/edit transform that already applies
 * SCALE_DISCIPLINE. CONSUMERS: CEE's own value-edit authority check (enforce
 * against the DECLARED scale only) and the UI (a min/max input hint derived
 * from `DECLARED_SCALE_BOUNDS` below, never re-implemented client-side).
 *
 * FAILURE SEMANTICS — FAIL OPEN, DELIBERATELY, AND ONLY HERE. Absence means
 * UNDECLARED, which is every graph drafted before this field existed. A
 * consumer MUST NOT treat absence as `unit_interval`: that is the unsound
 * guess 2.193 exists to retire, and it would refuse legal values on stored
 * graphs. Enforce a bound only where the scale is declared; where it is
 * absent, behave exactly as today (no bound, no hint). This is the one field
 * in the 0.31.0 set whose absence-behaviour is permissive rather than closed,
 * because the alternative is breaking every pre-existing graph.
 *
 * ADOPTION SEQUENCING (hazard 1 — an older-pinned consumer silently DROPS an
 * unknown key): CEE may stamp as soon as it re-vendors; the UI hint and the
 * CEE authority check may adopt in any order after that. No consumer needs
 * the others, because absence is the status quo everywhere.
 */
export const DeclaredScale = z.enum(['unit_interval', 'ratio', 'raw_count']);
export type DeclaredScaleType = z.infer<typeof DeclaredScale>;

/**
 * The admissible range each declared scale licenses — the AUTHORITY BOUND.
 *
 * Exported so the bound is DERIVED from the declaration in one place instead
 * of being re-implemented in CEE's validator and again in the UI's input hint.
 * Two hand-written copies of a server rule is the estate's dominant defect
 * class (trap 12) and is precisely what ROADMAP 2.193 refused to ship.
 *
 * `null` means UNBOUNDED ON THAT SIDE — never "no bound was computed". Both
 * ends are `number | null`.
 *
 * WHY `min` IS NULLABLE WHEN NO CURRENT MEMBER USES IT (adversarial-review
 * amendment, and the reasoning is the useful part): every scale today has a
 * floor of 0, so `min: number` would have been sufficient — but `ratio` is
 * only non-negative under the MULTIPLIER convention this table assumes (1.0 =
 * parity, 1.10 = 110%, matching SCALE_DISCIPLINE's NRR/growth/ROI examples).
 * A signed-return convention (-0.2 for a 20% loss) is a perfectly ordinary way
 * to state the same metrics and is unbounded below. Widening the TYPE now is
 * free because the table has zero consumers; widening it after publication
 * would be a breaking change to every consumer that had narrowed on it. The
 * VALUES still assert the multiplier convention — that is a real claim, and a
 * producer using signed returns must declare `raw_count`, not `ratio`.
 */
export const DECLARED_SCALE_BOUNDS: Readonly<
  Record<
    DeclaredScaleType,
    { readonly min: number | null; readonly max: number | null }
  >
> = Object.freeze({
  unit_interval: Object.freeze({ min: 0, max: 1 }),
  ratio: Object.freeze({ min: 0, max: null }),
  raw_count: Object.freeze({ min: 0, max: null }),
});

/** Existing scale metadata can survive even when the selected quantity is unknown.
 * These fields make no value claim and do not authorise any scale inference.
 * Internal reusable field declarations; public enum/bounds exports stay unchanged.
 */
export const factorScaleFields = {
  unit: z.string().optional().describe('Existing unit of the factor quantity, preserved verbatim. Absence means no unit was declared; do not infer one.'),
  cap: z.number().optional().describe('Existing scale cap, preserved verbatim as metadata, not an estimated value or distribution bound. Absence means no cap was declared; do not infer one.'),
  declared_scale: DeclaredScale.optional().describe('Existing declared scale of the factor quantity. Absence means undeclared, never an implied unit interval; preserve the original declaration without inferring one.'),
};

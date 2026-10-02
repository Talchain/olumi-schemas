import { z } from 'zod';

// ============================================================================
// 0.75.0 — "WHAT WOULD CHANGE THIS?": the recommendation's tipping point per link (SCIENCE ROBUSTNESS step 2;
// SCIENCE/DSK, programme-docs #85 lease 5948579361; DL GO with conditions). EXPERIMENT: produced by ISL
// `POST /api/v1/robustness/decision-flip/v2` (ISL #220), not yet consumed on a served path.
//
// WHAT IT ANSWERS. For each requested link, the strength at which the analyser's RECOMMENDATION would change if the
// link were weaker, with every other link's stated uncertainty integrated over. That is not `edge_e_values.flip_mean`,
// which is the flip in ONE world (every other link at its mean) and overstated the safe range 1.8-2.6x on D1.
//
// THE LICENCE IS STRUCTURAL (DL CRs on #85 @6670076f and @598c4cc2). A block that fails any rule below fails the
// parse, so a consumer that parsed it can quote `threshold` without re-checking. Every issue message starts with its
// rule id, and each rule has RED rows bound to that id and the link's path (tests/contracts/release-0.75.0.test.ts):
//   R1 quoted <=> threshold + to_option_id, and no reason; an absent link names its reason.
//   R2 THE MEDIAN RULE: a quoted threshold is the median of replicate_thresholds (all non-null): the middle value for
//      odd K, the mean of the two middle values for even K (numpy.median, ISL's own rule).
//   R3 THE LICENCE, on the spread RECOMPUTED from the replicates (never only the reported one): quoted and
//      affine_check_failed => spread <= bound_abs AND <= bound_rel x |median|; replicates_spread => it breaks one.
//      replicate_range, where present, equals that spread.
//   R4 every replicate tipping point (and a quoted threshold) lies strictly between 0 and current_mean, same sign:
//      the search only weakens a link towards zero.
//   R5 replicate_thresholds is null ONLY when no replicate ran; otherwise it has exactly `replicates` entries.
//      no_change => every entry null.
//   R6 any quoted link => leader_option_id non-null, and every to_option_id differs from it. A NULL leader (no ranking
//      supported) allows only pre-search absences: no_change and post-search absences claim a stability the
//      analyser never ranked.
//   R7 bound_abs <= 0.01 and bound_rel <= 0.15: the licence the DL accepted (#85, 2 Oct). Loosening it is a contract
//      change, never a producer setting.
//   R8 each (from_id, to_id) appears at most once in a block.
//   R9 an absence's reason is a typed machine code with its evidence shape. PRE-SEARCH (no replicate ran:
//      ranking_not_supported, leader_unstable, link_at_zero, nonlinear_downstream:<clamp|identity>:<node>) => no
//      replicates, no range. POST-SEARCH: replicates_disagree => some replicates found a change and some did not, no
//      range; replicates_disagree_on_option => all found one, no range; replicates_spread and affine_check_failed =>
//      all found one, with the range (R3 decides which).
//   R10 every strength, threshold and replicate value is a sane magnitude (|x| <= 1e6; link strengths are O(1)), and
//      the median is computed overflow-safely (a/2 + b/2), so no Infinity can satisfy R2.
//
// NULL, NOT ABSENT. ISL serialises every member; an inapplicable one is `null`. `.strict()`: an ISL field this
// contract does not know fails the parse instead of being dropped (the schema-version-skew hazard).
// ============================================================================

const Id = z.string().min(1).max(200);

/** R7: the accepted licence. A producer that loosens either bound fails the parse. */
export const DECISION_FLIP_MAX_BOUND_ABS = 0.01;
export const DECISION_FLIP_MAX_BOUND_REL = 0.15;
/** R2/R3 float tolerance, RELATIVE: ISL computes the median and range in IEEE doubles that survive JSON exactly. */
const EQ_TOL = 1e-12;
/** R10: link strengths are O(1); this bound only stops pathological magnitudes (overflow) reaching R2/R3. */
export const DECISION_FLIP_MAX_MAGNITUDE = 1e6;
const Magnitude = z.number().finite().gte(-DECISION_FLIP_MAX_MAGNITUDE, { message: 'R10: |value| is at most 1e6' })
  .lte(DECISION_FLIP_MAX_MAGNITUDE, { message: 'R10: |value| is at most 1e6' });

export const DecisionFlipLinkStatus = z.enum(['quoted', 'absent', 'no_change']);

/** R9: absences decided before any search (no replicate ran). `nonlinear_downstream:<clamp|identity>:<node>` too. */
export const DECISION_FLIP_PRE_SEARCH_REASONS = ['ranking_not_supported', 'leader_unstable', 'link_at_zero'] as const;
/** R9: absences decided after the K replicates ran. */
export const DECISION_FLIP_POST_SEARCH_REASONS = [
  'replicates_disagree', 'replicates_disagree_on_option', 'replicates_spread', 'affine_check_failed',
] as const;
const NONLINEAR_DOWNSTREAM = /^nonlinear_downstream:(clamp|identity):.+$/;
const AbsenceReason = z.union([
  z.enum([...DECISION_FLIP_PRE_SEARCH_REASONS, ...DECISION_FLIP_POST_SEARCH_REASONS]),
  z.string().max(200).regex(NONLINEAR_DOWNSTREAM),
]);
const isPreSearch = (reason: string) =>
  (DECISION_FLIP_PRE_SEARCH_REASONS as readonly string[]).includes(reason) || NONLINEAR_DOWNSTREAM.test(reason);

function median(sorted: number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[m] : sorted[m - 1] / 2 + sorted[m] / 2; // R10: overflow-safe
}

const near = (a: number, b: number) => Math.abs(a - b) <= EQ_TOL * Math.max(Math.abs(a), Math.abs(b));

/** Strictly between 0 and `current`: same sign, smaller magnitude. */
function weakerThan(current: number, x: number): boolean {
  return x !== 0 && Math.sign(x) === Math.sign(current) && Math.abs(x) < Math.abs(current);
}

/** The replicates' own evidence: the sorted found values, their median and spread (null unless every replicate found). */
function evidenceOf(reps: (number | null)[] | null) {
  const found = (reps ?? []).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const all = reps !== null && reps.length > 0 && found.length === reps.length;
  return { found, all, median: all ? median(found) : null, spread: all ? found[found.length - 1] - found[0] : null };
}

export const DecisionFlipLinkV1Schema = z
  .object({
    from_id: Id,
    to_id: Id,
    status: DecisionFlipLinkStatus,
    /** A typed machine code for an absence (R9); null otherwise. */
    reason: AbsenceReason.nullable(),
    current_mean: Magnitude,
    /** The median replicate tipping point (R2). Non-null ONLY when `status` is `quoted`. */
    threshold: Magnitude.nullable(),
    /** One entry per replicate: its tipping point, or null when that replicate found no change. Null when no replicate
     *  ran (R5). */
    replicate_thresholds: z.array(Magnitude.nullable()).min(2).max(8).nullable(),
    /** max - min of the replicates (R3); present only when every replicate found a change and the range was judged. */
    replicate_range: z.number().finite().nonnegative().lte(2 * DECISION_FLIP_MAX_MAGNITUDE, { message: 'R10: a range is at most 2e6' }).nullable(),
    /** The option that would lead past the threshold. Non-null ONLY when `status` is `quoted`. */
    to_option_id: Id.nullable(),
  })
  .strict()
  .superRefine((link, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const reps = link.replicate_thresholds;
    const ev = evidenceOf(reps);
    if (!ev.found.every((x) => weakerThan(link.current_mean, x))) {
      fail('R4: a replicate tipping point lies strictly between 0 and the current strength');
    }
    const rangeMatches = link.replicate_range !== null && ev.spread !== null && near(link.replicate_range, ev.spread);
    if (link.status === 'quoted') {
      if (link.threshold === null || link.to_option_id === null || link.reason !== null) {
        fail('R1: a quoted link carries a threshold and a new leader, and no reason');
        return;
      }
      if (!ev.all || ev.median === null) {
        fail('R2: a quoted link has a tipping point from every replicate');
        return;
      }
      if (!near(link.threshold, ev.median)) fail('R2: a quoted threshold is the median of its replicates');
      if (!rangeMatches) fail('R3: replicate_range is the max - min of the replicates');
      if (!weakerThan(link.current_mean, link.threshold)) fail('R4: the threshold lies strictly between 0 and the current strength');
      return;
    }
    if (link.threshold !== null || link.to_option_id !== null) fail(`R1: a ${link.status} link never carries a threshold or a new leader`);
    if (link.status === 'no_change') {
      if (link.reason !== null || link.replicate_range !== null) fail('R5: a no_change link has no reason and no range');
      if (reps === null || ev.found.length > 0) fail('R5: no_change means every replicate ran and none found a change');
      return;
    }
    // absent
    if (link.reason === null) {
      fail('R1: an absent link names its reason');
      return;
    }
    if (isPreSearch(link.reason)) {
      if (reps !== null || link.replicate_range !== null) fail('R9: a pre-search absence carries no replicate evidence');
      return;
    }
    if (reps === null) {
      fail('R5: a post-search absence carries its replicates');
      return;
    }
    if (link.reason === 'replicates_disagree') {
      if (ev.all || ev.found.length === 0 || link.replicate_range !== null) {
        fail('R9: replicates_disagree = some replicates found a change and some did not, with no range');
      }
    } else if (link.reason === 'replicates_disagree_on_option') {
      if (!ev.all || link.replicate_range !== null) fail('R9: replicates_disagree_on_option = every replicate found a change, with no range');
    } else if (!ev.all || !rangeMatches) {
      fail(`R9: ${link.reason} = every replicate found a change, with their range`);
    }
  });

export const DecisionFlipBlockV1Schema = z
  .object({
    method: z.literal('affine_crn_replicates_v1'),
    /** The analyser's recommendation the tipping points are about; null when the ranking was not supported. */
    leader_option_id: Id.nullable(),
    replicates: z.number().int().min(2).max(8),
    bound_abs: z.number().finite().positive().max(DECISION_FLIP_MAX_BOUND_ABS, { message: 'R7: bound_abs is at most the accepted 0.01' }),
    bound_rel: z.number().finite().positive().max(DECISION_FLIP_MAX_BOUND_REL, { message: 'R7: bound_rel is at most the accepted 0.15' }),
    grid_step: z.number().finite().positive(),
    links: z.array(DecisionFlipLinkV1Schema).min(1).max(12),
  })
  .strict()
  .superRefine((block, ctx) => {
    const fail = (i: number, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['links', i], message });
    const seen = new Set<string>();
    block.links.forEach((link, i) => {
      const key = JSON.stringify([link.from_id, link.to_id]);
      if (seen.has(key)) fail(i, 'R8: a link appears at most once in a block');
      seen.add(key);
      if (link.replicate_thresholds !== null && link.replicate_thresholds.length !== block.replicates) {
        fail(i, 'R5: one replicate_thresholds entry per replicate');
      }
      const ev = evidenceOf(link.replicate_thresholds);
      if (ev.spread !== null && ev.median !== null) {
        const withinAbs = ev.spread <= block.bound_abs;
        const withinRel = ev.spread <= block.bound_rel * Math.abs(ev.median);
        const licensed = withinAbs && withinRel;
        if ((link.status === 'quoted' || link.reason === 'affine_check_failed') && !licensed) {
          fail(i, `R3: the replicates' spread breaks the licence (${withinAbs ? 'relative' : 'absolute'} bound)`);
        }
        if (link.reason === 'replicates_spread' && licensed) fail(i, 'R3: replicates_spread needs a spread that breaks the licence');
      }
      if (link.status === 'quoted' && (block.leader_option_id === null || link.to_option_id === block.leader_option_id)) {
        fail(i, 'R6: a quoted link names a leader and a different option past its tipping point');
      } else if (block.leader_option_id === null && !(link.status === 'absent' && link.reason !== null && isPreSearch(link.reason))) {
        fail(i, 'R6: with no leader, a link can only be a pre-search absence');
      }
    });
  });

export type DecisionFlipLinkV1 = z.infer<typeof DecisionFlipLinkV1Schema>;
export type DecisionFlipBlockV1 = z.infer<typeof DecisionFlipBlockV1Schema>;

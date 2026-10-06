// ============================================================================
// 0.78.0 — THE RUN'S OWN DELIVERED RECORD (SD-1 Slice R; DL ruling #87, 6 Oct 2026: "carry what the Run DELIVERED,
// never re-composed").
//
// Witnessed (J1 record 4b, run 37402501132): after a reload, or in a fresh browser, the Analysis panel lost the Run's
// "Olumi model review" cards and the coverage disclosure ("Not every option is equally specified"). Both were composed
// for the Run's own turn and stored nowhere: the cards lived only in the browser's session storage, and the coverage
// options only in the turn's `analysis_ready`.
//
// RULES (DL conditions, binding on every producer and reader):
//   - the EXACT post-projection blocks the user saw on the Run's turn (after the leader-withheld wire rewording), never a
//     re-composition from today's state;
//   - bound to the Run: `run_id` and `graph_hash` equal the Run fact's own `run_id` and `graph_hash_at_run`;
//   - served on the scenario read only while that Run is `complete_current`, and never re-worded on read;
//   - optional (absent = an older Run, or a Run whose turn delivered nothing to record), and size-capped below.
// It amends the scenario read's "no prose" rule to "no prose except the Run's own delivered record".
// ============================================================================

import { z } from 'zod';

import { DeliveredPhase3BlockSchema } from './blocks.js';

/** At most this many Phase 3 blocks are recorded for one Run. */
export const RUN_DELIVERED_RECORD_MAX_BLOCKS = 16;
/** At most this many options from the Run's `analysis_ready`. */
export const RUN_DELIVERED_RECORD_MAX_OPTIONS = 16;
/** The whole record, serialised as UTF-8 JSON, is at most this many bytes. */
export const RUN_DELIVERED_RECORD_MAX_BYTES = 64_000;

/**
 * One option as the Run's turn delivered it in `analysis_ready.options[]`: the members the coverage disclosure reads
 * (which factors the option sets), nothing re-derived.
 */
export const RunDeliveredOptionSchema = z.object({
  option_id: z.string().min(1).max(200),
  label: z.string().max(200),
  status: z.string().min(1).max(64),
  /** Factor id → the number the option sets it to, as delivered. */
  interventions: z.record(z.string().min(1).max(200), z.number().finite()),
}).strict();
export type RunDeliveredOption = z.infer<typeof RunDeliveredOptionSchema>;

export const RunDeliveredRecordSchema = z.object({
  record_version: z.literal(1),
  /** The Run this record was delivered with (its fact's `run_id`). */
  run_id: z.string().min(1).max(200),
  /** The graph the Run was computed against (its fact's `graph_hash_at_run`). */
  graph_hash: z.string().min(1).max(200),
  /** The Phase 3 blocks the user saw on the Run's turn, post-projection, in delivered order. `[]` = none delivered. */
  phase3_blocks: z.array(DeliveredPhase3BlockSchema).max(RUN_DELIVERED_RECORD_MAX_BLOCKS),
  /** The turn's `analysis_ready.options[]`, projected to the coverage members. Absent = the turn delivered none. */
  analysis_ready_options: z.array(RunDeliveredOptionSchema).max(RUN_DELIVERED_RECORD_MAX_OPTIONS).optional(),
}).strict().superRefine((record, ctx) => {
  const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
  if (bytes > RUN_DELIVERED_RECORD_MAX_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: `a delivered record is at most ${RUN_DELIVERED_RECORD_MAX_BYTES} bytes (got ${bytes}).` });
  }
  const seen = new Set<string>();
  (record.analysis_ready_options ?? []).forEach((o, i) => {
    if (seen.has(o.option_id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['analysis_ready_options', i, 'option_id'], message: 'an option is recorded once.' });
    }
    seen.add(o.option_id);
  });
});
export type RunDeliveredRecord = z.infer<typeof RunDeliveredRecordSchema>;

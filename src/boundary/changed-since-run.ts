import { z } from 'zod';

// ============================================================================
// 0.83.0 (P48, audit #27; DL ruling on #87) — WHAT CHANGED IN THE MODEL SINCE THE LAST RUN, BY ID.
//
// CEE projects the applied mutation receipts recorded after the newest Run's graph snapshot
// (`context/changed-since-run.ts`) and serves them on the scenario graph read's conversation opt-in, so the UI's
// one analysis-state cue ("Since the last run") can light the changed elements and a reload keeps them. A newer Run
// moves the boundary, so the set clears by construction. Ids only: no labels, no values, no cause.
//
// ⚠ ABSENCE OF THE BLOCK IS "NOT ANSWERED", never "nothing changed" (a failed read omits it).
// ⚠ `unattributed_changes > 0` means some applied changes name no element (a receipt written before
//   `EditGraphAffectedEntitySchema.id` existed). A consumer must not present the ids as the whole set while it is > 0.
// ⚠ `complete: false` means the producer's bounded receipt window may not reach back to the Run, or the graph moved
//   with no receipt naming the change.
// ============================================================================

const Id = z.string().min(1).max(200);

export const ChangedSinceRunLinkSchema = z.object({
  from: Id,
  to: Id,
}).strict();

export const ChangedSinceRunV1Schema = z.object({
  version: z.literal(1),
  /** The Run the set is relative to; `null` = no Run recorded yet (every applied change is since). */
  since_run_id: Id.nullable(),
  /**
   * The Run's `computed_at` (its stored result), the SAME stamp `analysis_state.run_state.computed_at` names it by on a
   * `complete_stale` read, where no Run id is served. A consumer binds the set to the Run it is SHOWING with it there.
   * Present only with a `since_run_id`; absent = the Run's stamp is unknown, and a consumer must not bind by it.
   */
  since_run_computed_at: z.string().datetime().optional(),
  /** Nodes added or changed since the Run. Removed elements are not listed (nothing left to mark). */
  node_ids: z.array(Id).max(200),
  /** Links added or changed since the Run, by their two ends (CEE links carry no id of their own). */
  links: z.array(ChangedSinceRunLinkSchema).max(400),
  unattributed_changes: z.number().int().min(0),
  complete: z.boolean(),
}).strict();

export type ChangedSinceRunLink = z.infer<typeof ChangedSinceRunLinkSchema>;
export type ChangedSinceRunV1 = z.infer<typeof ChangedSinceRunV1Schema>;

import { z } from 'zod';
import { GraphV3Schema } from '../graph.js';

// ============================================================================
// GraphWriteRequest / GraphWriteResult (0.21.0) — the CEE write-through / CAS
// endpoint contract (SINGLE-GRAPH-DESIGN v2 §1 Q1 amendment B,
// schemas-0.21.0-manifest a5).
//
// LOAD-BEARING FOR GUESTS. The client-side Supabase RPC write path is
// scenario-id-gated and RLS-fails SILENTLY for guests (A2), so a guest's canvas
// mutation never persists through it. This endpoint IS the guest write channel:
// guests (and, uniformly, authenticated users) write the graph through CEE,
// which owns the single authoritative `scenarios.graph`. Every mutation writes
// through BEFORE it counts (the invariant).
//
// COMPARE-AND-SET. `base_hash` is the `computeGraphHash` the client last
// observed the server graph at (`null` = create / first write). The server
// applies the write only if the current server hash still equals `base_hash`;
// otherwise it returns the `diverged` result carrying the authoritative
// `server_hash` and the `GRAPH_DIVERGED` code — no last-writer-wins, ever.
// Because the hash excludes layout (see graph-hash.ts), a layout-only tick
// leaves the hash unchanged and the CAS no-ops on hash-equality while positions
// still persist.
// ============================================================================

export const GraphWriteRequestSchema = z
  .object({
    scenario_id: z.string().min(1),
    graph: GraphV3Schema,
    /**
     * The graph-identity hash the client believes the server is currently at,
     * from `computeGraphHash`. `null` = create / first write (no base to
     * compare against). Required key, nullable value — an ABSENT base_hash is
     * not a valid write intent (a client must state whether it is creating or
     * updating-from-a-known-base), which is why this is `.nullable()` and not
     * `.optional()`.
     */
    base_hash: z.string().min(1).nullable(),
  })
  .strict();
export type GraphWriteRequest = z.infer<typeof GraphWriteRequestSchema>;

// Success: the write applied; `new_hash` is the authoritative post-write
// identity hash the client adopts as its next `base_hash`.
export const GraphWriteAppliedSchema = z
  .object({
    status: z.literal('ok'),
    new_hash: z.string().min(1),
  })
  .strict();
export type GraphWriteApplied = z.infer<typeof GraphWriteAppliedSchema>;

// Conflict (HTTP 409 on the wire): the server graph moved since `base_hash`.
// `server_hash` is the authoritative current identity; the client reconciles
// (default: reload authoritative) before retrying.
export const GraphWriteDivergedSchema = z
  .object({
    status: z.literal('diverged'),
    server_hash: z.string().min(1),
    code: z.literal('GRAPH_DIVERGED'),
  })
  .strict();
export type GraphWriteDiverged = z.infer<typeof GraphWriteDivergedSchema>;

export const GraphWriteResultSchema = z.discriminatedUnion('status', [
  GraphWriteAppliedSchema,
  GraphWriteDivergedSchema,
]);
export type GraphWriteResult = z.infer<typeof GraphWriteResultSchema>;

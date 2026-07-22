import { z } from 'zod';

// Boundary error codes per Boundary Contract v1.1 §6.4.
// Stable strings that become the `error` field on BoundaryError and the
// `error_code` field on error blocks. Extend additively; do not rename.
export const BoundaryErrorCode = z.enum([
  'INGRESS_CONTRACT_VIOLATION',
  'EGRESS_CONTRACT_VIOLATION',
  'FEATURE_NOT_ENABLED',
  'TURN_BUDGET_EXCEEDED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'LLM_UNAVAILABLE',
  'INTERNAL_ERROR',
  // 0.21.0 (SINGLE-GRAPH-DESIGN v2 §1, schemas-0.21.0-manifest a4) — the
  // blocking, user-visible graph-divergence state's wire code. The single
  // authoritative graph moved under the client (compare-and-set base_hash no
  // longer matches the server hash); compute and edit-confirm are blocked until
  // the client reconciles. Additive to the enum; also carried as the literal
  // `code` on GraphWriteDivergedSchema (boundary/graph-write.ts).
  'GRAPH_DIVERGED',
]);
export type BoundaryErrorCodeType = z.infer<typeof BoundaryErrorCode>;

// FailureType union for UI TypedErrorRenderer per addendum §2.1.5.
// Kept in sync with BoundaryErrorCode; UI renders a declared outcome text
// for each member.
export const FailureType = BoundaryErrorCode;
export type FailureTypeLiteral = z.infer<typeof FailureType>;

// Declared user-visible outcome text per §2.1.5. Consumers that cannot import
// this table (e.g. non-TS contexts) should fall back to the error code itself.
export const FAILURE_USER_TEXT: Record<FailureTypeLiteral, string> = {
  INGRESS_CONTRACT_VIOLATION:
    'We could not process that request. Please try again.',
  EGRESS_CONTRACT_VIOLATION:
    'We generated a response but it failed validation. Please try again.',
  FEATURE_NOT_ENABLED:
    'This feature is not enabled in your environment.',
  TURN_BUDGET_EXCEEDED:
    'That took longer than we allow for a single turn. Please retry.',
  UPSTREAM_TIMEOUT:
    'An upstream service did not respond in time. Please retry.',
  UPSTREAM_UNAVAILABLE:
    'An upstream service is temporarily unavailable.',
  LLM_UNAVAILABLE:
    'The model is temporarily unavailable. Please retry shortly.',
  INTERNAL_ERROR:
    'Something went wrong on our side. Please retry.',
  GRAPH_DIVERGED:
    'Your canvas is out of sync with the saved model. Reload to see the latest before continuing.',
};

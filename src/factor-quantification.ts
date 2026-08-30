import { z } from 'zod';
import type { KnownObservedStateSourceLiteral } from './graph.js';

/** Model reasoning is an explanation, NEVER evidence authority or a citation. */
export const FactorReasoningSchema = z.object({
  rationale: z.string().min(1).describe('Why Olumi estimated this quantity or could not estimate it. This is model reasoning, not evidence.'),
  context_basis: z.array(z.string().min(1)).describe('IDs of supplied context items used in the reasoning. The producer must validate these IDs; naming one does not establish evidence authority.'),
}).strict();
export type FactorReasoning = z.infer<typeof FactorReasoningSchema>;

/**
 * Existing CEE vocabulary, now declared at the shared boundary. In particular,
 * the legacy name inferred_with_evidence does NOT establish that evidence exists.
 * Only fallback_default is used by the selection helper below. No value is
 * classified by numeric equality. An absent tier means no tier declaration;
 * source attribution is independent and is preserved.
 */
export const FactorValueTierSchema = z.enum(['explicit', 'inferred_with_evidence', 'fallback_default']);
export type FactorValueTier = z.infer<typeof FactorValueTierSchema>;

/**
 * Unknown without a numeric claim. Numeric support is deliberately undeclared
 * and rejected, rather than fabricated from the absence of a value. Old flagged
 * numeric priors remain expressible in PriorSchema's numeric arm, and select as
 * fallback support, never as this nonnumeric unknown arm.
 */
export const UnquantifiedPriorSchema = z.object({
  prior_is_unquantified: z.literal(true),
  source: z.string().optional().describe('Who recorded the unknown. Absence means unattributed, not an Olumi or user claim.'),
  reasoning: FactorReasoningSchema.optional().describe('Optional model explanation of the unresolved gap. Absence means no model reasoning was recorded; this is never evidence authority.'),
}).strict();
export type UnquantifiedPrior = z.infer<typeof UnquantifiedPriorSchema>;

/**
 * Pure selection of the supplied quantity, NOT permission to compute or recommend.
 * protected means an estimator must not replace the existing quantity. Source is
 * passed through verbatim; null means unattributed and is never guessed.
 */
export interface FactorQuantitySelection {
  kind: 'point' | 'distribution' | 'unknown' | 'fallback' | 'ambiguous' | 'missing';
  carrier: 'observed_state' | 'prior' | null;
  protected: boolean;
  source: string | null;
}

// Compile-time total over the existing source vocabulary; no second wire enum.
// Unknown strings remain neutral/protected, rather than being called AI input.
const SOURCE_ORIGIN = {
  brief_extraction: 'supplied', explicit: 'supplied',
  cee_inference: 'model', inferred: 'model', cee_repair: 'model',
  user_override: 'supplied', user_confirmed: 'supplied', user: 'supplied',
  user_edited: 'supplied', user_calibration: 'supplied', user_assumption: 'supplied',
  panel_elicited: 'supplied',
} as const satisfies Record<KnownObservedStateSourceLiteral, 'supplied' | 'model'>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function sourceOf(quantity: Record<string, unknown> | undefined): string | null {
  return typeof quantity?.source === 'string' ? quantity.source : null;
}

function originOf(quantity: Record<string, unknown> | undefined): 'supplied' | 'model' | undefined {
  const source = sourceOf(quantity);
  return source !== null && Object.prototype.hasOwnProperty.call(SOURCE_ORIGIN, source)
    ? SOURCE_ORIGIN[source as KnownObservedStateSourceLiteral] : undefined;
}

function isSystemQuantity(quantity: Record<string, unknown> | undefined): boolean {
  return sourceOf(quantity) === null || originOf(quantity) === 'model';
}

function isSystemResidue(prior: Record<string, unknown> | undefined): boolean {
  return prior !== undefined && isSystemQuantity(prior)
    && (prior.prior_is_unquantified === true || prior.value_tier === 'fallback_default');
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function selected(kind: FactorQuantitySelection['kind'], carrier: FactorQuantitySelection['carrier'],
  quantity: Record<string, unknown> | undefined, protect: boolean): FactorQuantitySelection {
  return { kind, carrier, protected: protect, source: sourceOf(quantity) };
}

export function selectFactorQuantity(node: unknown): FactorQuantitySelection {
  const modelNode = record(node);
  const observed = record(modelNode?.observed_state);
  const prior = record(modelNode?.prior);
  const point = finite(observed?.value);
  const hasPointClaim = observed !== undefined && Object.prototype.hasOwnProperty.call(observed, 'value');
  const distribution = prior !== undefined && typeof prior.distribution === 'string'
    && finite(prior.range_min) && finite(prior.range_max) && prior.range_min < prior.range_max;
  const pointFallback = point && observed?.value_tier === 'fallback_default' && originOf(observed) !== 'supplied';
  const priorResidue = isSystemResidue(prior);
  const priorFallback = prior !== undefined
    && (prior.prior_is_unquantified === true || prior.value_tier === 'fallback_default');
  const unknown = prior !== undefined && UnquantifiedPriorSchema.safeParse(prior).success;

  // A verified user/brief point supersedes only SYSTEM residue. A real prior
  // beside a point is not silently subordinated, even when both are numeric.
  if (point && originOf(observed) === 'supplied' && (!prior || priorResidue)) {
    return selected('point', 'observed_state', observed, true);
  }
  if (point && !pointFallback && prior) return selected('ambiguous', null, undefined, true);
  if (point && !pointFallback) return selected('point', 'observed_state', observed, true);
  if (distribution && !priorFallback) {
    if (hasPointClaim && !pointFallback) return selected('ambiguous', null, undefined, true);
    return selected('distribution', 'prior', prior, true);
  }
  // Malformed supplied data is not a licence to overwrite it. Source-bearing
  // contradictory markers are likewise left for an explicit correction.
  if (hasPointClaim && !pointFallback) return selected('ambiguous', null, undefined, true);
  if (pointFallback) return selected('fallback', 'observed_state', observed, !isSystemQuantity(observed));
  if (unknown) return selected('unknown', 'prior', prior, !isSystemQuantity(prior));
  if (distribution && priorFallback) return selected('fallback', 'prior', prior, !isSystemQuantity(prior));
  if (prior) return selected('ambiguous', null, undefined, true);
  return selected('missing', null, undefined, false);
}

/**
 * Call ONLY after an accepted user mutation has stamped its source. This helper
 * cannot authorise that mutation. It clears stale model qualifiers on that point
 * and system-created unknown/fallback prior only; it never deletes a genuine
 * supplied prior or changes any number. Input objects are never mutated.
 */
export function clearSupersededFactorMarkers<T extends Record<string, unknown>>(node: T): T {
  const observed = record(node.observed_state);
  if (!finite(observed?.value) || originOf(observed) !== 'supplied') return node;
  const nextObserved = { ...observed };
  delete nextObserved.value_tier;
  delete nextObserved.reasoning;
  const next = { ...node, observed_state: nextObserved };
  if (isSystemResidue(record(node.prior))) delete next.prior;
  return next as T;
}

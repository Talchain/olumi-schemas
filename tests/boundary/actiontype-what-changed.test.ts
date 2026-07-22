/**
 * F2 CHANGE B (0.21.0 candidate) — `what_changed` joins ActionType.
 *
 * The typed door for the "What changed?" pill. Today that pill is a
 * device-local canvas diff that never reaches CEE; F2 CHANGE B routes it as a
 * typed `chip.action_type='what_changed'` chip_click so CEE narrates the real
 * two-run RunDelta (deterministic ground truth) through the coach. The wire
 * enum needs the value first — a consumer on an older pin silently drops an
 * unknown `action_type` (schema-skew hazard), and CEE's ingress validates the
 * chip fail-closed, so without this literal the pill 422s.
 *
 * Name parity (the whole point — one name end-to-end): the literal MUST equal
 * CEE's existing intent value `'what_changed'`
 * (`classifyAnalyticalIntent`/`run-comparison-gate.ts`). If these ever drift,
 * the typed pill and the free-text path answer to two different names.
 *
 * Mutation-check property (why this file bites on revert): the enum
 * membership + parse assertions and the wire-shape ingress parse all go RED if
 * `what_changed` is removed from `ActionType`.
 */

import { describe, it, expect } from 'vitest';
import {
  ActionType,
  ActionSchema,
  OrchestratorTurnPayloadSchema,
} from '../../src/boundary/index.js';

describe('ActionType what_changed (F2 CHANGE B — 0.21.0 candidate)', () => {
  it('the enum includes what_changed and parses it (additive; unknowns still rejected)', () => {
    expect(ActionType.options).toContain('what_changed');
    expect(ActionType.parse('what_changed')).toBe('what_changed');
    // Additive-only: none of the pre-existing values is disturbed.
    expect(ActionType.options).toContain('analysis_readiness');
    expect(ActionType.options).toContain('what_would_flip');
    // Near-miss and empty are still rejected (the door is exact).
    expect(ActionType.safeParse('what_change').success).toBe(false);
    expect(ActionType.safeParse('whatchanged').success).toBe(false);
    expect(ActionType.safeParse('compare_runs').success).toBe(false);
    expect(ActionType.safeParse('').success).toBe(false);
  });

  it('chip.action_type accepts what_changed on the turn-payload ingress (the fail-closed seam)', () => {
    // The exact wire shape CEE validates fail-closed on ingress — the reason
    // the "What changed?" pill could not reach CEE until this value existed.
    const payload = {
      kind: 'message' as const,
      turn_id: '33333333-3333-4333-8333-333333333333',
      scenario_id: '44444444-4444-4444-8444-444444444444',
      stage: 'analyse' as const,
      message: 'What changed since the last run?',
      turn_class: 'review' as const,
      source: 'chip_click' as const,
      chip: { action_type: 'what_changed' as const },
    };
    const r = OrchestratorTurnPayloadSchema.parse(payload);
    expect(r).toEqual(payload);
  });

  it('ActionSchema.action_type accepts what_changed (suggested-action linkage)', () => {
    expect(
      ActionSchema.safeParse({
        id: 'chip_what_changed',
        label: 'What changed?',
        message: 'What changed since the last run?',
        action_type: 'what_changed',
      }).success,
    ).toBe(true);
  });
});

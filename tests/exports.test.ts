// Verifies the v0.11.0 exports surface as consumers actually receive it.
// Imports from the built dist (root + boundary subpath) — not from src — to
// catch drift between source and the published package.json `exports` field.
//
// This file requires `pnpm build` to have run before `pnpm test`. The package
// `prepublishOnly` hook enforces this for npm publish; CI must run build
// before test for this assertion to hold.
import { describe, it, expect } from 'vitest';

import * as rootDist from '../dist/index.js';
import * as boundaryDist from '../dist/boundary/index.js';

describe('package exports — root entry (dist/index.js)', () => {
  it('exposes coaching schemas', () => {
    expect(rootDist.CoachingSchema).toBeDefined();
    expect(rootDist.BiasType).toBeDefined();
    expect(rootDist.BiasSignalSchema).toBeDefined();
    expect(rootDist.WideningLogSchema).toBeDefined();
    expect(rootDist.StrengthenItemSchema).toBeDefined();
    expect(rootDist.StrengthenItemActionType).toBeDefined();
    expect(rootDist.BriefCompleteness).toBeDefined();
  });

  it('exposes causal-claims schemas', () => {
    expect(rootDist.CausalClaimSchema).toBeDefined();
    expect(rootDist.CausalClaimsArraySchema).toBeDefined();
    expect(rootDist.StrengthBand).toBeDefined();
    expect(rootDist.DirectEffectClaimSchema).toBeDefined();
    expect(rootDist.MediationOnlyClaimSchema).toBeDefined();
    expect(rootDist.NoDirectEffectClaimSchema).toBeDefined();
    expect(rootDist.UnmeasuredConfounderClaimSchema).toBeDefined();
  });

  it('exposes TopologyPlanSchema', () => {
    expect(rootDist.TopologyPlanSchema).toBeDefined();
  });

  it('the exported CoachingSchema validates a fully-populated coaching object', () => {
    const parsed = rootDist.CoachingSchema.parse({
      summary: 'x',
      strengthen_items: [],
      widening_log: {
        elements_added: [],
        elements_considered_but_excluded: [],
        brief_completeness: 'thin',
      },
      bias_signals: [],
    });
    expect(parsed.summary).toBe('x');
  });
});

describe('package exports — boundary subpath (dist/boundary/index.js)', () => {
  it('exposes coaching schemas at the boundary entry', () => {
    expect(boundaryDist.CoachingSchema).toBeDefined();
    expect(boundaryDist.BiasType).toBeDefined();
    expect(boundaryDist.WideningLogSchema).toBeDefined();
    expect(boundaryDist.StrengthenItemSchema).toBeDefined();
  });

  it('exposes causal-claims schemas at the boundary entry', () => {
    expect(boundaryDist.CausalClaimSchema).toBeDefined();
    expect(boundaryDist.CausalClaimsArraySchema).toBeDefined();
    expect(boundaryDist.StrengthBand).toBeDefined();
  });

  it('exposes TopologyPlanSchema at the boundary entry', () => {
    expect(boundaryDist.TopologyPlanSchema).toBeDefined();
  });

  it('boundary subpath CoachingSchema is the same Zod schema instance as root', () => {
    // Both paths re-export from the same coaching.js module — referential
    // identity confirms there is no accidental divergence (e.g. a duplicate
    // schema with the same name but different shape).
    expect(boundaryDist.CoachingSchema).toBe(rootDist.CoachingSchema);
    expect(boundaryDist.CausalClaimSchema).toBe(rootDist.CausalClaimSchema);
    expect(boundaryDist.BiasType).toBe(rootDist.BiasType);
    expect(boundaryDist.StrengthBand).toBe(rootDist.StrengthBand);
    expect(boundaryDist.TopologyPlanSchema).toBe(rootDist.TopologyPlanSchema);
  });
});

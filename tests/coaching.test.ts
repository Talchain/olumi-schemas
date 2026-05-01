import { describe, it, expect } from 'vitest';
import {
  BiasType,
  BiasSignalSchema,
  BriefCompleteness,
  WideningLogSchema,
  StrengthenItemActionType,
  StrengthenItemSchema,
  CoachingSchema,
  StrengthBand,
  CausalClaimSchema,
  CausalClaimsArraySchema,
  TopologyPlanSchema,
} from '../src/index.js';
import type {
  BiasTypeT,
  BiasSignal,
  WideningLog,
  StrengthenItem,
  Coaching,
  StrengthBandT,
  CausalClaim,
  CausalClaimsArray,
  TopologyPlan,
} from '../src/index.js';

describe('BiasType', () => {
  it('accepts the four canonical bias values', () => {
    for (const v of ['anchoring', 'narrow_framing', 'status_quo_bias', 'overconfidence']) {
      expect(BiasType.parse(v)).toBe(v);
    }
  });

  it('rejects legacy / off-enum bias strings (CEE-side normaliser converts them upstream)', () => {
    for (const v of ['framing', 'confidence', 'blindspots', 'unknown', '']) {
      expect(() => BiasType.parse(v)).toThrow();
    }
  });

  it('infers as a string-literal union', () => {
    const t: BiasTypeT = 'anchoring';
    expect(t).toBe('anchoring');
  });
});

describe('BiasSignalSchema', () => {
  it('parses a populated bias signal', () => {
    const sig: BiasSignal = BiasSignalSchema.parse({
      type: 'anchoring',
      detail: 'Your projection anchors on 50M with no rationale.',
    });
    expect(sig.type).toBe('anchoring');
  });

  it('rejects extra fields (.strict)', () => {
    expect(() =>
      BiasSignalSchema.parse({ type: 'anchoring', detail: 'x', extra: 'y' }),
    ).toThrow();
  });

  it('rejects an off-enum type', () => {
    expect(() => BiasSignalSchema.parse({ type: 'framing', detail: 'x' })).toThrow();
  });
});

describe('WideningLogSchema', () => {
  it('parses a fully populated widening log', () => {
    const log: WideningLog = WideningLogSchema.parse({
      elements_added: ['fac_alpha', 'fac_beta'],
      elements_considered_but_excluded: ['Regulatory pause unlikely in this horizon'],
      brief_completeness: 'partial',
    });
    expect(log.brief_completeness).toBe('partial');
    expect(log.elements_added).toHaveLength(2);
  });

  it('parses with empty arrays', () => {
    const log = WideningLogSchema.parse({
      elements_added: [],
      elements_considered_but_excluded: [],
      brief_completeness: 'thin',
    });
    expect(log.elements_added).toEqual([]);
  });

  it('rejects an unknown brief_completeness value', () => {
    expect(() =>
      WideningLogSchema.parse({
        elements_added: [],
        elements_considered_but_excluded: [],
        brief_completeness: 'mostly_complete',
      }),
    ).toThrow();
  });

  it('BriefCompleteness enum exposes the three valid values', () => {
    for (const v of ['complete', 'partial', 'thin']) {
      expect(BriefCompleteness.parse(v)).toBe(v);
    }
    expect(() => BriefCompleteness.parse('rich')).toThrow();
  });
});

describe('StrengthenItemSchema', () => {
  const baseItem = {
    id: 'strengthen_001',
    label: 'Stress synergy estimate',
    detail: 'Synergy figure is a point estimate; recast as a 10-30M range.',
    action_type: 'add_constraint' as const,
  };

  it('parses an item without bias_category', () => {
    const item: StrengthenItem = StrengthenItemSchema.parse(baseItem);
    expect(item.bias_category).toBeUndefined();
  });

  it('parses an item with valid bias_category', () => {
    const item = StrengthenItemSchema.parse({ ...baseItem, bias_category: 'anchoring' });
    expect(item.bias_category).toBe('anchoring');
  });

  it('rejects an invalid action_type', () => {
    expect(() =>
      StrengthenItemSchema.parse({ ...baseItem, action_type: 'add_factor' }),
    ).toThrow();
  });

  it('rejects an off-enum bias_category', () => {
    expect(() =>
      StrengthenItemSchema.parse({ ...baseItem, bias_category: 'framing' }),
    ).toThrow();
  });

  it('StrengthenItemActionType enum exposes the four valid values', () => {
    for (const v of ['add_option', 'add_constraint', 'add_risk', 'reframe_goal']) {
      expect(StrengthenItemActionType.parse(v)).toBe(v);
    }
  });
});

describe('CoachingSchema', () => {
  it('parses a minimal coaching object (no widening_log / bias_signals)', () => {
    const c: Coaching = CoachingSchema.parse({
      summary: 'Acquisition undervalues integration risk.',
      strengthen_items: [],
    });
    expect(c.summary).toMatch(/Acquisition/);
    expect(c.widening_log).toBeUndefined();
    expect(c.bias_signals).toBeUndefined();
  });

  it('parses a fully populated coaching object', () => {
    const c = CoachingSchema.parse({
      summary: 'Tension between speed (acquisition) and caution (partnership).',
      strengthen_items: [
        {
          id: 'strengthen_001',
          label: 'Add downside risk',
          detail: 'Add explicit churn-risk node to expose synergy fragility.',
          action_type: 'add_risk',
          bias_category: 'overconfidence',
        },
      ],
      widening_log: {
        elements_added: ['risk_churn'],
        elements_considered_but_excluded: ['No FX exposure in horizon'],
        brief_completeness: 'partial',
      },
      bias_signals: [
        { type: 'narrow_framing', detail: 'Brief frames decision as binary acquire/skip.' },
      ],
    });
    expect(c.strengthen_items).toHaveLength(1);
    expect(c.bias_signals?.[0].type).toBe('narrow_framing');
  });

  it('rejects extra top-level fields (.strict)', () => {
    expect(() =>
      CoachingSchema.parse({
        summary: 'x',
        strengthen_items: [],
        unexpected: 'field',
      }),
    ).toThrow();
  });

  it('rejects when summary is missing', () => {
    expect(() => CoachingSchema.parse({ strengthen_items: [] })).toThrow();
  });
});

describe('StrengthBand', () => {
  it('accepts the four canonical strength bands', () => {
    for (const v of ['very_strong', 'strong', 'moderate', 'slight']) {
      expect(StrengthBand.parse(v)).toBe(v);
    }
  });

  it('rejects the legacy 3-band "weak" value', () => {
    expect(() => StrengthBand.parse('weak')).toThrow();
  });

  it('infers as a string-literal union', () => {
    const t: StrengthBandT = 'very_strong';
    expect(t).toBe('very_strong');
  });
});

describe('CausalClaimSchema (discriminated union)', () => {
  it('parses a direct_effect claim with stated_strength', () => {
    const claim: CausalClaim = CausalClaimSchema.parse({
      type: 'direct_effect',
      from: 'fac_acquisition',
      to: 'out_acquisition',
      stated_strength: 'strong',
    });
    expect(claim.type).toBe('direct_effect');
  });

  it('parses a mediation_only claim', () => {
    const claim = CausalClaimSchema.parse({
      type: 'mediation_only',
      from: 'fac_competition',
      via: 'risk_churn',
      to: 'goal_midmarket',
    });
    expect(claim.type).toBe('mediation_only');
  });

  it('parses a no_direct_effect claim', () => {
    const claim = CausalClaimSchema.parse({
      type: 'no_direct_effect',
      from: 'fac_partnership',
      to: 'risk_runway',
    });
    expect(claim.type).toBe('no_direct_effect');
  });

  it('parses an unmeasured_confounder claim with a 2-tuple', () => {
    const claim = CausalClaimSchema.parse({
      type: 'unmeasured_confounder',
      between: ['fac_a', 'fac_b'],
    });
    if (claim.type !== 'unmeasured_confounder') throw new Error('bad discriminator');
    expect(claim.between).toEqual(['fac_a', 'fac_b']);
  });

  it('rejects unmeasured_confounder with a non-2 tuple', () => {
    expect(() =>
      CausalClaimSchema.parse({ type: 'unmeasured_confounder', between: ['only_one'] }),
    ).toThrow();
    expect(() =>
      CausalClaimSchema.parse({
        type: 'unmeasured_confounder',
        between: ['a', 'b', 'c'],
      }),
    ).toThrow();
  });

  it('rejects unmeasured_confounder.stated_source (dropped from contract per Task 0(b))', () => {
    expect(() =>
      CausalClaimSchema.parse({
        type: 'unmeasured_confounder',
        between: ['fac_a', 'fac_b'],
        stated_source: 'shared_demand',
      }),
    ).toThrow();
  });

  it('rejects direct_effect with the legacy "weak" stated_strength', () => {
    expect(() =>
      CausalClaimSchema.parse({
        type: 'direct_effect',
        from: 'fac_a',
        to: 'fac_b',
        stated_strength: 'weak',
      }),
    ).toThrow();
  });

  it('rejects an unknown claim type', () => {
    expect(() =>
      CausalClaimSchema.parse({ type: 'feedback_loop', from: 'a', to: 'b' }),
    ).toThrow();
  });

  it('rejects extra fields on direct_effect (.strict)', () => {
    expect(() =>
      CausalClaimSchema.parse({
        type: 'direct_effect',
        from: 'fac_a',
        to: 'fac_b',
        stated_strength: 'strong',
        confidence: 0.9,
      }),
    ).toThrow();
  });

  it('rejects empty node ID strings', () => {
    expect(() =>
      CausalClaimSchema.parse({
        type: 'direct_effect',
        from: '',
        to: 'fac_b',
        stated_strength: 'strong',
      }),
    ).toThrow();
  });
});

describe('CausalClaimsArraySchema', () => {
  it('parses an empty array (cardinality enforcement is CEE-side)', () => {
    const arr: CausalClaimsArray = CausalClaimsArraySchema.parse([]);
    expect(arr).toHaveLength(0);
  });

  it('parses a heterogenous array of all four claim types', () => {
    const arr = CausalClaimsArraySchema.parse([
      { type: 'direct_effect', from: 'a', to: 'b', stated_strength: 'moderate' },
      { type: 'mediation_only', from: 'a', via: 'm', to: 'b' },
      { type: 'no_direct_effect', from: 'a', to: 'b' },
      { type: 'unmeasured_confounder', between: ['a', 'b'] },
    ]);
    expect(arr).toHaveLength(4);
  });

  it('rejects when one element is malformed', () => {
    expect(() =>
      CausalClaimsArraySchema.parse([
        { type: 'direct_effect', from: 'a', to: 'b', stated_strength: 'strong' },
        { type: 'direct_effect', from: 'a', to: 'b', stated_strength: 'weak' },
      ]),
    ).toThrow();
  });
});

describe('TopologyPlanSchema', () => {
  it('parses an empty topology plan', () => {
    const tp: TopologyPlan = TopologyPlanSchema.parse([]);
    expect(tp).toEqual([]);
  });

  it('parses a populated topology plan preserving order', () => {
    const lines = [
      'opt_acquire sets {fac_acquisition=1}',
      'fac_acquisition → out_acquisition',
      'out_acquisition → goal_midmarket',
    ];
    const tp = TopologyPlanSchema.parse(lines);
    expect(tp).toEqual(lines);
  });

  it('rejects non-string entries', () => {
    expect(() => TopologyPlanSchema.parse(['line', 42, 'line2'])).toThrow();
  });

  it('rejects a non-array root', () => {
    expect(() => TopologyPlanSchema.parse('not an array')).toThrow();
  });
});

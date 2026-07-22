// ============================================================================
// 0.22.0 (ROADMAP 1.181) — Group-A compute-seam response surfaces.
//
// Authored + reviewed against A3's byte-verified dossier
// (acceptance-evidence/.../1181-review-dossier/DOSSIER.md). This suite runs the
// dossier §3 accept/reject checklist. The optimise ACCEPT cases are the EXACT
// post-fix wire captures (optimise-postfix-resp{A,B}.json, deployed build
// 51abbc8 == the typed-from source SHA) inlined byte-for-byte — proving the
// schema accepts real deployed wire, and that the killed utility bands (a
// pre-fix capture had them) are structurally refused.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  SequentialAnalysisResponseSchema,
  CounterfactualResponseSchema,
  OptimiseResponseSchema,
  OptimiseUtilitySchema,
} from '../../src/boundary/group-a.js';

// ---------------------------------------------------------------------------
// SEQUENTIAL
// ---------------------------------------------------------------------------
function seqValid(): Record<string, unknown> {
  return {
    optimal_policy: {
      stages: [{
        stage_index: 0,
        stage_label: 'Decide',
        decision_rule: { default_action: 'go' },
      }],
      expected_total_value: 126.06,
      value_distribution: { type: 'normal', parameters: { mean: 126.06, std: 12.3 } },
    },
    stage_analyses: [{
      stage_index: 0,
      stage_label: 'Decide',
      options_at_stage: [{
        option_id: 'o1', label: 'O1',
        immediate_value: 10, continuation_value: 20, total_value: 30,
      }],
      information_value: 0,
    }],
    value_of_flexibility: 0,
    sensitivity_to_timing: 'high',
  };
}

describe('Sequential — accept (dossier §3)', () => {
  it('accepts the base valid response (schema_version absent, _metadata absent)', () => {
    expect(SequentialAnalysisResponseSchema.safeParse(seqValid()).success).toBe(true);
  });

  it('accepts EMPTY options_at_stage on chance/terminal stages (no .min(1))', () => {
    const v = seqValid();
    (v.stage_analyses as Record<string, unknown>[])[0].options_at_stage = [];
    expect(SequentialAnalysisResponseSchema.safeParse(v).success).toBe(true);
  });

  it('accepts optimal_waiting_value as null AND as absent', () => {
    const nullCase = seqValid();
    (nullCase.stage_analyses as Record<string, unknown>[])[0].optimal_waiting_value = null;
    expect(SequentialAnalysisResponseSchema.safeParse(nullCase).success).toBe(true);
    expect(SequentialAnalysisResponseSchema.safeParse(seqValid()).success).toBe(true); // absent
  });

  it("accepts sensitivity_to_timing: 'medium' (valid-but-unwitnessed enum member)", () => {
    const v = seqValid();
    v.sensitivity_to_timing = 'medium';
    expect(SequentialAnalysisResponseSchema.safeParse(v).success).toBe(true);
  });

  it('accepts _metadata present-full, null, and absent (all three)', () => {
    const meta = {
      isl_version: '1.0.0', config_fingerprint: 'cb0a', config_details: { a: 1 }, request_id: 'r',
    };
    const full = { ...seqValid(), _metadata: meta };
    const nul = { ...seqValid(), _metadata: null };
    expect(SequentialAnalysisResponseSchema.safeParse(full).success).toBe(true);
    expect(SequentialAnalysisResponseSchema.safeParse(nul).success).toBe(true);
    expect(SequentialAnalysisResponseSchema.safeParse(seqValid()).success).toBe(true);
  });

  it('passthrough — an unknown top-level key survives', () => {
    const v = { ...seqValid(), FIXTURE_unknown: true };
    const r = SequentialAnalysisResponseSchema.safeParse(v);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).FIXTURE_unknown).toBe(true);
  });
});

describe('Sequential — reject (dossier §3)', () => {
  it('rejects stage_index: -1 (minimum 0)', () => {
    const v = seqValid();
    (v.stage_analyses as Record<string, unknown>[])[0].stage_index = -1;
    expect(SequentialAnalysisResponseSchema.safeParse(v).success).toBe(false);
  });

  it("rejects sensitivity_to_timing: 'sideways' (enum)", () => {
    const v = seqValid();
    v.sensitivity_to_timing = 'sideways';
    expect(SequentialAnalysisResponseSchema.safeParse(v).success).toBe(false);
  });

  it("rejects value_of_flexibility: '0' (type — number not string)", () => {
    const v = seqValid();
    v.value_of_flexibility = '0';
    expect(SequentialAnalysisResponseSchema.safeParse(v).success).toBe(false);
  });

  it('rejects a missing optimal_policy (required)', () => {
    const v = seqValid();
    delete v.optimal_policy;
    expect(SequentialAnalysisResponseSchema.safeParse(v).success).toBe(false);
  });

  it('rejects a StageOption missing total_value (required)', () => {
    const v = seqValid();
    const opt = (v.stage_analyses as Record<string, unknown>[])[0].options_at_stage as Record<string, unknown>[];
    delete opt[0].total_value;
    expect(SequentialAnalysisResponseSchema.safeParse(v).success).toBe(false);
  });

  it('rejects optimal_policy.expected_total_value null AND wrong-type (required number)', () => {
    // `expected_total_value` is a required `z.number()` — the headline value of
    // the whole policy. A `null` or a stringified number must be refused, never
    // coerced: a missing/malformed total is a producer failure, not a value.
    const nul = seqValid();
    (nul.optimal_policy as Record<string, unknown>).expected_total_value = null;
    const str = seqValid();
    (str.optimal_policy as Record<string, unknown>).expected_total_value = '126.06';
    expect(SequentialAnalysisResponseSchema.safeParse(nul).success).toBe(false);
    expect(SequentialAnalysisResponseSchema.safeParse(str).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// COUNTERFACTUAL
// ---------------------------------------------------------------------------
function cfValid(): Record<string, unknown> {
  return {
    scenario: { intervention: { X: 5 }, outcome: 'Y' },
    prediction: {
      point_estimate: 9.9,
      confidence_interval: { lower: -9.9, upper: 29.8 },
      sensitivity_range: { optimistic: 29.8, pessimistic: -9.9, explanation: 'e' },
    },
    uncertainty: {
      overall: 'high',
      sources: [{ factor: 'U', impact: 1, confidence: 'low', explanation: 'e', basis: 'b' }],
    },
    robustness: {
      score: 'moderate',
      critical_assumptions: [{ assumption: 'a', impact: 1, confidence: 'medium', recommendation: 'r' }],
    },
    explanation: { summary: 's', reasoning: 'r', technical_basis: 't', assumptions: ['a'] },
  };
}

describe('Counterfactual — accept (dossier §3)', () => {
  it('accepts the base valid response (context/confidence_level/_metadata absent)', () => {
    expect(CounterfactualResponseSchema.safeParse(cfValid()).success).toBe(true);
  });

  it('accepts scenario.context as null, as {k:number}, and absent', () => {
    const nul = cfValid();
    (nul.scenario as Record<string, unknown>).context = null;
    const map = cfValid();
    (map.scenario as Record<string, unknown>).context = { u_b: 20 };
    expect(CounterfactualResponseSchema.safeParse(nul).success).toBe(true);
    expect(CounterfactualResponseSchema.safeParse(map).success).toBe(true);
    expect(CounterfactualResponseSchema.safeParse(cfValid()).success).toBe(true);
  });

  it('accepts a DEGENERATE CI {lower:68, upper:68} with point_estimate 68 (correct abduction)', () => {
    const v = cfValid();
    (v.prediction as Record<string, unknown>).point_estimate = 68;
    (v.prediction as Record<string, unknown>).confidence_interval = { lower: 68, upper: 68 };
    (v.prediction as Record<string, unknown>).sensitivity_range = {
      optimistic: 68, pessimistic: 68, explanation: 'pinned',
    };
    expect(CounterfactualResponseSchema.safeParse(v).success).toBe(true);
  });

  it('DOCTRINE PIN — accepts a CI where lower > upper (NO ordering refinement, by design)', () => {
    // ⚠⚠ DELIBERATE: this schema carries NO `lower < upper` (nor
    // optimistic/pessimistic ordering) refinement. The no-ordering-refinement
    // doctrine (dossier §2) exists to protect the CORRECT degenerate-CI case
    // above under full context, where the interval collapses and any ordering
    // constraint would be arbitrary. A future "helpful" refinement that starts
    // rejecting lower > upper MUST consciously break THIS test — it is the pin
    // that makes that a deliberate doctrine change, not an unnoticed tightening.
    const v = cfValid();
    (v.prediction as Record<string, unknown>).confidence_interval = { lower: 30, upper: 10 };
    expect(CounterfactualResponseSchema.safeParse(v).success).toBe(true);
    const s = cfValid();
    (s.prediction as Record<string, unknown>).sensitivity_range = {
      optimistic: 5, pessimistic: 50, explanation: 'inverted, still accepted',
    };
    expect(CounterfactualResponseSchema.safeParse(s).success).toBe(true);
  });

  it("accepts unwitnessed enum members: overall 'medium', confidence 'high', score 'robust'", () => {
    const v = cfValid();
    (v.uncertainty as Record<string, unknown>).overall = 'medium';
    ((v.uncertainty as Record<string, unknown>).sources as Record<string, unknown>[])[0].confidence = 'high';
    (v.robustness as Record<string, unknown>).score = 'robust';
    expect(CounterfactualResponseSchema.safeParse(v).success).toBe(true);
  });

  it('accepts explanation display fields absent, null, and present', () => {
    const present = cfValid();
    (present.explanation as Record<string, unknown>).simple_explanation = 'simple';
    (present.explanation as Record<string, unknown>).learn_more_url = 'https://x.invalid';
    (present.explanation as Record<string, unknown>).visual_type = 'uncertainty_plot';
    const nul = cfValid();
    (nul.explanation as Record<string, unknown>).simple_explanation = null;
    expect(CounterfactualResponseSchema.safeParse(present).success).toBe(true);
    expect(CounterfactualResponseSchema.safeParse(nul).success).toBe(true);
    expect(CounterfactualResponseSchema.safeParse(cfValid()).success).toBe(true);
  });
});

describe('Counterfactual — reject (dossier §3)', () => {
  it("rejects uncertainty.overall 'extreme' / robustness.score 'brittle' / confidence 'certain' (enums)", () => {
    const a = cfValid(); (a.uncertainty as Record<string, unknown>).overall = 'extreme';
    const b = cfValid(); (b.robustness as Record<string, unknown>).score = 'brittle';
    const c = cfValid();
    ((c.uncertainty as Record<string, unknown>).sources as Record<string, unknown>[])[0].confidence = 'certain';
    expect(CounterfactualResponseSchema.safeParse(a).success).toBe(false);
    expect(CounterfactualResponseSchema.safeParse(b).success).toBe(false);
    expect(CounterfactualResponseSchema.safeParse(c).success).toBe(false);
  });

  it("rejects point_estimate: '9.9' (type)", () => {
    const v = cfValid();
    (v.prediction as Record<string, unknown>).point_estimate = '9.9';
    expect(CounterfactualResponseSchema.safeParse(v).success).toBe(false);
  });

  it('rejects a missing prediction / missing scenario (required)', () => {
    const noPred = cfValid(); delete noPred.prediction;
    const noScen = cfValid(); delete noScen.scenario;
    expect(CounterfactualResponseSchema.safeParse(noPred).success).toBe(false);
    expect(CounterfactualResponseSchema.safeParse(noScen).success).toBe(false);
  });

  it('rejects prediction with point_estimate deleted (required — the headline number)', () => {
    // point_estimate is the prediction's headline value; it is required, not
    // optional. A prediction object present but MISSING its point estimate is a
    // producer failure and must be refused, never read as an absent value.
    const v = cfValid();
    delete (v.prediction as Record<string, unknown>).point_estimate;
    expect(CounterfactualResponseSchema.safeParse(v).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OPTIMISE (SCM-lite /v1/optimise @ 51abbc80) — the POST-FIX wire captures
// ---------------------------------------------------------------------------
// Byte-for-byte from 1181-review-dossier/captures/optimise-postfix-resp{A,B}.json.
const POSTFIX_RESP_A = {
  schema: 'optimise.v1',
  method: 'greedy_independent_v1',
  action_semantics: 'edge_weight_scaling',
  selected: ['aY'],
  utility: { expected: 6 },
  explanations: [{ action_id: 'aY', marginal_gain: 4 }],
  meta: {
    seed: 4242,
    solver: 'greedy_kernel_v1',
    constraints_applied: [],
    constraints_resolved: { budget: { value: 2, source: 'top_level' } },
  },
};
const POSTFIX_RESP_B = {
  schema: 'optimise.v1',
  method: 'greedy_independent_v1',
  action_semantics: 'edge_weight_scaling',
  selected: ['aY', 'aX'],
  utility: { expected: 8 },
  explanations: [
    { action_id: 'aY', marginal_gain: 4 },
    { action_id: 'aX', marginal_gain: 2 },
  ],
  meta: {
    seed: 4242,
    solver: 'greedy_kernel_v1',
    constraints_applied: [],
    constraints_resolved: { budget: { value: 4, source: 'top_level' } },
  },
};

describe('Optimise — accept the POST-FIX deployed wire captures (build 51abbc8)', () => {
  it('accepts optimise-postfix-respA (budget 2 → aY/6)', () => {
    const r = OptimiseResponseSchema.safeParse(POSTFIX_RESP_A);
    if (!r.success) throw new Error(`respA failed: ${r.error.message}`);
    expect(r.data.utility.expected).toBe(6);
    expect(r.data.method).toBe('greedy_independent_v1');
    expect(r.data.action_semantics).toBe('edge_weight_scaling');
  });

  it('accepts optimise-postfix-respB (budget 4 → aY,aX/8)', () => {
    expect(OptimiseResponseSchema.safeParse(POSTFIX_RESP_B).success).toBe(true);
  });

  it('accepts empty selected / explanations / constraints_applied', () => {
    const v = {
      ...POSTFIX_RESP_A,
      selected: [],
      explanations: [],
      meta: { ...POSTFIX_RESP_A.meta, constraints_applied: [] },
    };
    expect(OptimiseResponseSchema.safeParse(v).success).toBe(true);
  });

  it("accepts a non-budget constraints_resolved entry {source:'user'} (source-proven shape)", () => {
    const v = {
      ...POSTFIX_RESP_A,
      meta: {
        ...POSTFIX_RESP_A.meta,
        constraints_applied: ['cost_cap'],
        constraints_resolved: {
          budget: { value: 2, source: 'top_level' },
          cost_cap: { source: 'user' },
        },
      },
    };
    expect(OptimiseResponseSchema.safeParse(v).success).toBe(true);
  });

  it('passthrough — an unknown key on the envelope survives', () => {
    const r = OptimiseResponseSchema.safeParse({ ...POSTFIX_RESP_A, FIXTURE_extra: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).FIXTURE_extra).toBe(1);
  });
});

describe('Optimise — reject (dossier §3 + the killed-bands honesty guarantee)', () => {
  it("rejects utility.expected as a string '6' (type)", () => {
    const v = { ...POSTFIX_RESP_A, utility: { expected: '6' } };
    expect(OptimiseResponseSchema.safeParse(v).success).toBe(false);
  });

  it('rejects a missing / numeric method (the disclosure marker is structurally required)', () => {
    const missing = { ...POSTFIX_RESP_A } as Record<string, unknown>;
    delete missing.method;
    const numeric = { ...POSTFIX_RESP_A, method: 42 };
    expect(OptimiseResponseSchema.safeParse(missing).success).toBe(false);
    expect(OptimiseResponseSchema.safeParse(numeric).success).toBe(false);
  });

  it('rejects a missing action_semantics (disclosure marker required)', () => {
    const missing = { ...POSTFIX_RESP_A } as Record<string, unknown>;
    delete missing.action_semantics;
    expect(OptimiseResponseSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects an EMPTY method '' (a present-but-empty marker discloses nothing — .min(1))", () => {
    // An empty honesty marker satisfies "field present" while disclosing
    // nothing — exactly the dead-marker class the schema exists to refuse.
    // Reverting the `.min(1)` on `method` turns this RED.
    const v = { ...POSTFIX_RESP_A, method: '' };
    expect(OptimiseResponseSchema.safeParse(v).success).toBe(false);
  });

  it("rejects an EMPTY action_semantics '' (present-but-empty marker — .min(1))", () => {
    // Reverting the `.min(1)` on `action_semantics` turns this RED.
    const v = { ...POSTFIX_RESP_A, action_semantics: '' };
    expect(OptimiseResponseSchema.safeParse(v).success).toBe(false);
  });

  it('rejects explanations[].marginal_gain as a string (type)', () => {
    const v = { ...POSTFIX_RESP_A, explanations: [{ action_id: 'aY', marginal_gain: 'lots' }] };
    expect(OptimiseResponseSchema.safeParse(v).success).toBe(false);
  });

  it('STRUCTURALLY REFUSES a re-introduced utility band (the deliberate .strict() honesty guard)', () => {
    // The killed p10/p50/p90 bands must never ride again. utility is STRICT
    // (a conscious deviation from the repo passthrough convention) so a band
    // FAILS validation rather than silently passing through.
    expect(OptimiseUtilitySchema.safeParse({ expected: 6, p50: 6 }).success).toBe(false);
    const withBand = { ...POSTFIX_RESP_A, utility: { expected: 6, p10: 5.4, p50: 6, p90: 6.6 } };
    expect(OptimiseResponseSchema.safeParse(withBand).success).toBe(false);
  });
});

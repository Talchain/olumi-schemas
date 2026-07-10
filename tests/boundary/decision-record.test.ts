/**
 * DecisionRecordSchema (0.15.0) — ROADMAP 3.1, "Minimal decision record now".
 *
 * Standalone export, NOT wired into OlumiResponse. Types the wire/API
 * surface for the prediction→outcome capture loop that backs the future
 * Brier-calibration pass (ROADMAP 3.2).
 *
 * Coverage:
 *   - valid happy-path fixture (no outcome yet — the common in-flight shape)
 *   - valid fixture WITH outcome recorded
 *   - required-field rejection at each level (top, decision, prediction)
 *   - analysis_summary is fully optional-forward (all sub-fields optional)
 *   - outcome is optional at the top level; required sub-fields once present
 *   - confidence / win_probability bounds (0–1)
 *   - outcome.result enum exhaustiveness
 *   - strict-mode rejection of unknown fields at every level
 */
import { describe, it, expect } from 'vitest';
import {
  DecisionRecordSchema,
  DecisionRecordDecisionSchema,
  DecisionRecordAnalysisSummarySchema,
  DecisionRecordPredictionSchema,
  DecisionRecordOutcomeSchema,
  DecisionRecordOutcomeResult,
} from '../../src/boundary/decision-record.js';

const SCENARIO_ID = '22222222-2222-4222-8222-222222222222';

const MINIMAL_RECORD = {
  record_id: 'dr_9b1e2c3a7f4d',
  scenario_id: SCENARIO_ID,
  created_at: '2026-07-10T09:00:00Z',
  decision: {
    chosen_option_id: 'opt_launch_now',
    chosen_option_label: 'Launch now',
    graph_hash: 'gh_abc123',
  },
  prediction: {
    statement: 'Launching now will grow qualified pipeline by 15% within a quarter.',
  },
  review_date: '2026-10-10T09:00:00Z',
};

describe('DecisionRecordSchema', () => {
  it('accepts a minimal valid record (no analysis_summary, no outcome yet)', () => {
    expect(DecisionRecordSchema.parse(MINIMAL_RECORD)).toEqual(MINIMAL_RECORD);
  });

  it('accepts a record with a full analysis_summary', () => {
    const record = {
      ...MINIMAL_RECORD,
      decision: {
        ...MINIMAL_RECORD.decision,
        analysis_summary: {
          leading_option: 'Launch now',
          win_probability: 0.62,
          goal_fit: 0.81,
          robustness_band: 'medium',
        },
      },
    };
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
  });

  it('accepts a record with prediction.confidence', () => {
    const record = { ...MINIMAL_RECORD, prediction: { ...MINIMAL_RECORD.prediction, confidence: 0.7 } };
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
  });

  it('accepts a record with a recorded outcome', () => {
    const record = {
      ...MINIMAL_RECORD,
      outcome: {
        recorded_at: '2026-10-12T09:00:00Z',
        result: 'as_expected' as const,
        notes: 'Pipeline grew 14% — within the predicted band.',
        brier_component: 0.04,
      },
    };
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
  });

  it('accepts an outcome without optional notes/brier_component', () => {
    const record = {
      ...MINIMAL_RECORD,
      outcome: { recorded_at: '2026-10-12T09:00:00Z', result: 'worse' as const },
    };
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
  });

  it('rejects a missing record_id', () => {
    const { record_id: _r, ...rest } = MINIMAL_RECORD;
    expect(DecisionRecordSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-UUID scenario_id', () => {
    expect(
      DecisionRecordSchema.safeParse({ ...MINIMAL_RECORD, scenario_id: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('rejects a missing decision', () => {
    const { decision: _d, ...rest } = MINIMAL_RECORD;
    expect(DecisionRecordSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a decision missing graph_hash', () => {
    const { graph_hash: _g, ...decisionRest } = MINIMAL_RECORD.decision;
    expect(
      DecisionRecordSchema.safeParse({ ...MINIMAL_RECORD, decision: decisionRest }).success,
    ).toBe(false);
  });

  it('rejects a missing prediction', () => {
    const { prediction: _p, ...rest } = MINIMAL_RECORD;
    expect(DecisionRecordSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty prediction statement', () => {
    expect(
      DecisionRecordSchema.safeParse({
        ...MINIMAL_RECORD,
        prediction: { statement: '' },
      }).success,
    ).toBe(false);
  });

  it('rejects prediction.confidence out of [0,1] bounds', () => {
    expect(
      DecisionRecordSchema.safeParse({
        ...MINIMAL_RECORD,
        prediction: { ...MINIMAL_RECORD.prediction, confidence: 1.5 },
      }).success,
    ).toBe(false);
  });

  it('rejects a missing review_date', () => {
    const { review_date: _rd, ...rest } = MINIMAL_RECORD;
    expect(DecisionRecordSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects win_probability out of [0,1] bounds in analysis_summary', () => {
    const record = {
      ...MINIMAL_RECORD,
      decision: {
        ...MINIMAL_RECORD.decision,
        analysis_summary: { win_probability: 1.2 },
      },
    };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects an outcome missing result', () => {
    const record = {
      ...MINIMAL_RECORD,
      outcome: { recorded_at: '2026-10-12T09:00:00Z' },
    };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects an invented outcome.result', () => {
    const record = {
      ...MINIMAL_RECORD,
      outcome: { recorded_at: '2026-10-12T09:00:00Z', result: 'amazing' },
    };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects a negative brier_component', () => {
    const record = {
      ...MINIMAL_RECORD,
      outcome: { recorded_at: '2026-10-12T09:00:00Z', result: 'worse' as const, brier_component: -0.1 },
    };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects unknown fields at the top level (strict)', () => {
    expect(DecisionRecordSchema.safeParse({ ...MINIMAL_RECORD, extra: 'x' }).success).toBe(false);
  });

  it('rejects unknown fields on decision (strict)', () => {
    const record = { ...MINIMAL_RECORD, decision: { ...MINIMAL_RECORD.decision, extra: 'x' } };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects unknown fields on prediction (strict)', () => {
    const record = { ...MINIMAL_RECORD, prediction: { ...MINIMAL_RECORD.prediction, extra: 'x' } };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects unknown fields on outcome (strict)', () => {
    const record = {
      ...MINIMAL_RECORD,
      outcome: { recorded_at: '2026-10-12T09:00:00Z', result: 'worse' as const, extra: 'x' },
    };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects unknown fields on analysis_summary (strict)', () => {
    const record = {
      ...MINIMAL_RECORD,
      decision: { ...MINIMAL_RECORD.decision, analysis_summary: { extra: 'x' } },
    };
    expect(DecisionRecordSchema.safeParse(record).success).toBe(false);
  });
});

describe('DecisionRecordOutcomeResult', () => {
  it('has exactly the four outcome results', () => {
    expect([...DecisionRecordOutcomeResult.options].sort()).toEqual(
      ['abandoned', 'as_expected', 'better', 'worse'].sort(),
    );
  });
});

describe('component schemas — standalone import', () => {
  it('DecisionRecordDecisionSchema validates standalone', () => {
    expect(DecisionRecordDecisionSchema.parse(MINIMAL_RECORD.decision)).toEqual(
      MINIMAL_RECORD.decision,
    );
  });

  it('DecisionRecordAnalysisSummarySchema accepts an empty object (all optional)', () => {
    expect(DecisionRecordAnalysisSummarySchema.parse({})).toEqual({});
  });

  it('DecisionRecordPredictionSchema validates standalone', () => {
    expect(DecisionRecordPredictionSchema.parse(MINIMAL_RECORD.prediction)).toEqual(
      MINIMAL_RECORD.prediction,
    );
  });

  it('DecisionRecordOutcomeSchema validates standalone', () => {
    const outcome = { recorded_at: '2026-10-12T09:00:00Z', result: 'better' as const };
    expect(DecisionRecordOutcomeSchema.parse(outcome)).toEqual(outcome);
  });
});

// ============================================================================
// 0.22.0 (S2 + decision ②/⑥) turn-payload additions:
//   * `Intent` vocabulary (decision ①, a parallel set — NOT a wider ActionType)
//   * first-class `chip.id` + typed `chip.intent` on the message-turn chip
//   * batched `direct_graph_edit` (additive fields; singular kept required)
//   * typed `feedback` system event (Paul ruled WIRE)
//
// Each accept proves the new member parses on a real-shaped payload; each
// reject discriminates — it is RED unless the schema actually carries the
// constraint (an enum, a required field, a strict shape). Reverting the
// corresponding source edit turns the paired reject RED.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  Intent,
  ActionType,
  SystemEventKind,
} from '../../src/boundary/enums.js';
import {
  MessageTurnPayloadSchema,
  SystemEventSchema,
  OrchestratorTurnPayloadSchema,
  FeedbackRating,
  FeedbackTargetKind,
} from '../../src/boundary/turn-payload.js';

const TURN = '11111111-1111-4111-8111-111111111111';
const SCEN = '22222222-2222-4222-8222-222222222222';

function messageBase() {
  return {
    turn_id: TURN,
    scenario_id: SCEN,
    stage: 'analyse' as const,
    kind: 'message' as const,
    message: 'hello',
    turn_class: 'propose' as const,
  };
}

describe('Intent vocabulary (decision ① — parallel set, not a wider ActionType)', () => {
  const EXPECTED = [
    'elicit_options',
    'add_option',
    'challenge_frame',
    'challenge_assumption',
    'outside_view',
    'pre_mortem',
    'elicit_risks',
    'estimate_help',
    'mitigation_help',
    'define_success',
    'discuss',
  ];

  it('carries exactly the design §2.1 members', () => {
    expect([...Intent.options].sort()).toStrictEqual([...EXPECTED].sort());
  });

  it('is DECOUPLED from ActionType — coaching intents are NOT ActionType members', () => {
    // The whole point of decision ①: these three were authored-but-invalid
    // against ActionType and silently stripped. They live in Intent, not here.
    for (const v of ['add_option', 'challenge_assumption', 'discuss']) {
      expect(ActionType.safeParse(v).success).toBe(false);
      expect(Intent.safeParse(v).success).toBe(true);
    }
  });

  it('rejects an unknown intent (fail closed, not an open string)', () => {
    expect(Intent.safeParse('framework_request').success).toBe(false); // reserved headroom, not yet a member
    expect(Intent.safeParse('nonsense').success).toBe(false);
  });
});

describe('message-turn chip — first-class id + typed intent', () => {
  it('accepts a chip carrying id + intent + action_type + parameters', () => {
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      source: 'chip',
      chip: {
        id: 'chip_1',
        action_type: 'run_analysis',
        intent: 'pre_mortem',
        parameters: { factor_id: 'f1' },
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.chip?.id).toBe('chip_1');
      expect(r.data.chip?.intent).toBe('pre_mortem');
    }
  });

  it('rejects an unknown intent on the chip (enum, not open string)', () => {
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      source: 'chip',
      chip: { intent: 'not_a_real_intent' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty chip.id (min(1))', () => {
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      source: 'chip',
      chip: { id: '' },
    });
    expect(r.success).toBe(false);
  });

  it('still rejects an unknown key on the strict chip', () => {
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      source: 'chip',
      chip: { id: 'c', spark_id: 'smuggled' },
    });
    expect(r.success).toBe(false);
  });
});

describe('batched direct_graph_edit (decision ② — additive, singular kept required)', () => {
  it('accepts the batch alongside the representative singular pair', () => {
    const r = SystemEventSchema.safeParse({
      kind: 'direct_graph_edit',
      target_id: 'f1',
      operation: 'set_factor_value',
      changed_node_ids: ['f1', 'o1'],
      changed_edge_ids: ['e1'],
      operations: ['set_factor_value', 'adjust_edge_strength'],
      fields_changed: ['value', 'strength'],
      summary: 'two nodes, one edge',
    });
    expect(r.success).toBe(true);
  });

  it('still accepts the legacy singular-only shape (back-compat)', () => {
    const r = SystemEventSchema.safeParse({
      kind: 'direct_graph_edit',
      target_id: 'f1',
      operation: 'set_factor_value',
    });
    expect(r.success).toBe(true);
  });

  it('STILL REQUIRES the singular pair — a batch without target_id is refused', () => {
    // "keep singular required for back-compat" — an older consumer requires
    // target_id/operation, so a new producer must keep sending them.
    const r = SystemEventSchema.safeParse({
      kind: 'direct_graph_edit',
      changed_node_ids: ['f1'],
      operations: ['set_factor_value'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty id inside a batch array (min(1) element)', () => {
    const r = SystemEventSchema.safeParse({
      kind: 'direct_graph_edit',
      target_id: 'f1',
      operation: 'set_factor_value',
      changed_node_ids: [''],
    });
    expect(r.success).toBe(false);
  });
});

describe('typed feedback event (decision ⑥ — WIRE)', () => {
  it('is a member of the SystemEventKind parity list', () => {
    expect(SystemEventKind.safeParse('feedback').success).toBe(true);
  });

  it('accepts a thumbs rating with comment + target, wrapped in a system_event turn', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      turn_id: TURN,
      scenario_id: SCEN,
      stage: 'review',
      kind: 'system_event',
      event: {
        kind: 'feedback',
        rating: 'down',
        comment: 'not useful',
        target: { id: TURN, kind: 'turn' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts feedback with no comment (comment optional)', () => {
    const r = SystemEventSchema.safeParse({
      kind: 'feedback',
      rating: 'up',
      target: { id: 'block_1', kind: 'block' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a rating outside up|down', () => {
    expect(FeedbackRating.safeParse('meh').success).toBe(false);
    const r = SystemEventSchema.safeParse({
      kind: 'feedback',
      rating: 'meh',
      target: { id: 't', kind: 'turn' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects feedback with no target (a rating with no referent is not actionable)', () => {
    const r = SystemEventSchema.safeParse({ kind: 'feedback', rating: 'up' });
    expect(r.success).toBe(false);
  });

  it('rejects a target kind outside the closed vocabulary', () => {
    expect(FeedbackTargetKind.safeParse('galaxy').success).toBe(false);
    const r = SystemEventSchema.safeParse({
      kind: 'feedback',
      rating: 'up',
      target: { id: 't', kind: 'galaxy' },
    });
    expect(r.success).toBe(false);
  });

  it('the union discriminates feedback from every other kind', () => {
    const kinds = (SystemEventSchema.options as z.ZodDiscriminatedUnionOption<'kind'>[])
      .map((o) => (o.shape.kind as z.ZodLiteral<string>).value);
    expect(kinds).toContain('feedback');
  });
});

describe('SystemEventKind ↔ SystemEventSchema parity (trap-12: fail loud on drift)', () => {
  // The `SystemEventKind` enum in enums.ts is a HAND-MAINTAINED MIRROR of the
  // `kind` literals in the SystemEventSchema union — exactly the drift-prone
  // pattern trap-12 warns about (a list a human must remember to sync WILL
  // drift, and the drift reads as green). This one-line set-equality test makes
  // the mirror FAIL LOUD: add a union member without its enum entry (or vice
  // versa) and this goes RED at the next run instead of silently diverging.
  it('SystemEventKind.options == the set of union members\' kind literals', () => {
    const unionKinds = (SystemEventSchema.options as z.ZodDiscriminatedUnionOption<'kind'>[])
      .map((o) => (o.shape.kind as z.ZodLiteral<string>).value);
    expect([...SystemEventKind.options].sort()).toStrictEqual([...unionKinds].sort());
  });
});

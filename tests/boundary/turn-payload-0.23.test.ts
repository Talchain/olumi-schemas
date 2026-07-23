// ============================================================================
// 0.23.0 turn-payload addition: `graph_state?: GraphV3` on the message turn
// (A2 guest-template train, ROADMAP 1.188 / A1-DECISIONS D-24).
//
// The additive contract this batch must guarantee:
//   1. a message turn WITH a full inbound GraphV3 parses (composition);
//   2. a message turn WITHOUT `graph_state` parses UNCHANGED (fail-safe — the
//      strict shape does not newly require it);
//   3. `graph_state` composes with the other optional message fields (chip /
//      selected_elements) and through the discriminated-union wrapper;
//   4. `.strict()` still rejects an UNKNOWN top-level key (the field add did not
//      relax strictness);
//   5. a malformed graph is rejected (the field is really typed as GraphV3, not
//      an escape hatch) — this reject is RED unless `graph_state` is present and
//      typed, so reverting the source edit fails it.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  MessageTurnPayloadSchema,
  OrchestratorTurnPayloadSchema,
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
    source: 'composer' as const,
  };
}

// A minimal-but-valid GraphV3: one factor node + one goal node + one edge.
function validGraph() {
  return {
    nodes: [
      { id: 'fac_demand', kind: 'factor' as const, label: 'Demand' },
      { id: 'goal_rev', kind: 'goal' as const, label: 'Revenue', goal_threshold: 100 },
    ],
    edges: [
      {
        from: 'fac_demand',
        to: 'goal_rev',
        strength: { mean: 0.4, std: 0.2 },
        exists_probability: 0.9,
      },
    ],
  };
}

describe('0.23.0 — graph_state on MessageTurnPayloadSchema', () => {
  it('accepts a message turn carrying a full inbound GraphV3 (composition)', () => {
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      graph_state: validGraph(),
    });
    expect(r.success).toBe(true);
  });

  it('accepts a message turn WITHOUT graph_state (fail-safe — not newly required)', () => {
    const r = MessageTurnPayloadSchema.safeParse(messageBase());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.graph_state).toBeUndefined();
  });

  it('composes with the other optional message fields (selected_elements + graph_state)', () => {
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      selected_elements: [{ id: 'fac_demand', kind: 'factor' }],
      graph_state: validGraph(),
    });
    expect(r.success).toBe(true);
  });

  it('parses through the discriminated-union wrapper on a message kind', () => {
    const r = OrchestratorTurnPayloadSchema.safeParse({
      ...messageBase(),
      graph_state: validGraph(),
    });
    expect(r.success).toBe(true);
  });

  it('still rejects an unknown top-level key (the add did not relax .strict())', () => {
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      graph_state: validGraph(),
      not_a_field: true,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a malformed graph_state (really typed as GraphV3 — discriminating)', () => {
    // Missing `edges` and a node missing its required `label`/`kind`.
    const r = MessageTurnPayloadSchema.safeParse({
      ...messageBase(),
      graph_state: { nodes: [{ id: 'x' }] },
    });
    expect(r.success).toBe(false);
  });
});

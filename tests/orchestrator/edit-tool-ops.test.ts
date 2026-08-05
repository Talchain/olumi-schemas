/**
 * Coach structural-edit tool — op batch contract. ROADMAP 2.474, amendments A1/A3/A5/A6.
 *
 * A1 (BINDING): the tool emits the CANONICAL `PatchOperation[]` vocabulary and
 * enters the existing `handleEditGraph` -> `evaluateEditGraphMutations` -> commit
 * train. It does NOT mint a second producer vocabulary and it does NOT emit
 * referee envelopes directly — that would create a second referee<->applier
 * agreement surface, which is 2.380's parity defect built on purpose.
 *
 * So the shape here is `{ op, path, value, old_value? }` with the same six op
 * kinds CEE's `PatchOperationSchema` validates
 * (`src/orchestrator/patch-validation.ts:23-30,:139-153` @ ac62fd4d). The tool
 * schema is deliberately NARROWER, never wider: an `EditToolOperation` is
 * assignable to a `ValidatedPatchOperation`, and the narrowing is the classed
 * field table (A6) — validate-before-propose, reject-don't-repair.
 *
 * A5c dual identity binding: an op that names an EXISTING entity carries a
 * label echo in the envelope's `target_bindings`, so the executor can catch
 * wrong-id-right-shape before the gate (trap 19: bind by identity, never by a
 * value predicate another object could satisfy).
 */
import { describe, it, expect } from 'vitest';

import {
  EDIT_TOOL_OP_KINDS,
  EditToolOperationSchema,
  EditToolOpBatchSchema,
  EDIT_TOOL_OPS_REFERENCING_EXISTING_ENTITY,
  countEnvelopeFanOut,
} from '../../src/orchestrator/edit-tool-ops.js';

const HASH = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const BATCH_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function batch(overrides: Record<string, unknown> = {}) {
  return {
    batch_id: BATCH_ID,
    base_graph_hash: HASH,
    operations: [
      { op: 'update_node', path: 'fac_revenue', value: { label: 'FIXTURE_Revenue' } },
    ],
    target_bindings: [
      { op_index: 0, target_id: 'fac_revenue', target_label: 'FIXTURE_Revenue' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. A1 — vocabulary alignment with CEE's PatchOperationSchema
// ---------------------------------------------------------------------------

describe('edit-tool ops — A1 canonical PatchOperation alignment', () => {
  it('the op-kind vocabulary IS CEE PatchOperationSchema\'s, exactly', () => {
    // Re-typed from patch-validation.ts:23-30 @ ac62fd4d — the corpus half.
    // A NEW kind minted here (a panel op landing in the graph union by mistake)
    // REDs, which is what makes the extension point deliberate rather than
    // accidental.
    expect([...EDIT_TOOL_OP_KINDS]).toEqual([
      'add_node', 'remove_node', 'update_node', 'add_edge', 'remove_edge', 'update_edge',
    ]);
  });

  it('an accepted op has exactly the PatchOperation key set — no parallel vocabulary', () => {
    const parsed = EditToolOperationSchema.parse({
      op: 'update_node',
      path: 'fac_revenue',
      value: { label: 'FIXTURE_Revenue' },
    });
    expect(Object.keys(parsed).sort()).toEqual(['op', 'path', 'value']);
  });

  it('`old_value` is REJECTED — an LLM-authored "was" value is a fabricated number in a receipt', () => {
    // The producer fills the receipt's "was" half from old_value
    // (edit-graph-producer.ts:104,:135). A5b's argument for hashes applies
    // identically: the model never echoes state the server already holds.
    const res = EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue',
      value: { label: 'FIXTURE_New' }, old_value: { label: 'FIXTURE_Invented' },
    });
    expect(res.success).toBe(false);
  });

  it('`value` on a remove op is REJECTED — the producer never reads it', () => {
    expect(EditToolOperationSchema.safeParse({
      op: 'remove_node', path: 'fac_revenue', value: { anything: true },
    }).success).toBe(false);
    expect(EditToolOperationSchema.safeParse({ op: 'remove_node', path: 'fac_revenue' }).success).toBe(true);
  });

  it('panel ops are NOT in this union yet — the extension point is documented, not pre-opened', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'update_panel_section', path: 'framing', value: { collapsed: true },
    });
    expect(res.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. CLOSURE — unknown op kinds and unknown keys REJECT (.strict())
// ---------------------------------------------------------------------------

describe('edit-tool ops — closure', () => {
  it('an unknown op kind is REJECTED', () => {
    expect(EditToolOperationSchema.safeParse({ op: 'obliterate_graph', path: 'x', value: {} }).success).toBe(false);
  });

  it('an unknown KEY on an op is REJECTED (strict, not stripped)', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'remove_node', path: 'fac_revenue', reason: 'because',
    });
    expect(res.success).toBe(false);
  });

  it('an unknown KEY on the batch envelope is REJECTED', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({ auto_apply: true })).success).toBe(false);
  });

  it('a missing base_graph_hash is REJECTED — the stale gate is non-optional', () => {
    const b = batch();
    delete (b as Record<string, unknown>).base_graph_hash;
    expect(EditToolOpBatchSchema.safeParse(b).success).toBe(false);
  });

  it('an empty base_graph_hash is REJECTED (absent/null/empty are all forbidden)', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({ base_graph_hash: '' })).success).toBe(false);
  });

  it('an empty operations array is REJECTED', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({ operations: [], target_bindings: [] })).success).toBe(false);
  });

  it('a non-uuid batch_id is REJECTED', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({ batch_id: 'batch-1' })).success).toBe(false);
  });

  it('the happy path parses', () => {
    expect(EditToolOpBatchSchema.safeParse(batch()).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. A6 — the classed table is LOAD-BEARING in the contract, not documentation
// ---------------------------------------------------------------------------

describe('edit-tool ops — update values are screened by the classed field table', () => {
  it('a GENUINE GRANT is accepted (state_space — the first new grant)', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue', value: { state_space: { range: { min: 0, max: 1 } } },
    });
    expect(res.success).toBe(true);
  });

  it('the new observed_state.std grant is accepted', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue', value: { 'observed_state.std': 0.2 },
    });
    expect(res.success).toBe(true);
  });

  it('a PROVENANCE-OWNED field is REJECTED — permanently, by design', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue', value: { 'observed_state.source': 'user' },
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.success ? {} : res.error.issues)).toMatch(/provenance/i);
  });

  it('extractiontype is REJECTED in every producer spelling the pipeline emits', () => {
    for (const spelling of ['extractiontype', 'extractionType']) {
      const res = EditToolOperationSchema.safeParse({
        op: 'update_node', path: 'fac_revenue', value: { [spelling]: 'explicit' },
      });
      expect(res.success, `spelling '${spelling}' was accepted`).toBe(false);
    }
  });

  it('an INVARIANT-COUPLED field is REJECTED as a raw grant, with its own reason', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'goal_profit', value: { goal_threshold_raw: 500000 },
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.success ? {} : res.error.issues)).toMatch(/invariant/i);
  });

  it('a field absent from the table entirely is REJECTED (closed, not open)', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue', value: { sensitivity_score: 0.9 },
    });
    expect(res.success).toBe(false);
  });

  it('the edge label grant is accepted; an edge provenance stamp is not', () => {
    expect(EditToolOperationSchema.safeParse({
      op: 'update_edge', path: 'fac_a::fac_b', value: { label: 'FIXTURE_drives' },
    }).success).toBe(true);
    expect(EditToolOperationSchema.safeParse({
      op: 'update_edge', path: 'fac_a::fac_b', value: { weightSource: 'user' },
    }).success).toBe(false);
  });

  it('a DEFERRED field is rejected — and with its OWN reason, not the generic "no row"', () => {
    // Orchestrator ruling on J3: edge `confidence` is not granted on low
    // confidence that it means anything. It HAS a row, so telling the model it
    // has none would be a false reason, and a model given the wrong reason
    // retries the wrong way.
    const res = EditToolOperationSchema.safeParse({
      op: 'update_edge', path: 'fac_a::fac_b', value: { confidence: 0.8 },
    });
    expect(res.success).toBe(false);
    const issues = JSON.stringify(res.success ? {} : res.error.issues);
    expect(issues).toMatch(/deferred/i);
    expect(issues, 'a field WITH a row was told it has none').not.toMatch(/no row/i);
  });

  it('identity fields are never updatable (node id/kind, edge from/to)', () => {
    expect(EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue', value: { id: 'fac_other' },
    }).success).toBe(false);
    expect(EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue', value: { kind: 'goal' },
    }).success).toBe(false);
    expect(EditToolOperationSchema.safeParse({
      op: 'update_edge', path: 'fac_a::fac_b', value: { from: 'fac_c' },
    }).success).toBe(false);
  });

  it('an ADD value is screened too — the referee hole this closes', () => {
    // checkFieldSafety screens only update_node_field/update_edge_field, and
    // add_node projects to just {id,kind,label} (edit-graph-producer.ts:76-83).
    // So every other key on an add_node value reaches the applier UNSCREENED —
    // a provenance stamp could ride in on a NEW node and never meet the guard.
    const smuggled = EditToolOperationSchema.safeParse({
      op: 'add_node',
      path: 'fac_new',
      value: {
        id: 'fac_new', kind: 'factor', label: 'FIXTURE_New',
        'observed_state.source': 'user',
      },
    });
    expect(smuggled.success, 'a provenance stamp rode in on an add_node value').toBe(false);

    const legitimate = EditToolOperationSchema.safeParse({
      op: 'add_node',
      path: 'fac_new',
      value: {
        id: 'fac_new', kind: 'factor', label: 'FIXTURE_New',
        description: 'FIXTURE_desc', category: 'controllable',
      },
    });
    expect(legitimate.success).toBe(true);
  });

  it('the LIVE option-configure spelling is ACCEPTED — a screen that revokes it is worse than none', () => {
    // `data/interventions/<factor_id>` is what the producer actually emits for
    // an option-configure edit, carrying InterventionV3's own payload. Bound by
    // the exact wire string, not by a shape another path could satisfy.
    expect(EditToolOperationSchema.safeParse({
      op: 'update_node',
      path: 'opt_raise_price',
      value: {
        'data/interventions/fac_marketing_spend': {
          value: 0.5, raw_value: 25000, unit: 'GBP', cap: 50000, source: 'user_specified',
        },
      },
    }).success, 'the live option-configure edit was rejected').toBe(true);

    expect(EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'opt_raise_price',
      value: { 'observed_state.interventions.fac_marketing_spend': 0.5 },
    }).success).toBe(true);

    // Everything below `interventions` is a FACTOR ID, not vocabulary — a factor
    // that happens to be called `cap` is not an invariant-coupled field.
    expect(EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'opt_raise_price',
      value: { 'data/interventions/cap': 0.5 },
    }).success, 'a factor id collided with a vocabulary token').toBe(true);
  });

  it('NESTED provenance in an add value is REJECTED — a top-level scan is not a screen', () => {
    // Measured before the recursive screen existed: this exact payload was
    // ACCEPTED, and nothing downstream catches adds (checkFieldSafety screens
    // only the update kinds, and add_node projects to {id,kind,label}).
    const res = EditToolOperationSchema.safeParse({
      op: 'add_node', path: 'fac_x',
      value: { id: 'fac_x', kind: 'factor', label: 'FIXTURE_X', observed_state: { value: 1, source: 'user' } },
    });
    expect(res.success, 'a provenance stamp rode in NESTED on a new node').toBe(false);
    expect(JSON.stringify(res.success ? {} : res.error.issues)).toMatch(/provenance_owned/);
  });

  it('NESTED raw_value and a deeply-buried extractiontype are REJECTED', () => {
    expect(EditToolOperationSchema.safeParse({
      op: 'add_node', path: 'fac_x',
      value: { id: 'fac_x', kind: 'factor', label: 'FIXTURE_X', observed_state: { value: 1, raw_value: 25000 } },
    }).success, 'nested raw_value was accepted').toBe(false);

    expect(EditToolOperationSchema.safeParse({
      op: 'add_node', path: 'fac_x',
      value: { id: 'fac_x', kind: 'factor', label: 'FIXTURE_X', meta: { deep: { extractionType: 'explicit' } } },
    }).success, 'a stamp buried two levels down was accepted').toBe(false);
  });

  it('POSITIVE CONTROL: the recursive screen does NOT over-reach into the interventions payload', () => {
    // InterventionV3 declares its OWN `source` (cee-v3.ts:284 — an enum of
    // brief_extraction | cee_hypothesis | user_specified, meaning how the
    // INTERVENTION was determined). That is a different field from node
    // observed_state.source wearing the same name, and CEE exempts it. Without
    // this control, a screen that rejected everything named `source` would look
    // perfectly correct while killing the option-configure path.
    expect(EditToolOperationSchema.safeParse({
      op: 'add_node', path: 'opt_x',
      value: {
        id: 'opt_x', kind: 'option', label: 'FIXTURE_Opt',
        interventions: { fac_spend: { value: 0.5, raw_value: 25000, cap: 50000, source: 'user_specified' } },
      },
    }).success, 'the screen over-reached into InterventionV3 contract keys').toBe(true);

    // ...and a clean add is still clean.
    expect(EditToolOperationSchema.safeParse({
      op: 'add_node', path: 'fac_x',
      value: { id: 'fac_x', kind: 'factor', label: 'FIXTURE_X', observed_state: { value: 1, unit: 'GBP' } },
    }).success).toBe(true);
  });

  it('POSITIVE CONTROL: a NESTED `observed_state.interventions` payload parses — the SECONDARY live spelling', () => {
    // ⚠ THIS TEST EXISTS BECAUSE THE PREVIOUS CONTROL DID NOT REACH THE CODE IT
    // WAS MEANT TO PIN. The control above puts `interventions` at the TOP LEVEL
    // of the add value, where `screenAddValue`'s own skip catches it — so the
    // recursive walker's inner `insideInterventions` branch was never exercised
    // by any test, and deleting it left the suite GREEN while flipping THIS
    // payload from ACCEPTED to REJECTED. A future tidy-up of a branch with no
    // coverage would have silently revoked the secondary live spelling: the
    // exact defect class this whole change set exists to close, one level down.
    //
    // `observed_state.interventions.<factor_id>` is live on the update path
    // (see REAL_LIVE_WIRE_SPELLINGS); this is the same subtree arriving as an
    // add payload, carrying InterventionV3's contract keys — including its own
    // `source` (cee-v3.ts:284), which is NOT node provenance.
    const res = EditToolOperationSchema.safeParse({
      op: 'add_node',
      path: 'opt_raise_price',
      value: {
        id: 'opt_raise_price', kind: 'option', label: 'FIXTURE_Opt',
        observed_state: {
          value: 1,
          interventions: {
            fac_marketing_spend: {
              value: 0.5, raw_value: 25000, unit: 'GBP', cap: 50000, source: 'user_specified',
            },
          },
        },
      },
    });
    expect(
      res.success,
      'the nested interventions subtree was screened as node vocabulary — the secondary live spelling is revoked',
    ).toBe(true);
  });

  it('the nested exclusion is SCOPED — a stamp beside the nested interventions map is still caught', () => {
    // The exclusion must tunnel through `interventions` ONLY. A sibling key on
    // the same observed_state is still node vocabulary and must still reject,
    // or the fix for the tunnel would open a hole beside it.
    expect(EditToolOperationSchema.safeParse({
      op: 'add_node',
      path: 'opt_x',
      value: {
        id: 'opt_x', kind: 'option', label: 'FIXTURE_Opt',
        observed_state: {
          value: 1,
          source: 'user',
          interventions: { fac_spend: { value: 0.5, source: 'user_specified' } },
        },
      },
    }).success, 'a node provenance stamp rode in beside a legitimate interventions map').toBe(false);
  });

  it('an add_edge value is screened past its structural keys', () => {
    const base = {
      from: 'fac_a', to: 'fac_b',
      strength: { mean: 0.5, std: 0.1 },
      exists_probability: 0.9,
      effect_direction: 'positive' as const,
    };
    expect(EditToolOperationSchema.safeParse({
      op: 'add_edge', path: 'fac_a::fac_b', value: base,
    }).success).toBe(true);
    expect(EditToolOperationSchema.safeParse({
      op: 'add_edge', path: 'fac_a::fac_b', value: { ...base, weightSource: 'user' },
    }).success).toBe(false);
  });

  it('an empty update value is REJECTED (a no-op op is a clarify, not an edit)', () => {
    expect(EditToolOperationSchema.safeParse({
      op: 'update_node', path: 'fac_revenue', value: {},
    }).success).toBe(false);
  });

  it('ONE denied key poisons the whole op — no partial acceptance', () => {
    const res = EditToolOperationSchema.safeParse({
      op: 'update_node',
      path: 'fac_revenue',
      value: { label: 'FIXTURE_ok', 'observed_state.source': 'user' },
    });
    expect(res.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. A5c — dual identity binding
// ---------------------------------------------------------------------------

describe('edit-tool ops — A5c dual identity binding', () => {
  it('the ops that reference an existing entity are exactly the four non-add kinds', () => {
    expect([...EDIT_TOOL_OPS_REFERENCING_EXISTING_ENTITY].sort()).toEqual(
      ['remove_edge', 'remove_node', 'update_edge', 'update_node'],
    );
  });

  it('an existing-entity op with NO binding is REJECTED', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({ target_bindings: [] })).success).toBe(false);
  });

  it('an add_node needs no binding (its id does not exist yet)', () => {
    const res = EditToolOpBatchSchema.safeParse(batch({
      operations: [{
        op: 'add_node',
        path: 'fac_new',
        value: { id: 'fac_new', kind: 'factor', label: 'FIXTURE_New' },
      }],
      target_bindings: [],
    }));
    expect(res.success).toBe(true);
  });

  it('a binding whose op_index is out of range is REJECTED', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({
      target_bindings: [{ op_index: 5, target_id: 'fac_revenue', target_label: 'FIXTURE_Revenue' }],
    })).success).toBe(false);
  });

  it('two bindings for one op are REJECTED (one op, one identity)', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({
      target_bindings: [
        { op_index: 0, target_id: 'fac_revenue', target_label: 'FIXTURE_Revenue' },
        { op_index: 0, target_id: 'fac_other', target_label: 'FIXTURE_Other' },
      ],
    })).success).toBe(false);
  });

  it('an empty target_label is REJECTED — a blank echo cannot catch a wrong id', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({
      target_bindings: [{ op_index: 0, target_id: 'fac_revenue', target_label: '' }],
    })).success).toBe(false);
  });

  it('a binding for an ADD op is REJECTED (nothing to bind against)', () => {
    expect(EditToolOpBatchSchema.safeParse(batch({
      operations: [{
        op: 'add_node', path: 'fac_new',
        value: { id: 'fac_new', kind: 'factor', label: 'FIXTURE_New' },
      }],
      target_bindings: [{ op_index: 0, target_id: 'fac_new', target_label: 'FIXTURE_New' }],
    })).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. A5d — id lifecycle: no reuse of a removed id inside one batch
// ---------------------------------------------------------------------------

describe('edit-tool ops — A5d id lifecycle', () => {
  it('remove_node X + add_node X in one batch is REJECTED with a precise reason', () => {
    const res = EditToolOpBatchSchema.safeParse(batch({
      operations: [
        { op: 'remove_node', path: 'fac_x' },
        { op: 'add_node', path: 'fac_x', value: { id: 'fac_x', kind: 'factor', label: 'FIXTURE_X' } },
      ],
      target_bindings: [{ op_index: 0, target_id: 'fac_x', target_label: 'FIXTURE_X' }],
    }));
    expect(res.success).toBe(false);
    // The referee's working view never subtracts removes (referee.ts:478-480), so
    // this is a structural collision. Pre-catching it precisely is what stops the
    // model looping on generic collision copy.
    expect(JSON.stringify(res.success ? {} : res.error.issues)).toMatch(/removed.*same batch|reuse/i);
  });

  it('add_node X in a batch that does NOT remove X is fine', () => {
    const res = EditToolOpBatchSchema.safeParse(batch({
      operations: [
        { op: 'remove_node', path: 'fac_y' },
        { op: 'add_node', path: 'fac_x', value: { id: 'fac_x', kind: 'factor', label: 'FIXTURE_X' } },
      ],
      target_bindings: [{ op_index: 0, target_id: 'fac_y', target_label: 'FIXTURE_Y' }],
    }));
    expect(res.success).toBe(true);
  });

  it('add_node whose value.id disagrees with its path is REJECTED', () => {
    const res = EditToolOpBatchSchema.safeParse(batch({
      operations: [{
        op: 'add_node', path: 'fac_a',
        value: { id: 'fac_b', kind: 'factor', label: 'FIXTURE_B' },
      }],
      target_bindings: [],
    }));
    expect(res.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. A3 — the fan-out rule, exported ONCE so the caps stop disagreeing
// ---------------------------------------------------------------------------

describe('edit-tool ops — A3 envelope fan-out', () => {
  it('a multi-FIELD update fans out one envelope PER FIELD, not per op', () => {
    // edit-graph-producer.ts:88-141 @ ac62fd4d — this is the rule that makes a
    // 5-op batch exceed the referee's PROPOSAL_CAP of 8 envelopes while passing
    // the pipeline's 15-OP gate. Both sides must count the same thing.
    expect(countEnvelopeFanOut([
      { op: 'update_node', path: 'n1', value: { label: 'a', description: 'b', category: 'controllable' } },
    ])).toBe(3);
  });

  it('add/remove ops are one envelope each', () => {
    expect(countEnvelopeFanOut([
      { op: 'add_node', path: 'n1', value: { id: 'n1', kind: 'factor', label: 'a' } },
      { op: 'remove_node', path: 'n2' },
      { op: 'add_edge', path: 'n1::n2', value: {} },
      { op: 'remove_edge', path: 'n1::n2' },
    ])).toBe(4);
  });

  it('identity keys are skipped by the producer, so they do not fan out', () => {
    expect(countEnvelopeFanOut([
      { op: 'update_node', path: 'n1', value: { id: 'n1', label: 'a' } },
    ])).toBe(1);
    expect(countEnvelopeFanOut([
      { op: 'update_edge', path: 'a::b', value: { from: 'a', to: 'b', exists_probability: 0.9 } },
    ])).toBe(1);
  });

  it('the headline restructure — 3 adds, 5 wires, 2 retitles — is 10 envelopes, over PROPOSAL_CAP', () => {
    const ops = [
      ...[1, 2, 3].map((i) => ({ op: 'add_node' as const, path: `n${i}`, value: { id: `n${i}`, kind: 'factor', label: `L${i}` } })),
      ...[1, 2, 3, 4, 5].map((i) => ({ op: 'add_edge' as const, path: `n1::n${i}`, value: {} })),
      { op: 'update_node' as const, path: 'g1', value: { label: 'A' } },
      { op: 'update_node' as const, path: 'g2', value: { label: 'B' } },
    ];
    // 10 > PROPOSAL_CAP(8): the CEE leg must choose ONE cap story (A3). This
    // package exports the COUNT, never the number — the number is CEE's.
    expect(countEnvelopeFanOut(ops)).toBe(10);
  });

  it('fan-out is total on a malformed value (never throws — the referee is the validity authority)', () => {
    expect(countEnvelopeFanOut([{ op: 'update_node', path: 'n1', value: null }])).toBe(0);
    expect(countEnvelopeFanOut([{ op: 'not_an_op', path: 'n1' }])).toBe(1);
  });
});

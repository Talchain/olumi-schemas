import { describe, expect, it } from 'vitest';

import {
  EdgeV3Schema,
  GraphV3Schema,
  NodeV3Schema,
  ObservedStateSchema,
  StrengthSchema,
} from '../../src/graph.js';
import {
  ModelVersionMutationReceiptV1Schema,
  OlumiResponseSchema,
} from '../../src/boundary/index.js';
import {
  maximalModelVersionMutationReceiptCommittedMutation,
  maximalOlumiResponse,
} from '../../src/fixtures/index.js';

/**
 * ⭐ P0: THE MODEL-VERSION RECEIPT MUST BE ABLE TO REPORT WHAT THE WRITER
 * ACTUALLY PERSISTED.
 *
 * The writer (CEE `orchestrator-v5/commit.ts`) deliberately TOLERATES a
 * non-positive `strength.std` / `observed_state.std`: it floors a PROJECTION
 * of the graph for the admissibility parse (`floorGraphSigmaForCompute`,
 * `COMPUTE_SIGMA_FLOOR = 0.001`) and then persists the caller's graph
 * VERBATIM, because sigma is inside the analysis-affecting hash projection and
 * rewriting it would fork graph identity. The floor is applied only where the
 * graph crosses into compute (`validators/numeric-bounds.ts`).
 *
 * The shared contract never adopted that ruling. `graph: GraphV3Schema` bounds
 * sigma with `.positive()`, so a receipt describing a legitimately committed
 * zero-sigma graph fails WHOLE-RESPONSE egress validation (CEE
 * `validators/b1.ts`). The user's edit COMMITS DURABLY and the user is then
 * told `EGRESS_CONTRACT_VIOLATION` — "The server produced a response that
 * failed validation." Commit/response divergence on a Core mutation.
 *
 * The remedy is a RECEIPT-SCOPED projection: the receipt admits exactly the
 * sigma band the writer admits; ordinary `GraphV3Schema` stays `.positive()`
 * for every other consumer, and identity is never rewritten.
 *
 * ⚠ THE ADMITTED BAND IS DERIVED FROM THE PRODUCER, NOT FROM THE SYMPTOM.
 * `checkGraphNumericBounds` flags `sigma_non_positive` via `checkFiniteNumber`
 * with the predicate `n > 0`, and `checkFiniteNumber` fires ONLY on finite
 * numbers. So `floorGraphSigmaForCompute` repairs — and the commit gate
 * therefore admits — EVERY FINITE `std <= 0`, negatives included. A projection
 * that admitted only `0` would leave the identical divergence open one value
 * to the left. Non-finite sigma is NOT floored and is not part of the band.
 */

const RECEIPT = maximalModelVersionMutationReceiptCommittedMutation;

function graphWithEdgeSigma(std: number): { nodes: unknown[]; edges: unknown[] } {
  return {
    nodes: [
      { id: 'factor_a', kind: 'factor', label: 'A' },
      { id: 'factor_b', kind: 'factor', label: 'B' },
    ],
    edges: [
      {
        from: 'factor_a',
        to: 'factor_b',
        strength: { mean: 0.4, std },
        exists_probability: 0.8,
      },
    ],
  };
}

function graphWithNodeSigma(std: number): { nodes: unknown[]; edges: unknown[] } {
  return {
    nodes: [
      {
        id: 'factor_a',
        kind: 'factor',
        label: 'A',
        observed_state: { value: 10, std },
      },
    ],
    edges: [],
  };
}

function receiptWith(graph: unknown): unknown {
  return { ...RECEIPT, graph };
}

describe('model-version receipt — persisted sigma band (P0 commit/response divergence)', () => {
  // ---------------------------------------------------------------------
  // 1. The defect itself, at both sigma sites, at both boundaries.
  // ---------------------------------------------------------------------

  it('accepts a receipt whose committed edge sigma is exactly zero', () => {
    const result = ModelVersionMutationReceiptV1Schema.safeParse(
      receiptWith(graphWithEdgeSigma(0)),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a receipt whose committed node observed_state sigma is exactly zero', () => {
    const result = ModelVersionMutationReceiptV1Schema.safeParse(
      receiptWith(graphWithNodeSigma(0)),
    );
    expect(result.success).toBe(true);
  });

  it('accepts the whole negative band the writer floors, not just zero', () => {
    // Derived from the producer: `checkFiniteNumber(..., n => n > 0,
    // 'sigma_non_positive')` fires on EVERY finite non-positive value, and
    // `floorGraphSigmaForCompute` repairs every one of them — so every one of
    // them can commit durably and must be reportable.
    for (const std of [0, -0, -0.1, -1, -1e6]) {
      expect(
        ModelVersionMutationReceiptV1Schema.safeParse(receiptWith(graphWithEdgeSigma(std)))
          .success,
      ).toBe(true);
      expect(
        ModelVersionMutationReceiptV1Schema.safeParse(receiptWith(graphWithNodeSigma(std)))
          .success,
      ).toBe(true);
    }
  });

  it('EGRESS: a whole OlumiResponse carrying a zero-sigma receipt validates', () => {
    // This is the exact seam that produced EGRESS_CONTRACT_VIOLATION on a
    // durably-committed mutation: CEE `validators/b1.ts` runs
    // `OlumiResponseSchema.safeParse` over the WHOLE response.
    const response = {
      ...maximalOlumiResponse,
      model_version_receipt: receiptWith(graphWithEdgeSigma(0)),
    };
    const result = OlumiResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------
  // 2. The projection is RECEIPT-ONLY. Ordinary GraphV3 stays strict.
  //
  //    ⭐ DISCRIMINATING PAIR. If the fix had been made by loosening
  //    `StrengthSchema` / `ObservedStateSchema` themselves, these would go
  //    RED — i.e. they prove the relaxation did NOT leak to the canonical
  //    schema, which is the claim the whole design rests on.
  // ---------------------------------------------------------------------

  it('does NOT loosen canonical StrengthSchema / EdgeV3Schema / GraphV3Schema', () => {
    expect(StrengthSchema.safeParse({ mean: 0.4, std: 0 }).success).toBe(false);
    expect(StrengthSchema.safeParse({ mean: 0.4, std: -0.1 }).success).toBe(false);
    expect(EdgeV3Schema.safeParse(graphWithEdgeSigma(0).edges[0]).success).toBe(false);
    expect(GraphV3Schema.safeParse(graphWithEdgeSigma(0)).success).toBe(false);
  });

  it('does NOT loosen canonical ObservedStateSchema / NodeV3Schema / GraphV3Schema', () => {
    expect(ObservedStateSchema.safeParse({ value: 10, std: 0 }).success).toBe(false);
    expect(NodeV3Schema.safeParse(graphWithNodeSigma(0).nodes[0]).success).toBe(false);
    expect(GraphV3Schema.safeParse(graphWithNodeSigma(0)).success).toBe(false);
  });

  // ---------------------------------------------------------------------
  // 3. The projection is a STRICT SUPERSET of canonical GraphV3 in exactly
  //    one dimension: it must not reject anything canonical accepts, and it
  //    must not admit anything else.
  // ---------------------------------------------------------------------

  it('still rejects every non-sigma GraphV3 violation inside the receipt', () => {
    const badMean = receiptWith({
      nodes: [
        { id: 'factor_a', kind: 'factor', label: 'A' },
        { id: 'factor_b', kind: 'factor', label: 'B' },
      ],
      edges: [
        {
          from: 'factor_a',
          to: 'factor_b',
          strength: { mean: 5, std: 0 },
          exists_probability: 0.8,
        },
      ],
    });
    expect(ModelVersionMutationReceiptV1Schema.safeParse(badMean).success).toBe(false);

    // Structurally incomplete edge — the pre-existing receipt strictness case.
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse(
        receiptWith({ nodes: [], edges: [{ from: 'a', to: 'b' }] }),
      ).success,
    ).toBe(false);

    // A bad node kind is still a bad node kind.
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse(
        receiptWith({ nodes: [{ id: 'a', kind: 'not_a_kind', label: 'A' }], edges: [] }),
      ).success,
    ).toBe(false);
  });

  it('rejects sigma outside the band the writer can persist', () => {
    // NaN and -Infinity are not `sigma_non_positive` repairs: the finiteness
    // walk flags them with no `kind`, `floorGraphSigmaForCompute` leaves them
    // alone, and the commit gate refuses them. They can never be persisted, so
    // the receipt must not pretend they can be reported.
    for (const std of [Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(
        ModelVersionMutationReceiptV1Schema.safeParse(receiptWith(graphWithEdgeSigma(std)))
          .success,
      ).toBe(false);
    }
  });

  it('accepts everything canonical GraphV3 accepts (superset property)', () => {
    // Pinned by construction, not by enumeration: the fixture graph is the
    // canonical maximal graph, and the positive branch of the receipt sigma
    // schema IS `StrengthSchema.shape.std`, not a restatement of it.
    expect(GraphV3Schema.safeParse(RECEIPT.graph).success).toBe(true);
    expect(ModelVersionMutationReceiptV1Schema.safeParse(RECEIPT).success).toBe(true);
    for (const std of [1e-9, 0.001, 0.5, 1000]) {
      expect(
        ModelVersionMutationReceiptV1Schema.safeParse(receiptWith(graphWithEdgeSigma(std)))
          .success,
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------------
  // 4. Identity is sacred: the receipt must not rewrite sigma.
  // ---------------------------------------------------------------------

  it('reports the persisted sigma verbatim — it does not floor or drop it', () => {
    const parsed = ModelVersionMutationReceiptV1Schema.parse(
      receiptWith(graphWithEdgeSigma(0)),
    ) as { graph: { edges: Array<{ strength: { std: number } }> } };
    expect(parsed.graph.edges[0].strength.std).toBe(0);

    const parsedNode = ModelVersionMutationReceiptV1Schema.parse(
      receiptWith(graphWithNodeSigma(0)),
    ) as { graph: { nodes: Array<{ observed_state?: { std?: number } }> } };
    expect(parsedNode.graph.nodes[0].observed_state?.std).toBe(0);
  });
});

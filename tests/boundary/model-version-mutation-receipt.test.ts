import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import * as boundaryDist from '../../dist/boundary/index.js';
import {
  ModelVersionMutationReceiptV1Schema,
  ModelVersionRestoreV2Schema,
  OlumiResponseSchema,
} from '../../src/boundary/index.js';
import {
  maximalModelVersionMutationReceiptCommittedMutation,
  maximalModelVersionMutationReceiptInitial,
  maximalModelVersionMutationReceiptRestore,
  maximalModelVersionRestoreV2,
  maximalOlumiResponse,
} from '../../src/fixtures/index.js';
import { GraphV3Schema } from '../../src/graph.js';

const MINIMAL_RESPONSE = {
  response_version: 2,
  assistant_text: 'The model change was committed.',
  blocks: [],
  suggested_actions: [],
  insights: [],
  stage_indicator: 'frame',
} as const;

type ModelVersionMutationReceiptInput = z.input<typeof ModelVersionMutationReceiptV1Schema>;

function expectSameJsonData(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

describe('ModelVersionMutationReceiptV1Schema', () => {
  it('parses only the three attested creation kinds and all actor/lineage states', () => {
    for (const receipt of [
      maximalModelVersionMutationReceiptInitial,
      maximalModelVersionMutationReceiptCommittedMutation,
      maximalModelVersionMutationReceiptRestore,
    ]) {
      const parsed = ModelVersionMutationReceiptV1Schema.parse(receipt);
      expect(parsed).toEqual(receipt);
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(receipt));
    }

    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        creation: { kind: 'variant_creation' },
      }).success,
    ).toBe(false);
  });

  it('keeps graph required in the public schema input type', () => {
    expectTypeOf<ModelVersionMutationReceiptInput['graph']>().toEqualTypeOf<
      z.input<typeof GraphV3Schema>
    >();
  });

  it('requires explicit source-turn and undo absence and a non-empty event id', () => {
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        source_turn_id: null,
      }).success,
    ).toBe(true);

    const { source_turn_id: _sourceTurn, ...withoutSourceTurn } =
      maximalModelVersionMutationReceiptCommittedMutation;
    expect(ModelVersionMutationReceiptV1Schema.safeParse(withoutSourceTurn).success).toBe(false);

    const { undo_version_id: _undoVersion, ...withoutUndoVersion } =
      maximalModelVersionMutationReceiptCommittedMutation;
    expect(ModelVersionMutationReceiptV1Schema.safeParse(withoutUndoVersion).success).toBe(false);

    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        event_id: '',
      }).success,
    ).toBe(false);
  });

  it('requires authoritative GraphV3 and lower-case 64-hex hashes', () => {
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        graph: { nodes: [], edges: [{ from: 'a', to: 'b' }] },
      }).success,
    ).toBe(false);
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        full_hash: 'A'.repeat(64),
      }).success,
    ).toBe(false);
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        analysis_affecting_hash: 'short',
      }).success,
    ).toBe(false);
  });

  it('validates but never rebuilds the hash-bearing graph', () => {
    const graphWithoutEdgeType = {
      nodes: [
        {
          id: 'factor_a',
          kind: 'factor',
          label: 'Factor A',
          state_space: { range: { min: 0, max: 1, future_range_key: 'retained' } },
        },
        { id: 'goal_b', kind: 'goal', label: 'Goal B' },
      ],
      edges: [
        {
          from: 'factor_a',
          to: 'goal_b',
          strength: { mean: 0.5, std: 0.1, future_strength_key: 'retained' },
          exists_probability: 0.9,
        },
      ],
      future_graph_key: 'retained',
    };
    const receipt = {
      ...maximalModelVersionMutationReceiptCommittedMutation,
      graph: graphWithoutEdgeType,
    };

    // Discriminating control: the general GraphV3 parser still rebuilds the
    // graph and materialises its historical default.
    const ordinaryGraphParse = GraphV3Schema.parse(graphWithoutEdgeType);
    expect(ordinaryGraphParse).not.toBe(graphWithoutEdgeType);
    expect(ordinaryGraphParse.edges.every((edge) => edge.edge_type === 'directed')).toBe(true);
    expect('future_strength_key' in ordinaryGraphParse.edges[0].strength).toBe(false);
    expect(
      'future_range_key' in (ordinaryGraphParse.nodes[0].state_space?.range ?? {}),
    ).toBe(false);

    const parsed = ModelVersionMutationReceiptV1Schema.parse(receipt);
    expect(parsed.graph).not.toBe(graphWithoutEdgeType);
    expect(parsed.graph).toEqual(graphWithoutEdgeType);
    expect(JSON.stringify(parsed.graph)).toBe(JSON.stringify(graphWithoutEdgeType));
    expect(parsed.graph.edges.every((edge) => !('edge_type' in edge))).toBe(true);
    expect('future_strength_key' in parsed.graph.edges[0].strength).toBe(true);
    expect('future_range_key' in (parsed.graph.nodes[0].state_space?.range ?? {})).toBe(true);

    // The same guarantee survives the composed response parser used by clients.
    const response = { ...MINIMAL_RESPONSE, model_version_receipt: receipt };
    const parsedResponse = OlumiResponseSchema.parse(response);
    expectSameJsonData(parsedResponse.model_version_receipt?.graph, graphWithoutEdgeType);
    expect(
      parsedResponse.model_version_receipt?.graph.edges.every(
        (edge) => !('edge_type' in edge),
      ),
    ).toBe(true);

    // The stable snapshot is recursively independent of its source and can be
    // validated again without changing its JSON representation.
    const stableWire = JSON.stringify(parsed.graph);
    graphWithoutEdgeType.nodes[0].label = 'Mutated after parse';
    graphWithoutEdgeType.edges[0].strength.mean = -0.25;
    expect(JSON.stringify(parsed.graph)).toBe(stableWire);
    expect(JSON.stringify(ModelVersionMutationReceiptV1Schema.parse(parsed).graph)).toBe(
      stableWire,
    );

    // Validation excluded inherited data; consumers still receive ordinary
    // objects/arrays, each shadowing inherited serialization hooks.
    expect(Object.getPrototypeOf(parsed.graph)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed.graph.nodes[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed.graph.edges[0].strength)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed.graph.nodes)).toBe(Array.prototype);
    expect(Object.getOwnPropertyDescriptor(parsed.graph, 'toJSON')).toMatchObject({
      value: undefined,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['factor_a', 'goal_b']);
  });

  it('snapshots stable JSON data so accepted input cannot change after validation', () => {
    const graph = maximalModelVersionMutationReceiptCommittedMutation.graph;
    let nodeReads = 0;
    const getterGraph = { edges: graph.edges } as { nodes?: unknown; edges: unknown };
    Object.defineProperty(getterGraph, 'nodes', {
      enumerable: true,
      get() {
        nodeReads += 1;
        return nodeReads === 1 ? graph.nodes : 'NOT_AN_ARRAY';
      },
    });
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        graph: getterGraph,
      }).success,
    ).toBe(false);
    expect(nodeReads).toBe(0);

    const toJsonGraph = { ...graph };
    Object.defineProperty(toJsonGraph, 'toJSON', {
      enumerable: false,
      value: () => ({ nodes: 'NOT_AN_ARRAY', edges: null }),
    });
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        graph: toJsonGraph,
      }).success,
    ).toBe(false);

    const bigintGraph = {
      ...graph,
      edges: graph.edges.map((edge, index) =>
        index === 0
          ? { ...edge, strength: { ...edge.strength, accepted_but_unserializable: 1n } }
          : edge,
      ),
    };
    expect(GraphV3Schema.safeParse(bigintGraph).success).toBe(true);
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        graph: bigintGraph,
      }).success,
    ).toBe(false);
  });

  it('excludes inherited fields and serialization hooks from the stable snapshot', () => {
    const graph = maximalModelVersionMutationReceiptCommittedMutation.graph;
    const expectedWire = JSON.stringify(graph);
    const objectNodes = Object.getOwnPropertyDescriptor(Object.prototype, 'nodes');
    const objectToJson = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
    const arrayToJson = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');

    try {
      Object.defineProperty(Object.prototype, 'nodes', {
        value: graph.nodes,
        enumerable: false,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(Object.prototype, 'toJSON', {
        value: () => ({ nodes: 'INHERITED_OBJECT_TO_JSON', edges: null }),
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(Array.prototype, 'toJSON', {
        value: () => 'INHERITED_ARRAY_TO_JSON',
        enumerable: false,
        configurable: true,
      });

      const parsed = ModelVersionMutationReceiptV1Schema.parse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        graph,
      });
      expect(JSON.stringify(parsed.graph)).toBe(expectedWire);
      expect(parsed.graph.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));

      // Without an own `nodes`, inherited data must not satisfy GraphV3.
      expect(
        ModelVersionMutationReceiptV1Schema.safeParse({
          ...maximalModelVersionMutationReceiptCommittedMutation,
          graph: { edges: graph.edges },
        }).success,
      ).toBe(false);

      // Even hostile inherited descriptors must produce a normal validation
      // failure rather than escaping `safeParse` as an exception.
      Object.defineProperty(Object.prototype, 'nodes', {
        value: graph.nodes,
        enumerable: false,
        configurable: true,
        writable: false,
      });
      let guardedResult: ReturnType<typeof ModelVersionMutationReceiptV1Schema.safeParse>;
      try {
        guardedResult = ModelVersionMutationReceiptV1Schema.safeParse({
          ...maximalModelVersionMutationReceiptCommittedMutation,
          graph,
        });
      } finally {
        Object.defineProperty(Object.prototype, 'nodes', {
          value: graph.nodes,
          enumerable: false,
          configurable: true,
          writable: true,
        });
      }
      expect(guardedResult.success).toBe(false);
    } finally {
      if (arrayToJson === undefined) delete (Array.prototype as { toJSON?: unknown }).toJSON;
      else Object.defineProperty(Array.prototype, 'toJSON', arrayToJson);
      if (objectToJson === undefined) delete (Object.prototype as { toJSON?: unknown }).toJSON;
      else Object.defineProperty(Object.prototype, 'toJSON', objectToJson);
      if (objectNodes === undefined) delete (Object.prototype as { nodes?: unknown }).nodes;
      else Object.defineProperty(Object.prototype, 'nodes', objectNodes);
    }
  });

  it('rejects prototype-control keys instead of stripping hash-bearing data', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const graph = {
        ...maximalModelVersionMutationReceiptCommittedMutation.graph,
      } as Record<string, unknown>;
      Object.defineProperty(graph, key, {
        value: { polluted: true },
        enumerable: true,
        configurable: true,
      });
      const result = ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        graph,
      });
      expect(result.success).toBe(false);
      if (result.success) continue;
      expect(result.error.issues.some((issue) => issue.path.join('.') === `graph.${key}`)).toBe(
        true,
      );
    }
  });

  it('keeps GraphV3 validation fail-closed with the original nested issue path', () => {
    const invalid = {
      ...maximalModelVersionMutationReceiptCommittedMutation,
      graph: {
        ...maximalModelVersionMutationReceiptCommittedMutation.graph,
        edges: [
          {
            ...maximalModelVersionMutationReceiptCommittedMutation.graph.edges[0],
            strength: { mean: 0.5, std: 0 },
          },
        ],
      },
    };

    const result = ModelVersionMutationReceiptV1Schema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) =>
      issue.path.join('.') === 'graph.edges.0.strength.std'
    )).toBe(true);
  });

  it('keeps nested union details under graph in formatted validation errors', () => {
    const graph = {
      nodes: [
        {
          id: 'factor_a',
          kind: 'factor',
          label: 'Factor A',
          observed_state: {
            value: 0.5,
            elicited_from: { round_id: 'round-1', participant_id: 42 },
          },
        },
      ],
      edges: [],
    };
    const result = ModelVersionMutationReceiptV1Schema.safeParse({
      ...maximalModelVersionMutationReceiptCommittedMutation,
      graph,
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join('.') ===
          'graph.nodes.0.observed_state.elicited_from.participant_id',
      ),
    ).toBe(true);
    const formatted = result.error.format() as Record<string, unknown>;
    expect(formatted).toHaveProperty(
      'graph.nodes.0.observed_state.elicited_from.participant_id._errors',
    );
    expect(formatted).not.toHaveProperty('nodes');
  });

  it('rejects self-referential parent, restore-source, and undo claims', () => {
    const receipt = maximalModelVersionMutationReceiptRestore;
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...receipt,
        lineage: {
          kind: 'known',
          parent_version_id: receipt.version_id,
          root_version_id: receipt.version_id,
        },
      }).success,
    ).toBe(false);
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...receipt,
        creation: { kind: 'restore', source_version_id: receipt.version_id },
      }).success,
    ).toBe(false);
    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...receipt,
        undo_version_id: receipt.version_id,
      }).success,
    ).toBe(false);
  });

  it('omits replay, dedupe, and freshness so replayed receipt bytes stay identical', () => {
    const parsed = ModelVersionMutationReceiptV1Schema.parse(
      maximalModelVersionMutationReceiptCommittedMutation,
    );
    expect(
      ModelVersionMutationReceiptV1Schema.parse(
        maximalModelVersionMutationReceiptCommittedMutation,
      ),
    ).toStrictEqual(parsed);
    expect('deduped' in parsed).toBe(false);
    expect('replayed' in parsed).toBe(false);
    expect('analysis_state' in parsed).toBe(false);
    expect('freshness' in parsed).toBe(false);

    for (const forbidden of ['deduped', 'replayed', 'analysis_state', 'freshness']) {
      expect(
        ModelVersionMutationReceiptV1Schema.safeParse({
          ...maximalModelVersionMutationReceiptCommittedMutation,
          [forbidden]: true,
        }).success,
        forbidden,
      ).toBe(false);
    }
  });
});

describe('OlumiResponse model_version_receipt carrier', () => {
  it('is additive and round-trips the atomic receipt without moving analysis authority', () => {
    expect(OlumiResponseSchema.safeParse(MINIMAL_RESPONSE).success).toBe(true);
    const response = {
      ...MINIMAL_RESPONSE,
      model_version_receipt: maximalModelVersionMutationReceiptCommittedMutation,
    } as const;
    const parsedResponse = OlumiResponseSchema.parse(response);
    expect(parsedResponse).toEqual(response);
    expectSameJsonData(
      parsedResponse.model_version_receipt?.graph,
      response.model_version_receipt.graph,
    );
    const parsedMaximal = OlumiResponseSchema.parse(maximalOlumiResponse);
    expect(parsedMaximal).toEqual(maximalOlumiResponse);
    expectSameJsonData(
      parsedMaximal.model_version_receipt?.graph,
      maximalOlumiResponse.model_version_receipt.graph,
    );
    expect(maximalOlumiResponse.analysis_state).toBeDefined();
    expect('analysis_state' in maximalOlumiResponse.model_version_receipt).toBe(false);
  });

  it('reaches the built /boundary entry', () => {
    expect(
      boundaryDist.ModelVersionMutationReceiptV1Schema.safeParse(
        maximalModelVersionMutationReceiptRestore,
      ).success,
    ).toBe(true);
    expect(boundaryDist.OlumiResponseSchema.shape.model_version_receipt).toBeDefined();
  });
});

describe('ModelVersionRestoreV2Schema', () => {
  it('carries the canonical restore receipt and sibling AnalysisState authority', () => {
    const parsed = ModelVersionRestoreV2Schema.parse(maximalModelVersionRestoreV2);
    expect(parsed).toEqual(maximalModelVersionRestoreV2);
    expectSameJsonData(
      parsed.receipt.graph,
      maximalModelVersionRestoreV2.receipt.graph,
    );
    expect(
      ModelVersionRestoreV2Schema.safeParse({
        ...maximalModelVersionRestoreV2,
        analysis_state: null,
      }).success,
    ).toBe(true);
  });

  it('fails closed on a scenario mismatch, non-restore receipt, or absent AnalysisState', () => {
    expect(
      ModelVersionRestoreV2Schema.safeParse({
        ...maximalModelVersionRestoreV2,
        scenario_id: 'fa000000-0000-4000-8000-000000000099',
      }).success,
    ).toBe(false);
    expect(
      ModelVersionRestoreV2Schema.safeParse({
        ...maximalModelVersionRestoreV2,
        receipt: maximalModelVersionMutationReceiptCommittedMutation,
      }).success,
    ).toBe(false);
    const { analysis_state: _analysisState, ...withoutAnalysisState } =
      maximalModelVersionRestoreV2;
    expect(ModelVersionRestoreV2Schema.safeParse(withoutAnalysisState).success).toBe(false);
  });

  it('reaches the built /boundary entry', () => {
    const parsed = boundaryDist.ModelVersionRestoreV2Schema.parse(maximalModelVersionRestoreV2);
    expect(parsed).toEqual(maximalModelVersionRestoreV2);
    expectSameJsonData(
      parsed.receipt.graph,
      maximalModelVersionRestoreV2.receipt.graph,
    );
  });
});

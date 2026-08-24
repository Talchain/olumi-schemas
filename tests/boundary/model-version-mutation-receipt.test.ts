import { describe, expect, it } from 'vitest';

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

const MINIMAL_RESPONSE = {
  response_version: 2,
  assistant_text: 'The model change was committed.',
  blocks: [],
  suggested_actions: [],
  insights: [],
  stage_indicator: 'frame',
} as const;

describe('ModelVersionMutationReceiptV1Schema', () => {
  it('parses only the three attested creation kinds and all actor/lineage states', () => {
    for (const receipt of [
      maximalModelVersionMutationReceiptInitial,
      maximalModelVersionMutationReceiptCommittedMutation,
      maximalModelVersionMutationReceiptRestore,
    ]) {
      expect(ModelVersionMutationReceiptV1Schema.parse(receipt)).toStrictEqual(receipt);
    }

    expect(
      ModelVersionMutationReceiptV1Schema.safeParse({
        ...maximalModelVersionMutationReceiptCommittedMutation,
        creation: { kind: 'variant_creation' },
      }).success,
    ).toBe(false);
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
    expect(OlumiResponseSchema.parse(response)).toStrictEqual(response);
    expect(OlumiResponseSchema.parse(maximalOlumiResponse)).toStrictEqual(maximalOlumiResponse);
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
    expect(ModelVersionRestoreV2Schema.parse(maximalModelVersionRestoreV2)).toStrictEqual(
      maximalModelVersionRestoreV2,
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
    expect(boundaryDist.ModelVersionRestoreV2Schema.parse(maximalModelVersionRestoreV2)).toStrictEqual(
      maximalModelVersionRestoreV2,
    );
  });
});

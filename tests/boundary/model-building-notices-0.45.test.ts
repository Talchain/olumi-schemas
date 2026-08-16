import { describe, expect, it } from 'vitest';

import {
  CanonicalCommittedGraphReceiptSchema,
  DraftGraphBlockSchema,
  ModelBuildingNoticeKindSchema,
  ModelBuildingNoticesSchema,
  OlumiResponseSchema,
} from '../../src/boundary/index.js';

const validNotices = {
  total_count: 4,
  groups: [
    { kind: 'detail_not_connected' as const, count: 3 },
    { kind: 'relationship_not_used' as const, count: 1 },
  ],
  details_redacted: true as const,
};

const legacyResponse = {
  response_version: 2 as const,
  assistant_text: 'Built a model from the available detail.',
  blocks: [],
  suggested_actions: [],
  insights: [],
  stage_indicator: 'analyse' as const,
};

const canonicalReceipt = {
  nodes: [],
  edges: [],
  options: [],
  goal_node_id: null,
  goal_constraints: [],
  node_count: 0,
  edge_count: 0,
};

function expectNumericRejectionAt(
  payload: unknown,
  expectedPath: ReadonlyArray<string | number>,
): void {
  const result = ModelBuildingNoticesSchema.safeParse(payload);
  expect(result.success).toBe(false);
  if (result.success) return;
  expect(
    result.error.issues.some(
      (issue) =>
        issue.code !== 'custom' &&
        JSON.stringify(issue.path) === JSON.stringify(expectedPath),
    ),
    `expected a numeric validation issue at ${JSON.stringify(expectedPath)}`,
  ).toBe(true);
}

describe('0.45.0 response-only model-building notices', () => {
  it('exports the closed notice-kind vocabulary', () => {
    expect(ModelBuildingNoticeKindSchema.options).toEqual([
      'detail_not_connected',
      'relationship_not_used',
      'alternative_consolidated',
      'conflict_resolved_conservatively',
      'target_not_modelled_as_threshold',
      'other',
    ]);
  });

  it('accepts exact, redacted aggregates on OlumiResponse without changing response_version', () => {
    expect(ModelBuildingNoticesSchema.parse(validNotices)).toEqual(validNotices);

    const response = OlumiResponseSchema.parse({
      ...legacyResponse,
      model_building_notices: validNotices,
    });
    expect(response.response_version).toBe(2);
    expect(response.model_building_notices).toEqual(validNotices);
    expect(
      OlumiResponseSchema.safeParse({
        ...legacyResponse,
        response_version: 3,
        model_building_notices: validNotices,
      }).success,
    ).toBe(false);
  });

  it('preserves legacy absence byte-for-byte and does not manufacture a zero notice', () => {
    const parsed = OlumiResponseSchema.parse(legacyResponse);
    expect(parsed).toEqual(legacyResponse);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(legacyResponse));
    expect(Object.prototype.hasOwnProperty.call(parsed, 'model_building_notices')).toBe(false);
  });

  it('rejects duplicate group kinds even when their counts sum exactly', () => {
    expect(
      ModelBuildingNoticesSchema.safeParse({
        total_count: 4,
        groups: [
          { kind: 'detail_not_connected', count: 3 },
          { kind: 'detail_not_connected', count: 1 },
        ],
        details_redacted: true,
      }).success,
    ).toBe(false);
  });

  it('rejects a total that does not equal the exact group-count sum', () => {
    expect(
      ModelBuildingNoticesSchema.safeParse({
        ...validNotices,
        total_count: validNotices.total_count + 1,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['zero', 0],
    ['fraction', 1.5],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects a %s total_count as a numeric constraint, not only via sum mismatch', (_label, value) => {
    expectNumericRejectionAt({ ...validNotices, total_count: value }, ['total_count']);
  });

  it.each([
    ['zero', 0],
    ['fraction', 1.5],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects a %s group count at the group field itself', (_label, value) => {
    expectNumericRejectionAt(
      {
        ...validNotices,
        groups: [{ ...validNotices.groups[0], count: value }, validNotices.groups[1]],
      },
      ['groups', 0, 'count'],
    );
  });

  it('rejects unknown kinds and requires the redaction attestation', () => {
    expect(
      ModelBuildingNoticesSchema.safeParse({
        ...validNotices,
        groups: [{ kind: 'model_disclosure', count: 4 }],
      }).success,
    ).toBe(false);
    expect(
      ModelBuildingNoticesSchema.safeParse({
        ...validNotices,
        details_redacted: false,
      }).success,
    ).toBe(false);
    expect(
      ModelBuildingNoticesSchema.safeParse({
        total_count: validNotices.total_count,
        groups: validNotices.groups,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown top-level and group fields, including detail-bearing data', () => {
    expect(
      ModelBuildingNoticesSchema.safeParse({
        ...validNotices,
        source_records: 4,
      }).success,
    ).toBe(false);

    for (const forbidden of [
      { label: 'A private scenario label' },
      { value: 0.72 },
      { raw_reason: 'model-authored internal refusal text' },
      { node_id: 'fac_private' },
    ]) {
      expect(
        ModelBuildingNoticesSchema.safeParse({
          ...validNotices,
          groups: [{ ...validNotices.groups[0], ...forbidden }, validNotices.groups[1]],
        }).success,
      ).toBe(false);
    }
  });

  it('keeps the carrier out of DraftGraphBlock and canonical receipt projections', () => {
    expect(
      DraftGraphBlockSchema.safeParse({
        type: 'draft_graph',
        ...canonicalReceipt,
      }).success,
    ).toBe(true);
    expect(CanonicalCommittedGraphReceiptSchema.safeParse(canonicalReceipt).success).toBe(true);

    expect(
      DraftGraphBlockSchema.safeParse({
        type: 'draft_graph',
        ...canonicalReceipt,
        model_building_notices: validNotices,
      }).success,
    ).toBe(false);
    expect(
      CanonicalCommittedGraphReceiptSchema.safeParse({
        ...canonicalReceipt,
        model_building_notices: validNotices,
      }).success,
    ).toBe(false);
    expect(
      OlumiResponseSchema.safeParse({
        ...legacyResponse,
        draft_graph: {
          ...canonicalReceipt,
          model_building_notices: validNotices,
        },
      }).success,
    ).toBe(false);
  });
});

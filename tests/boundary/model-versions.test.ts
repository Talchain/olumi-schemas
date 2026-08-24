import { describe, expect, it } from 'vitest';

import * as boundaryDist from '../../dist/boundary/index.js';
import {
  ModelVersionDiffV1Schema,
  ModelVersionSummaryV2Schema,
  ModelVersionsListV2Schema,
  RunDeltaSchema,
} from '../../src/boundary/index.js';

const SCENARIO_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_1_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_2_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_3_ID = '44444444-4444-4444-8444-444444444444';
const MUTATION_ID = '55555555-5555-4555-8555-555555555555';
const FULL_HASH_1 = 'a'.repeat(64);
const FULL_HASH_2 = 'b'.repeat(64);
const ANALYSIS_HASH_1 = 'c'.repeat(64);
const ANALYSIS_HASH_2 = 'd'.repeat(64);

const VERSION_2 = {
  version_id: VERSION_2_ID,
  scenario_id: SCENARIO_ID,
  sequence: 2,
  label: null,
  created_at: '2026-08-24T10:00:00.000Z',
  actor: { kind: 'unknown' },
  creation: { kind: 'unknown', mutation_id: null, source_turn_id: null },
  lineage: { kind: 'unknown' },
  full_hash: FULL_HASH_2,
  analysis_affecting_hash: ANALYSIS_HASH_2,
} as const;

const VERSION_1 = {
  version_id: VERSION_1_ID,
  scenario_id: SCENARIO_ID,
  sequence: 1,
  label: 'Initial model',
  created_at: '2026-08-24T09:00:00.000Z',
  actor: { kind: 'known', authored_by: 'owner' },
  creation: {
    kind: 'initial',
    mutation_id: MUTATION_ID,
    source_turn_id: 'turn_fixture_initial',
  },
  lineage: {
    kind: 'known',
    parent_version_id: null,
    root_version_id: VERSION_1_ID,
  },
  full_hash: FULL_HASH_1,
  analysis_affecting_hash: ANALYSIS_HASH_1,
} as const;

function emptyCategories() {
  return {
    structure: [],
    relationships: [],
    values_uncertainty: [],
    evidence_provenance: [],
    goals_constraints_options: [],
    assumptions_claims: [],
    presentation: [],
    other_model_fields: [],
  };
}

const VALUE_CHANGE = {
  path: '/nodes/fac_cost/observed_state/value',
  change_kind: 'changed',
  entity_kind: 'node',
  entity_id: 'fac_cost',
  label: 'Cost',
  before_display: '0.4',
  after_display: '0.6',
  summary: 'Cost changed from 0.4 to 0.6.',
  why_it_matters: 'This value is used by the model analysis.',
} as const;

const VALID_DIFFERENT_DIFF = {
  schema: 'model_version_diff.v1',
  request_id: 'request_diff_fixture',
  scenario_id: SCENARIO_ID,
  from_version_id: VERSION_1_ID,
  to_version_id: VERSION_2_ID,
  relation: 'different',
  from_full_hash: FULL_HASH_1,
  to_full_hash: FULL_HASH_2,
  analysis_equivalent: false,
  categories: {
    ...emptyCategories(),
    values_uncertainty: [VALUE_CHANGE],
  },
  coverage: {
    known_undetectable: [],
    known_uninterpreted_paths: [],
  },
} as const;

describe('ModelVersionSummaryV2Schema', () => {
  it('carries explicit unknown metadata instead of requiring invented actor or lineage', () => {
    expect(ModelVersionSummaryV2Schema.parse(VERSION_2)).toStrictEqual(VERSION_2);
  });

  it('carries known actor, creation, and lineage metadata when attested', () => {
    expect(ModelVersionSummaryV2Schema.parse(VERSION_1)).toStrictEqual(VERSION_1);
    expect(
      ModelVersionSummaryV2Schema.safeParse({
        ...VERSION_1,
        actor: { kind: 'system' },
      }).success,
    ).toBe(true);
    expect(
      ModelVersionSummaryV2Schema.safeParse({
        ...VERSION_1,
        actor: { kind: 'system', authored_by: 'owner' },
      }).success,
    ).toBe(false);
  });

  it('rejects zero-based sequence, non-SHA hashes, and flattened actor guesses', () => {
    expect(ModelVersionSummaryV2Schema.safeParse({ ...VERSION_2, sequence: 0 }).success).toBe(false);
    expect(ModelVersionSummaryV2Schema.safeParse({ ...VERSION_2, full_hash: 'not-a-sha' }).success).toBe(false);
    expect(ModelVersionSummaryV2Schema.safeParse({ ...VERSION_2, actor: 'owner' }).success).toBe(false);
    const { label: _omittedLabel, ...withoutLabel } = VERSION_2;
    expect(ModelVersionSummaryV2Schema.safeParse(withoutLabel).success).toBe(false);
    expect(
      ModelVersionSummaryV2Schema.safeParse({
        ...VERSION_2,
        creation: { kind: 'unknown', mutation_id: null },
      }).success,
    ).toBe(false);
  });

  it('rejects self-parent and self-source lineage claims', () => {
    expect(
      ModelVersionSummaryV2Schema.safeParse({
        ...VERSION_2,
        lineage: {
          kind: 'known',
          parent_version_id: VERSION_2_ID,
          root_version_id: VERSION_1_ID,
        },
      }).success,
    ).toBe(false);

    expect(
      ModelVersionSummaryV2Schema.safeParse({
        ...VERSION_2,
        creation: {
          kind: 'restore',
          source_version_id: VERSION_2_ID,
          mutation_id: null,
          source_turn_id: null,
        },
      }).success,
    ).toBe(false);
  });
});

describe('ModelVersionsListV2Schema', () => {
  const validList = {
    schema: 'model_versions_list.v2',
    request_id: 'request_list_fixture',
    scenario_id: SCENARIO_ID,
    current_version_id: VERSION_2_ID,
    versions: [VERSION_2, VERSION_1],
    next_cursor: null,
  } as const;

  it('parses a newest-first, scenario-scoped history page', () => {
    expect(ModelVersionsListV2Schema.parse(validList)).toStrictEqual(validList);
    expect(ModelVersionsListV2Schema.safeParse({ ...validList, request_id: null }).success).toBe(true);
    expect(
      ModelVersionsListV2Schema.safeParse({
        ...validList,
        current_version_id: null,
        versions: [],
      }).success,
    ).toBe(true);
    // A later cursor page may not contain the authoritative head. The id still
    // travels so consumers do not infer currentness from the first row.
    expect(
      ModelVersionsListV2Schema.safeParse({
        ...validList,
        current_version_id: VERSION_3_ID,
      }).success,
    ).toBe(true);
  });

  it('rejects unstable order, duplicate version ids, and cross-scenario rows', () => {
    expect(
      ModelVersionsListV2Schema.safeParse({ ...validList, versions: [VERSION_1, VERSION_2] }).success,
    ).toBe(false);
    expect(
      ModelVersionsListV2Schema.safeParse({ ...validList, versions: [VERSION_2, VERSION_2] }).success,
    ).toBe(false);
    expect(
      ModelVersionsListV2Schema.safeParse({ ...validList, current_version_id: null }).success,
    ).toBe(false);
    const { request_id: _omittedRequestId, ...listWithoutRequestId } = validList;
    expect(ModelVersionsListV2Schema.safeParse(listWithoutRequestId).success).toBe(false);
    expect(
      ModelVersionsListV2Schema.safeParse({
        ...validList,
        current_version_id: null,
        versions: [],
        next_cursor: 'unexpected-later-page',
      }).success,
    ).toBe(false);
    expect(
      ModelVersionsListV2Schema.safeParse({
        ...validList,
        versions: [
          VERSION_2,
          { ...VERSION_1, scenario_id: '66666666-6666-4666-8666-666666666666' },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('ModelVersionDiffV1Schema', () => {
  it('parses a bounded, user-readable model diff', () => {
    expect(ModelVersionDiffV1Schema.parse(VALID_DIFFERENT_DIFF)).toStrictEqual(VALID_DIFFERENT_DIFF);
  });

  it('requires identical to have equal hashes without treating equal hashes as sufficient', () => {
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        relation: 'identical',
      }).success,
    ).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        to_full_hash: FULL_HASH_1,
      }).success,
    ).toBe(true);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        relation: 'ancestor',
      }).success,
    ).toBe(false);
  });

  it('requires identical models to be analysis-equivalent and carry no changed items', () => {
    const identical = {
      ...VALID_DIFFERENT_DIFF,
      from_version_id: VERSION_3_ID,
      relation: 'identical',
      to_full_hash: FULL_HASH_1,
      analysis_equivalent: true,
      categories: emptyCategories(),
    } as const;
    expect(ModelVersionDiffV1Schema.parse(identical)).toStrictEqual(identical);
    expect(
      ModelVersionDiffV1Schema.safeParse({ ...identical, analysis_equivalent: false }).success,
    ).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...identical,
        categories: { ...emptyCategories(), values_uncertainty: [VALUE_CHANGE] },
      }).success,
    ).toBe(false);
  });

  it('requires a different model to classify a change or disclose a coverage limit', () => {
    const unexplained = {
      ...VALID_DIFFERENT_DIFF,
      categories: emptyCategories(),
    };
    expect(ModelVersionDiffV1Schema.safeParse(unexplained).success).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...unexplained,
        coverage: {
          known_undetectable: ['snapshot projection omits external evidence bodies'],
          known_uninterpreted_paths: [],
        },
      }).success,
    ).toBe(true);
  });

  it('enforces stable unique category and coverage arrays', () => {
    const later = { ...VALUE_CHANGE, path: '/nodes/z/value', entity_id: 'z' };
    const earlier = { ...VALUE_CHANGE, path: '/nodes/a/value', entity_id: 'a' };
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        categories: {
          ...emptyCategories(),
          values_uncertainty: [later, earlier],
        },
      }).success,
    ).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        coverage: {
          known_undetectable: ['z limitation', 'a limitation'],
          known_uninterpreted_paths: [],
        },
      }).success,
    ).toBe(false);
  });

  it('classifies each item once and reserves the uninterpreted ledger for other fields', () => {
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        categories: {
          ...VALID_DIFFERENT_DIFF.categories,
          presentation: [VALUE_CHANGE],
        },
      }).success,
    ).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        categories: {
          ...emptyCategories(),
          other_model_fields: [VALUE_CHANGE],
        },
        coverage: {
          known_undetectable: [],
          known_uninterpreted_paths: [VALUE_CHANGE.path],
        },
      }).success,
    ).toBe(true);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        categories: {
          ...emptyCategories(),
          other_model_fields: [VALUE_CHANGE],
        },
        coverage: {
          known_undetectable: [],
          known_uninterpreted_paths: [],
        },
      }).success,
    ).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        coverage: {
          known_undetectable: [],
          known_uninterpreted_paths: [VALUE_CHANGE.path],
        },
      }).success,
    ).toBe(false);
  });

  it('is strict at the envelope and item boundaries', () => {
    const { request_id: _omittedRequestId, ...withoutRequestId } = VALID_DIFFERENT_DIFF;
    expect(ModelVersionDiffV1Schema.safeParse(withoutRequestId).success).toBe(false);
    expect(ModelVersionDiffV1Schema.safeParse({ ...VALID_DIFFERENT_DIFF, request_id: null }).success).toBe(true);
    expect(
      ModelVersionDiffV1Schema.safeParse({ ...VALID_DIFFERENT_DIFF, extra: true }).success,
    ).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        ...VALID_DIFFERENT_DIFF,
        categories: {
          ...emptyCategories(),
          values_uncertainty: [{ ...VALUE_CHANGE, raw_before: 0.4 }],
        },
      }).success,
    ).toBe(false);
  });
});

describe('model-version contract export and authority boundaries', () => {
  it('reaches the built /boundary package entry', () => {
    expect(boundaryDist.ModelVersionSummaryV2Schema.safeParse(VERSION_2).success).toBe(true);
    expect(
      boundaryDist.ModelVersionsListV2Schema.safeParse({
        schema: 'model_versions_list.v2',
        request_id: 'request_list_fixture',
        scenario_id: SCENARIO_ID,
        current_version_id: VERSION_2_ID,
        versions: [VERSION_2, VERSION_1],
        next_cursor: null,
      }).success,
    ).toBe(true);
    expect(boundaryDist.ModelVersionDiffV1Schema.safeParse(VALID_DIFFERENT_DIFF).success).toBe(true);
  });

  it('does not parse as analysis-run RunDelta, or vice versa', () => {
    expect(RunDeltaSchema.safeParse(VALID_DIFFERENT_DIFF).success).toBe(false);
    expect(
      ModelVersionDiffV1Schema.safeParse({
        attribution_case: 'C0_identical',
        pair_provenance: {
          seed_equal: true,
          hash_equal: true,
          builds_equal: 'equal',
          n_equal: true,
        },
        leader: { changed: false, noise_verdict: 'within_noise' },
        win_probabilities: [],
        flip_thresholds: [],
      }).success,
    ).toBe(false);
  });
});

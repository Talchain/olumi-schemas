/**
 * 0.77.0 — `stated_relationship_not_used`: a user's stated relationship the model could not use as written.
 *
 * Before this member, such a row could only be counted under `relationship_not_used`, which consumers attribute to
 * Olumi ("Connections Olumi proposed…"), so the user's own words were credited to Olumi (DL ruling 5 Oct; SPINE X8).
 * Every rejection row has a passing twin that differs in one input.
 */
import { describe, expect, it } from 'vitest';
import {
  ModelBuildingNoticeKindSchema,
  ModelBuildingNoticesSchema,
  OlumiResponseSchema,
} from '../../src/boundary/index.js';
import { maximalModelBuildingNotices, maximalOlumiResponse } from '../../src/fixtures/index.js';

const KIND = 'stated_relationship_not_used';

describe('0.77.0 stated_relationship_not_used', () => {
  it('is a member of the closed notice-kind vocabulary, once, before the catch-all `other`', () => {
    const options = ModelBuildingNoticeKindSchema.options as readonly string[];
    expect(options.filter((k) => k === KIND)).toHaveLength(1);
    expect(options[options.length - 1]).toBe('other');
    expect(options.indexOf(KIND)).toBe(options.length - 2);
  });

  it('parses as its own group, apart from the Olumi-authored relationship_not_used', () => {
    const notices = {
      total_count: 5,
      groups: [
        { kind: 'relationship_not_used', count: 2 },
        { kind: KIND, count: 3 },
      ],
      details_redacted: true,
    };
    expect(ModelBuildingNoticesSchema.parse(notices)).toEqual(notices);
  });

  it('NEGATIVE: kinds stay unique (a duplicated new kind is refused at its own path); twin: distinct kinds pass', () => {
    const dup = ModelBuildingNoticesSchema.safeParse({
      total_count: 2,
      groups: [{ kind: KIND, count: 1 }, { kind: KIND, count: 1 }],
      details_redacted: true,
    });
    expect(dup.success).toBe(false);
    expect(dup.success ? [] : dup.error.issues.map((i) => JSON.stringify(i.path))).toContain(JSON.stringify(['groups', 1, 'kind']));
    expect(ModelBuildingNoticesSchema.safeParse({
      total_count: 2,
      groups: [{ kind: KIND, count: 1 }, { kind: 'other', count: 1 }],
      details_redacted: true,
    }).success).toBe(true);
  });

  it('NEGATIVE: the new group counts toward total_count (a short total is refused); twin: the exact total passes', () => {
    const groups = [{ kind: KIND, count: 4 }];
    expect(ModelBuildingNoticesSchema.safeParse({ total_count: 3, groups, details_redacted: true }).success).toBe(false);
    expect(ModelBuildingNoticesSchema.safeParse({ total_count: 4, groups, details_redacted: true }).success).toBe(true);
  });

  it('the maximal fixture exercises EVERY closed kind, so a future member without a fixture row fails here', () => {
    const fixtureKinds = new Set(maximalModelBuildingNotices.groups.map((g) => g.kind));
    expect([...fixtureKinds].sort()).toEqual([...ModelBuildingNoticeKindSchema.options].sort());
    expect(ModelBuildingNoticesSchema.parse(maximalModelBuildingNotices)).toEqual(maximalModelBuildingNotices);
  });

  it('rides the strict OlumiResponse envelope at the top-level model_building_notices key', () => {
    expect(OlumiResponseSchema.safeParse(maximalOlumiResponse).success).toBe(true);
    expect(maximalOlumiResponse.model_building_notices.groups.some((g) => g.kind === KIND)).toBe(true);
  });
});

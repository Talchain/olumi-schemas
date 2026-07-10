/**
 * UiDirectiveBlock (0.15.0) — seamlessness R4 keystone.
 *
 * Tests validate the new `ui_directive` block kind, its closed `verb`
 * enum, its reuse of the existing `TargetRefSchema` shape for `targets`,
 * and its routing through the `BlockSchema` discriminated union.
 *
 * Coverage:
 *   - valid happy-path fixture (all three verbs)
 *   - required-field rejection (verb, targets)
 *   - duration_ms bounds (500–10000) and optionality
 *   - note optionality and length bound
 *   - strict-mode rejection of unknown fields
 *   - enum exhaustiveness / rejection of invented verbs (annotate, start_tour)
 *   - discriminated-union routing via BlockSchema
 *   - existing block kinds unaffected by this addition
 */
import { describe, it, expect } from 'vitest';
import {
  BlockSchema,
  TextBlockSchema,
  UiDirectiveBlockSchema,
  UiDirectiveVerb,
} from '../../src/boundary/blocks.js';

const VALID_TARGET = { id: 'fac_delivery_risk', label: 'Delivery risk', kind: 'factor' as const };

const VALID_UI_DIRECTIVE = {
  type: 'ui_directive' as const,
  verb: 'highlight' as const,
  targets: [VALID_TARGET],
};

describe('UiDirectiveBlockSchema', () => {
  it('accepts a valid highlight directive (minimal)', () => {
    expect(UiDirectiveBlockSchema.parse(VALID_UI_DIRECTIVE)).toEqual(VALID_UI_DIRECTIVE);
  });

  it('accepts a valid focus directive', () => {
    const b = { ...VALID_UI_DIRECTIVE, verb: 'focus' as const };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts a valid open_inspector directive', () => {
    const b = { ...VALID_UI_DIRECTIVE, verb: 'open_inspector' as const };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts multiple targets', () => {
    const b = {
      ...VALID_UI_DIRECTIVE,
      targets: [VALID_TARGET, { id: 'opt_a', label: 'Option A', kind: 'option' as const }],
    };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts an empty targets array', () => {
    const b = { ...VALID_UI_DIRECTIVE, targets: [] };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts a valid duration_ms at the lower bound (500)', () => {
    const b = { ...VALID_UI_DIRECTIVE, duration_ms: 500 };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('accepts a valid duration_ms at the upper bound (10000)', () => {
    const b = { ...VALID_UI_DIRECTIVE, duration_ms: 10_000 };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('rejects duration_ms below the 500ms floor', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, duration_ms: 499 }).success,
    ).toBe(false);
  });

  it('rejects duration_ms above the 10000ms ceiling', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, duration_ms: 10_001 }).success,
    ).toBe(false);
  });

  it('rejects a non-integer duration_ms', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, duration_ms: 1000.5 }).success,
    ).toBe(false);
  });

  it('accepts an optional note', () => {
    const b = { ...VALID_UI_DIRECTIVE, note: 'Here is the affected factor.' };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('rejects an empty note when present', () => {
    expect(UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, note: '' }).success).toBe(
      false,
    );
  });

  it('rejects a note exceeding the 140-char cap', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, note: 'x'.repeat(141) }).success,
    ).toBe(false);
  });

  it('accepts a note exactly at the 140-char cap', () => {
    const b = { ...VALID_UI_DIRECTIVE, note: 'x'.repeat(140) };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });

  it('rejects a missing verb', () => {
    const { verb: _v, ...rest } = VALID_UI_DIRECTIVE;
    expect(UiDirectiveBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing targets array', () => {
    const { targets: _t, ...rest } = VALID_UI_DIRECTIVE;
    expect(UiDirectiveBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an invented verb (annotate — deferred, not in v1)', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, verb: 'annotate' }).success,
    ).toBe(false);
  });

  it('rejects an invented verb (start_tour — deferred, not in v1)', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, verb: 'start_tour' }).success,
    ).toBe(false);
  });

  it('rejects an invalid target ref (missing id)', () => {
    const bad = { ...VALID_UI_DIRECTIVE, targets: [{ label: 'x', kind: 'factor' }] };
    expect(UiDirectiveBlockSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, tour_id: 'abc' }).success,
    ).toBe(false);
  });

  it('rejects the wrong type literal', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_UI_DIRECTIVE, type: 'text' }).success,
    ).toBe(false);
  });
});

describe('UiDirectiveVerb', () => {
  it('has exactly the three v1 verbs', () => {
    expect([...UiDirectiveVerb.options].sort()).toEqual(
      ['focus', 'highlight', 'open_inspector'].sort(),
    );
  });
});

describe('Block discriminated union — ui_directive routing', () => {
  it('routes a ui_directive block through BlockSchema', () => {
    expect(BlockSchema.parse(VALID_UI_DIRECTIVE)).toEqual(VALID_UI_DIRECTIVE);
  });

  it('leaves an existing block kind (text) unaffected by this addition', () => {
    const textBlock = { type: 'text' as const, content: 'hello' };
    expect(BlockSchema.parse(textBlock)).toEqual(textBlock);
    expect(TextBlockSchema.parse(textBlock)).toEqual(textBlock);
  });

  it('rejects a ui_directive missing its discriminant fields, same as any other kind', () => {
    const r = BlockSchema.safeParse({ type: 'ui_directive' });
    expect(r.success).toBe(false);
  });
});

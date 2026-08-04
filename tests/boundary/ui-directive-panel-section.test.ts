/**
 * UiDirectiveBlock 0.32.0 — `open_panel` / `open_section` verbs + `ui_target`
 * (Lane 2, P3 UI agency — the assistant opens panels and sections, not just
 * points at graph elements).
 *
 * THE LOAD-BEARING PROPERTY UNDER TEST IS CLOSURE. A prior verification
 * proved absence-on-wire from this schema BECAUSE everything is strict; every
 * new shape here must stay `.strict()` and every new vocabulary closed. So
 * these tests assert acceptance of exactly the new shapes AND rejection of
 * everything adjacent (unknown verbs, unknown target kinds, unknown tab ids,
 * unknown section ids, unknown keys, cross-field contradictions in BOTH
 * directions).
 *
 * Cross-field contract (enforced via superRefine on the public schema AND at
 * the BlockSchema union level, mirroring the EvidenceBlock precedent):
 *   - open_panel   ⇒ ui_target REQUIRED with kind 'tab';           targets []
 *   - open_section ⇒ ui_target REQUIRED with kind 'model_section'; targets []
 *   - highlight / focus / open_inspector ⇒ ui_target ABSENT
 *
 * Vocabulary sources (derived at DecisionGuideAI staging tip 6d5db185):
 *   - tab ids: uiStore.ts:15 `OutputTab`
 *   - model section ids: ModelTabBody.tsx makeSectionProps call sites
 *     (:758,:772,:786,:795,:813) — the only ids with a live renderer.
 */
import { describe, it, expect } from 'vitest';
import {
  BlockSchema,
  UiDirectiveBlockSchema,
  UiDirectiveModelSectionId,
  UiDirectivePanelTabId,
  UiDirectiveUiTargetSchema,
  UiDirectiveVerb,
} from '../../src/boundary/blocks.js';

const VALID_TARGET = { id: 'fac_delivery_risk', label: 'Delivery risk', kind: 'factor' as const };

const VALID_OPEN_PANEL = {
  type: 'ui_directive' as const,
  verb: 'open_panel' as const,
  targets: [],
  ui_target: { kind: 'tab' as const, id: 'results' as const },
};

const VALID_OPEN_SECTION = {
  type: 'ui_directive' as const,
  verb: 'open_section' as const,
  targets: [],
  ui_target: { kind: 'model_section' as const, id: 'relationships' as const },
};

const VALID_HIGHLIGHT = {
  type: 'ui_directive' as const,
  verb: 'highlight' as const,
  targets: [VALID_TARGET],
};

describe('UiDirectiveVerb 0.32.0 vocabulary', () => {
  it('has exactly the five verbs (three graph + two panel)', () => {
    expect([...UiDirectiveVerb.options].sort()).toEqual(
      ['focus', 'highlight', 'open_inspector', 'open_panel', 'open_section'].sort(),
    );
  });

  it('still rejects invented verbs (closure preserved)', () => {
    for (const verb of ['hover', 'annotate', 'start_tour', 'open_menu']) {
      expect(UiDirectiveVerb.safeParse(verb).success).toBe(false);
    }
  });
});

describe('UiDirectivePanelTabId / UiDirectiveModelSectionId vocabularies', () => {
  it('tab ids are exactly the five OutputsDock tabs', () => {
    expect([...UiDirectivePanelTabId.options].sort()).toEqual(
      ['compare', 'diagnostics', 'journey', 'olumi', 'results'].sort(),
    );
  });

  it('model section ids are exactly the five rendered ModelTabBody sections', () => {
    expect([...UiDirectiveModelSectionId.options].sort()).toEqual(
      ['factors', 'modelcard', 'options', 'relationships', 'risks'].sort(),
    );
  });

  it('rejects a tab id with no renderer', () => {
    expect(UiDirectivePanelTabId.safeParse('settings').success).toBe(false);
  });

  it('rejects a section id with no renderer (the 2.457(b) dead-end class)', () => {
    expect(UiDirectiveModelSectionId.safeParse('constraints').success).toBe(false);
  });
});

describe('UiDirectiveUiTargetSchema', () => {
  it('accepts a tab target', () => {
    const t = { kind: 'tab' as const, id: 'compare' as const };
    expect(UiDirectiveUiTargetSchema.parse(t)).toEqual(t);
  });

  it('accepts a model_section target', () => {
    const t = { kind: 'model_section' as const, id: 'risks' as const };
    expect(UiDirectiveUiTargetSchema.parse(t)).toEqual(t);
  });

  it('rejects an unknown kind (no string escape hatch)', () => {
    expect(UiDirectiveUiTargetSchema.safeParse({ kind: 'menu', id: 'kebab' }).success).toBe(false);
  });

  it('rejects a tab-kind target carrying a section id', () => {
    expect(UiDirectiveUiTargetSchema.safeParse({ kind: 'tab', id: 'relationships' }).success).toBe(
      false,
    );
  });

  it('rejects a model_section-kind target carrying a tab id', () => {
    expect(
      UiDirectiveUiTargetSchema.safeParse({ kind: 'model_section', id: 'results' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys inside the target (strict branches)', () => {
    expect(
      UiDirectiveUiTargetSchema.safeParse({ kind: 'tab', id: 'results', label: 'Results' })
        .success,
    ).toBe(false);
  });
});

describe('UiDirectiveBlockSchema — open_panel', () => {
  it('accepts a valid open_panel directive', () => {
    expect(UiDirectiveBlockSchema.parse(VALID_OPEN_PANEL)).toEqual(VALID_OPEN_PANEL);
  });

  it('accepts open_panel at every tab id', () => {
    for (const id of UiDirectivePanelTabId.options) {
      const b = { ...VALID_OPEN_PANEL, ui_target: { kind: 'tab' as const, id } };
      expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
    }
  });

  it('rejects open_panel WITHOUT ui_target (rule bites forward)', () => {
    const { ui_target: _u, ...rest } = VALID_OPEN_PANEL;
    expect(UiDirectiveBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects open_panel with a model_section ui_target (verb/kind mismatch)', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({
        ...VALID_OPEN_PANEL,
        ui_target: { kind: 'model_section', id: 'relationships' },
      }).success,
    ).toBe(false);
  });

  it('rejects open_panel with non-empty graph targets', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_OPEN_PANEL, targets: [VALID_TARGET] }).success,
    ).toBe(false);
  });
});

describe('UiDirectiveBlockSchema — open_section', () => {
  it('accepts a valid open_section directive', () => {
    expect(UiDirectiveBlockSchema.parse(VALID_OPEN_SECTION)).toEqual(VALID_OPEN_SECTION);
  });

  it('accepts open_section at every section id', () => {
    for (const id of UiDirectiveModelSectionId.options) {
      const b = { ...VALID_OPEN_SECTION, ui_target: { kind: 'model_section' as const, id } };
      expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
    }
  });

  it('rejects open_section WITHOUT ui_target', () => {
    const { ui_target: _u, ...rest } = VALID_OPEN_SECTION;
    expect(UiDirectiveBlockSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects open_section with a tab ui_target (verb/kind mismatch)', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({
        ...VALID_OPEN_SECTION,
        ui_target: { kind: 'tab', id: 'diagnostics' },
      }).success,
    ).toBe(false);
  });

  it('rejects open_section with non-empty graph targets', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...VALID_OPEN_SECTION, targets: [VALID_TARGET] })
        .success,
    ).toBe(false);
  });

  it('accepts open_section with an optional note (caption unchanged for new verbs)', () => {
    const b = { ...VALID_OPEN_SECTION, note: 'Contested links live here.' };
    expect(UiDirectiveBlockSchema.parse(b)).toEqual(b);
  });
});

describe('UiDirectiveBlockSchema — graph verbs must NOT carry ui_target (rule bites backward)', () => {
  it('rejects highlight with a ui_target', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({
        ...VALID_HIGHLIGHT,
        ui_target: { kind: 'tab', id: 'results' },
      }).success,
    ).toBe(false);
  });

  it('rejects focus with a ui_target', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({
        ...VALID_HIGHLIGHT,
        verb: 'focus',
        ui_target: { kind: 'model_section', id: 'factors' },
      }).success,
    ).toBe(false);
  });

  it('rejects open_inspector with a ui_target', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({
        ...VALID_HIGHLIGHT,
        verb: 'open_inspector',
        ui_target: { kind: 'tab', id: 'results' },
      }).success,
    ).toBe(false);
  });

  it('still accepts the v1 graph-verb shapes byte-identically (regression floor)', () => {
    expect(UiDirectiveBlockSchema.parse(VALID_HIGHLIGHT)).toEqual(VALID_HIGHLIGHT);
    const focus = { ...VALID_HIGHLIGHT, verb: 'focus' as const };
    expect(UiDirectiveBlockSchema.parse(focus)).toEqual(focus);
  });
});

describe('BlockSchema union — the wire-level chokepoint carries the same rules', () => {
  it('routes a valid open_panel block through BlockSchema', () => {
    expect(BlockSchema.parse(VALID_OPEN_PANEL)).toEqual(VALID_OPEN_PANEL);
  });

  it('routes a valid open_section block through BlockSchema', () => {
    expect(BlockSchema.parse(VALID_OPEN_SECTION)).toEqual(VALID_OPEN_SECTION);
  });

  it('REJECTS open_panel without ui_target AT THE UNION (wire validation fails closed)', () => {
    const { ui_target: _u, ...rest } = VALID_OPEN_PANEL;
    expect(BlockSchema.safeParse(rest).success).toBe(false);
  });

  it('REJECTS a graph verb carrying ui_target AT THE UNION', () => {
    expect(
      BlockSchema.safeParse({
        ...VALID_HIGHLIGHT,
        ui_target: { kind: 'tab', id: 'results' },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown key on an open_panel block (strict preserved with the new field)', () => {
    expect(
      BlockSchema.safeParse({ ...VALID_OPEN_PANEL, panel_id: 'legacy' }).success,
    ).toBe(false);
  });
});

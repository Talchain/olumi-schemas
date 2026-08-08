/**
 * 0.39.0 car 2 — `UiDirectiveBlock.source` (ROADMAP 2.701's deferred
 * ui_directive-family enum; UI-DIRECTIVE-0.38-DESIGN-2026-08-06 §2.3).
 *
 * P4 provenance for an AI gesture: `'ladder'` (deterministic fact-derived
 * rows), `'gate'` (advice-gate deterministic mapping), `'composer'`
 * (LLM-proposed on gesture-less turns, §3-hybrid). Absence ⇔ emitted by a
 * producer that does not stamp it (pre-0.39 ladder era) — never null, no
 * default, never a second meaning.
 *
 * DELIBERATELY LEFT OUT (per the same design, stated so the next lane does
 * not "helpfully" add them): NO new verbs. `activate_tab` is ruled DO NOT
 * ADD (§2.1 — `open_panel` already IS tab activation); `annotate` /
 * `start_tour` need their own payload shapes; the right-panel target
 * extensions (§2.2) carry an unfired named trigger.
 *
 * RED-first at pristine 371e18c8: fails at collect (no UiDirectiveSource
 * export) and on the maximal-fixture presence assertion.
 */
import { describe, it, expect } from 'vitest';
import {
  UiDirectiveBlockSchema,
  UiDirectiveVerb,
} from '../../src/boundary/blocks.js';
import { UiDirectiveSource } from '../../src/boundary/blocks.js';
import { maximalUiDirectiveBlock } from '../../src/fixtures/index.js';

// A 0.38.0-shape graph-verb directive (no `source`) — the absent-optional
// control base.
const BASE_DIRECTIVE = {
  type: 'ui_directive',
  verb: 'highlight',
  targets: [{ id: 'fac_alpha', label: 'Factor Alpha', kind: 'factor' }],
} as const;

describe('UiDirectiveSource (0.39.0 car 2)', () => {
  it('is exactly the §2.3 vocabulary: ladder | gate | composer', () => {
    expect(UiDirectiveSource.options).toStrictEqual(['ladder', 'gate', 'composer']);
  });

  it('the verb enum is UNCHANGED — no wave-2 verbs were added (the honest §2 verdict)', () => {
    expect(UiDirectiveVerb.options).toStrictEqual([
      'highlight',
      'focus',
      'open_inspector',
      'open_panel',
      'open_section',
    ]);
  });
});

describe('UiDirectiveBlock.source (0.39.0 car 2)', () => {
  it('a 0.38.0-shape directive (no source) still parses byte-identically', () => {
    expect(UiDirectiveBlockSchema.parse(BASE_DIRECTIVE)).toStrictEqual(BASE_DIRECTIVE);
  });

  it.each(['ladder', 'gate', 'composer'] as const)('parses with source: %s', (source) => {
    const block = { ...BASE_DIRECTIVE, source };
    expect(UiDirectiveBlockSchema.parse(block)).toStrictEqual(block);
  });

  it('rejects an out-of-vocabulary source', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...BASE_DIRECTIVE, source: 'llm' }).success,
    ).toBe(false);
  });

  it('rejects null (absence is the only no-source state — never null on the wire)', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...BASE_DIRECTIVE, source: null }).success,
    ).toBe(false);
  });

  it('does not default: parse output of a source-less directive carries NO source key', () => {
    const parsed = UiDirectiveBlockSchema.parse(BASE_DIRECTIVE);
    expect('source' in parsed).toBe(false);
  });

  it('still rejects unknown keys (strict parent unchanged)', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({ ...BASE_DIRECTIVE, FIXTURE_unknown: true }).success,
    ).toBe(false);
  });

  it('the 0.32.0 verb/ui_target consistency rule is untouched: a panel verb still requires its ui_target even with source present', () => {
    expect(
      UiDirectiveBlockSchema.safeParse({
        type: 'ui_directive',
        verb: 'open_panel',
        targets: [],
        source: 'gate',
      }).success,
    ).toBe(false);
    const valid = {
      type: 'ui_directive',
      verb: 'open_panel',
      targets: [],
      ui_target: { kind: 'tab', id: 'results' },
      source: 'gate',
    };
    expect(UiDirectiveBlockSchema.parse(valid)).toStrictEqual(valid);
  });

  it('the maximal fixture populates source (maximality)', () => {
    expect(maximalUiDirectiveBlock).toHaveProperty('source');
  });
});

// ============================================================================
// ABSENCE-SEMANTICS CENSUS GATE — two states, one byte.
//
// THE DEFECT CLASS THIS EXISTS FOR. One adversarial review wave found SIX
// independent instances, across all four consumer services, of a single shape:
// a field whose ABSENCE and whose DEFAULT/EMPTY value carry different meanings,
// with no discriminator on the wire. Each was found separately, fixed
// separately, and left behind no instrument — so the seventh instance was
// always going to cost the same as the first. This is the instrument.
//
// WHAT IT GUARANTEES, PRECISELY (claim-type matters — ~/.claude/CLAUDE.md):
//   * COMPLETE ENUMERATION of optionality-bearing fields on the exported Zod
//     graph. Derived by walking Zod's own `_def`, never a hand-listed set.
//   * NO SILENT OMISSION: any construct the walker cannot introspect becomes an
//     UNPARSEABLE row and REDs this gate. An absence assertion must derive the
//     node set it visits.
//   * EVERY enumerated field carries an ANSWER — `distinct`, `same`, or an
//     explicit, counted `unresolved`.
//
// WHAT IT DOES NOT GUARANTEE, and this is the honest boundary:
//   * It says nothing about REQUIRED fields. Seed instance #1 (CEE
//     `may_name_leading_option`: a `true` from "permitted" vs a `true` from
//     "blind") is a required boolean and is invisible here BY CONSTRUCTION.
//     census.json `seed_instances` records which of the six this gate would
//     have caught (4 of 6, one partially) rather than claiming all of them.
//   * It does not verify a consumer HONOURS a `distinct` verdict. That is a
//     consumer-repo test, and it is a different claim.
//
// THE RATCHET. `unresolved` rows are allowed, counted, and pinned. A new
// optional field lands as `unresolved`, which pushes the pinned number up in
// the diff where a reviewer sees it — the same shape as the house typecheck
// ratchet. The number is meant to travel downward.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { deriveAbsenceCensus, type OptionalityMarker } from './absence-walk.js';
import { WALKED_NAMESPACES, declaredJsEntryPoints, REPO_ROOT } from './entry-points.js';

const CENSUS_PATH = join(REPO_ROOT, 'tests/contracts/absence-semantics/census.json');
const CENSUS_REL = 'tests/contracts/absence-semantics/census.json';

const VERDICTS = ['distinct', 'same', 'unresolved'] as const;
type Verdict = (typeof VERDICTS)[number];

interface CensusRow {
  markers: OptionalityMarker[];
  verdict: Verdict;
  note?: string;
  ref?: string;
}

interface CensusFile {
  counts: { distinct: number; same: number; unresolved: number };
  open_objects: { keys: string[] };
  unparseable: { entries: Record<string, { kind: string; note: string }> };
  fields: Record<string, CensusRow>;
  seed_instances: Record<string, unknown>;
}

const census = JSON.parse(readFileSync(CENSUS_PATH, 'utf8')) as CensusFile;
const derived = deriveAbsenceCensus(WALKED_NAMESPACES);

const derivedByKey = new Map(derived.fields.map((field) => [field.key, field]));
const openObjectKeys = derived.unparseable
  .filter((entry) => entry.kind === 'open-object')
  .map((entry) => entry.key.replace(/^open-object::/, ''))
  .sort();
const realUnparseable = derived.unparseable.filter((entry) => entry.kind !== 'open-object');

/** A paste-ready census row for a field the author now has to answer for. */
function rowTemplate(key: string): string {
  const field = derivedByKey.get(key);
  const markers = JSON.stringify(field?.markers ?? []);
  const describe = field?.description
    ? `\n      // the field's own .describe() says: ${field.description}`
    : '';
  return `    "${key}": { "markers": ${markers}, "verdict": "unresolved" },${describe}`;
}

const HOW_TO_ANSWER =
  '\n\nHOW TO ANSWER (one question, three answers):\n' +
  '  Does the ABSENCE of this field mean something DIFFERENT from its default /\n' +
  '  empty / null value?\n' +
  '    "distinct"   — yes. Absence carries a meaning no value can express, so the\n' +
  '                   wire needs a discriminator or the field needs to be required.\n' +
  '                   Add a `ref` pointing at the evidence. Do NOT fix the field in\n' +
  '                   this PR — a distinct row is DEBT, and its fix rides its own train.\n' +
  '    "same"       — no. Absence is equivalent to the default/empty value. Add a\n' +
  '                   `note` quoting where the contract says so.\n' +
  '    "unresolved" — nobody has established it yet. Allowed, counted, and the number\n' +
  '                   is pinned in `counts.unresolved` so the debt cannot grow silently.\n' +
  '  NEVER GUESS. An unevidenced verdict is worse than "unresolved", because it stops\n' +
  '  the next reader looking.\n' +
  `  Then update counts.unresolved in ${CENSUS_REL}.`;

// ---------------------------------------------------------------------------
describe('absence-semantics census · the derivation reaches a real surface', () => {
  // Trap 13: an absence assertion is vacuous until it can demonstrate a
  // presence. A walker that silently stopped introspecting would report an
  // empty census and every diff below would pass by testing nothing.
  it('walks a non-trivial surface (anti-vacuity floors)', () => {
    expect(derived.stats.namespaces, 'entry-point namespaces').toBeGreaterThanOrEqual(4);
    expect(derived.stats.exportedRoots, 'exported Zod schemas').toBeGreaterThan(150);
    expect(derived.stats.objectSchemas, 'distinct ZodObject identities').toBeGreaterThan(100);
    expect(derived.stats.fieldSites, 'distinct (object, field) sites').toBeGreaterThan(500);
    expect(derived.stats.optionalityBearingFields, 'optionality-bearing fields').toBeGreaterThan(200);
    expect(derived.stats.composites, 'array/record/union/... identities').toBeGreaterThan(50);
  });

  it('POSITIVE CONTROL: the walker SEES an optionality-bearing field it is shown', () => {
    const Probe = z.object({
      required_scalar: z.string(),
      plainly_optional: z.string().optional(),
      plainly_nullable: z.string().nullable(),
      fabricated_on_absence: z.number().default(0),
      caught_on_failure: z.number().catch(0),
      union_with_null: z.union([z.string(), z.null()]),
      silently_optional: z.unknown(),
      nested: z.object({ deep_optional: z.boolean().optional() }),
      in_array: z.array(z.object({ element_optional: z.string().optional() })),
      in_record: z.record(z.string(), z.object({ value_optional: z.string().optional() })),
    });
    const probe = deriveAbsenceCensus({ probe: { ProbeSchema: Probe } });
    const found = new Map(probe.fields.map((field) => [field.key, field.markers]));

    expect([...found.keys()].sort()).toEqual([
      'probe/ProbeSchema.caught_on_failure',
      'probe/ProbeSchema.fabricated_on_absence',
      'probe/ProbeSchema.in_array[].element_optional',
      'probe/ProbeSchema.in_record.*.value_optional',
      'probe/ProbeSchema.nested.deep_optional',
      'probe/ProbeSchema.plainly_nullable',
      'probe/ProbeSchema.plainly_optional',
      'probe/ProbeSchema.silently_optional',
      'probe/ProbeSchema.union_with_null',
    ]);
    // The markers are the load-bearing part: `default` and `catch` are the
    // fabricate-on-absence constructs, and conflating them with plain
    // `optional` is exactly the distinction this census exists to keep.
    expect(found.get('probe/ProbeSchema.fabricated_on_absence')).toEqual(['default']);
    expect(found.get('probe/ProbeSchema.caught_on_failure')).toEqual(['catch']);
    expect(found.get('probe/ProbeSchema.union_with_null')).toEqual(['nullable', 'null-in-union']);
    expect(found.get('probe/ProbeSchema.silently_optional')).toEqual(['any-or-unknown']);
    // ...and a required scalar must NOT be reported, or the census is noise.
    expect(found.has('probe/ProbeSchema.required_scalar')).toBe(false);
  });

  it('POSITIVE CONTROL: a construct the walker cannot introspect becomes UNPARSEABLE, not silence', () => {
    // ZodFunction is deliberately absent from both the composite dispatch and
    // the terminal allowlist — it stands in for "whatever Zod adds next".
    const Opaque = z.object({ callback: z.function(z.tuple([]), z.string()) });
    const result = deriveAbsenceCensus({ probe: { OpaqueSchema: Opaque } });
    const kinds = result.unparseable.map((entry) => entry.kind);
    expect(
      kinds,
      'an unhandled Zod construct MUST surface as unknown-type. If this ever passes ' +
        'by finding nothing, the walker has grown a silent fall-through and every ' +
        'completeness claim below is void.',
    ).toContain('unknown-type');
  });

  it('a transform is unparseable without inheriting optionality from its input schema', () => {
    const RequiredTransform = z.object({
      required_snapshot: z.unknown().transform((value, ctx) => {
        if (value === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'required' });
          return z.NEVER;
        }
        return value;
      }),
      inner_optional_but_required: z.string().optional().transform((value, ctx) => {
        if (value === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'required after transform' });
          return z.NEVER;
        }
        return value;
      }),
      outer_optional: z.string().transform((value) => value).optional(),
    });
    const result = deriveAbsenceCensus({ probe: { RequiredTransformSchema: RequiredTransform } });

    const fields = new Map(result.fields.map((field) => [field.key, field.markers]));
    expect(fields.has('probe/RequiredTransformSchema.required_snapshot')).toBe(false);
    expect(fields.has('probe/RequiredTransformSchema.inner_optional_but_required')).toBe(false);
    expect(fields.get('probe/RequiredTransformSchema.outer_optional')).toEqual(['optional']);
    expect(result.unparseable.map((entry) => entry.kind)).toContain('effects-transform');
    expect(result.unparseable.map((entry) => entry.kind)).not.toContain(
      'classification-disagreement',
    );
  });

  it('POSITIVE CONTROL: a passthrough object is reported as an open object', () => {
    const Open = z.object({ declared: z.string() }).passthrough();
    const result = deriveAbsenceCensus({ probe: { OpenSchema: Open } });
    expect(result.unparseable.map((entry) => entry.kind)).toContain('open-object');
  });

  it('is order-independent: shuffling the namespaces changes nothing', () => {
    // The keys anchor at the nearest EXPORTED ancestor and keep the smallest
    // path over every route, so a shared shape cannot be renamed by walk order.
    // Without this, adding one export would churn unrelated rows and the table
    // would rot into noise nobody reads.
    const reversed = Object.fromEntries(Object.entries(WALKED_NAMESPACES).reverse());
    const other = deriveAbsenceCensus(reversed);
    expect(other.fields.map((field) => `${field.key}=${field.markers.join('+')}`)).toEqual(
      derived.fields.map((field) => `${field.key}=${field.markers.join('+')}`),
    );
  });

  it('walks EVERY JavaScript entry point package.json declares', () => {
    // The namespace map in entry-points.ts is a static list (a dynamic import
    // resolves differently under vitest and tsc). Static list => mirror => it
    // must fail loud on drift rather than silently shrink the census.
    expect(
      declaredJsEntryPoints(),
      'package.json `exports` declares a JS entry point that entry-points.ts does not ' +
        'import. Every schema reachable only through it is ABSENT from the census while ' +
        'this gate reads green. Add it to WALKED_NAMESPACES.',
    ).toEqual(Object.keys(WALKED_NAMESPACES).sort());
  });
});

// ---------------------------------------------------------------------------
describe('absence-semantics census · the table matches the contract', () => {
  it('every derived optionality-bearing field has a census row', () => {
    const missing = derived.fields.map((f) => f.key).filter((key) => !(key in census.fields));
    expect(
      missing,
      missing.length === 0
        ? ''
        : `\n${missing.length} field(s) admit absence but no one has said what absence MEANS.\n` +
          `Add to \`fields\` in ${CENSUS_REL}:\n\n` +
          missing.map(rowTemplate).join('\n') +
          HOW_TO_ANSWER,
    ).toEqual([]);
  });

  it('has no stale rows (every census row still exists in the contract)', () => {
    const stale = Object.keys(census.fields).filter((key) => !derivedByKey.has(key));
    expect(
      stale,
      `\n${stale.length} census row(s) name a field that is no longer optionality-bearing ` +
        '(removed, made required, or renamed). A stale row is a claim about a contract that ' +
        `no longer exists — delete it from ${CENSUS_REL}, and if the field was made REQUIRED ` +
        'because its absence was meaningful, say so in the CHANGELOG.\n  ' +
        stale.join('\n  '),
    ).toEqual([]);
  });

  it('every row records the SAME markers the contract declares', () => {
    // This is the highest-value assertion in the file. Adding `.default()` to
    // an existing optional field changes its absence semantics COMPLETELY —
    // the validator starts fabricating a value and no consumer can ever see
    // absence again — while the field name, the type and every existing test
    // stay identical. Pinning markers turns that into a RED with the old and
    // new markers printed side by side.
    const drifted: string[] = [];
    for (const [key, row] of Object.entries(census.fields)) {
      const field = derivedByKey.get(key);
      if (!field) continue; // reported by the stale-row test
      const recorded = [...row.markers].join('+');
      const actual = field.markers.join('+');
      if (recorded !== actual) {
        drifted.push(`${key}\n      census says [${recorded}]  contract says [${actual}]`);
      }
    }
    expect(
      drifted,
      `\n${drifted.length} field(s) changed their optionality shape. Re-answer the census ` +
        'question for each — a marker change IS an absence-semantics change:\n  ' +
        drifted.join('\n  ') +
        HOW_TO_ANSWER,
    ).toEqual([]);
  });

  it('every verdict is one of the three, and carries the evidence its verdict requires', () => {
    const problems: string[] = [];
    for (const [key, row] of Object.entries(census.fields)) {
      if (!VERDICTS.includes(row.verdict)) {
        problems.push(`${key}: verdict "${row.verdict}" is not one of ${VERDICTS.join(' | ')}`);
        continue;
      }
      if (row.verdict === 'distinct') {
        // A `distinct` row asserts the contract has a defect. An assertion with
        // no reference is the guarantee-theatre this estate keeps finding.
        if (!row.ref || row.ref.length < 10) {
          problems.push(`${key}: verdict "distinct" requires a \`ref\` naming the evidence (schema comment, seed instance, PR/row)`);
        }
        if (!row.note || row.note.length < 40) {
          problems.push(`${key}: verdict "distinct" requires a \`note\` stating what absence means that no value can`);
        }
      }
      if (row.verdict === 'same' && (!row.note || row.note.length < 40)) {
        problems.push(`${key}: verdict "same" requires a \`note\` quoting where the contract says absence === default`);
      }
    }
    expect(problems, `\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('absence-semantics census · the ratchet and the holes', () => {
  it('the pinned counts match the table', () => {
    const actual = { distinct: 0, same: 0, unresolved: 0 };
    for (const row of Object.values(census.fields)) {
      if (VERDICTS.includes(row.verdict)) actual[row.verdict]++;
    }
    expect(
      actual,
      'The pinned `counts` block disagrees with the rows. `unresolved` is the RATCHET: it may ' +
        'be revised DOWNWARD freely (that is the point), and upward only when a genuinely new ' +
        'optional field lands — in which case the increase is visible in the same diff as the ' +
        'field. Never raise it to make a red go away.',
    ).toEqual({
      distinct: census.counts.distinct,
      same: census.counts.same,
      unresolved: census.counts.unresolved,
    });
    expect(actual.distinct + actual.same + actual.unresolved).toBe(
      Object.keys(census.fields).length,
    );
  });

  it('UNPARSEABLE: every construct the walker could not introspect is documented', () => {
    const undocumented = realUnparseable.filter((entry) => !(entry.key in census.unparseable.entries));
    expect(
      undocumented,
      `\n${undocumented.length} construct(s) DEFEAT INTROSPECTION, so the census is INCOMPLETE ` +
        'over them and its completeness claim is currently false. Either teach ' +
        'tests/contracts/absence-semantics/absence-walk.ts the construct (preferred — then this ' +
        'list goes back to empty), or document each one in `unparseable.entries` with what the ' +
        'census cannot see because of it:\n  ' +
        undocumented.map((entry) => `${entry.key}\n      ${entry.detail}`).join('\n  '),
    ).toEqual([]);
  });

  it('UNPARSEABLE: no stale documentation for a construct that is now introspectable', () => {
    const live = new Set(realUnparseable.map((entry) => entry.key));
    const stale = Object.keys(census.unparseable.entries).filter((key) => !live.has(key));
    expect(stale, 'documented unparseable entries that no longer occur — delete them').toEqual([]);
  });

  it('OPEN OBJECTS: the set of passthrough/catchall objects is pinned', () => {
    // An open object can carry keys outside its declared shape, so the census
    // cannot be complete over it BY CONSTRUCTION — an undeclared key is an
    // un-enumerable absence. That is workspace hazard 2 (the untyped
    // PLoT->CEE enrichment seam) measured object by object. Pinning the set
    // means a NEW hole reds; closing one also reds, which is the cheapest
    // possible reminder to record the win.
    const pinned = [...census.open_objects.keys].sort();
    const added = openObjectKeys.filter((key) => !pinned.includes(key));
    const removed = pinned.filter((key) => !openObjectKeys.includes(key));
    expect(
      { added, removed },
      '\nThe set of objects accepting undeclared keys changed.\n' +
        'ADDED means a new hole in the census: keys can now cross the wire that this table ' +
        'never enumerates. Prefer tightening the object to `.strict()`; if the openness is ' +
        'deliberate, add the key to `open_objects.keys`.\n' +
        'REMOVED means an object was tightened — delete the key and note the win.\n' +
        `  added:   ${added.join('\n           ') || '(none)'}\n` +
        `  removed: ${removed.join('\n           ') || '(none)'}`,
    ).toEqual({ added: [], removed: [] });
  });

  it('the six seed instances stay recorded with an HONEST visibility answer', () => {
    // The instrument's value depends on nobody believing it covers more than
    // it does. Seed instance #1 is a REQUIRED boolean and is invisible here by
    // construction; a census that quietly claimed all six would be the exact
    // over-read this estate keeps paying for.
    const instances = Object.entries(census.seed_instances).filter(([key]) => !key.startsWith('_'));
    expect(instances.length, 'all six motivating instances must stay recorded').toBe(6);
    for (const [key, value] of instances) {
      const record = value as { shape?: string; visible_to_this_gate?: unknown; why?: string };
      expect(record.shape, `${key} must state the shape`).toBeTruthy();
      expect(
        record.visible_to_this_gate,
        `${key} must state whether THIS gate can see it`,
      ).not.toBeUndefined();
      expect((record.why ?? '').length, `${key} must justify its visibility answer`).toBeGreaterThan(60);
    }
    const visible = instances.filter(([, v]) => (v as { visible_to_this_gate: unknown }).visible_to_this_gate === true);
    expect(
      visible.length,
      'If this ever reads 6/6, check it — two of the six are NOT schema-shaped, and a gate ' +
        'that grew to claim them has almost certainly widened its claim rather than its coverage.',
    ).toBeLessThan(6);
  });
});

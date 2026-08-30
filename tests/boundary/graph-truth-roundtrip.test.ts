import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  diffGraphLeaves,
  enumerateValueLeaves,
} from '../../dist/boundary/semantic-axes.js';
import { NodeV3Schema } from '../../dist/graph.js';
import { CanonicalCommittedGraphReceiptSchema } from '../../dist/boundary/blocks.js';
import { maximalCanonicalCommittedGraphReceipt } from '../../dist/fixtures/index.js';

// ============================================================================
// LIMB 3 — ROUND-TRIP. Does the graph that comes back equal the graph that went in?
//
// ⚠ SHIPPED WITH ITS CONTRAST CONTROL, AND THAT IS NOT OPTIONAL. A differ that
// extracts nothing reports `LOST 0 / GAINED 0 / CHANGED 0` and is
// indistinguishable from a differ that works — this estate has already run a
// comparison probe where BOTH extractions silently produced empty files and
// `diff` cheerfully agreed. So every no-op arm here is paired with an arm over
// a REAL edit that must report the exact expected changes. Ship both, or the
// green means nothing.
//
// ── SCOPE, STATED PRECISELY (RUNG: TESTED) ──────────────────────────────────
// These arms prove the DIFFER discriminates and pin the round-trip property
// over the repo's own canonical fixture. They are NOT a wire witness: no
// persisted graph was reloaded from a real store in this file, and a fixture is
// not evidence about the wire. Raising this to WIRE-WITNESSED is Limb 2's job
// (scripts/graph-truth-runtime-limb.mjs), which reuses this same differ against
// a live quartet — deliberately the same function, so the property asserted
// offline and the property asserted on the wire cannot drift apart.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const RECEIPT = maximalCanonicalCommittedGraphReceipt as Record<string, unknown>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('limb 3 — the differ itself, before any verdict', () => {
  it('CONTROL (sighting): the fixture yields a plausible, non-trivial leaf census', () => {
    const { leaves, unidentifiedElements } = enumerateValueLeaves(RECEIPT);
    // A differ that extracted nothing would pass every no-op arm below.
    expect(leaves.size).toBeGreaterThan(30);
    // Named contrast: leaves this receipt certainly has, bound by identity.
    const paths = [...leaves.keys()];
    expect(paths.some((p) => p.endsWith('.observed_state.value'))).toBe(true);
    expect(paths.some((p) => p.includes('goal_constraints[constraint_id='))).toBe(true);
    // Every OBJECT element bound to an identity — nothing fell back to a position.
    // ⚠ This assertion is why the differ keys edges by `from->to`: run against
    // this fixture it originally reported both edges as unidentified, because
    // EdgeV3Schema declares no `id`. The contract told the differ what an edge's
    // identity is; the differ was not written from an assumption about it.
    expect(unidentifiedElements).toEqual([]);
    expect(paths.some((p) => p.includes('edges[from='))).toBe(true);
  });

  it('CONTROL (discrimination): arrays are keyed by IDENTITY, so a reorder is not a rewrite', () => {
    const reordered = clone(RECEIPT);
    (reordered.nodes as unknown[]).reverse();
    const diff = diffGraphLeaves(RECEIPT, reordered);
    // The SAME nodes in a different order are the same graph.
    expect({ lost: diff.lost, gained: diff.gained, changed: diff.changed }).toEqual({
      lost: [],
      gained: [],
      changed: [],
    });
    // …and the contrast that proves this is identity-binding rather than
    // blindness: renaming one node's id DOES move every leaf beneath it.
    const renamed = clone(RECEIPT);
    (renamed.nodes as Record<string, unknown>[])[0]!.id = 'renamed_node_probe';
    const renamedDiff = diffGraphLeaves(RECEIPT, renamed);
    expect(renamedDiff.lost.length).toBeGreaterThan(0);
    expect(renamedDiff.gained.length).toBe(renamedDiff.lost.length);
  });

  it('CONTROL (empty is a value): [] and {} are leaves, not silence', () => {
    // `goal_constraints: []` is a producer ATTESTING there are none. If the
    // differ treated it as absent, an attestation replaced by silence — the
    // exact 0.43.0 absence-semantics defect — would read as no change at all.
    const withNone = { ...clone(RECEIPT), goal_constraints: [] };
    const withNoneToo = { ...clone(RECEIPT), goal_constraints: [] };
    expect(diffGraphLeaves(withNone, withNoneToo).lost).toEqual([]);

    const attestedThenSilent = { ...clone(RECEIPT), goal_constraints: [] } as Record<string, unknown>;
    delete attestedThenSilent.goal_constraints;
    const diff = diffGraphLeaves(withNone, attestedThenSilent);
    expect(diff.lost).toEqual(['goal_constraints[]<empty>']);
  });
});

describe('limb 3 — round-trip over the canonical committed graph', () => {
  it('a persist/reload no-op loses, gains and changes NOTHING', () => {
    const reloaded = clone(RECEIPT);
    const diff = diffGraphLeaves(RECEIPT, reloaded);
    expect({ lost: diff.lost, gained: diff.gained, changed: diff.changed.map((c) => c.path) }).toEqual({
      lost: [],
      gained: [],
      changed: [],
    });
    // The contrast that stops this passing vacuously: both sides were read.
    expect(diff.beforeCount).toBe(diff.afterCount);
    expect(diff.beforeCount).toBeGreaterThan(30);
  });

  it('CONTRAST CONTROL: a REAL edit reports exactly the expected leaves', () => {
    // The arm that proves the arm above. Three deliberate mutations: one value
    // changed, one qualifier added, one qualifier deleted.
    const edited = clone(RECEIPT);
    const node = (edited.nodes as Record<string, unknown>[]).find(
      (n) => (n.observed_state as Record<string, unknown> | undefined)?.value !== undefined,
    );
    expect(node, 'no node carries an observed value — this contrast cannot discriminate').toBeDefined();
    const os = node!.observed_state as Record<string, unknown>;
    const nodeId = node!.id as string;

    const originalValue = os.value;
    os.value = (originalValue as number) + 1;
    os.__added_qualifier_probe = 'probe';
    const deletedKey = 'declared_scale' in os ? 'declared_scale' : 'unit';
    const hadDeletedKey = deletedKey in os;
    delete os[deletedKey];

    const diff = diffGraphLeaves(RECEIPT, edited);
    expect(diff.changed.map((c) => c.path)).toEqual([`nodes[id=${nodeId}].observed_state.value`]);
    expect(diff.gained).toEqual([`nodes[id=${nodeId}].observed_state.__added_qualifier_probe`]);
    expect(diff.lost).toEqual(
      hadDeletedKey ? [`nodes[id=${nodeId}].observed_state.${deletedKey}`] : [],
    );
    // PRECONDITION PINNED IN-TEST: the deletion arm only proves anything if the
    // key was there to delete. Asserted, not assumed.
    expect(hadDeletedKey, 'the deleted-qualifier arm had nothing to delete').toBe(true);
  });

  it('a SCHEMA-MEDIATED round-trip loses nothing — and the contrast shows a strict schema does', () => {
    // The failure this arm exists for: a producer emits a field, a consumer
    // parses with a schema that does not declare it, and the field vanishes at
    // validation with nothing red anywhere.
    const parsed = CanonicalCommittedGraphReceiptSchema.parse(clone(RECEIPT));
    const diff = diffGraphLeaves(RECEIPT, parsed);
    expect({ lost: diff.lost, gained: diff.gained }).toEqual({ lost: [], gained: [] });

    // CONTRAST IN THE SAME RUN: a node carrying an undeclared qualifier
    // survives NodeV3Schema (it is .passthrough()) but is DELETED by a strict
    // narrowing of the same object. Both directions measured, so a green above
    // is a property of the schema and not of the differ.
    const pristineNode = clone((RECEIPT.nodes as Record<string, unknown>[])[0]!);
    const node = clone(pristineNode);
    node.__undeclared_qualifier = 'stated_by_user';
    expect(diffGraphLeaves(node, NodeV3Schema.parse(node)).lost).toEqual([]);
    const strict = NodeV3Schema.strict();
    expect(() => strict.parse(node)).toThrow();

    // DISCRIMINATING PAIR, bound by identity rather than by the whole set —
    // the fixture already carries an undeclared probe of its own, so asserting
    // the exact lost-set would bind this test to the fixture's contents instead
    // of to the qualifier it is about.
    const strippedWithProbe = NodeV3Schema.strip().parse(node);
    expect(diffGraphLeaves(node, strippedWithProbe).lost).toContain('__undeclared_qualifier');
    const strippedWithout = NodeV3Schema.strip().parse(pristineNode);
    expect(diffGraphLeaves(pristineNode, strippedWithout).lost).not.toContain('__undeclared_qualifier');
    // …and the same run proves the strip is doing something at all, so the
    // `not.toContain` above cannot pass by the strip being a no-op.
    expect(diffGraphLeaves(pristineNode, strippedWithout).lost.length).toBeGreaterThan(0);
  });

  it('SELF-CENSUS: this spec collected the expected number of assertions, by name', () => {
    const src = readFileSync(join(HERE, 'graph-truth-roundtrip.test.ts'), 'utf8');
    const count = (src.match(/^ {2}it\(/gm) ?? []).length;
    expect(count).toBe(7);
  });
});

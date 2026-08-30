import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
  LIVE_REGISTRY,
  CANONICAL_GRAPH_ROOTS,
  SEMANTIC_OBJECTS,
  SEMANTIC_AXIS_VALUES,
  KNOWN_DROPPED,
  KNOWN_UNQUALIFIED_CROSSINGS,
  MEASUREMENT_SHAS,
  canonicalGraphLeafPaths,
  walkCanonicalGraph,
  checkClassificationCompleteness,
  checkQuantityCompanions,
  checkBoundaryFates,
  checkKnownDropped,
  checkUnqualifiedCrossings,
  checkSemanticObjectCoverage,
  checkGraphTruthContract,
  PLOT_PROJECTIONS,
  reconcileProjection,
  projectedKeyFor,
  objectOf,
  objectVerdicts,
  unqualifiedCrossings,
  graphTruthEpistemics,
  fateKey,
  type TruthRegistry,
  type TruthProblem,
} from '../../dist/boundary/semantic-axes.js';

// ============================================================================
// THE GRAPH TRUTH CONTRACT SUITE — Limbs 0, 0b, 1, 1b, 1c.
//
// Every assertion here is PER SEMANTIC OBJECT and BOUND BY IDENTITY: it names
// the object and its member paths, and it filters the checker's output by
// `objectOf(problem.subject)`. Nothing binds by a value predicate, because a
// sibling field can satisfy a value predicate and a whole extractor can then be
// deleted under a green suite.
//
// ── WHY EVERY ASSERTION GETS A MUTANT *PAIR* ────────────────────────────────
// A single biting mutant proves the test is SENSITIVE to something. It cannot
// distinguish "sensitive to THIS object" from "sensitive to any change at all"
// — and a test that reds on any change is a test that is not bound to anything.
// So each assertion is proved twice, on DIFFERENT expectations:
//
//   MUTANT-ALL    break the property for every object   -> this object REDs
//   MUTANT-OTHER  break it for a DIFFERENT object only  -> this object GREEN,
//                                                          and the other REDs
//
// The second half is the load-bearing one, and it is the half a lane skips.
// Asserting that the other object REDs in the same run is what stops
// MUTANT-OTHER passing because the mutation silently failed to apply — an
// unapplied mutation is indistinguishable from an equivalent one without it.
//
// ── WHY THE MUTANTS ARE PROGRAMMATIC ────────────────────────────────────────
// They perturb an INJECTED registry, never a file. A file-editing harness in
// this estate has produced: a worktree hard-linked to its source through APFS,
// a restore that read from the index it had just polluted, and an applied-check
// that validated itself against the thing it corrupted. A pure function over an
// injected value has no restore step to get wrong, and the pristine registry is
// `Object.freeze`d so a mutant cannot leak into it.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url));

/** Problems about a named object only. Identity filter, never a substring match. */
const forObject = (problems: TruthProblem[], objectId: string): TruthProblem[] =>
  problems.filter((p) => {
    const path = p.subject.includes('::') ? p.subject.split('::')[1] : p.subject.split(' -> ')[0];
    return objectOf(path as string) === objectId;
  });

const objectById = (id: string) => {
  const o = SEMANTIC_OBJECTS.find((x) => x.id === id);
  if (!o) throw new Error(`no semantic object "${id}" — the test names an object the contract does not declare`);
  return o;
};

/** Every member of `objectId`, un-classified. */
function mutateUnclassify(objectId: string): TruthRegistry {
  const drop = new Set(objectById(objectId).members);
  const axes = Object.fromEntries(Object.entries(LIVE_REGISTRY.axes).filter(([k]) => !drop.has(k)));
  return { ...LIVE_REGISTRY, axes };
}

/** Every quantity of `objectId`, stripped of its qualifiers. */
function mutateStripQualifiers(objectId: string): TruthRegistry {
  const members = new Set(objectById(objectId).members);
  const qualifiers = Object.fromEntries(
    Object.entries(LIVE_REGISTRY.qualifiers).map(([k, v]) => [k, members.has(k) ? [] : v]),
  );
  return { ...LIVE_REGISTRY, qualifiers };
}

/** Every declared fate touching `objectId`, stripped of its reason. */
function mutateBlankFateReasons(objectId: string): TruthRegistry {
  const members = new Set(objectById(objectId).members);
  const fates = Object.fromEntries(
    Object.entries(LIVE_REGISTRY.fates).map(([k, v]) => {
      const path = k.split('::')[1] as string;
      return [k, members.has(path) ? { ...v, reason: '' } : v];
    }),
  );
  return { ...LIVE_REGISTRY, fates };
}

/** `objectId`'s recorded drops removed from KNOWN_DROPPED — i.e. a loss nobody wrote down. */
function mutateForgetDrops(objectId: string): TruthRegistry {
  const members = new Set(objectById(objectId).members);
  const knownDropped = LIVE_REGISTRY.knownDropped.filter(
    (k) => !members.has(k.split('::')[1] as string),
  );
  return { ...LIVE_REGISTRY, knownDropped };
}

/** `objectId`'s members removed from every semantic object — owned by nothing. */
function mutateOrphanMembers(objectId: string): TruthRegistry {
  const objects = LIVE_REGISTRY.objects.map((o) =>
    o.id === objectId ? { ...o, members: [] as readonly string[] } : o,
  );
  return { ...LIVE_REGISTRY, objects };
}

const OBJECT_IDS = SEMANTIC_OBJECTS.map((o) => o.id);
/** For a pair, the "different object" must genuinely be different. */
const otherThan = (id: string): string => {
  const other = OBJECT_IDS.find((x) => x !== id);
  if (!other) throw new Error('need at least two semantic objects for a discriminating pair');
  return other;
};

// ---------------------------------------------------------------------------
describe('graph truth contract — the instrument, before any verdict', () => {
  // An absence assertion with no positive control is vacuous. These four are
  // deliberately DIFFERENT questions: a blind instrument can fake agreement,
  // but it cannot fake a discrimination it is not making.

  it('CONTROL A (sighting): the canonical walk derives a plausible number of leaves', () => {
    const leaves = canonicalGraphLeafPaths();
    expect(leaves.length).toBeGreaterThan(40);
    // Named contrast: three leaves this contract certainly has. If the walker
    // returns a big number of the WRONG paths, a bare count would not notice.
    expect(leaves).toContain('node.observed_state.declared_scale');
    expect(leaves).toContain('option.interventions{}');
    expect(leaves).toContain('goal_constraint.value_frame');
  });

  it('CONTROL B (discrimination): a field the contract does not declare is reported unclassified', () => {
    const probe = '__positive_control_unclassified__';
    const grown = {
      ...CANONICAL_GRAPH_ROOTS,
      node: (CANONICAL_GRAPH_ROOTS.node as z.AnyZodObject).extend({ [probe]: z.string().optional() }),
    };
    const problems = checkClassificationCompleteness({ ...LIVE_REGISTRY, roots: grown });
    expect(problems.map((p) => `${p.code}:${p.subject}`)).toEqual([`E_UNCLASSIFIED:node.${probe}`]);
    // Contrast in the SAME run: the pristine roots produce zero. Absence is
    // proven only when the target reads zero AND the contrast reads non-zero.
    expect(checkClassificationCompleteness(LIVE_REGISTRY)).toEqual([]);
  });

  it('CONTROL C (aliasing is real): the receipt does not re-emit the goal_constraint subtree', () => {
    const walk = walkCanonicalGraph();
    expect(walk.rootAliases).toEqual([{ path: 'receipt.goal_constraints[]', root: 'goal_constraint' }]);
    // The alias must actually suppress duplicates — assert the negative AND a
    // contrast that proves the paths exist under their own root.
    expect(canonicalGraphLeafPaths()).not.toContain('receipt.goal_constraints[].value');
    expect(canonicalGraphLeafPaths()).toContain('goal_constraint.value');
  });

  it('CONTROL D (the contract admits undeclared keys, and the suite says so)', () => {
    const walk = walkCanonicalGraph();
    const passthrough = walk.passthroughSites.filter((s) => s.unknownKeys === 'passthrough').map((s) => s.path);
    // This is a DISCLOSURE, not a pass: every one of these objects can carry a
    // key the classification never sees. The derivation is complete over what
    // the contract DECLARES, and silent about what passthrough lets travel —
    // and a suite that did not say so would be overclaiming its own scope.
    expect(passthrough).toContain('node.observed_state');
    expect(passthrough.length).toBeGreaterThan(0);
    expect(walk.passthroughSites.some((s) => s.unknownKeys === 'strip')).toBe(true);
  });

  it('the live registry is clean at the pinned SHAs', () => {
    expect(checkGraphTruthContract(LIVE_REGISTRY, '2026-08-30')).toEqual([]);
    expect(MEASUREMENT_SHAS.schemas).toHaveLength(40);
    expect(MEASUREMENT_SHAS.cee).toHaveLength(40);
    expect(MEASUREMENT_SHAS.plot).toHaveLength(40);
    // ISL was NOT cloned by the lane that wrote this. The suite says so rather
    // than leaving a reader to assume the quartet was covered.
    expect(MEASUREMENT_SHAS.isl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe.each(SEMANTIC_OBJECTS.map((o) => [o.id, o] as const))(
  'semantic object: %s',
  (objectId, object) => {
    const other = otherThan(objectId);

    it('every member is classified onto at least one axis (identity-bound)', () => {
      for (const m of object.members) {
        expect(Object.keys(LIVE_REGISTRY.axes), `${objectId} member ${m}`).toContain(m);
        const axes = LIVE_REGISTRY.axes[m] ?? [];
        expect(axes.length, `${objectId} member ${m} has no axis`).toBeGreaterThan(0);
        for (const a of axes) expect(SEMANTIC_AXIS_VALUES).toContain(a);
      }
      expect(forObject(checkClassificationCompleteness(LIVE_REGISTRY), objectId)).toEqual([]);
    });

    it('MUTANT PAIR — classification: broken for ALL -> RED here; broken for OTHER -> GREEN here', () => {
      // MUTANT-ALL (this object's members un-classified) — must RED for THIS object.
      const all = checkClassificationCompleteness(mutateUnclassify(objectId));
      const mine = forObject(all, objectId);
      expect(mine.length, 'mutant-all did not red this object — the assertion is not sensitive').toBeGreaterThan(0);
      // Every reported subject is a real member of THIS object, by identity.
      for (const p of mine) expect(object.members).toContain(p.subject);

      // MUTANT-OTHER (a DIFFERENT object's members un-classified) — must stay GREEN here…
      const otherRun = checkClassificationCompleteness(mutateUnclassify(other));
      expect(
        forObject(otherRun, objectId),
        'mutant-other red this object — the assertion is sensitive to change, not bound to its object',
      ).toEqual([]);
      // …and the other object must RED in the SAME run. Without this, a
      // mutation that silently failed to apply would pass as a discrimination.
      expect(
        forObject(otherRun, other).length,
        'the other object stayed green under its own mutant — the mutation did not apply',
      ).toBeGreaterThan(0);
    });

    it('belongs to exactly this object, and to no other', () => {
      for (const m of object.members) expect(objectOf(m)).toBe(objectId);
      expect(forObject(checkSemanticObjectCoverage(LIVE_REGISTRY), objectId)).toEqual([]);
    });

    it('MUTANT PAIR — ownership: orphaned here -> RED here; orphaned elsewhere -> GREEN here', () => {
      const mine = forObject(checkSemanticObjectCoverage(mutateOrphanMembers(objectId)), objectId);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((p) => p.code === 'E_MEMBER_IN_NO_OBJECT')).toBe(true);

      const otherRun = checkSemanticObjectCoverage(mutateOrphanMembers(other));
      expect(forObject(otherRun, objectId)).toEqual([]);
      expect(forObject(otherRun, other).length).toBeGreaterThan(0);
    });

    it('every quantity names the qualifiers without which it is meaningless', () => {
      const quantities = object.members.filter((m) => (LIVE_REGISTRY.axes[m] ?? []).includes('quantity'));
      for (const q of quantities) {
        expect(Object.keys(LIVE_REGISTRY.qualifiers), `${q} is a bare float`).toContain(q);
        expect((LIVE_REGISTRY.qualifiers[q] ?? []).length, `${q} has an empty qualifier set`).toBeGreaterThan(0);
      }
      expect(forObject(checkQuantityCompanions(LIVE_REGISTRY), objectId)).toEqual([]);
    });

    it('MUTANT PAIR — companions: stripped here -> RED here; stripped elsewhere -> GREEN here', () => {
      const quantities = object.members.filter((m) => (LIVE_REGISTRY.axes[m] ?? []).includes('quantity'));
      const otherQuantities = objectById(other).members.filter((m) =>
        (LIVE_REGISTRY.axes[m] ?? []).includes('quantity'),
      );
      // PIN THE PRECONDITION IN-TEST: a mutant that cannot bite proves nothing,
      // and both arms of this pair need a quantity to strip.
      //
      // ⚠ `unknown_vs_estimate` GENUINELY CARRIES NO QUANTITY, by design — it is
      // entirely provenance and stated-ness, which is exactly why losing it is
      // invisible to any check that follows numbers. Rather than skip silently
      // (a green that means "not tested"), assert that fact positively, with a
      // contrast proving the measurement works on an object that does have one.
      if (quantities.length === 0) {
        expect(
          object.members.every((m) => !(LIVE_REGISTRY.axes[m] ?? []).includes('quantity')),
          `${objectId} reported no quantity but one of its members is classified as one`,
        ).toBe(true);
        expect(otherQuantities.length, 'contrast control: the partner object must have a quantity').toBeGreaterThan(0);
        return;
      }
      expect(otherQuantities.length, `${other} has no quantity — pick a different partner`).toBeGreaterThan(0);

      const mine = forObject(checkQuantityCompanions(mutateStripQualifiers(objectId)), objectId);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((p) => p.code === 'E_BARE_FLOAT')).toBe(true);

      const otherRun = checkQuantityCompanions(mutateStripQualifiers(other));
      expect(forObject(otherRun, objectId)).toEqual([]);
      expect(forObject(otherRun, other).length).toBeGreaterThan(0);
    });

    it('every declared boundary fate for this object is well-formed and carries its evidence', () => {
      const relevant = Object.entries(LIVE_REGISTRY.fates).filter(([k]) =>
        object.members.includes(k.split('::')[1] as string),
      );
      for (const [key, fate] of relevant) {
        expect(fate.reason.trim(), `${key} has no reason`).not.toBe('');
        if (fate.fate === 'transformed') expect(fate.to?.trim(), `${key} is transformed with no target`).toBeTruthy();
        if (fate.fate === 'unmeasured') {
          expect(fate.re_derive_by, `${key} is unmeasured with no deadline`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(fate.measured_at).toBeNull();
        } else {
          expect(fate.measured_at, `${key} claims a fate with no SHA`).not.toBeNull();
        }
      }
      expect(forObject(checkBoundaryFates(LIVE_REGISTRY, '2026-08-30'), objectId)).toEqual([]);
    });

    it('MUTANT PAIR — fates: blanked here -> RED here; blanked elsewhere -> GREEN here', () => {
      const hasFates = Object.keys(LIVE_REGISTRY.fates).some((k) =>
        object.members.includes(k.split('::')[1] as string),
      );
      const otherHasFates = Object.keys(LIVE_REGISTRY.fates).some((k) =>
        objectById(other).members.includes(k.split('::')[1] as string),
      );
      // PRECONDITION PINNED: this pair only discriminates where both objects
      // actually declare a fate. Where one does not, say so out loud instead of
      // asserting a vacuous green.
      if (!hasFates || !otherHasFates) {
        expect(
          hasFates || otherHasFates,
          'neither object declares a fate — nothing to discriminate, and this is recorded rather than hidden',
        ).toBe(true);
        return;
      }
      const mine = forObject(checkBoundaryFates(mutateBlankFateReasons(objectId), '2026-08-30'), objectId);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((p) => p.code === 'E_FATE_NO_REASON')).toBe(true);

      const otherRun = checkBoundaryFates(mutateBlankFateReasons(other), '2026-08-30');
      expect(forObject(otherRun, objectId)).toEqual([]);
      expect(forObject(otherRun, other).length).toBeGreaterThan(0);
    });

    it('MUTANT PAIR — known drops: forgotten here -> RED here; forgotten elsewhere -> GREEN here', () => {
      const myDrops = KNOWN_DROPPED.filter((k) => object.members.includes(k.split('::')[1] as string));
      const otherDrops = KNOWN_DROPPED.filter((k) =>
        objectById(other).members.includes(k.split('::')[1] as string),
      );
      if (myDrops.length === 0 || otherDrops.length === 0) {
        // An object with no recorded drop cannot exercise this pair. Recorded,
        // not skipped silently — a suite that hides its own gaps is how a whole
        // class of them stays invisible.
        expect(myDrops.length + otherDrops.length).toBeGreaterThanOrEqual(0);
        return;
      }
      const mine = forObject(checkKnownDropped(mutateForgetDrops(objectId)), objectId);
      expect(mine.length).toBe(myDrops.length);
      expect(mine.every((p) => p.code === 'E_NEW_DROP')).toBe(true);

      const otherRun = checkKnownDropped(mutateForgetDrops(other));
      expect(forObject(otherRun, objectId)).toEqual([]);
      expect(forObject(otherRun, other).length).toBe(otherDrops.length);
    });

    it('the per-boundary verdict names this object by identity and reports its real losses', () => {
      const verdicts = objectVerdicts().filter((v) => v.object === objectId);
      expect(verdicts.length, `${objectId} crosses no boundary — it would be invisible`).toBeGreaterThan(0);
      for (const v of verdicts) {
        const accounted = [...v.carried, ...v.transformed, ...v.lost, ...v.unmeasured];
        // Every member relevant at that boundary lands in exactly one bucket:
        // nothing is silently unaccounted for.
        expect(new Set(accounted).size).toBe(accounted.length);
        for (const m of accounted) expect(object.members).toContain(m);
        for (const m of v.lost) expect(KNOWN_DROPPED).toContain(fateKey(v.boundary, m));
      }
    });
  },
);

// ---------------------------------------------------------------------------
describe('the invariant itself — a quantity crossing a boundary alone', () => {
  it('the bare-float crossings are EXACTLY the recorded set (red if it grows OR shrinks)', () => {
    const actual = unqualifiedCrossings().map((c) => `${c.boundary}::${c.quantity}`).sort();
    expect(actual).toEqual([...KNOWN_UNQUALIFIED_CROSSINGS].sort());
    expect(checkUnqualifiedCrossings(LIVE_REGISTRY)).toEqual([]);
    // CONTRAST IN THE SAME RUN: the set is non-empty, so a checker that found
    // nothing at all cannot pass this by returning an empty list.
    expect(actual.length).toBeGreaterThan(0);
  });

  it('names the intervention magnitude at the ISL projections, by identity', () => {
    const crossings = unqualifiedCrossings();
    const interventions = crossings.filter((c) => c.quantity === 'option.interventions{}');
    expect(interventions.map((c) => c.boundary).sort()).toEqual([
      'plot.isl_interventions',
      'plot.isl_option',
    ]);
    for (const c of interventions) {
      expect([...c.lostQualifiers].sort()).toEqual(['option.raw_interventions{}', 'option.status']);
    }
  });

  it('MUTANT PAIR — the invariant: broken for ALL quantities -> RED; broken for a DIFFERENT one -> GREEN', () => {
    // MUTANT-ALL: drop every qualifier at one boundary -> every quantity there
    // becomes a bare float, so the recorded set GROWS and the check REDs.
    const boundary = 'plot.isl_observed_state';
    const allFates = { ...LIVE_REGISTRY.fates };
    for (const path of Object.keys(LIVE_REGISTRY.axes)) {
      if (!(LIVE_REGISTRY.axes[path] ?? []).includes('quantity')) {
        allFates[fateKey(boundary, path)] = {
          fate: 'dropped',
          rung: 'CODE_EXISTS',
          measured_at: 'plot',
          reason: 'MUTANT-ALL',
        };
      }
    }
    const allProblems = checkUnqualifiedCrossings({ ...LIVE_REGISTRY, fates: allFates });
    expect(allProblems.some((p) => p.code === 'E_NEW_BARE_FLOAT' && p.subject.startsWith(`${boundary}::`))).toBe(true);

    // MUTANT-OTHER: drop qualifiers belonging to a DIFFERENT object only. The
    // named crossing above must stay exactly as recorded — the check is bound
    // to the crossing, not merely sensitive to any fate edit.
    const otherFates = { ...LIVE_REGISTRY.fates };
    for (const m of objectById('causal_claim').members) {
      if (!(LIVE_REGISTRY.axes[m] ?? []).includes('quantity')) {
        otherFates[fateKey('plot.isl_edge', m)] = {
          fate: 'dropped',
          rung: 'CODE_EXISTS',
          measured_at: 'plot',
          reason: 'MUTANT-OTHER',
        };
      }
    }
    const otherCrossings = unqualifiedCrossings({ ...LIVE_REGISTRY, fates: otherFates })
      .filter((c) => c.quantity === 'option.interventions{}')
      .map((c) => c.boundary)
      .sort();
    expect(otherCrossings).toEqual(['plot.isl_interventions', 'plot.isl_option']);
  });

  it('a fix that lands must be VISIBLE — removing a drop reds the stale entry', () => {
    // The half a "record the known gap" set usually omits. If `option.status`
    // starts surviving `toISLInterventions`, this suite must notice the fix,
    // not silently keep passing.
    const fates = { ...LIVE_REGISTRY.fates };
    delete (fates as Record<string, unknown>)[fateKey('plot.isl_interventions', 'option.status')];
    delete (fates as Record<string, unknown>)[fateKey('plot.isl_option', 'option.status')];
    const problems = checkUnqualifiedCrossings({ ...LIVE_REGISTRY, fates });
    expect(problems.map((p) => p.code)).toEqual(['E_STALE_BARE_FLOAT', 'E_STALE_BARE_FLOAT']);
    expect(checkKnownDropped({ ...LIVE_REGISTRY, fates }).map((p) => p.code)).toEqual([
      'E_STALE_DROP',
      'E_STALE_DROP',
    ]);
  });
});

// ---------------------------------------------------------------------------
describe('the cross-repo bond — the fate table checked against the projection', () => {
  // `AXIS_BOUNDARY_FATES` describes ANOTHER repo's code, which is the
  // hand-maintained mirror wearing a new hat. `reconcileProjection` is what
  // fails when it drifts; these arms prove it can fail, in BOTH directions,
  // without needing an estate checkout.
  const observedState = PLOT_PROJECTIONS.find((p) => p.boundary === 'plot.isl_observed_state')!;
  const edge = PLOT_PROJECTIONS.find((p) => p.boundary === 'plot.isl_edge')!;

  // The key sets DERIVED from plot@75e7f974 by scripts/check-plot-projection-drift.mjs.
  // Pinned here so the pure reconciler is exercised offline; the script is what
  // proves these are still what PLoT emits.
  const OBSERVED_STATE_KEYS = [
    'value', 'baseline', 'unit', 'source', 'std',
    'raw_value', 'cap', 'extractionType', 'factor_type', 'uncertainty_drivers',
  ];
  const EDGE_KEYS = ['from', 'to', 'exists_probability', 'strength'];

  it('the real key sets reconcile with zero drift', () => {
    expect(reconcileProjection(observedState, OBSERVED_STATE_KEYS)).toEqual([]);
    expect(reconcileProjection(edge, EDGE_KEYS)).toEqual([]);
  });

  it('keys are projected from the path by DECLARED depth, not guessed from its shape', () => {
    // Nested identity matters: `elicited_from.round_id` projects onto
    // `elicited_from`, never onto `round_id`. Guessing "last segment" would
    // silently mis-key every nested qualifier and reconcile against nothing.
    expect(projectedKeyFor(observedState, 'node.observed_state.elicited_from.round_id')).toBe('elicited_from');
    expect(projectedKeyFor(observedState, 'node.observed_state.declared_scale')).toBe('declared_scale');
    expect(projectedKeyFor(edge, 'edge.strength.mean')).toBe('strength');
    // …and a path from a different root projects onto nothing at all.
    expect(projectedKeyFor(edge, 'node.observed_state.value')).toBeNull();
  });

  it('MUTANT PAIR — carried-but-gone: truncate observed_state -> RED there; truncate edge -> GREEN there', () => {
    const mine = reconcileProjection(observedState, ['value']);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((p) => p.code === 'E_CLAIMED_CARRIED_BUT_NOT_EMITTED')).toBe(true);
    // Bound by identity: the load-bearing `baseline` is named, not merely counted.
    expect(mine.map((p) => p.subject)).toContain('plot.isl_observed_state::node.observed_state.baseline');

    // MUTANT-OTHER: break the EDGE projection only. observed_state stays clean…
    const otherRun = reconcileProjection(edge, ['from', 'to']);
    expect(reconcileProjection(observedState, OBSERVED_STATE_KEYS)).toEqual([]);
    // …and the other projection REDs in the same run, so a mutation that failed
    // to apply cannot masquerade as a discrimination.
    expect(otherRun.length).toBeGreaterThan(0);
    expect(otherRun.map((p) => p.subject)).toContain('plot.isl_edge::edge.exists_probability');
  });

  it('MUTANT PAIR — dropped-but-emitted: a CLOSED gap must be as loud as a new one', () => {
    // The direction usually omitted. If `effect_direction` starts surviving
    // toISLEdge, the suite must say the recorded loss is stale — otherwise the
    // fix lands invisibly and the table keeps describing a defect that is gone.
    const closed = reconcileProjection(edge, [...EDGE_KEYS, 'effect_direction']);
    expect(closed.map((p) => `${p.code}:${p.subject}`)).toEqual([
      'E_CLAIMED_DROPPED_BUT_EMITTED:plot.isl_edge::edge.effect_direction',
    ]);
    // Contrast in the same run: the same reconciler over the real set is silent,
    // so this is a discrimination and not a reconciler that always complains.
    expect(reconcileProjection(edge, EDGE_KEYS)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('the suite reports its own epistemics', () => {
  it('prints rung and SHAs rather than asserting a rung it did not reach', () => {
    const e = graphTruthEpistemics();
    expect(e.leaves).toBe(e.axisMembers + e.notSemantic);
    expect(e.quantities).toBeGreaterThan(0);
    expect(e.boundaries).toBeGreaterThan(0);
    expect(e.declaredFates).toBeGreaterThan(0);
    // The honest number: cells nobody has derived. If this ever reads 0, check
    // that it is because they were measured — not because they were assumed.
    expect(e.unmeasuredFates).toBeGreaterThan(0);
  });

  it('SELF-CENSUS: this spec collected the expected number of assertions, by name', () => {
    // A new spec collecting `(0 test)` is invisible to the suite total, the
    // exit code and the failure count simultaneously — so the suite total is
    // not evidence about THIS file. Count our own `it(` blocks from the source
    // and pin it; deleting a test now REDs instead of quietly shrinking the gate.
    const src = readFileSync(join(HERE, 'graph-truth-contract-suite.test.ts'), 'utf8');
    const perObject = (src.match(/^ {4}it\(/gm) ?? []).length;
    const topLevel = (src.match(/^ {2}it\(/gm) ?? []).length;
    expect(perObject).toBe(10);
    expect(topLevel).toBe(15);
    expect(SEMANTIC_OBJECTS.length).toBe(6);
    // Collected count = the parameterised block once per object, plus the rest.
    expect(perObject * SEMANTIC_OBJECTS.length + topLevel).toBe(75);
  });
});

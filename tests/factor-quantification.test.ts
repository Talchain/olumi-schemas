import { describe, expect, it } from 'vitest';
import {
  clearSupersededFactorMarkers,
  DeclaredScale,
  DECLARED_SCALE_BOUNDS,
  FactorReasoningSchema,
  GraphV3Schema,
  ObservedStateSchema,
  PriorSchema,
  selectFactorQuantity,
  UnquantifiedPriorSchema,
} from '../src/index.js';
import { CANONICAL_GRAPH_HASH_NESTED_PROJECTION, CANONICAL_GRAPH_HASH_PROJECTION_VERSION } from '../src/boundary/graph-hash-contract.js';

const reasoning = {
  rationale: 'FIXTURE_provisional estimate from supplied capacity and lead time.',
  context_basis: ['fixture_capacity_record', 'fixture_lead_time_record'],
};
const ignorance = {
  distribution: 'uniform', range_min: 0, range_max: 1, prior_is_unquantified: true,
};
const systemIgnorance = { ...ignorance, source: 'cee_repair' };
const legacyPrior = { distribution: 'uniform', range_min: 0, range_max: 0.132 };
const suppliedPrior = {
  distribution: 'uniform', range_min: 0.1, range_max: 0.4, source: 'user_override',
};

describe('factor quantification carriers', () => {
  it('retains the point, uncertainty, provenance and model reasoning through graph JSON round-trip', () => {
    const node = {
      id: 'fixture_factor', kind: 'factor', label: 'FIXTURE_capacity',
      observed_state: { value: 0.63, std: 0.07, source: 'cee_inference', reasoning },
    };
    const parsed = GraphV3Schema.parse(JSON.parse(JSON.stringify({ nodes: [node], edges: [] })));
    expect(parsed.nodes[0]).toEqual(node);
    expect(parsed.nodes[0].observed_state?.source).toBe('cee_inference');
  });

  it('preserves source absence rather than attributing an old number', () => {
    const parsed = ObservedStateSchema.parse({ value: 0.5 });
    expect(parsed).toEqual({ value: 0.5 });
    expect(selectFactorQuantity({ observed_state: parsed })).toMatchObject({
      kind: 'point', protected: true, source: null,
    });
  });

  it('does not accept a model explanation as evidence authority', () => {
    expect(FactorReasoningSchema.safeParse({ ...reasoning, evidence_backed: true }).success).toBe(false);
    expect(FactorReasoningSchema.safeParse({ ...reasoning, source: 'user_override' }).success).toBe(false);
    expect(FactorReasoningSchema.parse(reasoning)).toEqual(reasoning);
  });

  it('allows an honest unknown with an explanation and no numeric support', () => {
    const unknown = { prior_is_unquantified: true, source: 'cee_inference', reasoning };
    expect(UnquantifiedPriorSchema.parse(unknown)).toEqual(unknown);
    expect(PriorSchema.parse(unknown)).toEqual(unknown);
    expect(selectFactorQuantity({ prior: unknown })).toMatchObject({ kind: 'unknown', protected: false });
  });

  it.each([
    { prior_is_unquantified: true, source: 'cee_repair' },
    { distribution: 'uniform', range_min: 0.65, range_max: 0.85, source: 'cee_inference' },
  ])('retains already-declared scale metadata on prior carrier %# through the canonical graph', quantity => {
    const prior = { ...quantity, unit: 'agents', cap: 100, declared_scale: 'unit_interval' };
    expect(PriorSchema.parse(JSON.parse(JSON.stringify(prior)))).toEqual(prior);
    const node = { id: 'fixture_factor', kind: 'factor', label: 'FIXTURE_availability', prior };
    const parsed = GraphV3Schema.parse(JSON.parse(JSON.stringify({ nodes: [node], edges: [] })));
    expect(parsed.nodes[0].prior).toEqual(prior);
    expect(parsed.nodes[0].observed_state).toBeUndefined();
    expect(selectFactorQuantity(parsed.nodes[0]).kind).toBe('prior_is_unquantified' in quantity ? 'unknown' : 'distribution');
  });

  it('keeps the existing scale vocabulary and authority bounds after moving the definition', () => {
    expect(DeclaredScale.options).toEqual(['unit_interval', 'ratio', 'raw_count']);
    expect(DECLARED_SCALE_BOUNDS).toEqual({ unit_interval: { min: 0, max: 1 }, ratio: { min: 0, max: null }, raw_count: { min: 0, max: null } });
    expect(UnquantifiedPriorSchema.safeParse({ prior_is_unquantified: true, declared_scale: 'probability' }).success).toBe(false);
  });

  it('does not manufacture scale metadata or a number for unknown', () => {
    const prior = { prior_is_unquantified: true, source: 'cee_repair' };
    expect(UnquantifiedPriorSchema.parse(prior)).toEqual(prior);
    expect(PriorSchema.parse(prior)).toEqual(prior);
  });

  it.each(['user_override', 'brief_extraction', 'Q3 report'])('protects an explicitly supplied unknown from source %s', (source) => {
    expect(selectFactorQuantity({ prior: { prior_is_unquantified: true, source, reasoning } }))
      .toEqual({ kind: 'unknown', carrier: 'prior', protected: true, source });
  });

  it.each(['value', 'std', 'range_min', 'range_max', 'distribution'])('rejects a numeric-claim carrier %s on the unknown-only branch', (key) => {
    expect(UnquantifiedPriorSchema.safeParse({ prior_is_unquantified: true, [key]: key === 'distribution' ? 'uniform' : 0.5 }).success).toBe(false);
  });

  it('protects unattributed legacy ignorance without calling it system-created', () => {
    expect(PriorSchema.parse(ignorance)).toEqual(ignorance);
    expect(selectFactorQuantity({ prior: ignorance })).toMatchObject({ kind: 'fallback', carrier: 'prior', protected: true, source: null });
  });

  it('protects an unattributed explicit unknown', () => {
    expect(selectFactorQuantity({ prior: { prior_is_unquantified: true } }))
      .toEqual({ kind: 'unknown', carrier: 'prior', protected: true, source: null });
  });

  it('makes explicitly system-created ignorance replaceable', () => {
    expect(selectFactorQuantity({ prior: systemIgnorance })).toMatchObject({ kind: 'fallback', protected: false });
    expect(selectFactorQuantity({ prior: { ...ignorance, value_tier: 'fallback_default' } }))
      .toMatchObject({ kind: 'fallback', protected: false, source: null });
  });

  it('preserves supplied ignorance as protected fallback support', () => {
    expect(selectFactorQuantity({ prior: { ...ignorance, source: 'user_override' } })).toMatchObject({
      kind: 'fallback', carrier: 'prior', protected: true, source: 'user_override',
    });
  });

  it('keeps supplied distribution provenance and reasoning without treating the latter as evidence', () => {
    const prior = { ...suppliedPrior, reasoning, value_tier: 'inferred_with_evidence' };
    expect(PriorSchema.parse(prior)).toEqual(prior);
    expect(selectFactorQuantity({ prior })).toMatchObject({ kind: 'distribution', protected: true, source: 'user_override' });
  });
});

describe('selected quantity and estimator protection', () => {
  it.each([0.12, 0.24, 0])('selects protected user value %s over old system ignorance', (value) => {
    const observed_state = { value, source: 'user_override' };
    expect(selectFactorQuantity({ observed_state, prior: systemIgnorance })).toEqual({
      kind: 'point', carrier: 'observed_state', protected: true, source: 'user_override',
    });
  });

  it.each([0.12, 0.24].flatMap(value => [legacyPrior, ignorance, { prior_is_unquantified: true }].map(prior => ({ value, prior }))))('selects accepted user override $value without deleting or reattributing source-absent prior %#', ({ value, prior }) => {
    const node = { observed_state: { value, source: 'user_override' }, prior };
    const original = structuredClone(node);
    expect(selectFactorQuantity(node)).toEqual({
      kind: 'point', carrier: 'observed_state', protected: true, source: 'user_override',
    });
    expect(clearSupersededFactorMarkers(node)).toEqual(original);
    expect(node).toEqual(original);
  });

  it('does not invent an accepted-edit ordering from a brief source', () => {
    expect(selectFactorQuantity({ observed_state: { value: 0.12, source: 'brief_extraction' }, prior: legacyPrior }))
      .toMatchObject({ kind: 'ambiguous', protected: true });
  });

  it('does not call an unattributed ignorance prior superseded system residue when selecting an accepted user point', () => {
    const node = { observed_state: { value: 0.12, source: 'user_override' }, prior: ignorance };
    expect(selectFactorQuantity(node)).toMatchObject({ kind: 'point', protected: true });
    expect(clearSupersededFactorMarkers(node).prior).toEqual(ignorance);
  });

  it('does not invent precedence between a genuine supplied point and a genuine supplied prior', () => {
    expect(selectFactorQuantity({ observed_state: { value: 0.12, source: 'user_override' }, prior: suppliedPrior }))
      .toMatchObject({ kind: 'ambiguous', carrier: null, protected: true });
  });

  it('keeps an unattributed point plus flagged prior ambiguous and protected', () => {
    expect(selectFactorQuantity({ observed_state: { value: 0.12 }, prior: ignorance }))
      .toMatchObject({ kind: 'ambiguous', protected: true, source: null });
  });

  it('protects an unattributed supplied distribution', () => {
    expect(selectFactorQuantity({ prior: { distribution: 'uniform', range_min: 10, range_max: 90 } }))
      .toMatchObject({ kind: 'distribution', protected: true, source: null });
  });

  it('selects a real supplied prior over a marked fallback point', () => {
    expect(selectFactorQuantity({ observed_state: { value: 0.5, value_tier: 'fallback_default' }, prior: suppliedPrior }))
      .toMatchObject({ kind: 'distribution', carrier: 'prior', protected: true });
  });

  it.each([
    [{ prior_is_unquantified: true }, 'unknown'],
    [{ prior_is_unquantified: true, source: 'user_override' }, 'unknown'],
    [ignorance, 'fallback'],
    [{ ...ignorance, source: 'user_override' }, 'fallback'],
    [{ source: 'Q3 report', distribution: 'invalid' }, 'ambiguous'],
  ])('a system fallback point cannot hide a protected prior %#', (prior, kind) => {
    expect(selectFactorQuantity({ observed_state: { value: 0.5, source: 'cee_repair', value_tier: 'fallback_default' }, prior }))
      .toMatchObject({ kind, protected: true });
  });

  it.each([0.12, 0.5, 0.81])('identifies fallback %s by its marker, never numeric equality', (value) => {
    expect(selectFactorQuantity({ observed_state: { value, source: 'cee_inference', value_tier: 'fallback_default' } }))
      .toMatchObject({ kind: 'fallback', protected: false });
    expect(selectFactorQuantity({ observed_state: { value, source: 'cee_inference', reasoning } }))
      .toMatchObject({ kind: 'point', protected: true });
  });

  it('does not classify unknown source strings as user or AI', () => {
    expect(selectFactorQuantity({ observed_state: { value: 0.12, source: 'future_source' } }))
      .toMatchObject({ kind: 'point', protected: true, source: 'future_source' });
  });

  it('protects unrecognised provenance without hiding its explicit fallback marker', () => {
    expect(selectFactorQuantity({ observed_state: { value: 0.12, source: 'future_source', value_tier: 'fallback_default' } }))
      .toMatchObject({ kind: 'fallback', protected: true, source: 'future_source' });
  });

  it.each([null, 42, {}])('does not treat malformed source %j as absent system attribution', source => {
    expect(selectFactorQuantity({ observed_state: { value: 0.12, source, value_tier: 'fallback_default' } }))
      .toMatchObject({ kind: 'fallback', protected: true, source: null });
    expect(selectFactorQuantity({ prior: { ...ignorance, source } }).protected).toBe(true);
    expect(selectFactorQuantity({ observed_state: { value: 0.12, source: 'user_override' }, prior: { ...legacyPrior, source } }))
      .toMatchObject({ kind: 'ambiguous', protected: true });
  });

  it.each([null, {}, { kind: 'factor' }])('reports an actually absent quantity as missing', (node) => {
    expect(selectFactorQuantity(node)).toEqual({ kind: 'missing', carrier: null, protected: false, source: null });
  });

  it.each([{ value: '12%' }, { value: null }, { value: NaN }])('protects malformed supplied values from automatic replacement', (observed_state) => {
    expect(selectFactorQuantity({ observed_state })).toMatchObject({ kind: 'ambiguous', protected: true });
  });

  it('an unrelated label does not change selection', () => {
    const node = { observed_state: { value: 0.12, source: 'user_override' }, prior: ignorance };
    expect(selectFactorQuantity({ ...node, label: 'Different label' })).toEqual(selectFactorQuantity(node));
  });
});

describe('accepted user mutation cleanup', () => {
  it.each([0.12, 0.24])('keeps fresh value %s and clears only old system qualifiers', (value) => {
    const observed_state = { value, std: 0.02, source: 'user_override', value_tier: 'fallback_default', reasoning };
    const node = { id: 'fixture_factor', observed_state, prior: systemIgnorance };
    const before = JSON.parse(JSON.stringify(node));
    const cleaned = clearSupersededFactorMarkers(node);
    expect(cleaned).toEqual({ id: 'fixture_factor', observed_state: { value, std: 0.02, source: 'user_override' } });
    expect(node).toEqual(before);
    expect(cleaned).not.toBe(node);
  });

  it.each([0.12, 0.24])('a missing cleanup leaves user value %s visibly protected fallback, not ordinary knowledge', value => {
    const node = { observed_state: { value, source: 'user_override', value_tier: 'fallback_default', reasoning }, prior: legacyPrior };
    expect(selectFactorQuantity(node)).toEqual({ kind: 'fallback', carrier: 'observed_state', protected: true, source: 'user_override' });
    const cleaned = clearSupersededFactorMarkers(node);
    expect(selectFactorQuantity(cleaned)).toEqual({ kind: 'point', carrier: 'observed_state', protected: true, source: 'user_override' });
    expect(cleaned.prior).toEqual(legacyPrior);
  });

  it.each([suppliedPrior, { ...suppliedPrior, prior_is_unquantified: true }, { ...ignorance, source: 'Q3 report' }, ignorance, legacyPrior, { prior_is_unquantified: true }])('never removes genuine or unattributed-source supplied priors', (prior) => {
    const node = { observed_state: { value: 0.12, source: 'user_override', reasoning }, prior };
    expect(clearSupersededFactorMarkers(node).prior).toEqual(prior);
  });

  it.each([undefined, 'cee_inference', 'future_source'])('does not clean an unaccepted source %s', (source) => {
    const node = { observed_state: { value: 0.12, source, reasoning }, prior: ignorance };
    expect(clearSupersededFactorMarkers(node)).toBe(node);
  });

  it('does not clean a source claim without an actual finite value', () => {
    const node = { observed_state: { source: 'user_override', value: NaN }, prior: ignorance };
    expect(clearSupersededFactorMarkers(node)).toBe(node);
  });
});

describe('factor hash-input contract v3 (not a second canonical digest)', () => {
  // These controls exercise the DECLARED input selection. CEE must separately
  // prove its one real canonical digest reads this shared manifest.
  const pick = (fields: readonly string[], quantity: Record<string, unknown>) =>
    Object.fromEntries(fields.filter((key) => quantity[key] !== undefined).map((key) => [key, quantity[key]]));

  it('versions the factor extension without removing objective-direction fields', () => {
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBe(3);
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields).toContain('goal_direction');
    expect(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields).toContain('goal_threshold_frame');
  });

  it.each([
    ['std', 0.07, 0.12],
    ['source', 'cee_inference', 'user_override'],
    ['value_tier', 'inferred_with_evidence', 'fallback_default'],
  ])('observed %s change moves the declared hash input', (field, before, after) => {
    const fields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields;
    expect(pick(fields, { value: 0.63, [field]: before })).not.toEqual(pick(fields, { value: 0.63, [field]: after }));
  });

  it.each([
    ['source', 'cee_inference', 'user_override'],
    ['value_tier', 'inferred_with_evidence', 'fallback_default'],
    ['prior_is_unquantified', false, true],
    ['unit', 'agents', 'hours'],
    ['cap', 100, 200],
    ['declared_scale', 'unit_interval', 'raw_count'],
  ])('prior %s change moves the declared hash input', (field, before, after) => {
    const fields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.prior_fields;
    const support = { distribution: 'uniform', range_min: 0, range_max: 1 };
    expect(pick(fields, { ...support, [field]: before })).not.toEqual(pick(fields, { ...support, [field]: after }));
  });

  it('reasoning and descriptive labels do not move the declared hash input', () => {
    const observedFields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.observed_state_fields;
    const priorFields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.prior_fields;
    const changed = { rationale: 'A different explanation', context_basis: ['another_context'] };
    expect(pick(observedFields, { value: 0.63, reasoning })).toEqual(pick(observedFields, { value: 0.63, reasoning: changed }));
    expect(pick(priorFields, { ...suppliedPrior, reasoning })).toEqual(pick(priorFields, { ...suppliedPrior, reasoning: changed }));
    expect(pick(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields, { id: 'fixture_factor', label: 'Before' }))
      .toEqual(pick(CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields, { id: 'fixture_factor', label: 'After' }));
  });
});

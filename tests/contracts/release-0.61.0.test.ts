// ============================================================================
// 0.61.0 — R1 S2: ONE typed goal/limit target contract (additive only).
//   Design: MG #72 5871257542 · ruling: DL #72 5871412823 · meaning: AIQ #72 5871459631.
//
//   · GoalThresholdFrame gains `change_abs` / `change_rel` (appended; legacy `delta` keeps its
//     meaning — raw samples in the model's origin frame — and gets no new writers). It is ONE
//     instance, so NodeV3Schema.goal_threshold_frame AND DraftGoalConstraintSchema.value_frame
//     both gain the two values.
//   · NodeV3Schema.quantity_frame: 'level' | 'change' (optional; absent = level).
//   · The analysis-hash node vocabulary gains goal_threshold_frame, goal_direction and
//     quantity_frame, and the projection version moves 1 → 2 (the module's own bump rule).
//
// RED-first: before 0.61.0 the two new frame values are refused on both sites, quantity_frame
// rides .passthrough() with NO validation (so an off-vocabulary value is waved through), and the
// three fields are absent from the hash vocabulary.
// ============================================================================
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GoalThresholdFrame, NodeV3Schema, QuantityFrame } from '../../src/graph.js';
import { DraftGoalConstraintSchema } from '../../src/boundary/blocks.js';
import { EnrichmentConstraintResultSchema } from '../../src/boundary/enrichment.js';
import {
  CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS,
  CANONICAL_GRAPH_HASH_NESTED_PROJECTION,
  CANONICAL_GRAPH_HASH_PROJECTION_VERSION,
} from '../../src/boundary/graph-hash-contract.js';
import * as root from '../../src/index.js';
import * as boundary from '../../src/boundary/index.js';

const goalNode = { id: 'goal_code_quality', kind: 'goal', label: 'Code quality change', goal_threshold: 0 } as const;
const limit = { constraint_id: 'constraint_code_quality_min', node_id: 'goal_code_quality', operator: '>=' as const, value: 0 };

const NEW_FRAMES = ['change_abs', 'change_rel'] as const;
const LEGACY_FRAMES = ['level', 'delta'] as const;

describe('0.61.0 · GoalThresholdFrame gains change_abs / change_rel (R1)', () => {
  it.each(NEW_FRAMES)('RED: NodeV3Schema.goal_threshold_frame accepts %s and preserves it', (frame) => {
    const parsed = NodeV3Schema.parse({ ...goalNode, goal_threshold_frame: frame });
    expect(parsed.goal_threshold_frame).toBe(frame);
  });

  it.each(NEW_FRAMES)('RED: DraftGoalConstraintSchema.value_frame accepts %s and preserves it', (value_frame) => {
    expect(DraftGoalConstraintSchema.parse({ ...limit, value_frame }).value_frame).toBe(value_frame);
  });

  it.each(LEGACY_FRAMES)('CONTROL: legacy %s still parses on both sites (additive — no stored graph breaks)', (frame) => {
    expect(NodeV3Schema.parse({ ...goalNode, goal_threshold_frame: frame }).goal_threshold_frame).toBe(frame);
    expect(DraftGoalConstraintSchema.parse({ ...limit, value_frame: frame }).value_frame).toBe(frame);
  });

  it('RED: the vocabulary is exactly the two legacy members followed by the two new ones (appended, never reordered)', () => {
    expect(GoalThresholdFrame.options).toEqual(['level', 'delta', 'change_abs', 'change_rel']);
  });

  it("refuses a QUANTITY-frame value as a TARGET frame — 'change' is quantity_frame's word, not the target's", () => {
    // The two enums are deliberately different vocabularies. A producer that writes the node's
    // quantity into the target frame must be refused, not waved through as a near-synonym.
    for (const bad of ['change', 'absolute', 'relative', 'Change_abs', '']) {
      expect(NodeV3Schema.safeParse({ ...goalNode, goal_threshold_frame: bad }).success, bad).toBe(false);
      expect(DraftGoalConstraintSchema.safeParse({ ...limit, value_frame: bad }).success, bad).toBe(false);
    }
  });

  it('absence stays ABSENT on both sites (no default fabricates a frame)', () => {
    expect('goal_threshold_frame' in NodeV3Schema.parse(goalNode)).toBe(false);
    expect('value_frame' in DraftGoalConstraintSchema.parse(limit)).toBe(false);
  });
});

describe('0.61.0 · NodeV3Schema.quantity_frame (R1)', () => {
  it.each(['level', 'change'] as const)('accepts %s and preserves it', (quantity_frame) => {
    expect(NodeV3Schema.parse({ ...goalNode, quantity_frame }).quantity_frame).toBe(quantity_frame);
  });

  it('RED: refuses an unknown value — before 0.61.0 the key rode .passthrough() and anything was waved through', () => {
    for (const bad of ['delta', 'change_abs', 'change_rel', 'levels', 'Change', '', 0, null]) {
      expect(NodeV3Schema.safeParse({ ...goalNode, quantity_frame: bad }).success, String(bad)).toBe(false);
    }
  });

  it('RED: is a DECLARED key on the schema, not an unknown key riding passthrough', () => {
    // NodeV3Schema is .passthrough(), so `quantity_frame: 'change'` parses and survives EVEN IF it
    // were never declared. The two assertions above that accept a value are mutation-blind on their
    // own; this structural check and the refusal test are what tell "declared" from "waved through".
    expect(Object.keys(NodeV3Schema.shape)).toContain('quantity_frame');
  });

  it('RED: the node field IS the exported QuantityFrame instance (identity, derive-don\'t-mirror)', () => {
    const unwrapped = (NodeV3Schema.shape.quantity_frame as z.ZodOptional<typeof QuantityFrame>).unwrap();
    expect(unwrapped).toBe(QuantityFrame);
    expect(QuantityFrame.options).toEqual(['level', 'change']);
  });

  it('RED: QuantityFrame is published from both entry points that publish GoalThresholdFrame', () => {
    expect((root as Record<string, unknown>).QuantityFrame).toBe(QuantityFrame);
    expect((boundary as Record<string, unknown>).QuantityFrame).toBe(QuantityFrame);
    // Contrast control: the probe sees a sibling export through the same namespaces.
    expect((root as Record<string, unknown>).GoalThresholdFrame).toBe(GoalThresholdFrame);
    expect((boundary as Record<string, unknown>).GoalThresholdFrame).toBe(GoalThresholdFrame);
  });

  it('is a DIFFERENT vocabulary from the target frame (no shared instance, no shared change word)', () => {
    expect(QuantityFrame).not.toBe(GoalThresholdFrame);
    expect(GoalThresholdFrame.options as readonly string[]).not.toContain('change');
    expect(QuantityFrame.options as readonly string[]).not.toContain('change_abs');
  });

  it('absence stays ABSENT — absent means level by contract, but the parser never fabricates the key', () => {
    const parsed = NodeV3Schema.parse(goalNode);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'quantity_frame')).toBe(false);
  });
});

describe('0.61.0 · NodeV3Schema stays .passthrough() for every other key', () => {
  it('an undeclared sibling key survives a parse beside the two declared frames', () => {
    const parsed = NodeV3Schema.parse({
      ...goalNode,
      goal_threshold_frame: 'level',
      quantity_frame: 'change',
      goal_direction: '>=',
      goal_threshold_frame_provenance: 'drafter',
    }) as Record<string, unknown>;
    expect(parsed.goal_direction).toBe('>=');
    expect(parsed.goal_threshold_frame_provenance).toBe('drafter');
  });

  it("the node object's unknown-key policy is still passthrough", () => {
    expect(NodeV3Schema._def.unknownKeys).toBe('passthrough');
  });
});

describe('0.61.0 · analysis-hash vocabulary: frame, direction and quantity move the hash', () => {
  const nodeFields = CANONICAL_GRAPH_HASH_NESTED_PROJECTION.node.fields as readonly string[];

  it.each(['goal_threshold_frame', 'goal_direction', 'quantity_frame'])('RED: node.fields contains %s', (field) => {
    expect(nodeFields).toContain(field);
  });

  it('RED: the projection version moves 1 → 2 (the module rule: bump on ANY nested inclusion change)', () => {
    // 0.62.0 moved it again (2 → 3, observed_state.source; release-0.62.0.test.ts pins the exact value).
    expect(CANONICAL_GRAPH_HASH_PROJECTION_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('APPEND-ONLY: the ten pre-0.61.0 node fields keep their exact order as the prefix', () => {
    expect(nodeFields.slice(0, 10)).toEqual([
      'id',
      'kind',
      'category',
      'factor_type',
      'is_baseline',
      'goal_threshold',
      'goal_threshold_raw',
      'goal_threshold_cap',
      'intercept',
      'encoding_map',
    ]);
    expect(new Set(nodeFields).size).toBe(nodeFields.length);
  });

  it('the limit value_frame needs NO vocabulary entry: goal_constraints is hashed WHOLE (AIQ 5871459631)', () => {
    expect(CANONICAL_GRAPH_HASH_ANALYSIS_STATE_FIELDS as readonly string[]).toContain('goal_constraints');
    // There is no nested goal-constraint projection that could omit value_frame.
    expect(Object.keys(CANONICAL_GRAPH_HASH_NESTED_PROJECTION)).not.toContain('goal_constraint');
    // Positive control: the probe sees the nested projections that DO exist.
    expect(Object.keys(CANONICAL_GRAPH_HASH_NESTED_PROJECTION)).toEqual(['node', 'edge', 'option', 'intervention']);
  });

  it('CONTRAST: `label` is still NOT a hash input (the vocabulary grew by exactly three)', () => {
    expect(nodeFields).not.toContain('label');
    // 0.62.0 appended `scale_frame` (release-0.62.0.test.ts pins the exact list); 0.61.0's three stay at 10–12.
    expect(nodeFields.slice(10, 13)).toEqual(['goal_threshold_frame', 'goal_direction', 'quantity_frame']);
  });
});

describe('0.61.0 · EnrichmentConstraintResultSchema.frame_verdict (R3 SCIENCE 5873480886)', () => {
  const row = { constraint_id: 'c_spend', node_id: 'monthly_cloud_bill', operator: '<=', value: -0.2, probability: 0.41 };

  it.each(['scored', 'estimate_only'] as const)('CONTROL (passes at 0.60.0 too, by .passthrough()): carries frame_verdict %s through the parse', (v) => {
    expect(EnrichmentConstraintResultSchema.parse({ ...row, frame_verdict: v }).frame_verdict).toBe(v);
  });

  it('RED: an off-vocabulary verdict is REFUSED (not waved through by .passthrough())', () => {
    expect(EnrichmentConstraintResultSchema.safeParse({ ...row, frame_verdict: 'scored_ish' }).success).toBe(false);
  });

  it('absent stays ABSENT — never defaulted to scored', () => {
    const parsed = EnrichmentConstraintResultSchema.parse(row);
    expect('frame_verdict' in parsed).toBe(false);
  });

  it('is exported from the boundary namespace as the same instance', () => {
    expect(boundary.EnrichmentConstraintResultSchema).toBe(EnrichmentConstraintResultSchema);
  });
});

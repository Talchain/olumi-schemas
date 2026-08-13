/**
 * 0.40.0 additivity proof — every 0.39.0-valid payload still parses, and
 * parses IDENTICALLY.
 *
 * `fixtures-0.39.0.json` is the complete `MAXIMAL_FIXTURES` registry as
 * published at v0.39.0 (`76fe0ed9`), serialised MECHANICALLY from the built
 * dist of the pristine clone (never hand-written — a hand-copied corpus is
 * the mirror this estate keeps paying for). Every family is maximal at its
 * version, so this suite exercises every 0.39.0 field through the CURRENT
 * schemas and fails on ANY of:
 *   - a family that no longer exists (a removal — breaking);
 *   - a 0.39.0 payload that no longer parses (narrowing — breaking);
 *   - a parse output that differs from 0.39.0's recorded output (a new
 *     default / coercion — silent mutation, breaking in behaviour).
 *
 * Of particular interest to THIS train: the 0.39.0 corpus carries
 * `root/ObservedStateSchema` with `source: 'FIXTURE_user_estimate'` and NO
 * `elicited_from`, and `boundary/SystemEventSchema#factor_value_edit` with
 * NO `applied_from` — so the suite proves both additions are genuinely
 * optional and that the free-string `source` was not narrowed.
 *
 * POSITIVE CONTROLS (trap 13): the suite proves it can SEE a violation by
 * running deliberately-narrowed schemas against their own 0.39.0 fixtures —
 * one on a family this train touches (ObservedStateSchema), one on the
 * 0.39-suite's original control family (CoachingBlockSchema).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { MAXIMAL_FIXTURES } from '../../src/fixtures/index.js';

interface SnapshotRow {
  family: string;
  fixture: unknown;
  expectedParseOutput?: unknown;
}

const snapshotPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'additivity',
  'fixtures-0.39.0.json',
);
const SNAPSHOT: SnapshotRow[] = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const CURRENT_BY_FAMILY = new Map(MAXIMAL_FIXTURES.map((e) => [e.family, e]));

describe('0.40.0 additivity against the complete 0.39.0 fixture corpus', () => {
  it('the snapshot is the COMPLETE 0.39.0 registry (159 families) — a shrunk corpus proves nothing', () => {
    expect(SNAPSHOT.length).toBe(159);
    const families = new Set(SNAPSHOT.map((r) => r.family));
    expect(families.size).toBe(SNAPSHOT.length);
  });

  it('every 0.39.0 family still exists at the current tip (no removal)', () => {
    const missing = SNAPSHOT.map((r) => r.family).filter((f) => !CURRENT_BY_FAMILY.has(f));
    expect(missing).toStrictEqual([]);
  });

  it.each(SNAPSHOT.map((row) => [row.family, row] as const))(
    '%s: the 0.39.0 maximal payload parses IDENTICALLY through the current schema',
    (_family, row) => {
      const entry = CURRENT_BY_FAMILY.get(row.family);
      expect(entry).toBeDefined();
      const parsed = entry!.schema.parse(row.fixture);
      expect(parsed).toStrictEqual(row.expectedParseOutput ?? row.fixture);
    },
  );

  it('POSITIVE CONTROL (touched family): narrowing observed_state.source to the new enum REDs against the 0.39.0 fixture — proving the suite would catch exactly the narrowing this train declined to ship', () => {
    const row = SNAPSHOT.find((r) => r.family === 'root/ObservedStateSchema');
    expect(row).toBeDefined();
    const entry = CURRENT_BY_FAMILY.get('root/ObservedStateSchema');
    expect(entry).toBeDefined();
    // The 0.39.0 fixture's source is 'FIXTURE_user_estimate' — outside the
    // declared vocabulary. If ObservedStateSchema.source were narrowed from
    // z.string() to the KnownObservedStateSource enum, every pre-0.40.0
    // payload with an unlisted literal would break exactly like this:
    const narrowed = (entry!.schema as z.ZodObject<z.ZodRawShape>).extend({
      source: z.enum(['panel_elicited']),
    });
    expect(narrowed.safeParse(row!.fixture).success).toBe(false);
    expect(entry!.schema.safeParse(row!.fixture).success).toBe(true);
  });

  it('POSITIVE CONTROL (0.39 lineage): a deliberately narrowed CoachingBlockSchema REDs against its own 0.39.0 fixture', () => {
    const row = SNAPSHOT.find((r) => r.family === 'boundary/CoachingBlockSchema');
    expect(row).toBeDefined();
    const entry = CURRENT_BY_FAMILY.get('boundary/CoachingBlockSchema');
    expect(entry).toBeDefined();
    const narrowed = (entry!.schema as z.ZodObject<z.ZodRawShape>).extend({
      signal_code: z.number(),
    });
    expect(narrowed.safeParse(row!.fixture).success).toBe(false);
    expect(entry!.schema.safeParse(row!.fixture).success).toBe(true);
  });
});

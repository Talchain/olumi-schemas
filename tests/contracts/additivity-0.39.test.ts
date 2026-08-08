/**
 * 0.39.0 additivity proof — every 0.38.0-valid payload still parses, and
 * parses IDENTICALLY.
 *
 * `fixtures-0.38.0.json` is the complete `MAXIMAL_FIXTURES` registry as
 * published at v0.38.0 (`371e18c8`), serialised MECHANICALLY from the built
 * dist of the pristine clone (never hand-written — a hand-copied corpus is
 * the mirror this estate keeps paying for). Every family is maximal at its
 * version, so this suite exercises every 0.38.0 field through the CURRENT
 * schemas and fails on ANY of:
 *   - a family that no longer exists (a removal — breaking);
 *   - a 0.38.0 payload that no longer parses (narrowing — breaking);
 *   - a parse output that differs from 0.38.0's recorded output (a new
 *     default / coercion — silent mutation, breaking in behaviour).
 *
 * POSITIVE CONTROL (trap 13): the suite proves it can SEE a violation by
 * running one deliberately-narrowed schema against its own 0.38.0 fixture.
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
  'fixtures-0.38.0.json',
);
const SNAPSHOT: SnapshotRow[] = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const CURRENT_BY_FAMILY = new Map(MAXIMAL_FIXTURES.map((e) => [e.family, e]));

describe('0.39.0 additivity against the complete 0.38.0 fixture corpus', () => {
  it('the snapshot is the COMPLETE 0.38.0 registry (133 families) — a shrunk corpus proves nothing', () => {
    expect(SNAPSHOT.length).toBe(133);
    const families = new Set(SNAPSHOT.map((r) => r.family));
    expect(families.size).toBe(SNAPSHOT.length);
  });

  it('every 0.38.0 family still exists at the current tip (no removal)', () => {
    const missing = SNAPSHOT.map((r) => r.family).filter((f) => !CURRENT_BY_FAMILY.has(f));
    expect(missing).toStrictEqual([]);
  });

  it.each(SNAPSHOT.map((row) => [row.family, row] as const))(
    '%s: the 0.38.0 maximal payload parses IDENTICALLY through the current schema',
    (_family, row) => {
      const entry = CURRENT_BY_FAMILY.get(row.family);
      expect(entry).toBeDefined();
      const parsed = entry!.schema.parse(row.fixture);
      expect(parsed).toStrictEqual(row.expectedParseOutput ?? row.fixture);
    },
  );

  it('POSITIVE CONTROL: a deliberately narrowed schema REDs against its own 0.38.0 fixture (the suite can see a violation)', () => {
    const row = SNAPSHOT.find((r) => r.family === 'boundary/CoachingBlockSchema');
    expect(row).toBeDefined();
    const entry = CURRENT_BY_FAMILY.get('boundary/CoachingBlockSchema');
    expect(entry).toBeDefined();
    // Narrow: pretend `signal_code` was retyped to a number — the 0.38.0
    // payload must FAIL this narrowed twin while PASSING the real schema.
    const narrowed = (entry!.schema as z.ZodObject<z.ZodRawShape>).extend({
      signal_code: z.number(),
    });
    expect(narrowed.safeParse(row!.fixture).success).toBe(false);
    expect(entry!.schema.safeParse(row!.fixture).success).toBe(true);
  });
});

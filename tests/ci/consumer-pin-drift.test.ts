/**
 * THE PIN-DRIFT CHECK'S OWN GUARD.
 *
 * The first version of this check (#64) could never fail: it warned by default and its
 * workflow piped it through `tee` with no pipefail. These rows import THE logic the script
 * runs (`scripts/lib/consumer-pins.mjs`), so they cannot pass against a copy. Every
 * failing row has a passing twin that differs in one input.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONSUMERS,
  DEFAULT_MAX_LAG_HOURS,
  versionFromPin,
  compareSemver,
  releasesFromTagLines,
  requiredVersion,
  assess,
} from '../../scripts/lib/consumer-pins.mjs';

const H = 3_600_000;
const NOW = Date.parse('2026-10-05T10:00:00Z');

// Real tag dates (git for-each-ref on olumi-schemas, 5 Oct 2026).
const TAG_LINES = [
  'v0.76.0\t2026-10-04T10:36:59+01:00',
  'v0.75.0\t2026-10-02T11:23:53+01:00',
  'v0.74.0\t2026-10-02T10:15:04+01:00',
  'v0.61.0\t2026-09-22T12:00:00+01:00',
  'not-a-release\t2026-10-05T09:00:00Z',
].join('\n');
const RELEASES = releasesFromTagLines(TAG_LINES);

const read = (name: string, version: string) => ({
  name, status: 'READ', version, pin: `file:./vendor/talchain-schemas-${version}.tgz`,
});
const unreadable = (name: string) => ({ name, status: 'UNREADABLE', detail: 'gh api could not read package.json' });

describe('version derivation', () => {
  it('reads the vendored tarball form and bare semver', () => {
    expect(versionFromPin('file:./vendor/talchain-schemas-0.74.0.tgz')).toBe('0.74.0');
    expect(versionFromPin('^0.56.0')).toBe('0.56.0');
  });

  it('NEGATIVE CONTROL: refuses anything it cannot derive exactly', () => {
    for (const pin of [
      'github:Talchain/olumi-schemas#main', 'workspace:*', 'latest', '*', '', undefined, null, 42,
      'file:./vendor/talchain-schemas.tgz', '>=0.55.0',
    ]) {
      expect(versionFromPin(pin as unknown as string), `pin ${JSON.stringify(pin)}`).toBeNull();
    }
  });

  it('compares numerically, not as strings (0.10.0 > 0.9.0)', () => {
    expect(compareSemver('0.10.0', '0.9.0')).toBe(1);
    expect(compareSemver('0.9.0', '0.10.0')).toBe(-1);
    expect(compareSemver('0.76.0', '0.76.0')).toBe(0);
  });
});

describe('release tags', () => {
  it('reads only vX.Y.Z tags, newest version first', () => {
    expect(RELEASES.map((r: { version: string }) => r.version)).toEqual(['0.76.0', '0.75.0', '0.74.0', '0.61.0']);
  });

  it('the required release is the newest one older than the window (boundary pair)', () => {
    const at = Date.parse('2026-10-04T10:36:59+01:00'); // v0.76.0
    expect(requiredVersion(RELEASES, at + 48 * H, 48)).toBe('0.76.0');
    expect(requiredVersion(RELEASES, at + 48 * H - 1000, 48)).toBe('0.75.0');
  });

  it('no release older than the window -> no requirement', () => {
    expect(requiredVersion(RELEASES, Date.parse('2026-09-22T12:00:00+01:00'), 48)).toBeNull();
  });
});

describe('assess — the skew rule', () => {
  const opts = { nowMs: NOW, maxLagHours: DEFAULT_MAX_LAG_HOURS };

  it('FAILS on the estate as measured 5 Oct (CEE 0.76 · UI 0.74 · PLoT 0.61)', () => {
    const r = assess([read('CEE', '0.76.0'), read('UI', '0.74.0'), read('PLoT', '0.61.0')], RELEASES, opts);
    expect(r.required).toBe('0.75.0');
    expect(r.verdicts.map((v: { name: string; verdict: string }) => `${v.name}:${v.verdict}`))
      .toEqual(['CEE:CURRENT', 'UI:BEHIND', 'PLoT:BEHIND']);
    expect(r.exitCode).toBe(1);
  });

  it('twin: PASSES once UI and PLoT are on 0.76.0', () => {
    const r = assess([read('CEE', '0.76.0'), read('UI', '0.76.0'), read('PLoT', '0.76.0')], RELEASES, opts);
    expect(r.exitCode).toBe(0);
  });

  it('twin: drift INSIDE the window passes (0.75.0 while 0.76.0 is ~24 h old)', () => {
    const r = assess([read('CEE', '0.76.0'), read('UI', '0.75.0'), read('PLoT', '0.75.0')], RELEASES, opts);
    expect(r.verdicts.map((v: { verdict: string }) => v.verdict)).toEqual(['CURRENT', 'WITHIN_WINDOW', 'WITHIN_WINDOW']);
    expect(r.exitCode).toBe(0);
  });

  it('--strict (window 0) fails the same in-window drift', () => {
    const r = assess([read('CEE', '0.76.0'), read('UI', '0.75.0'), read('PLoT', '0.76.0')], RELEASES, { nowMs: NOW, maxLagHours: 0 });
    expect(r.exitCode).toBe(1);
  });

  it('a pin with no release tag is UNTAGGED and fails; its tagged twin passes', () => {
    expect(assess([read('CEE', '0.77.0'), read('UI', '0.76.0'), read('PLoT', '0.76.0')], RELEASES, opts).exitCode).toBe(1);
    expect(assess([read('CEE', '0.76.0'), read('UI', '0.76.0'), read('PLoT', '0.76.0')], RELEASES, opts).exitCode).toBe(0);
  });

  it('one UNREADABLE consumer fails (1); ALL unreadable is could-not-measure (2)', () => {
    expect(assess([read('CEE', '0.76.0'), unreadable('UI'), read('PLoT', '0.76.0')], RELEASES, opts).exitCode).toBe(1);
    expect(assess([unreadable('CEE'), unreadable('UI'), unreadable('PLoT')], RELEASES, opts).exitCode).toBe(2);
  });

  it('no release tags readable (shallow checkout) is could-not-measure (2), never a pass', () => {
    expect(assess([read('CEE', '0.76.0'), read('UI', '0.76.0'), read('PLoT', '0.76.0')], [], opts).exitCode).toBe(2);
  });

  it('--report-only exits 0 on skew but still 2 when it measured nothing', () => {
    const ro = { ...opts, reportOnly: true };
    expect(assess([read('CEE', '0.76.0'), read('UI', '0.74.0'), read('PLoT', '0.61.0')], RELEASES, ro).exitCode).toBe(0);
    expect(assess([unreadable('CEE'), unreadable('UI'), unreadable('PLoT')], RELEASES, ro).exitCode).toBe(2);
  });
});

describe('scope and wiring', () => {
  it('lists every consumer — a repo absent from the list is invisible to the check', () => {
    expect(CONSUMERS.map((c: { repo: string }) => c.repo)).toEqual([
      'Talchain/olumi-assistants-service',
      'Talchain/DecisionGuideAI',
      'Talchain/plot-lite-service',
    ]);
  });

  it('the CLI exits with assess()’s code, and imports the logic this file tests', () => {
    const cli = readFileSync(new URL('../../scripts/check-consumer-pins.mjs', import.meta.url), 'utf8');
    expect(cli).toContain("from './lib/consumer-pins.mjs'");
    expect(cli).toContain('process.exit(result.exitCode)');
  });

  it('the workflow can fail: no pipe on the check line, full tag history, exit code propagated', () => {
    const wf = readFileSync(new URL('../../.github/workflows/consumer-pin-drift.yml', import.meta.url), 'utf8');
    const checkLine = wf.split('\n').find((l) => l.includes('node scripts/check-consumer-pins.mjs'));
    expect(checkLine, 'the workflow must run the check').toBeDefined();
    expect(checkLine).not.toContain('|');
    expect(wf).toContain('fetch-depth: 0');
    expect(wf).toContain('exit "$rc"');
  });
});

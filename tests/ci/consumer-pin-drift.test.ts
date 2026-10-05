/**
 * THE PIN-DRIFT CHECK'S OWN GUARD.
 *
 * The first version of this check (#64) could never fail: it warned by default and its
 * workflow piped it through `tee` with no pipefail. These rows import THE logic the script
 * runs (`scripts/lib/consumer-pins.mjs`), so they cannot pass against a copy. Every
 * failing row has a passing twin that differs in one input.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONSUMERS,
  DEFAULT_MAX_LAG_HOURS,
  versionFromPin,
  pinFromPackageJson,
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

  it('NEGATIVE CONTROL: at most one range prefix (Codex r1: ^~0.76.0 must not read as 0.76.0)', () => {
    expect(versionFromPin('^~0.76.0')).toBeNull();
    expect(versionFromPin('~^0.76.0')).toBeNull();
    expect(versionFromPin('~0.76.0')).toBe('0.76.0');
  });

  it('reads dependencies AND devDependencies; conflicting pins are an error, never "dev wins" (Codex r1)', () => {
    const P = '@talchain/schemas';
    expect(pinFromPackageJson({ dependencies: { [P]: 'a' } }, P)).toEqual({ pin: 'a' });
    expect(pinFromPackageJson({ devDependencies: { [P]: 'b' } }, P)).toEqual({ pin: 'b' });
    expect(pinFromPackageJson({ dependencies: { [P]: 'a' }, devDependencies: { [P]: 'a' } }, P)).toEqual({ pin: 'a' });
    expect(pinFromPackageJson({ dependencies: { [P]: 'old' }, devDependencies: { [P]: 'new' } }, P).error).toMatch(/conflicting pins/);
    expect(pinFromPackageJson({}, P).error).toMatch(/not a dependency/);
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

  it('--strict compares against the newest release even when its tag is future-dated (Codex r1)', () => {
    const future = releasesFromTagLines(['v0.77.0\t2026-10-06T10:00:00Z', ...TAG_LINES.split('\n')].join('\n'));
    const rows = [read('CEE', '0.76.0'), read('UI', '0.76.0'), read('PLoT', '0.76.0')];
    expect(assess(rows, future, { nowMs: NOW, maxLagHours: 0 }).exitCode).toBe(1);
    expect(assess(rows, future, opts).exitCode).toBe(0); // twin: the default window does not require an unreleased-yet tag
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

  it('the CLI, run for real against a stub `gh` and a tagged git repo, exits 1 on skew, 0 aligned, 2 with no tags', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pin-drift-cli-'));
    try {
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'gh'), [
        '#!/usr/bin/env bash',
        'repo=$(echo "$2" | cut -d/ -f3)',
        'ver=$(echo "$STUB_PINS" | tr "," "\\n" | grep "^$repo=" | cut -d= -f2)',
        '[ -z "$ver" ] && exit 1',
        'printf \'{"dependencies":{"@talchain/schemas":"file:./vendor/talchain-schemas-%s.tgz"}}\' "$ver" | base64 | tr -d "\\n"',
      ].join('\n'));
      chmodSync(join(bin, 'gh'), 0o755);
      const mkRepo = (name: string, tags: string[]) => {
        const root = join(dir, name);
        mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
        copyFileSync(new URL('../../scripts/check-consumer-pins.mjs', import.meta.url), join(root, 'scripts', 'check-consumer-pins.mjs'));
        copyFileSync(new URL('../../scripts/lib/consumer-pins.mjs', import.meta.url), join(root, 'scripts', 'lib', 'consumer-pins.mjs'));
        writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@talchain/schemas', version: '0.76.0', type: 'module' }));
        const g = (args: string[], env: Record<string, string> = {}) => {
          const r = spawnSync('git', args, { cwd: root, env: { ...process.env, ...env } });
          expect(r.status, `git ${args.join(' ')}: ${r.stderr}`).toBe(0);
        };
        g(['init', '-q']);
        const old = new Date(Date.now() - 72 * 3_600_000).toISOString();
        for (const tag of tags) {
          g(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', tag], { GIT_COMMITTER_DATE: old, GIT_AUTHOR_DATE: old });
          g(['tag', tag]);
        }
        return root;
      };
      const run = (root: string, pins: string) => spawnSync('node', ['scripts/check-consumer-pins.mjs'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_PINS: pins },
      });
      const tagged = mkRepo('tagged', ['v0.74.0', 'v0.75.0', 'v0.76.0']);
      const skew = 'olumi-assistants-service=0.76.0,DecisionGuideAI=0.74.0,plot-lite-service=0.61.0';
      const aligned = 'olumi-assistants-service=0.76.0,DecisionGuideAI=0.76.0,plot-lite-service=0.76.0';
      const r1 = run(tagged, skew);
      expect(r1.status, r1.stdout + r1.stderr).toBe(1);
      expect(r1.stdout).toMatch(/UI\s+BEHIND/);
      const r0 = run(tagged, aligned);
      expect(r0.status, r0.stdout + r0.stderr).toBe(0);
      const r2 = run(mkRepo('untagged', []), aligned);
      expect(r2.status, r2.stdout + r2.stderr).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the workflow step itself propagates the check exit code, run with the shell flags GitHub uses (mutant rc=0 is caught)', () => {
    const wf = readFileSync(new URL('../../.github/workflows/consumer-pin-drift.yml', import.meta.url), 'utf8');
    expect(wf).toContain('fetch-depth: 0');
    const lines = wf.split('\n');
    const stepAt = lines.findIndex((l) => l.includes('- name: Check consumer pin drift'));
    const runAt = lines.findIndex((l, i) => i > stepAt && /^\s+run: \|\s*$/.test(l));
    expect(stepAt >= 0 && runAt > stepAt, 'the check step and its run block must exist').toBe(true);
    // GitHub runs `shell: bash` as `bash -eo pipefail`, and an unspecified shell as `bash -e` (NO pipefail): #64's defect.
    const shellBash = lines.slice(stepAt, runAt).some((l) => /^\s+shell:\s*bash\s*$/.test(l));
    const flags = shellBash ? ['-eo', 'pipefail'] : ['-e'];
    const indent = lines[runAt].search(/\S/);
    const body: string[] = [];
    for (const l of lines.slice(runAt + 1)) {
      if (l.trim() !== '' && l.search(/\S/) <= indent) break;
      body.push(l.slice(indent + 2));
    }
    const block = body.join('\n');
    expect(block).toContain('node scripts/check-consumer-pins.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'pin-drift-wf-'));
    try {
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'node'), '#!/usr/bin/env bash\necho "stub check"\nexit "${STUB_RC:-0}"\n');
      chmodSync(join(bin, 'node'), 0o755);
      const exec = (script: string, rc: number) => {
        writeFileSync(join(dir, 'step.sh'), script);
        return spawnSync('bash', ['--noprofile', '--norc', ...flags, join(dir, 'step.sh')], {
          cwd: dir, encoding: 'utf8',
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_RC: String(rc), STRICT_FLAG: '', GITHUB_STEP_SUMMARY: join(dir, 'summary.md') },
        }).status;
      };
      for (const rc of [0, 1, 2]) expect(exec(block, rc), `check exited ${rc}`).toBe(rc);
      // Mutant twin: the defect this file exists for. If the step swallowed the code, rc=1 would read as 0.
      expect(exec(block.replace('rc=$?', 'rc=0'), 1)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The gate that keeps the test-tree typecheck from becoming the thing it prevents.
//
// `tsconfig.test.json` is what makes test files typechecked at all — before it,
// `tsconfig.json` excluded `tests` and `fixtures`, `npm run lint` used that same
// config, and pr.yml did not run `lint` anyway, so **no test file was typechecked
// by any gate.** A type error in a test was invisible to CI.
//
// A config with a hand-listed set of directories would reintroduce that hole the
// first time somebody adds `e2e/` and forgets to list it — and the hole would
// read as green, which is this estate's dominant defect class. So the include
// list is derived by extension (`**/*.ts` …), and THIS TEST asserts the result:
// every TypeScript test file on disk is in the typecheck program.
//
// Two properties worth naming:
//
//   1. It lives in the TEST SUITE, not in `.github/workflows/`. Narrowing
//      `include`, widening `exclude`, or deleting the pr.yml step cannot quietly
//      shrink coverage — `npm test` goes red.
//   2. The absence assertion carries a POSITIVE CONTROL. "No test file is
//      missing from the program" passes just as happily when the comparison is
//      broken and both sets are empty. The control below feeds a path that is
//      known not to exist through the same set-difference and requires it to be
//      reported, so the mechanism has to demonstrate it can SEE a miss before
//      its clean result means anything.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * Directories that hold no test source of ours: dependencies, and `dist` which
 * is BUILD OUTPUT of `src`. Dot-directories (`.git`, `.github`, …) are skipped
 * by the walk itself. Deliberately SHORT — every name here is a place this test
 * agrees not to look, so the list is a liability and stays minimal.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist']);

/**
 * Vitest's default include is `**\/*.{test,spec}.?(c|m)[jt]s?(x)`. These are the
 * TypeScript arms of it — the files that must be in the typecheck program.
 */
const TS_TEST = /\.(test|spec)\.(c|m)?tsx?$/;
/**
 * …and these are the JavaScript arms. Vitest would RUN them; `checkJs` is off,
 * so TypeScript would never check them. A JS test file is therefore a hole in
 * this gate by construction, which is why it is refused rather than tolerated.
 */
const JS_TEST = /\.(test|spec)\.(c|m)?jsx?$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(relative(ROOT, full).split(sep).join('/'));
    }
  }
  return out;
}

const onDisk = walk(ROOT);

/** Files tsc actually loads for `tsconfig.test.json`, as repo-relative paths. */
function programFiles(): Set<string> {
  const r = spawnSync(
    process.execPath,
    [TSC, '-p', 'tsconfig.test.json', '--listFilesOnly'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  // --listFilesOnly does not typecheck, so a type error in the tree must not
  // make this test fail as a coverage miss. Only a tsc that produced nothing is
  // a real failure here.
  const files = (r.stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((abs) => relative(ROOT, abs).split(sep).join('/'));
  if (files.length === 0) {
    throw new Error(
      `tsc --listFilesOnly produced no files (status ${r.status}): ${r.stderr ?? ''}`,
    );
  }
  return new Set(files);
}

const program = programFiles();

describe('test-tree typecheck coverage', () => {
  it('POSITIVE CONTROL: the program is real — it contains this very file', () => {
    // If this fails, every assertion below is vacuous rather than reassuring.
    expect(program.has('tests/contracts/test-typecheck-coverage.test.ts')).toBe(true);
    expect(program.size).toBeGreaterThan(50);
  });

  it('POSITIVE CONTROL: the set-difference can see a miss', () => {
    const sentinel = 'tests/__sentinel-that-does-not-exist__.test.ts';
    const missing = [...onDisk.filter((f) => TS_TEST.test(f)), sentinel].filter(
      (f) => !program.has(f),
    );
    expect(missing).toEqual([sentinel]);
  });

  it('every TypeScript test file on disk is in the typecheck program', () => {
    const tsTests = onDisk.filter((f) => TS_TEST.test(f));
    expect(tsTests.length).toBeGreaterThan(0);

    const missing = tsTests.filter((f) => !program.has(f));
    expect(
      missing,
      `These test files are NOT typechecked by tsconfig.test.json. Do not add ` +
        `them to an allowlist — widen "include" (or narrow "exclude") so the ` +
        `config keeps covering the tree by construction:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no JavaScript test file exists (vitest would run it; tsc would not check it)', () => {
    const jsTests = onDisk.filter((f) => JS_TEST.test(f));
    expect(
      jsTests,
      `Write tests in TypeScript. "checkJs" is off, so these would be executed ` +
        `by vitest and never typechecked — the exact hole tsconfig.test.json ` +
        `closes:\n  ${jsTests.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the non-test TypeScript helpers under tests/ are covered too', () => {
    // e.g. tests/orchestrator/__fixtures__/handler-fact-fixtures.ts — a fixture
    // module is exactly where a silent drift from a schema would hide.
    const helpers = onDisk.filter(
      (f) => f.startsWith('tests/') && f.endsWith('.ts') && !TS_TEST.test(f),
    );
    expect(helpers.length).toBeGreaterThan(0);
    expect(helpers.filter((f) => !program.has(f))).toEqual([]);
  });
});

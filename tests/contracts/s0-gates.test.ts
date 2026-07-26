// S0 enforcement gates — RED-first proof (arch step 2).
//
// A validator that passes everything is worse than none, because it converts
// "nobody checked" into "CI is green". Every rule below is proved twice:
//   POSITIVE — the real checked-in artifact passes (exit 0)
//   NEGATIVE — a deliberately-broken fixture FAILS with the specific error code
//
// If you add a rule to any of the three scripts, add its negative fixture here.
// A rule with no negative fixture is an unproven rule.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const NEG = join(ROOT, 'tests/contracts/negative');

function run(script: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  const r = spawnSync('node', [join(ROOT, 'scripts', script), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: ROOT,
  });
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Each negative manifest gets its own sha file, so the rule under test is the only thing failing. */
function runManifest(manifestPath: string, env: NodeJS.ProcessEnv = {}) {
  const shaFile = join(mkdtempSync(join(tmpdir(), 'olumi-s0-')), 'manifest.sha256');
  run('check-adoption-manifest.mjs', ['--manifest', manifestPath, '--sha-file', shaFile, '--write-sha']);
  return run('check-adoption-manifest.mjs', ['--manifest', manifestPath, '--sha-file', shaFile], env);
}

// ---------------------------------------------------------------------------
describe('S0 · adoption manifest', () => {
  it('POSITIVE: the checked-in manifest passes', () => {
    const r = run('check-adoption-manifest.mjs');
    expect(r.out).toContain('adoption-manifest: OK');
    expect(r.code).toBe(0);
  });

  it('POSITIVE: the checked-in manifest tells the truth about the three unadopted fields', async () => {
    const manifest = (await import('../../contracts/adoption-manifest.json', { with: { type: 'json' } })).default as {
      fields: Array<{ field: string; state: string; producer: string | null; producer_test: string | null }>;
    };
    for (const name of ['framing_question', 'framing_quality', 'decision_classification']) {
      const row = manifest.fields.find((f) => f.field === name);
      expect(row, `${name} must have a manifest row`).toBeDefined();
      // Measured 2026-07-26 against cee@staging 1c078f09a: zero producer sites.
      expect(row!.producer, `${name} has no producer — the manifest must say so`).toBeNull();
      expect(row!.producer_test).toBeNull();
      expect(row!.state).toBe('declared');
    }
  });

  const cases: Array<[string, string]> = [
    ['enforced-without-producer-test.json', 'E_STATE_WITHOUT_TESTS'],
    ['enforced-without-consumer-test.json', 'E_STATE_WITHOUT_TESTS'],
    ['unknown-repo.json', 'E_UNKNOWN_REPO'],
    ['malformed-test-ref.json', 'E_BAD_TEST_REF'],
    ['deadline-passed-while-dark.json', 'E_DEADLINE_PASSED'],
    ['invalid-state.json', 'E_SCHEMA'],
  ];
  it.each(cases)('NEGATIVE: %s is rejected with %s', (fixture, code) => {
    const r = runManifest(join(NEG, 'manifest', fixture));
    expect(r.code, `${fixture} must exit non-zero`).not.toBe(0);
    expect(r.out).toContain(code);
  });

  it('NEGATIVE: a test reference to a nonexistent file is rejected when the estate is available', () => {
    const r = runManifest(join(NEG, 'manifest', 'nonexistent-test-file.json'), {
      OLUMI_ESTATE_ROOT: ROOT, // any real dir; the referenced path is absent from it
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('E_MISSING_TEST_FILE');
  });

  it('NEGATIVE: --require-existence without OLUMI_ESTATE_ROOT fails instead of silently skipping', () => {
    const r = run('check-adoption-manifest.mjs', ['--require-existence'], { OLUMI_ESTATE_ROOT: '' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('E_SCHEMA');
  });

  it('every negative manifest fixture is exercised by a case above', () => {
    const onDisk = readdirSync(join(NEG, 'manifest')).filter((f) => f.endsWith('.json')).sort();
    const covered = [...cases.map(([f]) => f), 'nonexistent-test-file.json'].sort();
    expect(onDisk).toEqual(covered);
  });
});

// ---------------------------------------------------------------------------
describe('S0 · population registry', () => {
  it('POSITIVE: the checked-in registry passes and maps every live label', () => {
    const r = run('check-population-registry.mjs');
    expect(r.out).toContain('all mapped');
    expect(r.out).toContain('population-registry: OK');
    expect(r.code).toBe(0);
  });

  const cases: Array<[string, string]> = [
    ['unversioned-id.json', 'E_BAD_ID'],
    ['duplicate-id.json', 'E_DUP_ID'],
    ['open-stage.json', 'E_BAD_STAGE'],
    ['unmapped-wire-label.json', 'E_WIRE_UNMAPPED'],
    ['phantom-wire-label.json', 'E_WIRE_UNKNOWN'],
    ['dangling-parent.json', 'E_BAD_PARENT'],
    ['undeclared-transform.json', 'E_BAD_TRANSFORM'],
  ];
  it.each(cases)('NEGATIVE: %s is rejected with %s', (fixture, code) => {
    const r = run('check-population-registry.mjs', ['--registry', join(NEG, 'registry', fixture)]);
    expect(r.code, `${fixture} must exit non-zero`).not.toBe(0);
    expect(r.out).toContain(code);
  });

  it('every negative registry fixture is exercised by a case above', () => {
    const onDisk = readdirSync(join(NEG, 'registry')).filter((f) => f.endsWith('.json')).sort();
    expect(onDisk).toEqual(cases.map(([f]) => f).sort());
  });
});

// ---------------------------------------------------------------------------
describe('S0 · two-sided compat gate', () => {
  it('POSITIVE: the real ISL seam passes both directions', () => {
    const r = run('check-compat-gate.mjs');
    expect(r.out).toContain('[request]');
    expect(r.out).toContain('[response]');
    expect(r.out).toContain('compat-gate: OK');
    expect(r.code).toBe(0);
  });

  it('POSITIVE: the real seam detects the additive change ISL#114 actually made', () => {
    const r = run('check-compat-gate.mjs', ['--seam', 'isl-response-v2']);
    expect(r.out).toContain('ISLResponseV2.sample_population_provenance added (optional) — additive');
    expect(r.code).toBe(0);
  });

  it('POSITIVE CONTROL: an identical, immutably-pinned synthetic seam passes', () => {
    const r = run('check-compat-gate.mjs', ['--seams', join(NEG, 'seams'), '--seam', 'positive-control-identical']);
    expect(r.code, 'the gate must not simply reject everything').toBe(0);
  });

  const cases: Array<[string, string]> = [
    ['response-field-removed', 'E_RESPONSE_FIELD_REMOVED'],
    ['request-field-newly-required', 'E_REQUEST_FIELD_NEWLY_REQUIRED'],
    ['request-enum-narrowed', 'E_ENUM_NARROWED'],
    ['response-type-changed', 'E_TYPE_CHANGED'],
    ['moving-branch-pin', 'E_MOVING_PIN'],
    ['unsanitized-artifact', 'E_UNSANITIZED'],
  ];
  it.each(cases)('NEGATIVE: seam %s is rejected with %s', (seam, code) => {
    const r = run('check-compat-gate.mjs', ['--seams', join(NEG, 'seams'), '--seam', seam]);
    expect(r.code, `${seam} must exit non-zero`).not.toBe(0);
    expect(r.out).toContain(code);
  });

  it('NEGATIVE: a seams directory with no seams fails rather than reporting success', () => {
    const empty = mkdtempSync(join(tmpdir(), 'olumi-s0-seams-'));
    const r = run('check-compat-gate.mjs', ['--seams', empty]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('E_NO_SEAMS');
  });

  it('every negative seam fixture is exercised by a case above', () => {
    const onDisk = readdirSync(join(NEG, 'seams')).sort();
    expect(onDisk).toEqual([...cases.map(([s]) => s), 'positive-control-identical'].sort());
  });
});

// ---------------------------------------------------------------------------
describe('S0 · generated contract constants', () => {
  it('POSITIVE: generated-constants.ts is current', () => {
    const r = run('generate-contract-constants.mjs');
    expect(r.out).toContain('contract-constants: OK');
    expect(r.code).toBe(0);
  });

  // These re-derive the two SHAs INDEPENDENTLY of the generator, so a hand-edited
  // constant fails here even if someone also edits the generator to agree with it.
  it('CONTRACT_MANIFEST_SHA is the real sha256 of the adoption manifest', async () => {
    const { CONTRACT_MANIFEST_SHA } = await import('../../src/contracts/generated-constants.js');
    const actual = createHash('sha256').update(readFileSync(join(ROOT, 'contracts/adoption-manifest.json'))).digest('hex');
    expect(CONTRACT_MANIFEST_SHA).toBe(actual);
  });

  it('SCHEMA_SHA is the real sha256 of the published wire contract', async () => {
    const { SCHEMA_SHA, SCHEMA_PACKAGE_VERSION } = await import('../../src/contracts/generated-constants.js');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(SCHEMA_PACKAGE_VERSION).toBe(pkg.version);
    const h = createHash('sha256').update(`${pkg.name}@${pkg.version}\n`);
    for (const f of readdirSync(join(ROOT, 'json-schema')).filter((n) => n.endsWith('.json')).sort()) {
      h.update(f);
      h.update(readFileSync(join(ROOT, 'json-schema', f)));
    }
    expect(SCHEMA_SHA).toBe(h.digest('hex'));
  });

  it('the checker fails loudly when the manifest sha file is missing', () => {
    const r = run('generate-contract-constants.mjs', ['--sha-file', '/nonexistent/manifest.sha256']);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('FAIL');
  });
});

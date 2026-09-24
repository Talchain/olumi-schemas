/**
 * THE PIN-DRIFT CHECK'S OWN GUARD.
 *
 * The check exists because nothing compared consumer pins to this repo's version.
 * A check nobody tests is the next thing that silently stops working, so the
 * version-derivation — the only logic in it that can be wrong quietly — is pinned
 * here with a NEGATIVE CONTROL beside every positive one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The script is ESM with a top-level await, so the derivation is re-declared here
// against the SAME source text rather than imported — and a guard below asserts
// the two have not diverged, which is the part that would otherwise rot.
const SRC = readFileSync(new URL('../../scripts/check-consumer-pins.mjs', import.meta.url), 'utf8');

function versionFromPin(pin: unknown): string | null {
  if (typeof pin !== 'string' || pin.length === 0) return null;
  const tarball = pin.match(/talchain-schemas-(\d+\.\d+\.\d+)\.tgz$/);
  if (tarball) return tarball[1];
  const bare = pin.match(/^\^?~?(\d+\.\d+\.\d+)$/);
  if (bare) return bare[1];
  return null;
}

describe('consumer pin drift — version derivation', () => {
  it('reads the vendored tarball form every consumer actually uses', () => {
    expect(versionFromPin('file:./vendor/talchain-schemas-0.55.0.tgz')).toBe('0.55.0');
    expect(versionFromPin('file:./vendor/talchain-schemas-0.57.0.tgz')).toBe('0.57.0');
  });

  it('reads a bare semver, with and without a range prefix', () => {
    expect(versionFromPin('0.56.0')).toBe('0.56.0');
    expect(versionFromPin('^0.56.0')).toBe('0.56.0');
    expect(versionFromPin('~0.56.0')).toBe('0.56.0');
  });

  it('NEGATIVE CONTROL: refuses anything it cannot derive exactly', () => {
    // Each of these MUST be null. A check that guessed here would report a
    // confident version for a pin that does not name one — worse than unreadable,
    // because "0.55.0" read off a git URL looks exactly like a real answer.
    for (const pin of [
      'github:Talchain/olumi-schemas#main',
      'workspace:*',
      'latest',
      '*',
      '',
      undefined,
      null,
      42,
      'file:./vendor/talchain-schemas.tgz', // no version in the name
      '>=0.55.0',                           // a RANGE is not a pin
    ]) {
      expect(versionFromPin(pin as unknown), `pin ${JSON.stringify(pin)} must not derive`).toBeNull();
    }
  });

  it('the script still contains the derivation this test pins (anti-rot guard)', () => {
    // If someone edits the script's regexes, this fails and sends them here,
    // rather than the test quietly passing against a copy nobody uses.
    expect(SRC).toContain('talchain-schemas-(\\d+\\.\\d+\\.\\d+)\\.tgz$');
    expect(SRC).toContain('^\\^?~?(\\d+\\.\\d+\\.\\d+)$');
  });

  it('refuses to report "no drift" when nothing was readable', () => {
    // The trap this estate has recorded repeatedly: a probe that can see nothing
    // returns the same clean answer as a probe that looked.
    expect(SRC).toContain('REFUSING: every consumer was UNREADABLE');
    expect(SRC).toContain('process.exit(2)');
  });

  it('lists every consumer — a repo absent from the list is invisible to the check', () => {
    for (const repo of [
      'Talchain/olumi-assistants-service',
      'Talchain/DecisionGuideAI',
      'Talchain/plot-lite-service',
    ]) {
      expect(SRC).toContain(repo);
    }
  });
});

// ============================================================================
// computeGraphHash BROWSER-RUNTIME PROOF (0.21.0, P0-1).
//
// THE DEFECT THIS GUARDS: computeGraphHash is re-vendored by the UI and runs
// inside a Vite BROWSER bundle, which externalises `node:crypto` to a stub that
// throws on use (or fails the build). The old implementation hashed via
// `node:crypto`.`createHash`, so the UI's vendored hash would throw at runtime
// while the Node-env parity test stayed green — guarantee-theatre: the parity
// fixture "proved" agreement over a function the UI can never execute.
//
// THE PROOF: replace `node:crypto` / `crypto` with a stub whose `createHash`
// THROWS the moment it is used — exactly like the externalised browser stub —
// then require computeGraphHash to STILL compute the committed parity hash.
// Because the pure-TS SHA-256 has no node dependency, it succeeds. If anyone
// re-adds a `node:crypto`-based hash to the path, `createHash` would be invoked
// and throw → computeGraphHash throws → this suite goes RED.
//
// DISCRIMINATION / POSITIVE CONTROL (trap-13): the same stub is proven to
// genuinely disable node:crypto by importing a module that uses it and
// asserting the use THROWS. An absence proof that cannot see a presence is
// vacuous; this one can.
// ============================================================================
import { describe, it, expect, vi } from 'vitest';

// A stub matching how a browser bundle externalises node:crypto: importable,
// but any hashing use throws. (No top-level variable — vi.mock is hoisted.)
vi.mock('node:crypto', () => ({
  createHash: () => {
    throw new Error('node:crypto is not available in the browser bundle');
  },
  default: {
    createHash: () => {
      throw new Error('node:crypto is not available in the browser bundle');
    },
  },
}));
vi.mock('crypto', () => ({
  createHash: () => {
    throw new Error('crypto is not available in the browser bundle');
  },
}));

const EXPECTED_PARITY_HASH = '4310378fc45ec344';

describe('computeGraphHash runs with node builtins unavailable (browser proof)', () => {
  it('POSITIVE CONTROL — node:crypto is genuinely disabled (a module using it throws)', async () => {
    // Proves the absence proof below is not vacuous: node:crypto IS blocked.
    const scratch = await import('./fixtures/imports-node-crypto.js');
    expect(() => scratch.digest('abc')).toThrow(/crypto is not available in the browser/);
  });

  it('computeGraphHash produces the committed parity hash without node:crypto', async () => {
    // If the hash path re-acquired a node:crypto-based digest, invoking it would
    // hit the throwing stub and this call would throw → RED.
    const { computeGraphHash } = await import('../src/graph-hash.js');
    const { identityParityGraph } = await import('../src/fixtures/index.js');
    const hash = computeGraphHash(
      identityParityGraph as unknown as Parameters<typeof computeGraphHash>[0],
    );
    expect(hash).toBe(EXPECTED_PARITY_HASH);
  });

  it('the sha256 module itself needs no node builtin', async () => {
    const mod = await import('../src/sha256.js');
    expect(typeof mod.sha256Hex).toBe('function');
    expect(mod.sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

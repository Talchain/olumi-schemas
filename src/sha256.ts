// ============================================================================
// sha256 — a dependency-free, synchronous, ISOMORPHIC SHA-256 (0.21.0).
//
// WHY THIS EXISTS: `computeGraphHash` is the ONE canonical graph-identity hash
// that BOTH the CEE (Node) and the UI (a Vite browser bundle) re-vendor and
// call. The previous implementation hashed via `node:crypto`.`createHash`,
// which a browser bundle CANNOT execute — Vite externalises `node:crypto` to a
// stub that throws (or fails the build), so the UI's vendored hash would throw
// at runtime while the Node-env parity test passed: guarantee-theatre (the
// parity fixture "proves" agreement over a function the UI can never run).
//
// This is a from-scratch, well-known public-domain SHA-256 (FIPS 180-4) in pure
// TypeScript: no `node:*` import, no `require`, no WebCrypto (WebCrypto's
// `subtle.digest` is async — computeGraphHash is synchronous by contract, and
// `graph_hash` is computed on every turn/keystroke path). It runs byte-identical
// in Node, the browser, edge runtimes, and a Web Worker.
//
// CORRECTNESS is pinned by known-answer vectors (tests/sha256.test.ts) AND by
// the byte-parity fixture keeping its committed constant `965d721bd37964e8`
// (tests/graph-hash-parity.test.ts) — that constant was produced by
// `node:crypto` before this change, so an unchanged constant is positive proof
// this implementation agrees with the reference SHA-256 bit-for-bit.
// ============================================================================

// Round constants: first 32 bits of the fractional parts of the cube roots of
// the first 64 primes (FIPS 180-4 §4.2.2).
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Right-rotate a 32-bit word. */
function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Encode a JS string as UTF-8 bytes. Uses `TextEncoder` when present (browser,
 * modern Node, edge) and falls back to a manual encoder so the module has zero
 * runtime-global dependency and cannot fail on an exotic host.
 */
function utf8Bytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  // Manual UTF-8 (surrogate-pair aware) fallback.
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/** SHA-256 of raw bytes → 32-byte digest. */
export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  // Initial hash values: fractional parts of the square roots of the first 8
  // primes (FIPS 180-4 §5.3.3).
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLen = bytes.length * 8;
  // Padding: 0x80, then zeros, then 64-bit big-endian length; total ≡ 0 mod 64.
  const withPadLen = ((bytes.length + 8) >> 6) + 1; // number of 64-byte blocks
  const padded = new Uint8Array(withPadLen * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // 64-bit length in the last 8 bytes (big-endian). Bit length fits in 53 bits
  // for any practical input, so the high word is derived via division.
  const hiLen = Math.floor(bitLen / 0x100000000);
  const loLen = bitLen >>> 0;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, hiLen);
  dv.setUint32(padded.length - 4, loLen);

  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(block + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, h0 >>> 0);
  outDv.setUint32(4, h1 >>> 0);
  outDv.setUint32(8, h2 >>> 0);
  outDv.setUint32(12, h3 >>> 0);
  outDv.setUint32(16, h4 >>> 0);
  outDv.setUint32(20, h5 >>> 0);
  outDv.setUint32(24, h6 >>> 0);
  outDv.setUint32(28, h7 >>> 0);
  return out;
}

const HEX = '0123456789abcdef';

/** Lowercase hex of a byte array. */
function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  }
  return s;
}

/**
 * SHA-256 of a UTF-8 string → 64-char lowercase hex digest. Byte-for-byte
 * identical to `createHash('sha256').update(str,'utf8').digest('hex')`, but
 * runnable in any JS runtime (Node, browser, edge, worker).
 */
export function sha256Hex(str: string): string {
  return toHex(sha256Bytes(utf8Bytes(str)));
}

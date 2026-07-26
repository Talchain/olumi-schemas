#!/usr/bin/env node
// Two-sided compat gate (arch step 2, S0) — see compat/README.md for the spec.
//
// For each seam, diffs the CANDIDATE openapi against the BASELINE openapi in BOTH
// directions, because the two directions have opposite break rules:
//
//   RESPONSE direction (writer=service, reader=consumer)
//     A reader built against baseline breaks when the candidate REMOVES something:
//       removed response field · newly-optional-to-absent required field · removed
//       enum value · changed type.
//     Additions are safe (design §9: consumers tolerant-additive within a major).
//
//   REQUEST direction (writer=consumer, reader=service)
//     A writer built against baseline breaks when the candidate DEMANDS something new:
//       newly-required request field · removed enum value it may still send ·
//       changed type · removed field under strict parsing.
//     Removing a requirement is safe.
//
// Also enforced, because a gate that can be pointed at a moving target is not a gate:
//   PIN DISCIPLINE  both artifacts must be pinned to an immutable ref (40- or 7-hex
//                   commit sha). `main`, `staging`, `HEAD`, tags — rejected.
//   SANITIZATION    no artifact may contain a denylisted key anywhere.
//
// Usage: node scripts/check-compat-gate.mjs [--seams DIR] [--seam ID]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMMUTABLE_REF = /^[0-9a-f]{7}([0-9a-f]{33})?$/;
const MOVING_REFS = new Set(['main', 'master', 'staging', 'head', 'develop', 'latest']);
const SECRET_KEY = /(api[_-]?key|authorization|password|secret|token|bearer|cookie|email|user[_-]?id)/i;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const seamsDir = resolve(arg('seams', join(ROOT, 'compat/seams')));
const onlySeam = arg('seam', null);

const errors = [];
const fail = (code, msg) => errors.push(`${code}: ${msg}`);

// ---- helpers ---------------------------------------------------------------
const schemasOf = (doc) => doc?.components?.schemas ?? {};

function scanForSecrets(node, path, seamId, artifactLabel) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanForSecrets(v, `${path}[${i}]`, seamId, artifactLabel));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (SECRET_KEY.test(k)) {
      fail('E_UNSANITIZED', `${seamId}/${artifactLabel}: key "${k}" at ${path}/${k} matches the secret denylist — fixtures must be sanitized`);
    }
    scanForSecrets(v, `${path}/${k}`, seamId, artifactLabel);
  }
}

/** Flatten a component schema one level into {field -> {type, enum, required}}. */
function fieldsOf(schemas, name) {
  const s = schemas[name];
  if (!s) return null;
  const required = new Set(s.required ?? []);
  const out = new Map();
  for (const [field, def] of Object.entries(s.properties ?? {})) {
    // Unwrap the `anyOf: [X, null]` shape FastAPI emits for Optional[X].
    const branches = def.anyOf ?? def.oneOf ?? [def];
    const real = branches.find((b) => b?.type !== 'null') ?? branches[0] ?? {};
    out.set(field, {
      type: real.type ?? (real.$ref ? `ref:${real.$ref.split('/').pop()}` : 'unknown'),
      enum: real.enum ? [...real.enum].sort() : null,
      required: required.has(field),
    });
  }
  return out;
}

function diffDirection({ seamId, direction, schemaName, baseline, candidate }) {
  const findings = [];
  const b = fieldsOf(baseline, schemaName);
  const c = fieldsOf(candidate, schemaName);
  if (!b || !c) {
    if (!b && !c) return findings; // schema absent from both — nothing to compare
    fail('E_SCHEMA_VANISHED', `${seamId} ${direction}: schema "${schemaName}" present in ${b ? 'baseline' : 'candidate'} only`);
    return findings;
  }

  for (const [field, bd] of b) {
    const cd = c.get(field);
    if (!cd) {
      // A field the baseline had is gone.
      if (direction === 'response') {
        fail('E_RESPONSE_FIELD_REMOVED', `${seamId}: ${schemaName}.${field} removed — a reader pinned to baseline loses it`);
      } else {
        findings.push(`request field ${field} removed (safe unless the service parses strictly — confirm)`);
      }
      continue;
    }
    if (bd.type !== cd.type) {
      fail('E_TYPE_CHANGED', `${seamId} ${direction}: ${schemaName}.${field} type ${bd.type} -> ${cd.type}`);
    }
    if (bd.enum && cd.enum) {
      const lost = bd.enum.filter((v) => !cd.enum.includes(v));
      const gained = cd.enum.filter((v) => !bd.enum.includes(v));
      if (lost.length) {
        fail('E_ENUM_NARROWED', `${seamId} ${direction}: ${schemaName}.${field} no longer accepts [${lost.join(', ')}]`);
      }
      if (gained.length && direction === 'response') {
        findings.push(`${schemaName}.${field} gained enum value(s) [${gained.join(', ')}] — readers must tolerate them`);
      }
    }
    if (direction === 'request' && !bd.required && cd.required) {
      fail('E_REQUEST_FIELD_NEWLY_REQUIRED', `${seamId}: ${schemaName}.${field} is now required — a writer pinned to baseline is rejected`);
    }
    if (direction === 'response' && bd.required && !cd.required) {
      fail('E_RESPONSE_FIELD_NO_LONGER_GUARANTEED', `${seamId}: ${schemaName}.${field} was always present, now optional — readers may not have a null path`);
    }
  }
  for (const [field, cd] of c) {
    if (b.has(field)) continue;
    if (direction === 'request' && cd.required) {
      fail('E_REQUEST_FIELD_NEWLY_REQUIRED', `${seamId}: ${schemaName}.${field} is new AND required — a writer pinned to baseline is rejected`);
    } else {
      findings.push(`${direction}: ${schemaName}.${field} added${cd.required ? ' (required)' : ' (optional)'} — additive`);
    }
  }
  return findings;
}

// ---- run -------------------------------------------------------------------
if (!existsSync(seamsDir)) {
  console.error(`compat-gate: FAIL E_NO_SEAMS: ${seamsDir} does not exist`);
  process.exit(1);
}
const seamIds = readdirSync(seamsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(seamsDir, d.name, 'seam.json')))
  .map((d) => d.name)
  .filter((id) => !onlySeam || id === onlySeam);

if (seamIds.length === 0) {
  console.error(`compat-gate: FAIL E_NO_SEAMS: no seam.json found under ${seamsDir}`);
  process.exit(1);
}

for (const seamId of seamIds) {
  const dir = join(seamsDir, seamId);
  const seam = JSON.parse(readFileSync(join(dir, 'seam.json'), 'utf8'));
  const docs = {};

  for (const side of ['baseline', 'candidate']) {
    const spec = seam[side];
    const ref = String(spec?.pinned_ref ?? '');
    if (MOVING_REFS.has(ref.toLowerCase()) || !IMMUTABLE_REF.test(ref)) {
      fail('E_MOVING_PIN', `${seamId}.${side}: pinned_ref ${JSON.stringify(ref)} is not an immutable commit sha — a gate pointed at a branch tip proves nothing`);
    }
    const artifact = join(dir, spec?.artifact ?? '');
    if (!existsSync(artifact)) {
      fail('E_ARTIFACT_MISSING', `${seamId}.${side}: artifact ${spec?.artifact} not found`);
      continue;
    }
    docs[side] = JSON.parse(readFileSync(artifact, 'utf8'));
    scanForSecrets(docs[side], '', seamId, side);
  }
  if (!docs.baseline || !docs.candidate) continue;

  const bs = schemasOf(docs.baseline);
  const cs = schemasOf(docs.candidate);
  console.log(`compat-gate: ${seamId} — baseline ${seam.baseline.pinned_ref.slice(0, 7)} vs candidate ${seam.candidate.pinned_ref.slice(0, 7)}`);

  for (const op of seam.operations ?? []) {
    for (const [direction, schemaName] of [
      ['request', op.request_schema],
      ['response', op.response_schema],
    ]) {
      if (!schemaName) continue;
      const findings = diffDirection({ seamId, direction, schemaName, baseline: bs, candidate: cs });
      console.log(`compat-gate:   ${op.method.toUpperCase()} ${op.path} [${direction}] ${schemaName} — ${findings.length} advisory finding(s)`);
      for (const f of findings) console.log(`compat-gate:     · ${f}`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`compat-gate: FAIL ${e}`);
  process.exit(1);
}
console.log(`compat-gate: OK (${seamIds.length} seam(s), both directions)`);

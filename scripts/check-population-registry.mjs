#!/usr/bin/env node
// Population-registry checker (arch step 2, S0).
//
// Shape + uniqueness (design §7), PLUS the anti-mirror rule: the registry's
// declared wire labels must agree EXACTLY, in both directions, with the label
// enum in the pinned live artifact. A registry that drifts from what the
// producer actually emits is worse than no registry.
//
// FAILS when:
//   E_BAD_ID          id is not `<ns>.<seg>[.<seg>...]@<major>` (lowercase, versioned)
//   E_DUP_ID          two entries share an id
//   E_BAD_STAGE       stage outside the closed enum
//   E_BAD_PARENT      parent_id does not resolve to another entry (or is self)
//   E_BAD_TRANSFORM   transform_id does not resolve to a declared transform
//   E_TRANSFORM_REQ   a non-`raw` stage has a parent but no transform_id
//   E_WIRE_UNMAPPED   the live artifact emits a label no registry entry claims
//   E_WIRE_UNKNOWN    a registry entry claims a label the live artifact does not emit
//   E_WIRE_AMBIGUOUS  two entries claim the same wire label for the same source
//   E_ARTIFACT        the pinned artifact / json pointer is missing
//
// Usage: node scripts/check-population-registry.mjs [--registry PATH]
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+@[1-9]\d*$/;

const i = process.argv.indexOf('--registry');
const registryPath = resolve(i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : join(ROOT, 'contracts/population-registry.json'));

const errors = [];
const fail = (code, msg) => errors.push(`${code}: ${msg}`);

const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
const stages = reg.stages ?? [];
const pops = reg.populations ?? [];
const transformIds = new Set((reg.transforms ?? []).map((t) => t.id));

// --- transform ids are populations-adjacent but follow the same id rule -------
for (const t of reg.transforms ?? []) {
  if (!ID.test(t?.id ?? '')) fail('E_BAD_ID', `transform id ${JSON.stringify(t?.id)} must match ${ID}`);
}

// --- shape + uniqueness -------------------------------------------------------
const ids = new Set();
for (const p of pops) {
  const id = p?.id;
  if (!ID.test(id ?? '')) {
    fail('E_BAD_ID', `population id ${JSON.stringify(id)} must be namespaced+versioned, e.g. olumi.mc.auto_noise_sqrt2@1`);
    continue;
  }
  if (ids.has(id)) fail('E_DUP_ID', `population id ${id} declared more than once`);
  ids.add(id);
  if (!stages.includes(p.stage)) {
    fail('E_BAD_STAGE', `${id}: stage ${JSON.stringify(p.stage)} not in closed enum [${stages.join(' | ')}]`);
  }
  if (p.transform_id && !transformIds.has(p.transform_id)) {
    fail('E_BAD_TRANSFORM', `${id}: transform_id ${p.transform_id} is not declared in registry.transforms`);
  }
}
for (const p of pops) {
  if (!p?.parent_id) continue;
  if (p.parent_id === p.id) fail('E_BAD_PARENT', `${p.id}: parent_id points at itself`);
  else if (!ids.has(p.parent_id)) fail('E_BAD_PARENT', `${p.id}: parent_id ${p.parent_id} does not resolve to a registry entry`);
  if (p.stage !== 'raw' && !p.transform_id) {
    fail('E_TRANSFORM_REQ', `${p.id}: stage=${p.stage} derives from ${p.parent_id} but declares no transform_id`);
  }
}

// --- the anti-mirror rule: total + injective against what actually ships ------
function readPointer(doc, pointer) {
  let node = doc;
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node == null || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

for (const src of reg.wire_label_sources ?? []) {
  const artifact = resolve(ROOT, src.pinned_artifact ?? '');
  if (!existsSync(artifact)) {
    fail('E_ARTIFACT', `${src.source_id}: pinned_artifact ${src.pinned_artifact} not found`);
    continue;
  }
  const live = readPointer(JSON.parse(readFileSync(artifact, 'utf8')), src.json_pointer ?? '');
  if (!Array.isArray(live)) {
    fail('E_ARTIFACT', `${src.source_id}: json_pointer ${src.json_pointer} does not resolve to an array in ${src.pinned_artifact}`);
    continue;
  }

  const claimed = new Map(); // wire label -> population id
  for (const p of pops) {
    const label = p?.wire_labels?.[src.source_id];
    if (label === undefined) continue;
    if (claimed.has(label)) {
      fail('E_WIRE_AMBIGUOUS', `${src.source_id}: label "${label}" claimed by both ${claimed.get(label)} and ${p.id}`);
      continue;
    }
    claimed.set(label, p.id);
    if (!live.includes(label)) {
      fail('E_WIRE_UNKNOWN', `${src.source_id}: ${p.id} claims wire label "${label}", which the pinned artifact does not emit (emits: ${live.join(', ')})`);
    }
  }
  for (const label of live) {
    if (!claimed.has(label)) {
      fail('E_WIRE_UNMAPPED', `${src.source_id}: the pinned artifact emits "${label}" but no registry population claims it — add an entry (and an adoption-manifest row) before it reaches a consumer`);
    }
  }
  console.log(`population-registry: ${src.source_id} — ${live.length} live label(s) [${live.join(', ')}] all mapped`);
}

console.log(`population-registry: ${pops.length} population(s), ${transformIds.size} transform(s)`);
if (errors.length) {
  for (const e of errors) console.error(`population-registry: FAIL ${e}`);
  process.exit(1);
}
console.log('population-registry: OK');

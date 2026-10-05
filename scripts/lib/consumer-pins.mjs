/**
 * CONSUMER PIN DRIFT — the pure decision logic, importable by the test.
 *
 * `scripts/check-consumer-pins.mjs` does the I/O (gh api for each consumer's
 * package.json, git for the release tags) and calls `assess`. Everything that can be
 * wrong quietly lives here, so the test exercises THE code rather than a copy of it.
 *
 * ⭐ THE RULE. A consumer FAILS when it pins a version older than the newest release
 * that has been out for longer than the lag window (default 48 h). Drift inside the
 * window is the normal state just after a release (a consumer cannot vendor a version
 * that does not exist yet), so it is reported and passes. Drift past the window is
 * the skew this check exists for: one service producing fields another cannot parse.
 * `--strict` sets the window to 0.
 *
 * ⛔ COULD-NOT-MEASURE IS A FAILURE, never a pass:
 *   - a consumer whose pin cannot be read is UNREADABLE and fails the run;
 *   - every consumer UNREADABLE, or no release tag readable (a shallow checkout), exits 2.
 */

/** The consumers of this contract. A repo absent here is INVISIBLE to the check. */
export const CONSUMERS = [
  { name: 'CEE', repo: 'Talchain/olumi-assistants-service', ref: 'staging' },
  { name: 'UI', repo: 'Talchain/DecisionGuideAI', ref: 'staging' },
  { name: 'PLoT', repo: 'Talchain/plot-lite-service', ref: 'staging' },
];

export const DEFAULT_MAX_LAG_HOURS = 48;

/** Vendored tarball or bare semver -> version. Returns null when underivable. */
export function versionFromPin(pin) {
  if (typeof pin !== 'string' || pin.length === 0) return null;
  const tarball = pin.match(/talchain-schemas-(\d+\.\d+\.\d+)\.tgz$/);
  if (tarball) return tarball[1];
  const bare = pin.match(/^\^?~?(\d+\.\d+\.\d+)$/);
  if (bare) return bare[1];
  return null;
}

/** Numeric semver compare (0.10.0 > 0.9.0). -1, 0 or 1. */
export function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * `git for-each-ref --format='%(refname:strip=2)%09%(creatordate:iso-strict)' refs/tags/v*`
 * output -> [{ version, atMs }], newest version first. Lines that are not `vX.Y.Z<TAB>date`
 * are ignored, so a stray tag cannot be read as a release.
 */
export function releasesFromTagLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.trim().match(/^v(\d+\.\d+\.\d+)\t(\S+)$/);
    if (!m) continue;
    const atMs = Date.parse(m[2]);
    if (Number.isNaN(atMs)) continue;
    out.push({ version: m[1], atMs });
  }
  return out.sort((x, y) => compareSemver(y.version, x.version));
}

/** The newest release that has been out for at least `maxLagHours`; null when none has. */
export function requiredVersion(releases, nowMs, maxLagHours) {
  const cutoff = nowMs - maxLagHours * 3_600_000;
  for (const r of releases) {
    if (r.atMs <= cutoff) return r.version;
  }
  return null;
}

/**
 * rows: [{ name, status: 'READ' | 'UNREADABLE', version?, pin?, detail? }]
 * -> { newest, required, verdicts, exitCode }
 *
 * Verdict per consumer:
 *   CURRENT        pins the newest release
 *   WITHIN_WINDOW  behind the newest, but not behind the required release
 *   BEHIND         behind the required release (fails)
 *   UNTAGGED       pins a version with no release tag; its bytes are unverifiable (fails)
 *   UNREADABLE     pin could not be read (fails)
 */
export function assess(rows, releases, { nowMs, maxLagHours, reportOnly = false }) {
  const newest = releases.length > 0 ? releases[0].version : null;
  const required = requiredVersion(releases, nowMs, maxLagHours);
  const tagged = new Set(releases.map((r) => r.version));

  const verdicts = rows.map((r) => {
    if (r.status !== 'READ') return { ...r, verdict: 'UNREADABLE' };
    if (!tagged.has(r.version)) return { ...r, verdict: 'UNTAGGED' };
    if (r.version === newest) return { ...r, verdict: 'CURRENT' };
    if (required !== null && compareSemver(r.version, required) < 0) return { ...r, verdict: 'BEHIND' };
    return { ...r, verdict: 'WITHIN_WINDOW' };
  });

  const measuredNothing =
    releases.length === 0 || verdicts.every((v) => v.verdict === 'UNREADABLE');
  const failing = verdicts.some((v) => ['BEHIND', 'UNTAGGED', 'UNREADABLE'].includes(v.verdict));

  let exitCode = 0;
  if (measuredNothing) exitCode = 2;
  else if (failing && !reportOnly) exitCode = 1;

  return { newest, required, verdicts, exitCode, measuredNothing };
}

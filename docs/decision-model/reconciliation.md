# v2.6 fork reconciliation record

8 September 2026. Candidate document revision **2.7**; package remains **0.50.0**.
This is source reconciliation, not a deployed scientific or product acceptance.

## Canonical home and version

`Talchain/olumi-schemas` is the existing shared-contract repository. Its
[README](../../README.md), [repository map](../../contracts/repo-map.json) and
[repository instructions](../../CLAUDE.md) establish its role and `main`
integration branch. Remote `package.json` at the base below reports 0.50.0;
the earlier 0.15 reference is stale. A documentation revision is not an npm
version or permission to re-vendor service dependencies.

| Inspected source | Ref / full commit |
| --- | --- |
| schemas | main · `25d01ba2ce7210e768996e0f92a15fd36420e6d2` |
| UI | staging · `0a0a8113335621b8f80937f1b2d455caa1483ec2` |
| CEE | staging · `dcff3c562a53ecda0c487dd211aa9e04f788b468` |
| PLoT | staging · `d37c8cfd5694f7d76b0b4820f4bee72b577660a0` |
| ISL | staging · `7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1` |

These are inspected Git sources, not a freshly verified serving quartet.
Remote tree inspection found no schemas `AGENTS.md` or `CODEOWNERS`;
that absence is not a substitute for independent human/agent review.

## Exact fork and lossless preservation

| Existing copy | Git blob |
| --- | --- |
| [UI · docs/Olumi_Decision_Model_Schema_v2_6.md](https://github.com/Talchain/DecisionGuideAI/blob/0a0a8113335621b8f80937f1b2d455caa1483ec2/docs/Olumi_Decision_Model_Schema_v2_6.md) | `bff1aff2b5dc85d10fbf9a62f96c2666d3dd329a` |
| [CEE · Docs/Olumi_Decision_Model_Schema_v2_6.md](https://github.com/Talchain/olumi-assistants-service/blob/dcff3c562a53ecda0c487dd211aa9e04f788b468/Docs/Olumi_Decision_Model_Schema_v2_6.md) | `bff1aff2b5dc85d10fbf9a62f96c2666d3dd329a` |
| [ISL · docs/Olumi_Decision_Model_Schema_v2_6.md](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/docs/Olumi_Decision_Model_Schema_v2_6.md) | `017f0f3a165e6e43ca7bf90a5d9e5cc00f11d305` |

All three identify themselves as v2.6 dated 15 January 2026. UI and CEE are
byte-identical. ISL differs **only** between the `## B.5 ` and `## B.6 `
headings: prefix and suffix compare exactly. It adds 110 lines there.

[legacy-v2.6.md](legacy-v2.6.md) preserves the complete ISL text verbatim between
marked snapshot boundaries, including all Part A–E sections, appendices, examples,
open questions and FRAME material. The original UI/CEE B.5 is preserved verbatim
in a separate marked historical block. The two source versions can therefore
be reconstructed without discarding unique content.

The new entrypoint supersedes the old *canonical-reference claim*, not the
historical record. It corrects the explicit V5 analysis caller path and retains
the source-backed FRAME correction. It does not silently refresh every old claim.

## Claims deliberately not re-certified

The following require bounded owner-led source/test reconciliation before anyone
presents them as current doctrine:

- Historical blanket inference-domain and normalisation statements, range
  heuristics, fallback values, hard limits and line-number references.
- Claims that an all-0.5 strength pattern alone proves pipeline loss.
- Historical statements that only edge uncertainty exists or that all listed
  sensitivity surfaces use one proxy method.
- Every producer's threshold/frame/baseline attestation, goal direction,
  constraint semantics and finite-coverage disclosure to the user.
- The old scientific questions and suggested defaults in the appendices.

Do not treat missing numeric thresholds as missing goals, comparative frequency
as goal attainment, or wording changes as proof of a computation defect. Do not
use this document to settle those open questions by assertion.

## Pointer and fail-loud guard approach — not yet implemented

This PR establishes the home and preserves the fork; it does **not** eliminate
the copies still present in three other repositories. That requires separately
owned, reviewed documentation-only adoption changes, not a four-repo runtime
migration hidden in this PR.

1. UI, CEE and ISL owners replace their exact old paths above with thin pointers
   to `olumi-schemas/docs/decision-model/README.md`, retaining a link to the
   preserved snapshot and a reviewed canonical document commit. Do not copy the
   2.7 prose into each repository.
2. In each adopter's existing documentation/CI mechanism, check the exact pointer
   target and reviewed revision/commit, and reject a reinstated full document
   claiming to be the canonical v2.6 reference. Missing, empty or altered
   pointers must fail, not count as a skipped or successful sync.
3. If an offline snapshot is necessary, pin its immutable source blob/checksum
   and compare bytes locally; a missing pin or mismatch fails. Do not rely on a
   best-effort network fetch, a comment containing a version, or package version
   equality to establish semantic-document equality.
4. Prove the chosen small guard with unchanged-pointer PASS plus missing,
   wrong-target and restored-fork FAIL controls. Until that lands, describe
   consumer drift protection as **pending**, not implemented.

Shared field changes remain the schemas owner's release process; meaning and
producer attestations need the CEE owner; numerical interpretation needs the ISL
owner and PLoT boundary owner; UI wording/permission needs its UI owner. This is a
review-routing proposal using the existing repository roles, not a new authority
that overrides them.

## Candidate verification boundary

Verify snapshot reconstruction against the two Git blobs, local links and the
four-file allowlist. No `src/`, `json-schema/`, `contracts/`, package,
lockfile, consumer or runtime configuration changes belong to this candidate.
No provider call, browser journey, computation experiment, full test suite or
package upgrade is required to prove this documentation-only delta. Their absence
must not be reported as new runtime or scientific acceptance.

The byte-preserved snapshot retains original trailing whitespace. A full
`git diff --check` reports those archival lines; the curated documents and root
README pass separately. Do not normalise the archive while claiming byte identity
or change repository whitespace policy to hide this distinction.

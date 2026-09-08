# Decision-model semantics

Document revision **2.7**, 8 September 2026. Source reconciliation against
`@talchain/schemas` **0.50.0**; these are separate version numbers.

This is the canonical **curated semantic reference** for Olumi's decision-analysis
slice. Olumi's product is the living shared visual reasoning workspace; an
analysable decision model is one use of that workspace, not its entire purpose.

## Authority and scope

This document explains meaning and points to executable definitions. It does not
declare wire fields, supersede validators, license user-facing claims, or change
runtime behaviour. If prose and code disagree, record the disagreement: code
establishes what executes, not automatically what the science or product ought to
mean. A new scientific or product decision requires its own review.

| Question | Source of authority |
| --- | --- |
| Shared graph fields and validation | [`src/graph.ts`](../../src/graph.ts), generated [JSON schemas](../../json-schema/), and the consumer's actual pinned package |
| Shared draft/receipt and response contracts | [Boundary blocks](../../src/boundary/blocks.ts), [enrichment](../../src/boundary/enrichment.ts), and [analysis](../../src/analysis.ts) |
| PLoT compute request and normalised engine shapes | [`RunRequestV3`, graph, options and constraints](https://github.com/Talchain/plot-lite-service/blob/d37c8cfd5694f7d76b0b4820f4bee72b577660a0/src/types/engine-v3.ts), plus the actual route validator |
| ISL robustness request, threshold frame and numerical evaluation | [Request models](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/models/robustness_v2.py) and [analyser](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/services/robustness_analyzer_v2.py) |
| Repository roles and contract adoption evidence | [Repository map](../../contracts/repo-map.json) and [adoption manifest](../../contracts/adoption-manifest.json) |

The similarly named [`V2RunRequestSchema`](../../src/boundary/run.ts) is explicitly
a minimal legacy placeholder, **not the current compute-seam contract**. Do not
reconstruct an endpoint request from its name or the historical TypeScript tables.

The [preserved v2.6 reference](legacy-v2.6.md) contains the complete prior
explanation, examples and open questions, including ISL's FRAME correction and
the displaced UI/CEE B.5. It is a historical source, not a second current schema.

## The verified analysis path

For the inspected V5 **explicit run-analysis action**, the flow is:

**UI V5 turn → CEE scenario snapshot and run handler → PLoT `POST /v2/run` →
ISL `POST /api/v1/robustness/analyze/v2`.**

1. The UI builds a scenario-bound `message` with a `run_analysis` chip; this
   action payload does not contain a graph. [Payload builder](https://github.com/Talchain/DecisionGuideAI/blob/0a0a8113335621b8f80937f1b2d455caa1483ec2/src/v5/buildPayload.ts#L480-L496)
2. The V5 adapter posts the turn to its configured `VITE_V5_ENDPOINT`; this is
   not the historical “UI sends AnalysisRequest directly to PLoT” description.
   [Endpoint resolution and POST](https://github.com/Talchain/DecisionGuideAI/blob/0a0a8113335621b8f80937f1b2d455caa1483ec2/src/v5/v5Adapter.ts#L76-L126)
3. CEE reads the scenario snapshot, constructs the compute graph/options/goal
   payload, and invokes its PLoT client.
   [Snapshot read](https://github.com/Talchain/olumi-assistants-service/blob/dcff3c562a53ecda0c487dd211aa9e04f788b468/src/orchestrator-v5/tools/handlers/run-analysis.ts#L317-L320),
   [compute payload](https://github.com/Talchain/olumi-assistants-service/blob/dcff3c562a53ecda0c487dd211aa9e04f788b468/src/orchestrator-v5/tools/handlers/run-analysis.ts#L711-L721),
   [actual client POST](https://github.com/Talchain/olumi-assistants-service/blob/dcff3c562a53ecda0c487dd211aa9e04f788b468/src/orchestrator/plot-client.ts#L795-L820)
4. PLoT constructs the ISL request and calls the robustness endpoint.
   [Call site](https://github.com/Talchain/plot-lite-service/blob/d37c8cfd5694f7d76b0b4820f4bee72b577660a0/src/routes/v2/run.ts#L7599-L7607)

This is a source trace of that action, not a statement that all UI API traffic
follows this path. Registration, readiness, graph synchronisation, streaming and
other routes have distinct responsibilities. It does not prove that any
particular deployed run consumed the intended edited graph; that requires joined
scenario/request/model and calculation-input evidence.

## Goal, threshold and comparative frequency are different

- **Goal:** the target outcome node being evaluated. The inspected ISL request
  requires `goal_node_id` even when there is no threshold.
- **Threshold:** an optional target value whose frame must be attested before
  computing attainment. No threshold means no threshold-attainment result;
  it does **not** mean “no goal.”
- **Comparative win frequency:** the inspected main Monte Carlo loop evaluates
  each option's goal-node outcome, compares finite outcomes at each draw, and
  splits win credit equally among ties. `win_probability` divides that credit
  by the requested sample count. It is not the probability of meeting a target,
  an absolute statement that an option is good, or permission to name a leader.

Sources: [required goal and optional threshold/frame](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/models/robustness_v2.py#L827-L941),
[goal evaluation and win allocation](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/services/robustness_analyzer_v2.py#L3088-L3164),
[separate output fields](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/services/robustness_analyzer_v2.py#L4554-L4568).

User-facing ranking/leader permission, freshness and refusal are separate
contracts; these numerical descriptions do not override them. A wording defect
alone does not establish a contradictory calculation.

## Preserve the FRAME correction

The ISL v2.6 fork correctly records why sharing a unit is insufficient: the
threshold must also share the comparison's **frame**. The inspected implementation
distinguishes:

- `delta`: the producer attests that the threshold is already in the samples'
  comparison frame; compare the samples directly.
- `level`: use an admitted conversion plan and paired status-quo reference
  draws. For each draw:
  `level = goal_baseline + (option_sample - status_quo_sample)`,
  then compare that level with the level threshold.

Here the baseline is the explicitly supplied goal
`observed_state.baseline`, not a fallback from `observed_state.value`.
The withdrawn static conversion `threshold - baseline + intercept` must not
be revived: propagated parent values need not have a zero status-quo contribution.
[Resolver and correction](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/services/robustness_analyzer_v2.py#L3682-L3787),
[actual per-draw comparison](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/services/robustness_analyzer_v2.py#L4345-L4364).

No requested threshold yields no attainment result. An unattested or
unconvertible frame yields omission plus a warning, not an invented probability.
Conversion admission, finite-draw coverage and response emission still apply:
the formula alone does not guarantee that a probability may be emitted.
The current code uses finite **compared** draws for the attainment denominator
and suppresses categorical 0/1 results from partial coverage. This is not the
same denominator as comparative win frequency.
[Finite-draw calculation](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/services/robustness_analyzer_v2.py#L4457-L4460),
[partial-coverage emission guard](https://github.com/Talchain/Inference-Service-Layer/blob/7781ca4fdee93e550a9c3cc7b7e2a0bb5141bcf1/src/services/robustness_analyzer_v2.py#L4508-L4515).

The full historical FRAME cases, examples and refusal reasons remain in the
snapshot. This reconciliation does not certify every upstream frame producer,
every constraint path, goal direction, normalisation heuristic or end-to-end
display.

## Maintaining one reference

Start here for curated semantics; follow executable sources for field definitions.
See [reconciliation and adoption plan](reconciliation.md) for exact source
identities, preserved differences, unresolved claims, ownership and the proposed
fail-loud consumer-pointer guard. The three consumer copies have **not yet been
converted to pointers** by this documentation-only change.

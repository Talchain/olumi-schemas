# @olumi/schemas

Shared TypeScript schemas and runtime validation for Olumi's boundary contracts. Single source of truth for wire-format types consumed by UI, CEE, PLoT, and ISL.

## Installation

Configure your `.npmrc` for GitHub Packages:

```
@olumi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then install:

```bash
npm install @olumi/schemas
```

## Usage

```typescript
import {
  GraphV3Schema,
  NodeV3Schema,
  EdgeV3Schema,
  LIMITS,
  validateGraphLimits,
  CIL_WARNING_CODES,
  STRENGTH_DEFAULT_SIGNATURE,
} from '@olumi/schemas';

// Validate a graph
const graph = GraphV3Schema.parse(rawData);

// Check PoC limits (schema is permissive; limits are checked separately)
const violations = validateGraphLimits(graph);
if (violations.length > 0) {
  // Handle over-limit graph
}
```

All Zod schemas export inferred TypeScript types:

```typescript
import type { NodeV3, EdgeV3, GraphV3, ValidationWarning } from '@olumi/schemas';
```

## Package contents

| Module | Exports |
|--------|---------|
| `graph.ts` | `NodeV3Schema`, `EdgeV3Schema`, `GraphV3Schema`, `NodeKind`, `FactorCategory`, `StrengthSchema`, `ObservedStateSchema`, `StateSpaceSchema` |
| `analysis.ts` | `OptionForAnalysisSchema`, `AnalysisReadyV3Schema`, `ResponseMetaSchema`, `AnalysisRequestIdChainSchema`, `ProductReadiness`, `SeedSource`, `DetailLevel` |
| `warnings.ts` | `ValidationWarningSchema`, `CIL_WARNING_CODES`, `CIL_WARNING_SEVERITY`, `STRENGTH_DEFAULT_SIGNATURE`, threshold constants, typed detail schemas |
| `cee-errors.ts` | `CeeErrorCode`, `CeeTypedErrorSchema`, `CeeTimeoutErrorSchema`, `CeeBudgetErrorSchema`, `CeeUpstreamLlmErrorSchema` |
| `plot-errors.ts` | `PlotProxyTimeoutErrorSchema`, `PlotCeeUpstreamEnvelopeSchema` |
| `repairs.ts` | `REPAIR_CODES`, `RepairEntrySchema`, `RepairLayer` |
| `limits.ts` | `LIMITS`, `validateGraphLimits()` |
| `enums.ts` | Re-exports: `NodeKind`, `FactorCategory`, `ProductReadiness`, `SeedSource`, `DetailLevel`, `RepairLayer` |

## Error ownership model

Error codes are owned by the service that generates them:

| Code | Owner | Schema |
|------|-------|--------|
| `CEE_LLM_TIMEOUT` | CEE | `CeeTimeoutErrorSchema` |
| `CEE_REQUEST_BUDGET_EXCEEDED` | CEE | `CeeBudgetErrorSchema` |
| `CEE_LLM_UPSTREAM_ERROR` | CEE | `CeeUpstreamLlmErrorSchema` |
| `CEE_LLM_VALIDATION_FAILED` | CEE | `CeeTypedErrorSchema` |
| `CEE_CLIENT_DISCONNECT` | CEE | `CeeTypedErrorSchema` |
| `CEE_INTERNAL_ERROR` | CEE | `CeeTypedErrorSchema` |
| `CEE_PROXY_TIMEOUT` | **PLoT BFF** | `PlotProxyTimeoutErrorSchema` |
| `CEE_UPSTREAM_ERROR` | **PLoT BFF** | `PlotCeeUpstreamEnvelopeSchema` |

Do not create CEE errors in PLoT or PLoT errors in CEE. The `CeeErrorCode` enum only contains CEE-owned codes.

## `field_path` convention

Repair entries and validation warnings use JSONPath-style field references:

```
edges[0].strength.std
edges[3].exists_probability
nodes[2].observed_state.value
```

Array indices are zero-based. Paths refer to the canonical graph structure.

## Semver policy

| Change type | Version bump | Example |
|-------------|-------------|---------|
| New schemas, new optional fields, new enum values | **Minor** | Adding `GoalConstraintSchema` |
| Bug fixes, documentation, internal refactors | **Patch** | Fixing regex pattern |
| Field removal, type changes, stricter validation | **Major** | Removing `.passthrough()`, renaming fields |

All object schemas use `.passthrough()` for forward compatibility. Consumers should handle unknown fields gracefully.

## Adding new schemas

1. Create or edit the relevant file in `src/`
2. Define Zod schema with `.passthrough()` on objects
3. Export inferred type via `z.infer<typeof Schema>`
4. Add exports to `src/index.ts`
5. Add tests in `tests/schemas.test.ts`
6. Bump version in `package.json` per semver policy
7. Push to `main` — CI publishes and opens PRs in consuming repos

## Development

```bash
npm install       # Install dependencies
npm run lint      # Type check
npm test          # Run tests
npm run build     # Compile to dist/
```

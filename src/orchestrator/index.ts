// @talchain/schemas/orchestrator — CEE-internal runtime contracts.
//
// A0 ships this namespace as a stub. Pinning the subpath now lets A1 (TurnExecutor)
// add TurnContext, LLMResponse, ActionRecommendation, HandlerFact, ContextPack,
// CoachingSignal, Insight without bumping the major and without forcing consumers
// to rewrite import paths.
//
// Do not add runtime exports here in A0. If you need a new type in A0 scope,
// it belongs in /boundary.

export {};

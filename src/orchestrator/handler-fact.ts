import { z } from 'zod';

// HandlerFact — discriminated union populated by handlers in later slices.
// A1 ships ZERO handlers. `z.never()` is the correct "empty union" placeholder:
// any attempt to parse a HandlerFact in A1 fails, which matches the invariant
// that no handler produces facts yet.
//
// Future slices widen this to `z.discriminatedUnion('fact_type', [...])`.
// Consumers type-checking `HandlerFact` today will see `never`, which surfaces
// any accidental construction of handler facts at the type system.
export const HandlerFactSchema = z.never();
export type HandlerFact = z.infer<typeof HandlerFactSchema>;

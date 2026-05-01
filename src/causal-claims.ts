import { z } from 'zod';

export const StrengthBand = z.enum([
  'very_strong',
  'strong',
  'moderate',
  'slight',
]);
export type StrengthBandT = z.infer<typeof StrengthBand>;

const nodeIdString = z.string().min(1);

export const DirectEffectClaimSchema = z.object({
  type: z.literal('direct_effect'),
  from: nodeIdString,
  to: nodeIdString,
  stated_strength: StrengthBand,
}).strict();

export const MediationOnlyClaimSchema = z.object({
  type: z.literal('mediation_only'),
  from: nodeIdString,
  via: nodeIdString,
  to: nodeIdString,
}).strict();

export const NoDirectEffectClaimSchema = z.object({
  type: z.literal('no_direct_effect'),
  from: nodeIdString,
  to: nodeIdString,
}).strict();

export const UnmeasuredConfounderClaimSchema = z.object({
  type: z.literal('unmeasured_confounder'),
  between: z.tuple([nodeIdString, nodeIdString]),
}).strict();

export const CausalClaimSchema = z.discriminatedUnion('type', [
  DirectEffectClaimSchema,
  MediationOnlyClaimSchema,
  NoDirectEffectClaimSchema,
  UnmeasuredConfounderClaimSchema,
]);
export type CausalClaim = z.infer<typeof CausalClaimSchema>;

export const CausalClaimsArraySchema = z.array(CausalClaimSchema);
export type CausalClaimsArray = z.infer<typeof CausalClaimsArraySchema>;

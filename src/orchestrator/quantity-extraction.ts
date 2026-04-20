import { z } from 'zod';

// QuantityExtractionResult v1.1 — produced by CEE's Layer 0 Custom Quantity
// Extractor (CQE) and consumed by Sonnet via the routing prompt. See V5
// Architecture Spec v3.2 §11.1 and CQE Design v1.1 §3 for the frozen contract.
//
// `value_origin` is additive (v1.1) and optional for backward compatibility.

export const ParameterOperatorSchema = z.enum([
  'set',
  'add',
  'multiply',
  'increment',
  'decrement',
]);
export type ParameterOperator = z.infer<typeof ParameterOperatorSchema>;

export const QuantityExtractionResultSchema = z
  .object({
    raw_text: z.string(),
    value: z.number().nullable(),
    unit: z.string().nullable(),
    direction: z.enum(['up', 'down', 'set', 'unknown']).nullable(),
    multiplier: z.number().nullable(),
    operator: ParameterOperatorSchema.nullable(),
    comparator: z.enum(['at_least', 'at_most', 'between']).nullable(),
    range_min: z.number().nullable(),
    range_max: z.number().nullable(),
    approximate: z.boolean(),
    source: z.enum(['cqe', 'compromise', 'unparsed']),
    value_origin: z
      .enum([
        'literal',
        'lexical_quantifier',
        'word_fraction',
        'suffix_expansion',
        'word_number',
        'parsed_numeric',
      ])
      .optional(),
  })
  .strict();
export type QuantityExtractionResult = z.infer<
  typeof QuantityExtractionResultSchema
>;

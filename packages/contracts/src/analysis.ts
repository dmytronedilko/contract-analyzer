import { z } from 'zod';

import { QUESTION_MAX_LENGTH } from './constants.js';
import { SourceSchema } from './documents.js';

const QuestionSchema = z.string().trim().min(1).max(QUESTION_MAX_LENGTH);

export const AskRequestSchema = z.object({
  documentId: z.uuid(),
  question: QuestionSchema,
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskResponseSchema = z.object({
  answer: z.string(),
  /** True when the model stopped at max_tokens and the answer is incomplete. */
  truncated: z.boolean(),
  sources: z.array(SourceSchema),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

export const CompareRequestSchema = z
  .object({
    documentId1: z.uuid(),
    documentId2: z.uuid(),
    query: QuestionSchema,
  })
  .refine((value) => value.documentId1 !== value.documentId2, {
    message: 'Choose two different documents to compare',
    path: ['documentId2'],
  });
export type CompareRequest = z.infer<typeof CompareRequestSchema>;

export const CompareResponseSchema = z.object({
  analysis: z.string(),
  truncated: z.boolean(),
  sources: z.object({
    contractA: z.array(SourceSchema),
    contractB: z.array(SourceSchema),
  }),
});
export type CompareResponse = z.infer<typeof CompareResponseSchema>;

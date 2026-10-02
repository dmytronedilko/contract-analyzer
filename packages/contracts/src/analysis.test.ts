import { describe, expect, it } from 'vitest';

import { AskRequestSchema, CompareRequestSchema } from './analysis.js';
import { QUESTION_MAX_LENGTH } from './constants.js';

const idA = '0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d';
const idB = '7f3c2a10-9b1d-4e6f-8a2c-1d5e9f0b3a7c';

describe('AskRequestSchema', () => {
  it('trims the question', () => {
    expect(AskRequestSchema.parse({ documentId: idA, question: '  What is the term?  ' })).toEqual({
      documentId: idA,
      question: 'What is the term?',
    });
  });

  it('rejects whitespace-only questions', () => {
    expect(AskRequestSchema.safeParse({ documentId: idA, question: '   ' }).success).toBe(false);
  });

  it('enforces the maximum length after trimming', () => {
    const atLimit = `  ${'a'.repeat(QUESTION_MAX_LENGTH)}  `;
    const overLimit = 'a'.repeat(QUESTION_MAX_LENGTH + 1);
    expect(AskRequestSchema.safeParse({ documentId: idA, question: atLimit }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ documentId: idA, question: overLimit }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid document id', () => {
    expect(AskRequestSchema.safeParse({ documentId: 'abc', question: 'q' }).success).toBe(false);
  });
});

describe('CompareRequestSchema', () => {
  it('accepts two different documents', () => {
    const result = CompareRequestSchema.safeParse({
      documentId1: idA,
      documentId2: idB,
      query: 'termination',
    });
    expect(result.success).toBe(true);
  });

  it('rejects comparing a document with itself, reporting the issue on documentId2', () => {
    const result = CompareRequestSchema.safeParse({
      documentId1: idA,
      documentId2: idA,
      query: 'termination',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['documentId2']);
  });
});

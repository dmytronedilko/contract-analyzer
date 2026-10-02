import { describe, expect, it } from 'vitest';

import { ApiErrorBodySchema, ERROR_CODES } from './errors.js';

describe('ERROR_CODES', () => {
  it('maps every key to itself', () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) expect(value).toBe(key);
  });
});

describe('ApiErrorBodySchema', () => {
  it('accepts validation errors with a list of messages', () => {
    const body = {
      statusCode: 400,
      message: ['question: Too small'],
      error: 'Bad Request',
      errorCode: 'VALIDATION_FAILED',
    };
    expect(ApiErrorBodySchema.safeParse(body).success).toBe(true);
  });

  it('rejects unknown error codes', () => {
    const body = { statusCode: 500, message: 'x', error: 'Internal', errorCode: 'BOOM' };
    expect(ApiErrorBodySchema.safeParse(body).success).toBe(false);
  });
});

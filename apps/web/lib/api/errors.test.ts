import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_MB } from '../public-env';
import { ApiError, messageFor, NETWORK_ERROR_MESSAGE, networkError, toApiError } from './errors';

function headers(values: Record<string, string> = {}) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe('messageFor', () => {
  it.each([
    [409, 'DOCUMENT_NOT_READY', 'This document is still processing.'],
    [404, 'DOCUMENT_NOT_FOUND', 'Document not found.'],
    [413, 'FILE_TOO_LARGE', `File exceeds ${MAX_UPLOAD_MB} MB.`],
    [415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF files are supported.'],
    [
      422,
      'PDF_NO_TEXT_LAYER',
      "This PDF has no selectable text; scanned documents aren't supported.",
    ],
    [502, 'AI_PROVIDER_UNAVAILABLE', 'The AI service is temporarily unavailable. Try again.'],
    [403, 'ORIGIN_NOT_ALLOWED', "This request was blocked by the site's security policy."],
    [403, 'FORBIDDEN', "You don't have permission to do this."],
  ] as const)('maps %i %s', (status, code, message) => {
    expect(messageFor(status, code)).toBe(message);
  });

  it('prefers the error code over the status', () => {
    // A 403 can mean several things; the code decides.
    expect(messageFor(403, 'ORIGIN_NOT_ALLOWED')).not.toBe(messageFor(403, 'FORBIDDEN'));
  });

  it('falls back to the status, then a generic message', () => {
    expect(messageFor(413, undefined)).toBe(`File exceeds ${MAX_UPLOAD_MB} MB.`);
    expect(messageFor(418, undefined)).toBe('Something went wrong. Try again.');
  });

  it('includes Retry-After seconds for rate limits', () => {
    expect(messageFor(429, 'RATE_LIMITED', '42')).toBe(
      'Too many requests. Try again in 42 seconds.',
    );
    expect(messageFor(429, 'RATE_LIMITED', null)).toBe('Too many requests. Try again later.');
  });
});

describe('toApiError', () => {
  it('reads the error code and the request id', () => {
    const error = toApiError(
      404,
      {
        statusCode: 404,
        message: 'Document not found',
        error: 'Not Found',
        errorCode: 'DOCUMENT_NOT_FOUND',
      },
      headers({ 'x-request-id': 'req-1' }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      errorCode: 'DOCUMENT_NOT_FOUND',
      requestId: 'req-1',
      message: 'Document not found.',
      redirect: undefined,
    });
  });

  it('flags session errors as redirects instead of messages', () => {
    const unauthenticated = {
      statusCode: 401,
      message: 'x',
      error: 'Unauthorized',
      errorCode: 'UNAUTHENTICATED',
    };
    expect(toApiError(401, unauthenticated, headers()).redirect).toBe('sign-in');
    expect(toApiError(401, null, headers()).redirect).toBe('sign-in');
    const noOrg = {
      statusCode: 403,
      message: 'x',
      error: 'Forbidden',
      errorCode: 'NO_ACTIVE_ORGANIZATION',
    };
    expect(toApiError(403, noOrg, headers()).redirect).toBe('onboarding');
    const forbidden = { statusCode: 403, message: 'x', error: 'Forbidden', errorCode: 'FORBIDDEN' };
    expect(toApiError(403, forbidden, headers()).redirect).toBeUndefined();
  });

  it('tolerates bodies that are not API errors', () => {
    const error = toApiError(502, '<html>Bad gateway</html>', headers());
    expect(error.errorCode).toBeUndefined();
    expect(error.message).toBe('The AI service is temporarily unavailable. Try again.');
  });

  it('uses Retry-After for rate-limit messages', () => {
    const body = {
      statusCode: 429,
      message: 'x',
      error: 'Too Many Requests',
      errorCode: 'RATE_LIMITED',
    };
    expect(toApiError(429, body, headers({ 'retry-after': '7' })).message).toBe(
      'Too many requests. Try again in 7 seconds.',
    );
  });
});

describe('networkError', () => {
  it('has status 0, the network message and the request id', () => {
    const error = networkError('req-9');
    expect(error.isNetworkError).toBe(true);
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(error.requestId).toBe('req-9');
  });
});

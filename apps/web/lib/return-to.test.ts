import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { safeReturnTo, signInUrl } from './return-to';

describe('safeReturnTo', () => {
  it.each(['/documents', '/documents/abc?x=1', '/invite/123'])('keeps %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    undefined,
    '',
    'https://evil.example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    'javascript:alert(1)',
    'documents',
  ])('falls back to /documents for %s', (value) => {
    expect(safeReturnTo(value)).toBe('/documents');
  });

  it('uses the first value of a repeated parameter', () => {
    expect(safeReturnTo(['/compare', '//evil.example.com'])).toBe('/compare');
  });

  it('never leaves the site, whatever the input', () => {
    const origin = 'https://app.example.com';
    const input = fc.oneof(
      fc.string(),
      fc.string().map((tail) => `/${tail}`),
      fc.webUrl(),
    );
    fc.assert(
      fc.property(input, (value) => {
        expect(new URL(safeReturnTo(value), origin).origin).toBe(origin);
      }),
    );
  });
});

describe('signInUrl', () => {
  it('encodes the return path', () => {
    expect(signInUrl('/documents/abc?x=1')).toBe('/sign-in?returnTo=%2Fdocuments%2Fabc%3Fx%3D1');
  });
});

import { describe, expect, it } from 'vitest';

import { contentDisposition, sanitizeFilename } from './documents.controller.js';

describe('contentDisposition', () => {
  it('names an ASCII file plainly', () => {
    expect(contentDisposition('msa-2026.pdf')).toBe(
      `inline; filename="msa-2026.pdf"; filename*=UTF-8''msa-2026.pdf`,
    );
  });

  it('keeps the exact UTF-8 name and an ASCII fallback', () => {
    expect(contentDisposition('Договор (v2).pdf')).toBe(
      `inline; filename="_______ (v2).pdf"; filename*=UTF-8''%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%20%28v2%29.pdf`,
    );
  });

  it('cannot break out of the quoted fallback', () => {
    expect(contentDisposition('a"b\\c.pdf')).toMatch(/^inline; filename="a_b_c\.pdf"; /);
  });
});

describe('sanitizeFilename', () => {
  it('keeps the base name without control characters', () => {
    expect(sanitizeFilename('C:\\docs\\msa\u0007.pdf')).toBe('msa.pdf');
    expect(sanitizeFilename('  ')).toBe('document.pdf');
  });
});

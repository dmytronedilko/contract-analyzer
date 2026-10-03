import { describe, expect, it } from 'vitest';

import { citationHref, linkCitations, parseCitationHref } from './citations';

describe('linkCitations', () => {
  it.each([
    ['[chunk 3, p. 12]', '[chunk 3, p. 12](#cite-3)'],
    ['[chunk 3, pp. 12–14]', '[chunk 3, pp. 12–14](#cite-3)'],
    ['[chunk 3, pp. 12-14]', '[chunk 3, pp. 12-14](#cite-3)'],
    ['[chunk 3, pp. 12 — 14]', '[chunk 3, pp. 12 — 14](#cite-3)'],
    ['[A: chunk 2, p. 7]', '[A: chunk 2, p. 7](#cite-A-2)'],
    ['[B: chunk 1, pp. 5–6]', '[B: chunk 1, pp. 5–6](#cite-B-1)'],
    ['[Chunk 4, P. 2]', '[Chunk 4, P. 2](#cite-4)'],
  ])('rewrites %s', (input, expected) => {
    expect(linkCitations(input)).toBe(expected);
  });

  it('rewrites several citations in one bracket, separated by semicolons', () => {
    expect(linkCitations('See [chunk 1, p. 2; chunk 4, pp. 5-6].')).toBe(
      'See [chunk 1, p. 2](#cite-1); [chunk 4, pp. 5-6](#cite-4).',
    );
  });

  it('handles mixed sides and inherits the side within a bracket', () => {
    expect(linkCitations('[A: chunk 1, p. 3; B: chunk 2, p. 5]')).toBe(
      '[A: chunk 1, p. 3](#cite-A-1); [B: chunk 2, p. 5](#cite-B-2)',
    );
    expect(linkCitations('[A: chunk 1, p. 3; chunk 4, p. 8]')).toBe(
      '[A: chunk 1, p. 3](#cite-A-1); [A: chunk 4, p. 8](#cite-A-4)',
    );
  });

  it('keeps a short parenthetical note on a citation', () => {
    expect(linkCitations('[B: chunk 3, p. 2; B: chunk 5, p. 2 (partial)]')).toBe(
      '[B: chunk 3, p. 2](#cite-B-3); [B: chunk 5, p. 2 (partial)](#cite-B-5)',
    );
  });

  it('rewrites every citation in a longer answer', () => {
    const answer = '| Term | 24 months [A: chunk 1, p. 1] | 36 months [B: chunk 3, p. 2] |';
    expect(linkCitations(answer)).toBe(
      '| Term | 24 months [A: chunk 1, p. 1](#cite-A-1) | 36 months [B: chunk 3, p. 2](#cite-B-3) |',
    );
  });

  it.each([
    'Clause [4.2] applies.',
    'A [link](https://example.com) stays a link.',
    '[chunk 1, p. 2; see annex]',
    '[chunk one, p. 2]',
    '[chunk 1]',
    '[chunk 1, p. 2 (and see the annex for the full pricing schedule)]',
  ])('leaves %s untouched', (input) => {
    expect(linkCitations(input)).toBe(input);
  });
});

describe('citation hrefs', () => {
  it('round-trips targets', () => {
    for (const target of [
      { ref: 3 },
      { side: 'A' as const, ref: 2 },
      { side: 'B' as const, ref: 10 },
    ]) {
      expect(parseCitationHref(citationHref(target))).toEqual(target);
    }
  });

  it('ignores other links', () => {
    expect(parseCitationHref('https://example.com')).toBeNull();
    expect(parseCitationHref('#cite-C-1')).toBeNull();
    expect(parseCitationHref(undefined)).toBeNull();
  });
});

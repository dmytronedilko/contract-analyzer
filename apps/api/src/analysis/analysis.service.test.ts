import { describe, expect, it } from 'vitest';

import type { RetrievedChunk } from '../vector-store/vector-store.service.js';

import { withCounterparts } from './analysis.service.js';

const chunk = (chunkId: string, similarity = 0.5): RetrievedChunk => ({
  chunkId,
  pageStart: 1,
  pageEnd: 1,
  content: chunkId,
  similarity,
});

describe('withCounterparts', () => {
  it('keeps the query hits first, then adds counterparts that are new', () => {
    const merged = withCounterparts([chunk('a'), chunk('b')], [chunk('b'), chunk('c')]);
    expect(merged.map((row) => row.chunkId)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the hits unchanged when there are no counterparts', () => {
    const hits = [chunk('a', 0.9), chunk('b', 0.8)];
    expect(withCounterparts(hits, [])).toEqual(hits);
  });
});

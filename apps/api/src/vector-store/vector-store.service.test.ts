import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { documentChunks, documents, organization } from '@repo/db';

import {
  chunkRows,
  connectTestDatabase,
  hasTestDatabase,
  seedOrganization,
  unitVector,
  type TestDatabase,
} from '../test/database.js';
import { VectorStoreService } from './vector-store.service.js';

describe.skipIf(!hasTestDatabase)('VectorStoreService (Postgres)', () => {
  let database: TestDatabase;
  let store: VectorStoreService;
  let organizationId: string;
  let documentA: string;
  let documentB: string;
  let smallDocument: string;

  /** Chunk ids of a document, by chunk index. */
  const chunkIds = async (documentId: string): Promise<string[]> =>
    (
      await database.db
        .select({ id: documentChunks.id })
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentId))
        .orderBy(asc(documentChunks.chunkIndex))
    ).map((row) => row.id);

  beforeAll(async () => {
    database = connectTestDatabase();
    store = new VectorStoreService(database.db);
    ({ organizationId } = await seedOrganization(database.db));

    const insertDocument = async (filename: string): Promise<string> => {
      const [row] = await database.db
        .insert(documents)
        .values({
          organizationId,
          filename,
          mimeType: 'application/pdf',
          sizeBytes: 1,
          status: 'ready',
        })
        .returning({ id: documents.id });
      return row!.id;
    };
    documentA = await insertDocument('a.pdf');
    documentB = await insertDocument('b.pdf');
    smallDocument = await insertDocument('small.pdf');

    // Document B's chunks point along the same axes as A's, so an unscoped search would mix them.
    await store.insertChunks(database.db, documentA, chunkRows(documentA, 12));
    await store.insertChunks(database.db, documentB, chunkRows(documentB, 12));
    await store.insertChunks(database.db, smallDocument, chunkRows(smallDocument, 3));
  });

  afterAll(async () => {
    await database.db.delete(organization).where(eq(organization.id, organizationId));
    await database.close();
  });

  it('returns exactly k rows, all from the requested document', async () => {
    const results = await store.search(documentA, unitVector(4), 5);
    expect(results).toHaveLength(5);

    const ids = results.map((row) => row.chunkId);
    const owners = await database.pool.query<{ document_id: string }>(
      'select document_id from document_chunks where id = any($1::uuid[])',
      [ids],
    );
    expect(new Set(owners.rows.map((row) => row.document_id))).toEqual(new Set([documentA]));
  });

  it('ranks the closest chunk first with similarity near 1, in descending order', async () => {
    const results = await store.search(documentA, unitVector(4), 5);
    expect(results[0]).toMatchObject({ content: 'chunk 4', pageStart: 5, pageEnd: 5 });
    expect(results[0]!.similarity).toBeCloseTo(1, 5);
    const similarities = results.map((row) => row.similarity);
    expect(similarities).toEqual(similarities.toSorted((a, b) => b - a));
  });

  it('returns every chunk when the document has fewer than k', async () => {
    expect(await store.search(smallDocument, unitVector(0), 5)).toHaveLength(3);
  });

  it('returns nothing for an unknown document', async () => {
    expect(await store.search('00000000-0000-4000-8000-000000000000', unitVector(0), 5)).toEqual(
      [],
    );
  });

  describe('searchCounterparts', () => {
    it("finds each source chunk's closest chunk in the other document, in source order", async () => {
      const idsA = await chunkIds(documentA);
      // Chunk i of both documents points along axis i: A's chunk 7 pairs with B's chunk 7.
      const results = await store.searchCounterparts(
        documentB,
        [idsA[7]!, idsA[2]!],
        unitVector(4),
      );
      expect(results.map((row) => row.content)).toEqual(['chunk 7', 'chunk 2']);
      expect(results.map((row) => row.chunkId)).toEqual([
        (await chunkIds(documentB))[7],
        (await chunkIds(documentB))[2],
      ]);
      // Similarity is to the query (axis 4), not to the source chunk: these are far from it.
      for (const row of results) expect(row.similarity).toBeLessThan(0.5);
    });

    it('returns each counterpart once, and nothing without source chunks', async () => {
      const [first] = await chunkIds(documentA);
      expect(
        await store.searchCounterparts(documentB, [first!, first!], unitVector(0)),
      ).toHaveLength(1);
      expect(await store.searchCounterparts(documentB, [], unitVector(0))).toEqual([]);
    });
  });
});

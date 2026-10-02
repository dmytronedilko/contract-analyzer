import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { cosineDistance, eq, sql } from 'drizzle-orm';

import { documentChunks } from '@repo/db';

import type { Database, Executor } from '../database/database.js';

/** Rows per INSERT, well below Postgres' 65,535 bind-parameter limit. */
const INSERT_BATCH_SIZE = 500;

export interface ChunkToStore {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  embedding: number[];
}

export interface RetrievedChunk {
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  /** 1 - cosine distance: 1 is identical, 0 is unrelated. */
  similarity: number;
}

/**
 * Stores chunk embeddings and runs similarity search.
 *
 * Search is exact on purpose. Every query targets one document, so Postgres reads that document's
 * chunks through the document_id B-tree index, computes every distance and always returns k rows
 * (or all chunks, if fewer). An HNSW index was rejected: combined with a WHERE filter, its
 * approximate scan can return fewer than k rows and silently weaken answers. If search across
 * documents is added later, use HNSW with vector_cosine_ops and enable hnsw.iterative_scan.
 *
 * Callers must resolve the document within the caller's organization first; search filters by
 * document id only.
 */
@Injectable()
export class VectorStoreService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Inserts a document's chunks. Pass a transaction to make them atomic with other writes. */
  async insertChunks(
    executor: Executor,
    documentId: string,
    chunks: readonly ChunkToStore[],
  ): Promise<void> {
    for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
      await executor
        .insert(documentChunks)
        .values(
          chunks.slice(start, start + INSERT_BATCH_SIZE).map((chunk) => ({ ...chunk, documentId })),
        );
    }
  }

  /** The k chunks of one document closest to the query vector, most similar first. */
  async search(documentId: string, queryVector: number[], k: number): Promise<RetrievedChunk[]> {
    const distance = cosineDistance(documentChunks.embedding, queryVector);
    const rows = await this.db
      .select({
        chunkId: documentChunks.id,
        pageStart: documentChunks.pageStart,
        pageEnd: documentChunks.pageEnd,
        content: documentChunks.content,
        distance,
      })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(distance, documentChunks.chunkIndex)
      .limit(k);
    return rows.map(({ distance: value, ...chunk }) => ({
      ...chunk,
      similarity: 1 - Number(value),
    }));
  }

  /**
   * For each source chunk (of another document), the chunk of `documentId` closest to it, using the
   * stored embeddings: no embedding calls. A comparison uses this to show how the other contract
   * handles a clause the query found in one contract only, even when its wording differs. Results
   * follow the order of `sourceChunkIds`, without duplicates; `similarity` is to the query, as in
   * search(). Each lookup is an exact scan of the target document's chunks, like search().
   */
  async searchCounterparts(
    documentId: string,
    sourceChunkIds: readonly string[],
    queryVector: number[],
  ): Promise<RetrievedChunk[]> {
    if (!sourceChunkIds.length) return [];
    const query = JSON.stringify(queryVector);
    const { rows } = await this.db.execute<{
      sourceId: string;
      chunkId: string;
      pageStart: number;
      pageEnd: number;
      content: string;
      distance: number | string;
    }>(sql`
      select source.id as "sourceId", target.id as "chunkId", target.page_start as "pageStart",
        target.page_end as "pageEnd", target.content,
        target.embedding <=> ${query}::vector as distance
      from ${documentChunks} source
      cross join lateral (
        select candidate.id, candidate.page_start, candidate.page_end, candidate.content,
          candidate.embedding
        from ${documentChunks} candidate
        where candidate.document_id = ${documentId}
        order by candidate.embedding <=> source.embedding, candidate.chunk_index
        limit 1
      ) target
      where source.id in (${sql.join(
        sourceChunkIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    `);

    const bySource = new Map(rows.map((row) => [row.sourceId, row]));
    const seen = new Set<string>();
    const counterparts: RetrievedChunk[] = [];
    for (const sourceId of sourceChunkIds) {
      const row = bySource.get(sourceId);
      if (!row || seen.has(row.chunkId)) continue;
      seen.add(row.chunkId);
      counterparts.push({
        chunkId: row.chunkId,
        pageStart: row.pageStart,
        pageEnd: row.pageEnd,
        content: row.content,
        similarity: 1 - Number(row.distance),
      });
    }
    return counterparts;
  }
}

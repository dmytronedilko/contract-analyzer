import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import type { Document, DocumentListResponse } from '@repo/contracts';

import { documentChunks, documentFiles, documents, user, type DocumentRow } from '@repo/db';

import type { Database, Executor } from '../database/database.js';

export interface NewDocument {
  organizationId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Data access for documents. Every read and write is scoped by organization: there is no method
 * that can see another organization's document, so an id from elsewhere behaves like a missing one.
 */
@Injectable()
export class DocumentsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Creates the document as `processing` together with its stored PDF. */
  async create(executor: Executor, values: NewDocument, content: Buffer): Promise<DocumentRow> {
    const [row] = await executor
      .insert(documents)
      .values({ ...values, status: 'processing' })
      .returning();
    await executor.insert(documentFiles).values({ documentId: row!.id, content });
    return row!;
  }

  /** The stored PDF, or null when the document is missing, elsewhere, or predates file storage. */
  async findFile(
    organizationId: string,
    id: string,
  ): Promise<{ filename: string; content: Buffer } | null> {
    const [row] = await this.db
      .select({ filename: documents.filename, content: documentFiles.content })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(and(eq(documents.organizationId, organizationId), eq(documents.id, id)))
      .limit(1);
    return row ?? null;
  }

  async findById(organizationId: string, id: string): Promise<DocumentRow | null> {
    const [row] = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.organizationId, organizationId), eq(documents.id, id)))
      .limit(1);
    return row ?? null;
  }

  /** The API representation, with chunk count and uploader name. */
  async getView(organizationId: string, id: string): Promise<Document | null> {
    const [view] = await this.views(organizationId, { id, limit: 1, offset: 0 });
    return view ?? null;
  }

  /** Newest first. */
  async list(
    organizationId: string,
    page: { limit: number; offset: number },
  ): Promise<DocumentListResponse> {
    const [items, [{ total } = { total: 0 }]] = await Promise.all([
      this.views(organizationId, page),
      this.db
        .select({ total: count() })
        .from(documents)
        .where(eq(documents.organizationId, organizationId)),
    ]);
    return { items, total };
  }

  async markReady(
    executor: Executor,
    organizationId: string,
    id: string,
    pageCount: number,
  ): Promise<void> {
    await executor
      .update(documents)
      .set({ status: 'ready', pageCount, error: null })
      .where(and(eq(documents.organizationId, organizationId), eq(documents.id, id)));
  }

  /** `error` is shown to users: pass a safe, generic message, never a raw exception. */
  async markFailed(
    organizationId: string,
    id: string,
    error: string,
    pageCount?: number,
  ): Promise<void> {
    await this.db
      .update(documents)
      .set({ status: 'failed', error, ...(pageCount === undefined ? {} : { pageCount }) })
      .where(and(eq(documents.organizationId, organizationId), eq(documents.id, id)));
  }

  /** Deletes the document; its chunks and file go with it (ON DELETE CASCADE). */
  async delete(executor: Executor, organizationId: string, id: string): Promise<boolean> {
    const deleted = await executor
      .delete(documents)
      .where(and(eq(documents.organizationId, organizationId), eq(documents.id, id)))
      .returning({ id: documents.id });
    return deleted.length > 0;
  }

  private async views(
    organizationId: string,
    { id, limit, offset }: { id?: string; limit: number; offset: number },
  ): Promise<Document[]> {
    const chunkCounts = this.db
      .select({ documentId: documentChunks.documentId, chunkCount: count().as('chunk_count') })
      .from(documentChunks)
      .groupBy(documentChunks.documentId)
      .as('chunk_counts');

    const rows = await this.db
      .select({
        id: documents.id,
        filename: documents.filename,
        status: documents.status,
        pageCount: documents.pageCount,
        chunkCount: sql<number>`coalesce(${chunkCounts.chunkCount}, 0)`.mapWith(Number),
        hasFile: sql<boolean>`exists (select 1 from ${documentFiles} where ${documentFiles.documentId} = ${documents.id})`,
        error: documents.error,
        uploaderId: user.id,
        uploaderName: user.name,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(chunkCounts, eq(chunkCounts.documentId, documents.id))
      .leftJoin(user, eq(user.id, documents.uploadedBy))
      .where(
        and(eq(documents.organizationId, organizationId), id ? eq(documents.id, id) : undefined),
      )
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(limit)
      .offset(offset);

    return rows.map(({ uploaderId, uploaderName, createdAt, ...row }) => ({
      ...row,
      uploadedBy: uploaderId ? { id: uploaderId, name: uploaderName ?? '' } : null,
      createdAt: createdAt.toISOString(),
    }));
  }
}

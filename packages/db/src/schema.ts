import { sql } from 'drizzle-orm';
import {
  customType,
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  vector,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { organization, user } from './auth-schema.js';

/** Must match the embedding model's output size (voyage-law-2: 1024). */
export const EMBEDDING_DIMENSIONS = 1024;

export const documentStatus = pgEnum('document_status', ['processing', 'ready', 'failed']);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    pageCount: integer('page_count'),
    status: documentStatus('status').notNull().default('processing'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('documents_org_created_idx').on(t.organizationId, t.createdAt.desc())],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * The uploaded PDF, kept so users can open the original next to the answers. One row per document,
 * in its own table so listing and searching documents never reads file contents.
 */
export const documentFiles = pgTable('document_files', {
  documentId: uuid('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  content: bytea('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Searched exactly, per document, through the document_id B-tree index. There is deliberately no
 * HNSW index: combined with a WHERE filter it can return fewer than k rows.
 */
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    pageStart: integer('page_start').notNull(),
    pageEnd: integer('page_end').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('chunks_document_id_idx').on(t.documentId),
    uniqueIndex('chunks_document_chunk_uq').on(t.documentId, t.chunkIndex),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // one of AUDIT_ACTIONS from @repo/contracts
    targetType: text('target_type'),
    targetId: text('target_id'),
    requestId: text('request_id'),
    metadata: jsonb('metadata')
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('audit_org_created_idx').on(t.organizationId, t.createdAt.desc())],
);

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;
export type DocumentFileRow = typeof documentFiles.$inferSelect;
export type ChunkRow = typeof documentChunks.$inferSelect;
export type NewChunkRow = typeof documentChunks.$inferInsert;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;

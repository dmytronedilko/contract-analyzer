import { z } from 'zod';

export const DocumentStatusSchema = z.enum(['processing', 'ready', 'failed']);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** A user reference that never carries personal data beyond the display name. */
export const UserRefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});
export type UserRef = z.infer<typeof UserRefSchema>;

export const DocumentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  status: DocumentStatusSchema,
  pageCount: z.int().nonnegative().nullable(),
  chunkCount: z.int().nonnegative(),
  /** Whether the original PDF is stored and can be opened (documents uploaded before it was kept have none). */
  hasFile: z.boolean(),
  error: z.string().nullable(),
  uploadedBy: UserRefSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type Document = z.infer<typeof DocumentSchema>;

/** Shared limit/offset pagination. Query strings arrive as text, so values are coerced. */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ListDocumentsQuerySchema = PaginationQuerySchema;
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuerySchema>;

export const DocumentListResponseSchema = z.object({
  items: z.array(DocumentSchema),
  total: z.int().nonnegative(),
});
export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>;

/**
 * A retrieved chunk cited by an answer. `ref` is the chunk id used in the prompt (1..k, in
 * retrieval order), which is what citations like `[chunk 2, p. 7]` refer to.
 */
export const SourceSchema = z.object({
  ref: z.int().positive(),
  chunkId: z.uuid(),
  pageStart: z.int().positive(),
  pageEnd: z.int().positive(),
  content: z.string(),
  similarity: z.number(),
});
export type Source = z.infer<typeof SourceSchema>;

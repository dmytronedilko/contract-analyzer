import { describe, expect, it } from 'vitest';

import { DocumentSchema, ListDocumentsQuerySchema, SourceSchema } from './documents.js';

const document = {
  id: '0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d',
  filename: 'master-services-agreement.pdf',
  status: 'ready',
  pageCount: 12,
  chunkCount: 40,
  hasFile: true,
  error: null,
  uploadedBy: { id: 'user_1', name: 'Ada' },
  createdAt: '2026-01-15T10:00:00.000Z',
};

describe('DocumentSchema', () => {
  it('accepts a complete document', () => {
    expect(DocumentSchema.parse(document)).toEqual(document);
  });

  it('accepts a processing document with no page count and a deleted uploader', () => {
    const processing = { ...document, status: 'processing', pageCount: null, uploadedBy: null };
    expect(DocumentSchema.safeParse(processing).success).toBe(true);
  });

  it('rejects unknown statuses, non-uuid ids and Date objects for createdAt', () => {
    expect(DocumentSchema.safeParse({ ...document, status: 'queued' }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, id: '42' }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, createdAt: new Date() }).success).toBe(false);
  });
});

describe('ListDocumentsQuerySchema', () => {
  it('applies defaults', () => {
    expect(ListDocumentsQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it('coerces query-string values', () => {
    expect(ListDocumentsQuerySchema.parse({ limit: '50', offset: '100' })).toEqual({
      limit: 50,
      offset: 100,
    });
  });

  it.each([{ limit: '0' }, { limit: '101' }, { offset: '-1' }, { limit: '1.5' }])(
    'rejects %o',
    (query) => {
      expect(ListDocumentsQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe('SourceSchema', () => {
  it('requires a positive ref', () => {
    const source = {
      ref: 1,
      chunkId: document.id,
      pageStart: 4,
      pageEnd: 5,
      content: 'The Supplier shall...',
      similarity: 0.82,
    };
    expect(SourceSchema.safeParse(source).success).toBe(true);
    expect(SourceSchema.safeParse({ ...source, ref: 0 }).success).toBe(false);
  });
});

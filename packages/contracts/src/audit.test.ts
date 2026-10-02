import { describe, expect, it } from 'vitest';

import { AuditEventSchema, ListAuditEventsQuerySchema } from './audit.js';

describe('ListAuditEventsQuerySchema', () => {
  it('accepts a known action filter', () => {
    expect(ListAuditEventsQuerySchema.parse({ action: 'document.upload' })).toEqual({
      limit: 20,
      offset: 0,
      action: 'document.upload',
    });
  });

  it('rejects an unknown action', () => {
    expect(ListAuditEventsQuerySchema.safeParse({ action: 'document.read' }).success).toBe(false);
  });
});

describe('AuditEventSchema', () => {
  const event = {
    id: '0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d',
    action: 'analysis.ask',
    actor: { id: 'user_1', name: 'Ada' },
    targetType: 'document',
    targetId: '7f3c2a10-9b1d-4e6f-8a2c-1d5e9f0b3a7c',
    requestId: null,
    metadata: { sourceCount: 5, truncated: false, durationMs: 4210 },
    createdAt: '2026-01-15T10:00:00.000Z',
  };

  it('accepts scalar metadata', () => {
    expect(AuditEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects nested metadata values', () => {
    const nested = { ...event, metadata: { sources: [1, 2] } };
    expect(AuditEventSchema.safeParse(nested).success).toBe(false);
  });
});

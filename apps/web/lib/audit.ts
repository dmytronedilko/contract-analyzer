import 'server-only';
import type { AuditAction, AuditMetadata } from '@repo/contracts';

import { auditEvents } from '@repo/db';

import { db } from './db';

export interface AuthAuditEvent {
  action: AuditAction;
  organizationId: string;
  actorId: string | null;
  targetType?: string;
  targetId?: string;
  /** Ids, counts and flags only: never emails or names. */
  metadata?: AuditMetadata;
}

/**
 * Records an authentication or membership event in the shared audit_events table. Failures are
 * logged and swallowed: the auth action has already happened and must not be reported as failed.
 */
export async function recordAuditEvent(event: AuthAuditEvent): Promise<void> {
  try {
    await db()
      .insert(auditEvents)
      .values({
        organizationId: event.organizationId,
        actorId: event.actorId,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        requestId: null,
        metadata: event.metadata ?? {},
      });
  } catch (error) {
    console.error('Failed to record audit event', {
      action: event.action,
      organizationId: event.organizationId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, desc, eq } from 'drizzle-orm';

import {
  AuditActionSchema,
  type AuditAction,
  type AuditEventListResponse,
  type AuditMetadata,
  type ListAuditEventsQuery,
} from '@repo/contracts';
import { auditEvents, user } from '@repo/db';

import type { Principal } from '../auth/principal.js';
import type { Database, Executor } from '../database/database.js';

export interface AuditEntry {
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** Ids, counts, flags and durations only: never document text, questions, answers or names. */
  metadata?: AuditMetadata;
}

/** Who did it and in which request; built from the principal and x-request-id. */
export interface AuditActor {
  principal: Principal;
  requestId: string | null;
}

@Injectable()
export class AuditService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Records an event. Pass the transaction of the change it describes to make them atomic. */
  async record(executor: Executor, actor: AuditActor, entry: AuditEntry): Promise<void> {
    await executor.insert(auditEvents).values({
      organizationId: actor.principal.organizationId,
      actorId: actor.principal.userId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      requestId: actor.requestId,
      metadata: entry.metadata ?? {},
    });
  }

  /** The organization's events, newest first, optionally filtered by action. */
  async list(organizationId: string, query: ListAuditEventsQuery): Promise<AuditEventListResponse> {
    const where = and(
      eq(auditEvents.organizationId, organizationId),
      query.action ? eq(auditEvents.action, query.action) : undefined,
    );
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      this.db
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          actorId: user.id,
          actorName: user.name,
          targetType: auditEvents.targetType,
          targetId: auditEvents.targetId,
          requestId: auditEvents.requestId,
          metadata: auditEvents.metadata,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .leftJoin(user, eq(user.id, auditEvents.actorId))
        .where(where)
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(auditEvents).where(where),
    ]);

    return {
      total,
      items: rows.map(({ actorId, actorName, action, createdAt, ...row }) => ({
        ...row,
        action: AuditActionSchema.parse(action),
        actor: actorId ? { id: actorId, name: actorName ?? '' } : null,
        createdAt: createdAt.toISOString(),
      })),
    };
  }
}

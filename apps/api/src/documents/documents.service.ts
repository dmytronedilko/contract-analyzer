import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';

import type { DocumentRow } from '@repo/db';

import {
  ERROR_CODES,
  hasPermission,
  type Document,
  type DocumentListResponse,
  type ListDocumentsQuery,
} from '@repo/contracts';

import type { Principal } from '../auth/principal.js';
import type { Database } from '../database/database.js';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { DocumentsRepository } from './documents.repository.js';

export function documentNotFound(): NotFoundException {
  return new NotFoundException('Document not found', {
    errorCode: ERROR_CODES.DOCUMENT_NOT_FOUND,
  });
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly documents: DocumentsRepository,
    private readonly audit: AuditService,
  ) {}

  list(principal: Principal, query: ListDocumentsQuery): Promise<DocumentListResponse> {
    return this.documents.list(principal.organizationId, query);
  }

  async get(principal: Principal, id: string): Promise<Document> {
    const view = await this.documents.getView(principal.organizationId, id);
    if (!view) throw documentNotFound();
    return view;
  }

  /** The original PDF; 404 when the document is missing, elsewhere, or has no stored file. */
  async getFile(principal: Principal, id: string): Promise<{ filename: string; content: Buffer }> {
    const file = await this.documents.findFile(principal.organizationId, id);
    if (!file) throw documentNotFound();
    return file;
  }

  /**
   * Resolves a document within the caller's organization. A document in another organization is
   * reported exactly like a missing one (404), so its existence isn't revealed.
   */
  async resolve(principal: Principal, id: string): Promise<DocumentRow> {
    const document = await this.documents.findById(principal.organizationId, id);
    if (!document) throw documentNotFound();
    return document;
  }

  /** Requires document:delete:any, or document:delete:own for the caller's own uploads. */
  async delete(actor: AuditActor, id: string): Promise<void> {
    const { principal } = actor;
    const document = await this.resolve(principal, id);
    const canDelete =
      hasPermission(principal.role, 'document:delete:any') ||
      (hasPermission(principal.role, 'document:delete:own') &&
        document.uploadedBy === principal.userId);
    if (!canDelete) {
      throw new ForbiddenException("You don't have permission to do this", {
        errorCode: ERROR_CODES.FORBIDDEN,
      });
    }
    await this.db.transaction(async (tx) => {
      if (!(await this.documents.delete(tx, principal.organizationId, id))) {
        throw documentNotFound();
      }
      await this.audit.record(tx, actor, {
        action: 'document.delete',
        targetType: 'document',
        targetId: id,
        metadata: { ownDocument: document.uploadedBy === principal.userId },
      });
    });
  }
}

import { Controller, Get, Query, SerializeOptions } from '@nestjs/common';

import {
  AuditEventListResponseSchema,
  ListAuditEventsQuerySchema,
  type AuditEventListResponse,
  type ListAuditEventsQuery,
} from '@repo/contracts';

import type { Principal } from '../auth/principal.js';

import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { AuditService } from './audit.service.js';

@Controller('audit-events')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  @SerializeOptions({ schema: AuditEventListResponseSchema })
  list(
    @CurrentPrincipal() principal: Principal,
    @Query({ schema: ListAuditEventsQuerySchema }) query: ListAuditEventsQuery,
  ): Promise<AuditEventListResponse> {
    return this.audit.list(principal.organizationId, query);
  }
}

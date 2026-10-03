import { Body, Controller, HttpCode, HttpStatus, Post, SerializeOptions } from '@nestjs/common';

import {
  AskRequestSchema,
  AskResponseSchema,
  CompareRequestSchema,
  CompareResponseSchema,
  type AskRequest,
  type AskResponse,
  type CompareRequest,
  type CompareResponse,
} from '@repo/contracts';

import type { Principal } from '../auth/principal.js';

import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { RateLimit } from '../auth/rate-limit.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentRequestId } from '../http/current-request-id.decorator.js';
import { AnalysisService } from './analysis.service.js';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('analysis:run')
  @RateLimit('analysis')
  @SerializeOptions({ schema: AskResponseSchema })
  ask(
    @CurrentPrincipal() principal: Principal,
    @CurrentRequestId() requestId: string | null,
    @Body({ schema: AskRequestSchema }) body: AskRequest,
  ): Promise<AskResponse> {
    return this.analysis.ask({ principal, requestId }, body);
  }

  @Post('compare')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('analysis:run')
  @RateLimit('analysis')
  @SerializeOptions({ schema: CompareResponseSchema })
  compare(
    @CurrentPrincipal() principal: Principal,
    @CurrentRequestId() requestId: string | null,
    @Body({ schema: CompareRequestSchema }) body: CompareRequest,
  ): Promise<CompareResponse> {
    return this.analysis.compare({ principal, requestId }, body);
  }
}

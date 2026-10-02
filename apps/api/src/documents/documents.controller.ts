import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  SerializeOptions,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, type UploadedMultipartFile } from '@nestjs/platform-fastify/multipart';
import { z } from 'zod';

import {
  DocumentListResponseSchema,
  DocumentSchema,
  ERROR_CODES,
  ListDocumentsQuerySchema,
  type Document,
  type DocumentListResponse,
  type ListDocumentsQuery,
} from '@repo/contracts';

import type { Principal } from '../auth/principal.js';

import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { DocumentsService } from './documents.service.js';
import { IngestionService } from './ingestion.service.js';

const PDF_MAGIC = Buffer.from('%PDF-');
const IdSchema = z.uuid();

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly ingestion: IngestionService,
  ) {}

  /** Multipart upload with a single `file` field; size and count limits are set in main.ts. */
  @Post('upload')
  @RequirePermission('document:upload')
  @UseInterceptors(FileInterceptor('file'))
  @SerializeOptions({ schema: DocumentSchema })
  upload(
    @CurrentPrincipal() principal: Principal,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<Document> {
    if (!file?.buffer?.byteLength) {
      throw new BadRequestException('A PDF file is required in the "file" field', {
        errorCode: ERROR_CODES.FILE_REQUIRED,
      });
    }
    // Check both the declared type and the content: the mimetype is chosen by the client.
    if (file.mimetype !== 'application/pdf' || !file.buffer.subarray(0, 5).equals(PDF_MAGIC)) {
      throw new UnsupportedMediaTypeException('Only PDF files are supported', {
        errorCode: ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      });
    }
    return this.ingestion.ingest(principal, {
      filename: sanitizeFilename(file.originalname),
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Get()
  @RequirePermission('document:read')
  @SerializeOptions({ schema: DocumentListResponseSchema })
  list(
    @CurrentPrincipal() principal: Principal,
    @Query({ schema: ListDocumentsQuerySchema }) query: ListDocumentsQuery,
  ): Promise<DocumentListResponse> {
    return this.documents.list(principal, query);
  }

  @Get(':id')
  @RequirePermission('document:read')
  @SerializeOptions({ schema: DocumentSchema })
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', { schema: IdSchema }) id: string,
  ): Promise<Document> {
    return this.documents.get(principal, id);
  }

  /**
   * The original PDF, for viewing in the browser. `inline` lets the browser's PDF viewer open it;
   * nosniff keeps the browser from treating it as anything other than a PDF.
   */
  @Get(':id/file')
  @RequirePermission('document:read')
  @Header('cache-control', 'private, no-store')
  @Header('x-content-type-options', 'nosniff')
  async file(
    @CurrentPrincipal() principal: Principal,
    @Param('id', { schema: IdSchema }) id: string,
  ): Promise<StreamableFile> {
    const { filename, content } = await this.documents.getFile(principal, id);
    return new StreamableFile(content, {
      type: 'application/pdf',
      length: content.byteLength,
      disposition: contentDisposition(filename),
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('document:delete:own', 'document:delete:any')
  delete(
    @CurrentPrincipal() principal: Principal,
    @Param('id', { schema: IdSchema }) id: string,
  ): Promise<void> {
    return this.documents.delete(principal, id);
  }
}

/** `inline` with an ASCII fallback name and the exact UTF-8 name (RFC 6266). */
export function contentDisposition(filename: string): string {
  const fallback = filename.replaceAll(/[^\x20-\x7e]|["\\]/g, '_');
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

/** encodeURIComponent leaves ' ( ) * as is, which an RFC 5987 value doesn't allow. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Keeps the base name, drops control characters and caps the length. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? '';
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  const clean = base.replaceAll(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'document.pdf').slice(0, 255);
}

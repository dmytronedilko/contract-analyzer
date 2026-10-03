import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';

import { ERROR_CODES, type Document } from '@repo/contracts';

import type { Database } from '../database/database.js';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { VoyageEmbeddingProvider } from '../embeddings/voyage-embedding.provider.js';
import { COUNTERS, SPANS, SUMMARIES } from '../observability/telemetry-names.js';
import { TelemetryService, type SpanTagger } from '../telemetry/telemetry.service.js';
import { VectorStoreService } from '../vector-store/vector-store.service.js';
import { chunkPages } from './chunking.js';
import { DocumentsRepository } from './documents.repository.js';
import { PdfTextExtractor, UnreadablePdfError } from './pdf-text-extractor.service.js';

export interface UploadedPdf {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

const NO_TEXT_MESSAGE = "This PDF has no selectable text; scanned documents aren't supported.";
const UNREADABLE_MESSAGE = 'The file could not be read as a PDF.';
const FAILED_MESSAGE = 'Processing failed. Try uploading the document again.';

/**
 * Turns an uploaded PDF into searchable chunks: store the document and its file as `processing`,
 * extract text per page, chunk, embed, then insert every chunk and mark the document `ready` in
 * one transaction. Any failure leaves the document `failed` with a safe message.
 *
 * Processing is synchronous within the upload request, but this service takes plain inputs and
 * owns the whole pipeline so it can move to a queue worker later.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly documents: DocumentsRepository,
    private readonly extractor: PdfTextExtractor,
    private readonly vectorStore: VectorStoreService,
    private readonly audit: AuditService,
    private readonly telemetry: TelemetryService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {}

  async ingest(actor: AuditActor, file: UploadedPdf): Promise<Document> {
    const startedAt = performance.now();
    const { organizationId, userId } = actor.principal;
    // The upload is audited together with the row it creates.
    const documentId = await this.db.transaction(async (tx) => {
      const document = await this.documents.create(
        tx,
        {
          organizationId,
          uploadedBy: userId,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.buffer.byteLength,
        },
        file.buffer,
      );
      await this.audit.record(tx, actor, {
        action: 'document.upload',
        targetType: 'document',
        targetId: document.id,
        metadata: { sizeBytes: file.buffer.byteLength },
      });
      return document.id;
    });

    try {
      await this.telemetry.span(
        SPANS.INGEST_PDF,
        (span) => this.process(organizationId, documentId, file, span),
        { documentId },
      );
    } catch (error) {
      this.telemetry.increment(COUNTERS.INGEST_FAILED, 'Uploads that ended in status failed');
      if (
        !(error instanceof UnsupportedMediaTypeException) &&
        !(error instanceof UnprocessableEntityException)
      ) {
        this.logger.error('Document ingestion failed', {
          documentId,
          error: error instanceof Error ? error.name : 'unknown',
        });
        await this.documents
          .markFailed(organizationId, documentId, FAILED_MESSAGE)
          .catch(() => undefined);
      }
      // Rethrown, so Observe records it once as the request's error; no captureError here.
      throw error;
    }

    const durationMs = Math.round(performance.now() - startedAt);
    this.telemetry.observe(
      SUMMARIES.INGEST_DURATION_MS,
      durationMs,
      'Upload processing time, in milliseconds',
    );
    const view = await this.documents.getView(organizationId, documentId);
    return view!;
  }

  /** Extract, chunk, embed and store; throws the client errors for unreadable or scanned PDFs. */
  private async process(
    organizationId: string,
    documentId: string,
    file: UploadedPdf,
    span: SpanTagger,
  ): Promise<void> {
    const startedAt = performance.now();
    let extracted;
    try {
      extracted = await this.extractor.extract(file.buffer);
    } catch (error) {
      if (!(error instanceof UnreadablePdfError)) throw error;
      await this.documents.markFailed(organizationId, documentId, UNREADABLE_MESSAGE);
      throw new UnsupportedMediaTypeException(UNREADABLE_MESSAGE, {
        errorCode: ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      });
    }
    span.addTags({ pageCount: extracted.pageCount });

    const chunks = extracted.hasText ? await chunkPages(extracted.pages) : [];
    if (!chunks.length) {
      await this.documents.markFailed(
        organizationId,
        documentId,
        NO_TEXT_MESSAGE,
        extracted.pageCount,
      );
      throw new UnprocessableEntityException(NO_TEXT_MESSAGE, {
        errorCode: ERROR_CODES.PDF_NO_TEXT_LAYER,
      });
    }
    span.addTags({
      chunkCount: chunks.length,
      batches: VoyageEmbeddingProvider.batchCount(chunks.length),
    });

    const vectors = await this.embeddings.embedDocuments(chunks.map((chunk) => chunk.content));
    await this.db.transaction(async (tx) => {
      await this.vectorStore.insertChunks(
        tx,
        documentId,
        chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i]! })),
      );
      await this.documents.markReady(tx, organizationId, documentId, extracted.pageCount);
    });

    this.telemetry.observe(SUMMARIES.INGEST_CHUNKS, chunks.length, 'Chunks per ingested document');
    this.logger.log('Document ingested', {
      documentId,
      pageCount: extracted.pageCount,
      chunkCount: chunks.length,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
}

import { Module } from '@nestjs/common';

import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { VectorStoreModule } from '../vector-store/vector-store.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsRepository } from './documents.repository.js';
import { DocumentsService } from './documents.service.js';
import { IngestionService } from './ingestion.service.js';
import { PdfTextExtractor } from './pdf-text-extractor.service.js';

@Module({
  imports: [EmbeddingsModule, VectorStoreModule],
  controllers: [DocumentsController],
  providers: [DocumentsRepository, DocumentsService, IngestionService, PdfTextExtractor],
  exports: [DocumentsService],
})
export class DocumentsModule {}

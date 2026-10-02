import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module.js';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { VectorStoreModule } from '../vector-store/vector-store.module.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';
import { LlmService } from './llm.service.js';

@Module({
  imports: [DocumentsModule, EmbeddingsModule, VectorStoreModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, LlmService],
})
export class AnalysisModule {}

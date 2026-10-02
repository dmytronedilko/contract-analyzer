import { Module } from '@nestjs/common';

import { EMBEDDING_PROVIDER } from './embedding-provider.js';
import { VoyageEmbeddingProvider } from './voyage-embedding.provider.js';

@Module({
  providers: [{ provide: EMBEDDING_PROVIDER, useClass: VoyageEmbeddingProvider }],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingsModule {}

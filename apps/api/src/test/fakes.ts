import { createHash } from 'node:crypto';

import { EMBEDDING_DIMENSIONS } from '@repo/db';

import type { LlmOperation, LlmResult } from '../analysis/llm.service.js';
import type { EmbeddingProvider } from '../embeddings/embedding-provider.js';

/**
 * Deterministic bag-of-words embeddings: each word adds weight to a hashed dimension, so texts
 * sharing words are similar. Good enough to make retrieval behave plausibly without a provider.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'fake-embeddings';

  embedDocuments(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.vector(text)));
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(this.vector(text));
  }

  private vector(text: string): number[] {
    const vector = Array.from<number>({ length: EMBEDDING_DIMENSIONS }).fill(0.001);
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      vector[createHash('sha256').update(word).digest().readUInt16BE(0) % EMBEDDING_DIMENSIONS]! +=
        1;
    }
    return vector;
  }
}

/** Records prompts and answers with a fixed, cited response. */
export class FakeLlm {
  readonly model = 'fake-llm';
  readonly calls: Array<{ operation: LlmOperation; system: string; user: string }> = [];
  answer = 'The term is 24 months [chunk 1, p. 1].';

  generate(operation: LlmOperation, system: string, user: string): Promise<LlmResult> {
    this.calls.push({ operation, system, user });
    return Promise.resolve({
      text: this.answer,
      truncated: false,
      model: this.model,
      inputTokens: 100,
      outputTokens: 20,
      stopReason: 'end_turn',
    });
  }
}

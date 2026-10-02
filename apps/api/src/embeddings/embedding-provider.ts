/** Injection token for the active EmbeddingProvider. */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/**
 * Turns text into vectors for document_chunks.embedding. Every implementation must return
 * EMBEDDING_DIMENSIONS (1024) values per text, or the inserts and searches fail.
 */
export interface EmbeddingProvider {
  /** The model name, for logs and telemetry. */
  readonly model: string;
  /** Embeds chunks for indexing, in input order. */
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
  /** Embeds a question or comparison query for searching. */
  embedQuery(text: string): Promise<number[]>;
}

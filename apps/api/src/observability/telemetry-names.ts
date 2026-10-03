/**
 * Every custom span and metric name. Tags and values hold ids, counts, model names and timings
 * only: never document text, filenames, questions or answers. The wiki's Observability page must
 * list each of these (a drift test enforces it).
 */
export const SPANS = {
  /** Vector search for one document. Tags: documentId, k, returned, topSimilarity. */
  RAG_RETRIEVE: 'rag.retrieve',
  /** One Claude call. Tags: operation, model, inputTokens, outputTokens, stopReason. */
  LLM_GENERATE: 'llm.generate',
  /** Extraction, chunking and embedding of an upload. Tags: documentId, pageCount, chunkCount, batches. */
  INGEST_PDF: 'ingest.pdf',
} as const;

export const SUMMARIES = {
  LLM_ASK_DURATION_MS: 'llm.ask.duration_ms',
  LLM_COMPARE_DURATION_MS: 'llm.compare.duration_ms',
  LLM_INPUT_TOKENS: 'llm.input_tokens',
  LLM_OUTPUT_TOKENS: 'llm.output_tokens',
  RAG_TOP_SIMILARITY: 'rag.top_similarity',
  INGEST_DURATION_MS: 'ingest.duration_ms',
  INGEST_CHUNKS: 'ingest.chunks',
} as const;

export const COUNTERS = {
  /** Answers equal to a NOT_FOUND sentence; a rising rate signals retrieval problems. */
  RAG_NOT_FOUND_ANSWERS: 'rag.not_found_answers',
  INGEST_FAILED: 'ingest.failed',
  EMBEDDINGS_RETRIES: 'embeddings.retries',
  /** 401 and 403 responses from the auth guards. */
  AUTH_DENIED: 'auth.denied',
  RATELIMIT_REJECTED: 'ratelimit.rejected',
} as const;

export type SpanName = (typeof SPANS)[keyof typeof SPANS];
export type SummaryName = (typeof SUMMARIES)[keyof typeof SUMMARIES];
export type CounterName = (typeof COUNTERS)[keyof typeof COUNTERS];

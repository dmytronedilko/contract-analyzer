import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';

import { EMBEDDING_DIMENSIONS } from '@repo/db';

import type { Env } from '../config/env.schema.js';
import type { EmbeddingProvider } from './embedding-provider.js';

import { AiProviderError } from '../common/ai-provider.error.js';
import { COUNTERS } from '../observability/telemetry-names.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';

const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';
/** Voyage accepts up to 128 inputs per request; chunks are ~300 tokens, well under its token cap. */
const BATCH_SIZE = 64;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

type InputType = 'document' | 'query';

const VoyageResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()), index: z.int().nonnegative() })),
});

/** Thrown for a retryable failure (429, 5xx, timeout, network error). */
class RetryableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/**
 * Voyage AI embeddings over REST (global fetch). voyage-law-2 is trained on legal text and
 * returns 1024-dimensional vectors. Indexing uses input_type "document" and searching uses
 * "query", which Voyage optimizes for asymmetric retrieval.
 */
@Injectable()
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(VoyageEmbeddingProvider.name);
  private readonly apiKey: string;
  readonly model: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly telemetry: TelemetryService,
  ) {
    this.apiKey = config.get('VOYAGE_API_KEY', { infer: true });
    this.model = config.get('VOYAGE_MODEL', { infer: true });
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      embeddings.push(...(await this.embed(texts.slice(start, start + BATCH_SIZE), 'document')));
    }
    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text], 'query');
    if (!embedding) throw new AiProviderError('voyage', 'Voyage returned no embedding');
    return embedding;
  }

  /** Number of requests embedDocuments() makes for `count` texts. */
  static batchCount(count: number): number {
    return Math.ceil(count / BATCH_SIZE);
  }

  private async embed(input: readonly string[], inputType: InputType): Promise<number[][]> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.request(input, inputType);
      } catch (error) {
        if (!(error instanceof RetryableError)) throw error;
        if (attempt >= MAX_ATTEMPTS) {
          throw new AiProviderError(
            'voyage',
            `Voyage request failed: ${error.message}`,
            error.status,
            {
              cause: error,
            },
          );
        }
        const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
        const delayMs = error.retryAfterMs ?? backoff + Math.floor(Math.random() * 250);
        this.telemetry.increment(COUNTERS.EMBEDDINGS_RETRIES, 'Retried Voyage embedding requests');
        this.telemetry.captureError(error, {
          provider: 'voyage',
          attempt,
          status: error.status ?? 0,
        });
        this.logger.warn('Retrying Voyage request', {
          attempt,
          status: error.status ?? null,
          delayMs,
          inputs: input.length,
        });
        await sleep(delayMs);
      }
    }
  }

  private async request(input: readonly string[], inputType: InputType): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(VOYAGE_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input, model: this.model, input_type: inputType }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Timeouts and network failures are transient.
      throw new RetryableError(error instanceof Error ? error.name : 'network error');
    }

    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      throw new RetryableError(
        `HTTP ${response.status}`,
        response.status,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AiProviderError(
        'voyage',
        `Voyage rejected the request: HTTP ${response.status}`,
        response.status,
      );
    }

    const parsed = VoyageResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new AiProviderError('voyage', 'Voyage returned an unexpected response body');
    }
    const embeddings = parsed.data.data
      .toSorted((a, b) => a.index - b.index)
      .map((item) => item.embedding);
    if (
      embeddings.length !== input.length ||
      embeddings.some((embedding) => embedding.length !== EMBEDDING_DIMENSIONS)
    ) {
      throw new AiProviderError(
        'voyage',
        `Voyage returned ${embeddings.length} embeddings for ${input.length} inputs, expected ${EMBEDDING_DIMENSIONS} dimensions each`,
      );
    }
    return embeddings;
  }
}

/** Retry-After in seconds (or an HTTP date), capped so one header can't stall a request. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, MAX_DELAY_MS * 2) : undefined;
}

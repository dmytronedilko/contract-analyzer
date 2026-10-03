import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';

import type { DocumentRow } from '@repo/db';

import {
  ERROR_CODES,
  type AskRequest,
  type AskResponse,
  type CompareRequest,
  type CompareResponse,
  NOT_FOUND_COMPARE,
  NOT_FOUND_SINGLE,
  type Source,
} from '@repo/contracts';

import type { Principal } from '../auth/principal.js';
import type { Env } from '../config/env.schema.js';
import type { Database } from '../database/database.js';
import type { RetrievedChunk } from '../vector-store/vector-store.service.js';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { COUNTERS, SPANS, SUMMARIES } from '../observability/telemetry-names.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { VectorStoreService } from '../vector-store/vector-store.service.js';
import { LlmService } from './llm.service.js';
import {
  buildCompareUserPrompt,
  buildQaUserPrompt,
  COMPARE_SYSTEM_PROMPT,
  QA_SYSTEM_PROMPT,
} from './prompts.js';

/** Numbers chunks 1..k in retrieval order; `ref` is what citations point at. */
function toSources(chunks: readonly RetrievedChunk[]): Source[] {
  return chunks.map((chunk, index) => ({ ref: index + 1, ...chunk }));
}

/** The query's hits first, then counterparts that aren't already among them. */
export function withCounterparts(
  hits: readonly RetrievedChunk[],
  counterparts: readonly RetrievedChunk[],
): RetrievedChunk[] {
  const seen = new Set(hits.map((chunk) => chunk.chunkId));
  return [...hits, ...counterparts.filter((chunk) => !seen.has(chunk.chunkId))];
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly topK: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly documents: DocumentsService,
    private readonly vectorStore: VectorStoreService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    @InjectDrizzle() private readonly db: Database,
    private readonly telemetry: TelemetryService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {
    this.topK = config.get('RAG_TOP_K', { infer: true });
  }

  async ask(actor: AuditActor, request: AskRequest): Promise<AskResponse> {
    const startedAt = performance.now();
    const document = await this.resolveReady(actor.principal, request.documentId);

    const queryVector = await this.embeddings.embedQuery(request.question);
    const sources = toSources(await this.retrieve(document.id, queryVector));

    const result = await this.llm.generate(
      'ask',
      QA_SYSTEM_PROMPT,
      buildQaUserPrompt({
        filename: document.filename,
        question: request.question,
        chunks: sources,
      }),
    );

    this.countNotFound(result.text, NOT_FOUND_SINGLE);
    const durationMs = Math.round(performance.now() - startedAt);
    // Counts, flags and timing only: never the question or the answer.
    await this.audit.record(this.db, actor, {
      action: 'analysis.ask',
      targetType: 'document',
      targetId: document.id,
      metadata: { sourceCount: sources.length, truncated: result.truncated, durationMs },
    });
    this.logger.log('Question answered', {
      documentId: document.id,
      sources: sources.length,
      model: result.model,
      truncated: result.truncated,
      durationMs,
    });
    return { answer: result.text, truncated: result.truncated, sources };
  }

  async compare(actor: AuditActor, request: CompareRequest): Promise<CompareResponse> {
    const startedAt = performance.now();
    const { principal } = actor;
    // Resolve both before checking readiness, so a missing document is always reported as 404.
    const [documentA, documentB] = await Promise.all([
      this.documents.resolve(principal, request.documentId1),
      this.documents.resolve(principal, request.documentId2),
    ]);
    assertReady(documentA);
    assertReady(documentB);

    // Embed the query once and search both documents in parallel.
    const queryVector = await this.embeddings.embedQuery(request.query);
    const [hitsA, hitsB] = await Promise.all([
      this.retrieve(documentA.id, queryVector),
      this.retrieve(documentB.id, queryVector),
    ]);
    // Searched separately, each contract can miss a clause the other's hits contain, when its
    // wording matches the query less well. Each hit therefore also brings the most similar chunk of
    // the other contract, so the model sees both sides of every clause it compares.
    const [counterpartsA, counterpartsB] = await Promise.all([
      this.vectorStore.searchCounterparts(
        documentA.id,
        hitsB.map((chunk) => chunk.chunkId),
        queryVector,
      ),
      this.vectorStore.searchCounterparts(
        documentB.id,
        hitsA.map((chunk) => chunk.chunkId),
        queryVector,
      ),
    ]);
    const sourcesA = toSources(withCounterparts(hitsA, counterpartsA));
    const sourcesB = toSources(withCounterparts(hitsB, counterpartsB));

    const result = await this.llm.generate(
      'compare',
      COMPARE_SYSTEM_PROMPT,
      buildCompareUserPrompt({
        filenameA: documentA.filename,
        filenameB: documentB.filename,
        query: request.query,
        chunksA: sourcesA,
        chunksB: sourcesB,
      }),
    );

    this.countNotFound(result.text, NOT_FOUND_COMPARE);
    const durationMs = Math.round(performance.now() - startedAt);
    await this.audit.record(this.db, actor, {
      action: 'analysis.compare',
      targetType: 'document',
      targetId: documentA.id,
      metadata: {
        otherDocumentId: documentB.id,
        sourceCountA: sourcesA.length,
        sourceCountB: sourcesB.length,
        truncated: result.truncated,
        durationMs,
      },
    });
    this.logger.log('Documents compared', {
      documentIdA: documentA.id,
      documentIdB: documentB.id,
      sourcesA: sourcesA.length,
      sourcesB: sourcesB.length,
      counterpartsA: sourcesA.length - hitsA.length,
      counterpartsB: sourcesB.length - hitsB.length,
      model: result.model,
      truncated: result.truncated,
      durationMs,
    });
    return {
      analysis: result.text,
      truncated: result.truncated,
      sources: { contractA: sourcesA, contractB: sourcesB },
    };
  }

  private retrieve(documentId: string, queryVector: number[]): Promise<RetrievedChunk[]> {
    return this.telemetry.span(
      SPANS.RAG_RETRIEVE,
      async (span) => {
        const chunks = await this.vectorStore.search(documentId, queryVector, this.topK);
        const topSimilarity = chunks[0]?.similarity ?? 0;
        span.addTags({ returned: chunks.length, topSimilarity });
        this.telemetry.observe(
          SUMMARIES.RAG_TOP_SIMILARITY,
          topSimilarity,
          'Similarity of the best retrieved chunk',
        );
        return chunks;
      },
      { documentId, k: this.topK },
    );
  }

  /** The model answered with the exact "not found" sentence: retrieval missed or the text lacks it. */
  private countNotFound(answer: string, sentence: string): void {
    if (answer.trim() === sentence) {
      this.telemetry.increment(
        COUNTERS.RAG_NOT_FOUND_ANSWERS,
        'Answers stating the retrieved excerpts lack the information',
      );
    }
  }

  /** 404 outside the caller's organization, 409 until ingestion has finished successfully. */
  private async resolveReady(principal: Principal, documentId: string): Promise<DocumentRow> {
    const document = await this.documents.resolve(principal, documentId);
    assertReady(document);
    return document;
  }
}

function assertReady(document: DocumentRow): void {
  if (document.status !== 'ready') {
    throw new ConflictException('Document is not ready', {
      errorCode: ERROR_CODES.DOCUMENT_NOT_READY,
    });
  }
}

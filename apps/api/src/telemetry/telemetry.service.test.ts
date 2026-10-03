import type { TracerService } from '@nestjs/observe';

import { describe, expect, it, vi, type Mock } from 'vitest';

import { COUNTERS, SPANS, SUMMARIES } from '../observability/telemetry-names.js';
import { TelemetryService } from './telemetry.service.js';

type Tags = Record<string, string | number | boolean>;

interface FakeSpan {
  addTags: Mock<(tags: Tags) => FakeSpan>;
}

/** A TracerService double with only the methods TelemetryService uses. */
function fakeTracer(traceId: string | null) {
  const span: FakeSpan = { addTags: vi.fn<(tags: Tags) => FakeSpan>(() => span) };
  const summary = { observe: vi.fn<(value: number) => void>() };
  const counter = { increment: vi.fn<() => void>() };
  const tracer = {
    currentTraceId: vi.fn<() => string | null>(() => traceId),
    createSpan: vi.fn<
      (name: string, callback: (s: FakeSpan) => Promise<unknown>) => Promise<unknown>
    >(async (_name, callback) => callback(span)),
    activeSpan: vi.fn<() => Promise<FakeSpan>>(() => Promise.resolve(span)),
    captureError: vi.fn<(error: Error, tags?: Tags) => Promise<void>>(() => Promise.resolve()),
    summary: vi.fn<() => typeof summary>(() => summary),
    counter: vi.fn<() => typeof counter>(() => counter),
  };
  return {
    tracer,
    span,
    summary,
    counter,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- partial test double
    service: new TelemetryService(tracer as unknown as TracerService),
  };
}

describe('TelemetryService when Observe is disabled', () => {
  const telemetry = new TelemetryService();

  it('runs span callbacks directly and returns their result', async () => {
    const result = await telemetry.span(SPANS.RAG_RETRIEVE, async (span) => {
      span.addTags({ returned: 5 });
      return 42;
    });
    expect(result).toBe(42);
    expect(telemetry.enabled).toBe(false);
  });

  it('propagates callback errors unchanged', async () => {
    const error = new Error('boom');
    await expect(telemetry.span(SPANS.LLM_GENERATE, () => Promise.reject(error))).rejects.toBe(
      error,
    );
  });

  it('ignores tags, errors and metrics', async () => {
    await expect(telemetry.tag({ a: 1 })).resolves.toBeUndefined();
    expect(() => telemetry.captureError(new Error('x'))).not.toThrow();
    expect(() => telemetry.observe(SUMMARIES.INGEST_CHUNKS, 3, 'chunks')).not.toThrow();
    expect(() => telemetry.increment(COUNTERS.INGEST_FAILED, 'failed')).not.toThrow();
  });
});

describe('TelemetryService outside a trace', () => {
  it('skips spans, tags and errors but still records metrics', async () => {
    const { tracer, service, summary, counter } = fakeTracer(null);

    expect(await service.span(SPANS.INGEST_PDF, () => Promise.resolve('ok'))).toBe('ok');
    await service.tag({ a: 1 });
    service.captureError(new Error('x'));
    expect(tracer.createSpan).not.toHaveBeenCalled();
    expect(tracer.activeSpan).not.toHaveBeenCalled();
    expect(tracer.captureError).not.toHaveBeenCalled();

    service.observe(SUMMARIES.RAG_TOP_SIMILARITY, 0.8, 'similarity');
    service.increment(COUNTERS.AUTH_DENIED, 'denied');
    expect(summary.observe).toHaveBeenCalledWith(0.8);
    expect(counter.increment).toHaveBeenCalledOnce();
  });

  it('treats a throwing currentTraceId as "no trace"', async () => {
    const { tracer, service } = fakeTracer(null);
    tracer.currentTraceId.mockImplementation(() => {
      throw new Error('no context');
    });
    expect(await service.span(SPANS.INGEST_PDF, () => Promise.resolve(1))).toBe(1);
    expect(tracer.createSpan).not.toHaveBeenCalled();
  });
});

describe('TelemetryService inside a trace', () => {
  it('creates the span with initial and late tags and returns the result', async () => {
    const { tracer, service, span } = fakeTracer('trace-1');
    const result = await service.span(
      SPANS.RAG_RETRIEVE,
      async (tagger) => {
        tagger.addTags({ returned: 5, topSimilarity: 0.9 });
        return 'chunks';
      },
      { documentId: 'doc-1', k: 5 },
    );
    expect(result).toBe('chunks');
    expect(tracer.createSpan).toHaveBeenCalledWith('rag.retrieve', expect.any(Function));
    expect(span.addTags).toHaveBeenNthCalledWith(1, { documentId: 'doc-1', k: 5 });
    expect(span.addTags).toHaveBeenNthCalledWith(2, { returned: 5, topSimilarity: 0.9 });
  });

  it('tags the active span and forwards captured errors', async () => {
    const { tracer, service, span } = fakeTracer('trace-1');
    await service.tag({ stopReason: 'end_turn' });
    expect(span.addTags).toHaveBeenCalledWith({ stopReason: 'end_turn' });

    service.captureError('not an error', { provider: 'voyage' });
    expect(tracer.captureError).toHaveBeenCalledWith(expect.any(Error), { provider: 'voyage' });
  });

  it('never lets a tracer failure escape', async () => {
    const { tracer, service } = fakeTracer('trace-1');
    tracer.activeSpan.mockRejectedValue(new Error('tracer down'));
    tracer.summary.mockImplementation(() => {
      throw new Error('tracer down');
    });
    await expect(service.tag({ a: 1 })).resolves.toBeUndefined();
    expect(() => service.observe(SUMMARIES.LLM_INPUT_TOKENS, 1, 'tokens')).not.toThrow();
  });
});

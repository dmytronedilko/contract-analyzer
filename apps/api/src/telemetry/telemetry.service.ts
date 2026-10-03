import { Injectable, Logger, Optional } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';

import type { CounterName, SpanName, SummaryName } from '../observability/telemetry-names.js';

export type Tags = Record<string, string | number | boolean>;

/** Adds tags to the span a callback runs in. */
export interface SpanTagger {
  addTags(tags: Tags): void;
}

const noopTagger: SpanTagger = { addTags: () => undefined };

/**
 * A thin wrapper over Observe's TracerService that is safe to call everywhere:
 * - span, tag and captureError do nothing when Observe is disabled or when there is no current
 *   trace (TracerService throws outside a trace, e.g. during startup);
 * - observe and increment do nothing only when Observe is disabled: metrics need no trace.
 * Telemetry must never fail a request, so tracer errors are logged and swallowed.
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(@Optional() private readonly tracer?: TracerService) {}

  get enabled(): boolean {
    return this.tracer !== undefined;
  }

  private get inTrace(): boolean {
    try {
      return this.tracer?.currentTraceId() != null;
    } catch {
      return false;
    }
  }

  /** Runs `fn` in a custom span; `fn` receives a tagger for results known only at the end. */
  async span<T>(name: SpanName, fn: (span: SpanTagger) => Promise<T>, tags?: Tags): Promise<T> {
    if (!this.tracer || !this.inTrace) return fn(noopTagger);
    let outcome: { value: T } | undefined;
    await this.tracer.createSpan(name, async (span) => {
      if (tags) span.addTags(tags);
      outcome = { value: await fn({ addTags: (more) => void span.addTags(more) }) };
    });
    if (!outcome) throw new Error(`Span ${name} completed without a result`);
    return outcome.value;
  }

  /** Tags the active span. */
  async tag(tags: Tags): Promise<void> {
    if (!this.tracer || !this.inTrace) return;
    try {
      (await this.tracer.activeSpan()).addTags(tags);
    } catch (error) {
      this.swallow('tag', error);
    }
  }

  /** Records a handled error that would otherwise not reach Observe (e.g. a retried attempt). */
  captureError(exception: unknown, tags?: Tags): void {
    if (!this.tracer || !this.inTrace) return;
    const value = exception instanceof Error ? exception : new Error(String(exception));
    this.tracer
      .captureError(value, tags)
      .catch((cause: unknown) => this.swallow('captureError', cause));
  }

  observe(name: SummaryName, value: number, description: string): void {
    if (!this.tracer) return;
    try {
      this.tracer.summary(name, { description }).observe(value);
    } catch (error) {
      this.swallow('observe', error);
    }
  }

  increment(name: CounterName, description: string): void {
    if (!this.tracer) return;
    try {
      this.tracer.counter(name, { description }).increment();
    } catch (error) {
      this.swallow('increment', error);
    }
  }

  private swallow(operation: string, error: unknown): void {
    this.logger.warn('Telemetry call failed', {
      operation,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}

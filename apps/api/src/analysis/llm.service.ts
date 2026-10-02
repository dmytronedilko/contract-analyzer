import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';

import { AiProviderError } from '../common/ai-provider.error.js';

/** Long enough for a full comparison table; adaptive thinking also counts toward it. */
const MAX_TOKENS = 16_000;
/** Answers take 10-60 s; leave headroom for thinking. The SDK retries 429/5xx twice. */
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;

/**
 * Models that accept server-side refusal fallbacks in the `"default"` form. When a safety
 * classifier declines (e.g. a contract mentioning export-controlled technology), the API re-runs
 * the request on a model chosen for the refusal category within the same call.
 */
const DEFAULT_FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type LlmOperation = 'ask' | 'compare';

export interface LlmResult {
  text: string;
  /** The model stopped at max_tokens: the text is incomplete. */
  truncated: boolean;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

/** Calls Claude through the Anthropic SDK. No temperature: current models reject non-defaults. */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: Anthropic;
  readonly model: string;

  constructor(config: ConfigService<Env, true>) {
    this.model = config.get('ANTHROPIC_MODEL', { infer: true });
    this.client = new Anthropic({
      apiKey: config.get('ANTHROPIC_API_KEY', { infer: true }),
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }

  async generate(operation: LlmOperation, system: string, user: string): Promise<LlmResult> {
    const withFallbacks = DEFAULT_FALLBACK_MODELS.has(this.model);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
        ...(withFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      });
    } catch (error) {
      if (error instanceof APIError) {
        // Keep only the status: provider messages can echo request details.
        throw new AiProviderError(
          'anthropic',
          `Anthropic request failed${error.status ? `: HTTP ${error.status}` : ` (${error.name})`}`,
          error.status,
          { cause: error },
        );
      }
      throw error;
    }

    if (response.stop_reason === 'refusal') {
      this.logger.warn('Model declined the request', {
        operation,
        model: response.model,
        category: response.stop_details?.category ?? null,
      });
      throw new AiProviderError('anthropic', 'The model declined the request');
    }

    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    return {
      text,
      truncated: response.stop_reason === 'max_tokens',
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason ?? 'unknown',
    };
  }
}

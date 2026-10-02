export type AiProvider = 'anthropic' | 'voyage';

/**
 * A failed call to an AI provider. The exception filter maps it to 502 AI_PROVIDER_UNAVAILABLE
 * without exposing `message`, which may contain the provider's raw response.
 */
export class AiProviderError extends Error {
  override readonly name = 'AiProviderError';

  constructor(
    readonly provider: AiProvider,
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

import type { FastifyReply } from 'fastify';

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';

import { ERROR_CODES, ErrorCodeSchema, type ApiErrorBody, type ErrorCode } from '@repo/contracts';

import { AiProviderError } from './ai-provider.error.js';

const STATUS_TEXT: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/** Fastify errors (body parsing, content type, multipart) carry their own 4xx status. */
interface FastifyLikeError extends Error {
  statusCode: number;
  code?: string;
}

function isFastifyClientError(error: unknown): error is FastifyLikeError {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

/**
 * Turns every error into an ApiErrorBody with a machine-readable errorCode where one applies, and
 * never leaks internals: provider failures and unexpected errors get generic messages.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const errorBody = this.toBody(exception);
    if (errorBody.statusCode >= 500) this.logServerError(exception, errorBody.statusCode);
    void reply.status(errorBody.statusCode).send(errorBody);
  }

  toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof AiProviderError) {
      return errorBodyOf(
        HttpStatus.BAD_GATEWAY,
        'The AI service is temporarily unavailable. Try again.',
        ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) return errorBodyOf(status, 'Internal server error');
      const response = exception.getResponse();
      const details = typeof response === 'object' && response !== null ? response : {};
      const message =
        'message' in details &&
        (typeof details.message === 'string' || Array.isArray(details.message))
          ? (details.message as string | string[])
          : typeof response === 'string'
            ? response
            : exception.message;
      const declared = exception.errorCode ?? ('errorCode' in details ? details.errorCode : null);
      return errorBodyOf(status, message, toErrorCode(declared) ?? defaultCode(status));
    }

    if (isFastifyClientError(exception)) {
      const status = exception.statusCode;
      return errorBodyOf(status, exception.message, defaultCode(status));
    }

    return errorBodyOf(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }

  /**
   * Logs error names, codes and stack frames only. Messages are omitted on purpose: database
   * errors embed query parameters, which can include contract text.
   */
  private logServerError(exception: unknown, status: number): void {
    const chain: string[] = [];
    for (let current = exception; current instanceof Error; current = current.cause) {
      const code = 'code' in current && typeof current.code === 'string' ? `(${current.code})` : '';
      chain.push(`${current.name}${code}`);
    }
    const frames =
      exception instanceof Error
        ? (exception.stack ?? '')
            .split('\n')
            .filter((line) => line.trimStart().startsWith('at '))
            .slice(0, 10)
            .join('\n')
        : undefined;
    this.logger.error('Request failed', {
      status,
      error: chain.join(' <- ') || typeof exception,
      ...(exception instanceof AiProviderError
        ? { provider: exception.provider, providerStatus: exception.status ?? null }
        : {}),
      stack: frames,
    });
  }
}

function errorBodyOf(
  statusCode: number,
  message: string | string[],
  errorCode?: ErrorCode,
): ApiErrorBody {
  return {
    statusCode,
    message,
    error: STATUS_TEXT[statusCode] ?? 'Error',
    ...(errorCode ? { errorCode } : {}),
  };
}

function toErrorCode(value: unknown): ErrorCode | undefined {
  const parsed = ErrorCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Codes implied by the status when the error didn't declare one. */
function defaultCode(status: number): ErrorCode | undefined {
  switch (status) {
    case 400:
      return ERROR_CODES.VALIDATION_FAILED;
    case 413:
      // The only bodies large enough to hit a limit are uploads (multipart fileSize).
      return ERROR_CODES.FILE_TOO_LARGE;
    case 415:
      return ERROR_CODES.UNSUPPORTED_FILE_TYPE;
    default:
      return undefined;
  }
}

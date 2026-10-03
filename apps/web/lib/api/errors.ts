import { ApiErrorBodySchema, ERROR_CODES, type ErrorCode } from '@repo/contracts';

import { MAX_UPLOAD_MB } from '../public-env';

/** Where the UI must send the user instead of showing an error. */
export type ErrorRedirect = 'sign-in' | 'onboarding';

/** A failed API call, with a user-facing message and the reference id of the request. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    /** HTTP status, or 0 when the server couldn't be reached. */
    readonly status: number,
    message: string,
    readonly errorCode: ErrorCode | undefined,
    /** The x-request-id shown to users as "Reference: ..." to find the trace. */
    readonly requestId: string | undefined,
    readonly redirect?: ErrorRedirect,
  ) {
    super(message);
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export const NETWORK_ERROR_MESSAGE = "Can't reach the server.";

const MESSAGES_BY_CODE: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.DOCUMENT_NOT_READY]: 'This document is still processing.',
  [ERROR_CODES.DOCUMENT_NOT_FOUND]: 'Document not found.',
  [ERROR_CODES.FILE_REQUIRED]: 'Choose a PDF file to upload.',
  [ERROR_CODES.FILE_TOO_LARGE]: `File exceeds ${MAX_UPLOAD_MB} MB.`,
  [ERROR_CODES.UNSUPPORTED_FILE_TYPE]: 'Only PDF files are supported.',
  [ERROR_CODES.PDF_NO_TEXT_LAYER]:
    "This PDF has no selectable text; scanned documents aren't supported.",
  [ERROR_CODES.AI_PROVIDER_UNAVAILABLE]: 'The AI service is temporarily unavailable. Try again.',
  [ERROR_CODES.ORIGIN_NOT_ALLOWED]: "This request was blocked by the site's security policy.",
  [ERROR_CODES.FORBIDDEN]: "You don't have permission to do this.",
  [ERROR_CODES.VALIDATION_FAILED]: 'Check the highlighted fields and try again.',
};

const MESSAGES_BY_STATUS: Record<number, string> = {
  400: 'The request was invalid.',
  401: 'Your session has expired. Sign in again.',
  403: "You don't have permission to do this.",
  404: 'Not found.',
  409: 'This document is still processing.',
  413: `File exceeds ${MAX_UPLOAD_MB} MB.`,
  415: 'Only PDF files are supported.',
  429: 'Too many requests. Try again later.',
  502: 'The AI service is temporarily unavailable. Try again.',
  503: 'The service is temporarily unavailable. Try again.',
};

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

/** A user-facing message: by errorCode first, then by status. */
export function messageFor(
  status: number,
  errorCode: ErrorCode | undefined,
  retryAfter?: string | null,
): string {
  if (errorCode === ERROR_CODES.RATE_LIMITED || (!errorCode && status === 429)) {
    const seconds = retryAfterSeconds(retryAfter ?? null);
    return seconds
      ? `Too many requests. Try again in ${seconds} seconds.`
      : 'Too many requests. Try again later.';
  }
  return (
    (errorCode && MESSAGES_BY_CODE[errorCode]) ??
    MESSAGES_BY_STATUS[status] ??
    'Something went wrong. Try again.'
  );
}

/** Builds an ApiError from a non-OK response; tolerates bodies that aren't ApiErrorBody. */
export function toApiError(
  status: number,
  body: unknown,
  headers: { get(name: string): string | null },
): ApiError {
  const parsed = ApiErrorBodySchema.safeParse(body);
  const errorCode = parsed.success ? parsed.data.errorCode : undefined;
  const requestId = headers.get('x-request-id') ?? undefined;
  const redirect: ErrorRedirect | undefined =
    errorCode === ERROR_CODES.UNAUTHENTICATED || (!errorCode && status === 401)
      ? 'sign-in'
      : errorCode === ERROR_CODES.NO_ACTIVE_ORGANIZATION
        ? 'onboarding'
        : undefined;
  return new ApiError(
    status,
    messageFor(status, errorCode, headers.get('retry-after')),
    errorCode,
    requestId,
    redirect,
  );
}

export function networkError(requestId: string): ApiError {
  return new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, requestId);
}

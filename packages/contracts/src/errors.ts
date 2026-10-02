import { z } from 'zod';

/** Machine-readable error codes. The web app maps them to user-facing messages. */
export const ERROR_CODES = {
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  DOCUMENT_NOT_READY: 'DOCUMENT_NOT_READY',
  FILE_REQUIRED: 'FILE_REQUIRED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  PDF_NO_TEXT_LAYER: 'PDF_NO_TEXT_LAYER',
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NO_ACTIVE_ORGANIZATION: 'NO_ACTIVE_ORGANIZATION',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** The body of every error response from the API. */
export const ApiErrorBodySchema = z.object({
  statusCode: z.int(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string(),
  errorCode: ErrorCodeSchema.optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** Maximum length of a question or comparison query, after trimming. */
export const QUESTION_MAX_LENGTH = 2000;

/**
 * Request id header. The web proxy and the API set it to a UUID, the API adopts it as the
 * NestJS Observe trace id, and every response echoes it so users can quote it as a reference.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Exact sentences the model must reply with when the retrieved excerpts don't answer the
 * question. They are interpolated into the prompts, detected by the API (metrics) and by the UI
 * (rendered as a neutral callout), so they must never be paraphrased.
 */
export const NOT_FOUND_SINGLE =
  'The retrieved excerpts of this document do not contain this information.';
export const NOT_FOUND_COMPARE =
  'The retrieved excerpts of these documents do not contain this information.';

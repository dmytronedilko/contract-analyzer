import { createObserveModule } from '@nestjs/observe';

/**
 * Observe is enabled only when both credentials are present (not in tests, CI or for developers
 * without an account). It is read at import time, so the process must start with its env vars
 * already set: Node's --env-file in development, real env vars in Docker.
 */
export const observeEnabled = Boolean(
  process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET,
);

/**
 * The hosted collector. The SDK falls back to `process.env.OBSERVE_ENDPOINT ?? <this URL>`, so an
 * empty variable (as in .env.example) would become the endpoint "" and every export would fail.
 * app.module.ts therefore always passes the validated OBSERVE_ENDPOINT, or this URL.
 */
export const OBSERVE_HOSTED_ENDPOINT = 'https://observe-api.nestjs.com';

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  // Keep the default traceIdGenerator: it adopts the incoming x-request-id (always a UUID, set
  // by the HTTP policy hook), so the reference id users see is the trace id.
  attachTraceIdToLogs: true,
});

/**
 * Masked in error messages, stacks and forwarded logs before anything leaves the process:
 * provider keys, and the parameters that drizzle quotes in "Failed query ... params:" errors,
 * which can hold contract text.
 */
export const REDACTION_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /\bpa-[A-Za-z0-9_-]{20,}/g,
  /params: [\s\S]*/g,
];

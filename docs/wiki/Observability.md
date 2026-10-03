# Observability

How the API is traced and measured with NestJS Observe, exactly what is and isn't sent, the custom
spans and metrics, how to go from a user's reference id to a trace, the alerts we recommend, and the
logging conventions. Read this when turning Observe on or investigating a failed request.

## Setup

Observe is optional and off unless both credentials are set. To try it, create a project in
NestJS Observe and put its credentials in `apps/api/.env`:

```sh
OBSERVE_APP_KEY=…
OBSERVE_APP_SECRET=…
```

Optional: `OBSERVE_TRACES_SAMPLE_RATE` (0–1, default 1), `OBSERVE_FORWARD_LOGS` (`true` streams logs
too; needs a paid plan), and `OBSERVE_ENDPOINT` to send to a non-default collector (self-hosted or
local). The image's commit (`GIT_SHA`) is reported as the service version. The API must start with
these variables already set: Observe is wired before Nest starts. In tests, CI and for developers
without an account it is simply disabled. The wiring is in
[`observability/observe.ts`]({{repo}}/blob/main/apps/api/src/observability/observe.ts) and
[`app.module.ts`]({{repo}}/blob/main/apps/api/src/app.module.ts).

Only the API is instrumented; the web app's server logs go to the container's output.

## What is and isn't sent

| Sent                                                                                                     | Never sent                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A trace per request: route, method, status, duration, spans for controllers, providers, guards and pipes | Request or response bodies (capture of bodies is off)                                                                       |
| Database spans with the SQL statement stripped of literals                                               | Bound query parameters                                                                                                      |
| Outbound HTTP spans to Anthropic and Voyage AI (URL, status, duration)                                   | Their request or response bodies; trace ids aren't propagated to them                                                       |
| The opaque user id and an `organizationId` attribute                                                     | Emails, names                                                                                                               |
| Custom spans and metrics: ids, counts, model names, timings                                              | Document text, filenames, questions, answers                                                                                |
| Server errors with stack traces and a few lines of our source around each frame, after redaction         | Anthropic and Voyage keys, `x-api-key` and secrets, and the parameters drizzle quotes in failed-query messages (all masked) |
| For failed requests, or ones slower than 30 s: the default allow-list of request headers, redacted       | Cookies; authorization headers are redacted                                                                                 |

Health checks (`/health*`) and CORS preflights are not traced.

## Spans and metrics

Every name is defined in
[`telemetry-names.ts`]({{repo}}/blob/main/apps/api/src/observability/telemetry-names.ts).

### Custom spans

| Span           | Tags                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| `rag.retrieve` | `documentId`, `k`, `returned`, `topSimilarity`                                     |
| `llm.generate` | `operation` (ask or compare), `model`, `inputTokens`, `outputTokens`, `stopReason` |
| `ingest.pdf`   | `documentId`, `pageCount`, `chunkCount`, `batches`                                 |

### Summaries

| Metric                    | Meaning                                  |
| ------------------------- | ---------------------------------------- |
| `llm.ask.duration_ms`     | Claude latency for questions             |
| `llm.compare.duration_ms` | Claude latency for comparisons           |
| `llm.input_tokens`        | Input tokens per Claude call             |
| `llm.output_tokens`       | Output tokens per Claude call            |
| `rag.top_similarity`      | Similarity of the best retrieved excerpt |
| `ingest.duration_ms`      | Time to process an upload                |
| `ingest.chunks`           | Chunks per ingested document             |

### Counters

| Metric                  | Meaning                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `rag.not_found_answers` | Answers equal to the exact "not found" sentence; a rising rate signals retrieval problems |
| `ingest.failed`         | Uploads that ended `failed` (scans, unreadable PDFs, provider errors)                     |
| `embeddings.retries`    | Voyage requests retried after a 429, 5xx, timeout or network error                        |
| `auth.denied`           | 401 and 403 responses from the authentication and permission guards                       |
| `ratelimit.rejected`    | Requests rejected by the per-user rate limits                                             |

Retried Anthropic and Voyage attempts are also recorded as handled errors, since nothing else would
show them. Every failed request is recorded exactly once, as the request's own error.

## Finding a trace from a reference id

Every error in the web app shows **"Reference: <id>"**. That id is the request's `x-request-id`: the
web proxy generates it (or keeps the browser's), sends it to the API, and the API adopts it as the
**trace id**. Audit events store it too.

1. Ask the user for the reference (or find it in the audit log's Reference column).
2. In NestJS Observe, open the project and search traces by that id.
3. The trace shows the route, the user and organization ids, every span with timings, and the
   error, if any.

Responses from the API (directly or through the proxy) carry the same id in the `x-request-id`
header.

## Logging conventions

- The API logs with Nest's `Logger` and structured parameters, e.g.
  `logger.log('Document ingested', { documentId, pageCount, chunkCount, durationMs })`. In
  production logs are JSON lines; with Observe enabled they carry the trace id.
- **Log ids, counts, model names and durations only.** Never document text, filenames, questions,
  answers, emails, names, tokens or keys. Error logs carry error names, codes and stack frames, not
  messages, because database errors can quote stored text.
- `console` is forbidden in the API by lint; use `Logger`.
- Logs go to the containers' standard output: `docker compose logs api` on the host.

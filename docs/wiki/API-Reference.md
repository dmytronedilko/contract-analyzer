# API reference

Every HTTP endpoint of the API: request and response shapes, status codes, error codes, the
permission each one requires, authentication, rate limits, request ids and CORS. Read this when
building against the API or debugging a response.

The schemas named below are zod schemas in
[`@repo/contracts`]({{repo}}/tree/main/packages/contracts/src); the API validates requests and
serializes responses with them, and the web app uses the same ones.

## Base URL and access

- Browsers never call the API directly: the web app's proxy forwards `/api/backend/<path>` to the
  API server-to-server (see [Frontend](Frontend#the-backend-proxy)). Locally the API is
  `http://localhost:3001` (`http://api:3001` inside the Compose stack).

## Authentication

Every endpoint except `/health*` requires `Authorization: Bearer <token>`. Tokens are EdDSA JWTs
minted by the web app's Better Auth JWT plugin for a signed-in session:

- claims: `sub` (user id), `sid` (session id), `org` (active organization id), `iss` (`APP_URL`),
  `aud` (`legal-rag-api`), `exp` (5 minutes after issue);
- verified against the web app's JWKS (`/api/auth/jwks`), with 30 seconds of clock tolerance;
- on every request the API reads the caller's role in `org` from the database, so membership
  changes apply immediately.

To call the API yourself, mint a token with a signed-in browser session (copy the session cookie
from the browser's developer tools into `cookies.txt`, Netscape format) and use it within 5 minutes:

```sh
TOKEN=$(curl -s -b cookies.txt https://contracts.example.com/api/auth/token | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" "https://api.example.com/documents?limit=5"
```

Issuing tokens to third-party applications (OAuth clients, API keys) is not supported yet. How the
flow works end to end is on [Authentication and authorization](Authentication-and-Authorization).

| Situation                                                                                                   | Status | `errorCode`              |
| ----------------------------------------------------------------------------------------------------------- | ------ | ------------------------ |
| Missing, malformed, expired token, or wrong issuer, audience or algorithm (with `WWW-Authenticate: Bearer`) | 401    | `UNAUTHENTICATED`        |
| Token without an active organization (`org`)                                                                | 403    | `NO_ACTIVE_ORGANIZATION` |
| Caller isn't a member of that organization                                                                  | 403    | `FORBIDDEN`              |
| Caller's role lacks the endpoint's permission                                                               | 403    | `FORBIDDEN`              |

## Endpoints

| Method and path           | Permission                                                           | Success                                                        | Rate limit |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- | ---------- |
| `POST /documents/upload`  | `document:upload`                                                    | 201 `Document`                                                 | uploads    |
| `GET /documents`          | `document:read`                                                      | 200 `DocumentListResponse`                                     |            |
| `GET /documents/:id`      | `document:read`                                                      | 200 `Document`                                                 |            |
| `GET /documents/:id/file` | `document:read`                                                      | 200 `application/pdf`                                          |            |
| `DELETE /documents/:id`   | `document:delete:any`, or `document:delete:own` for your own uploads | 204                                                            |            |
| `POST /analysis/ask`      | `analysis:run`                                                       | 200 `AskResponse`                                              | analysis   |
| `POST /analysis/compare`  | `analysis:run`                                                       | 200 `CompareResponse`                                          | analysis   |
| `GET /audit-events`       | `audit:read`                                                         | 200 `AuditEventListResponse`                                   |            |
| `GET /health`             | public                                                               | 200 `{ "status": "ok" }`                                       |            |
| `GET /health/ready`       | public                                                               | 200 `{ "status": "ok" }`, 503 when the database is unreachable |            |

Everything is scoped to the caller's active organization. A document in another organization is
reported as **404 `DOCUMENT_NOT_FOUND`**, exactly like a missing one, never 403, so its existence
isn't revealed.

### `POST /documents/upload`

Multipart form with a single field `file` (a PDF, at most `MAX_UPLOAD_MB`). The document is
processed synchronously: text extraction, chunking, embedding and storage happen before the
response.

```sh
curl -s -H "Authorization: Bearer $TOKEN" -F "file=@msa.pdf;type=application/pdf" \
  https://api.example.com/documents/upload
```

Response `Document`:

```json
{
  "id": "0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d",
  "filename": "msa.pdf",
  "status": "ready",
  "pageCount": 12,
  "chunkCount": 40,
  "hasFile": true,
  "error": null,
  "uploadedBy": { "id": "xYz123", "name": "Ada Lovelace" },
  "createdAt": "2026-01-15T10:00:00.000Z"
}
```

| Status | `errorCode`               | When                                                                   |
| ------ | ------------------------- | ---------------------------------------------------------------------- |
| 400    | `FILE_REQUIRED`           | No `file` field, or it is empty.                                       |
| 413    | `FILE_TOO_LARGE`          | Larger than `MAX_UPLOAD_MB`.                                           |
| 415    | `UNSUPPORTED_FILE_TYPE`   | Not `application/pdf`, doesn't start with `%PDF-`, or can't be parsed. |
| 422    | `PDF_NO_TEXT_LAYER`       | No selectable text (a scan). The document is kept as `failed`.         |
| 502    | `AI_PROVIDER_UNAVAILABLE` | Voyage AI failed after retries. The document is kept as `failed`.      |

### `GET /documents` and `GET /documents/:id`

Query (`ListDocumentsQuery`): `limit` 1–100 (default 20), `offset` >= 0 (default 0). Newest first.
`chunkCount` counts stored excerpts; `hasFile` is false for documents uploaded before the original
PDF was kept; `uploadedBy` is null when the user was deleted; `error` is a
user-facing reason for `failed` documents.

```json
{ "items": [{ "id": "…", "filename": "msa.pdf", "status": "ready", "…": "…" }], "total": 1 }
```

`GET /documents/:id` returns one `Document` or 404 `DOCUMENT_NOT_FOUND`. A non-UUID id is 400
`VALIDATION_FAILED`.

### `GET /documents/:id/file`

The original PDF as uploaded, for the browser's PDF viewer: `Content-Type: application/pdf`,
`Content-Disposition: inline` with the filename (ASCII fallback plus `filename*` in UTF-8),
`Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. 404 `DOCUMENT_NOT_FOUND`
when the document is missing, in another organization, or has no stored file (`hasFile: false`).

```sh
curl -s -H "Authorization: Bearer $TOKEN" -o msa.pdf \
  https://api.example.com/documents/0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d/file
```

### `DELETE /documents/:id`

Deletes the document, its excerpts and its stored PDF. 204 on success; 404 `DOCUMENT_NOT_FOUND`; 403 `FORBIDDEN`
for a member deleting someone else's document.

### `POST /analysis/ask`

Request (`AskRequest`): `documentId` (UUID) and `question` (trimmed, 1–2000 characters).

```sh
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"documentId":"0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d","question":"What is the term?"}' \
  https://api.example.com/analysis/ask
```

Response (`AskResponse`):

```json
{
  "answer": "The initial term is 24 months [chunk 1, p. 3].",
  "truncated": false,
  "sources": [
    {
      "ref": 1,
      "chunkId": "7f3c2a10-9b1d-4e6f-8a2c-1d5e9f0b3a7c",
      "pageStart": 3,
      "pageEnd": 3,
      "content": "1. Term. The initial term of this Agreement is 24 months…",
      "similarity": 0.83
    }
  ]
}
```

- `ref` is the number citations use (`[chunk N, p. X]`); sources are in retrieval order.
- `truncated` is true when the answer hit the output limit.
- When the excerpts don't contain the answer, `answer` is exactly
  `The retrieved excerpts of this document do not contain this information.`

Errors: 404 `DOCUMENT_NOT_FOUND`, 409 `DOCUMENT_NOT_READY` (still processing or failed), 400
`VALIDATION_FAILED`, 429 `RATE_LIMITED`, 502 `AI_PROVIDER_UNAVAILABLE`.

### `POST /analysis/compare`

Request (`CompareRequest`): `documentId1`, `documentId2` (two different UUIDs) and `query`
(trimmed, 1–2000 characters). Response (`CompareResponse`): `analysis` (Markdown with Summary,
Differences table and "Only found in…" sections, citing `[A: chunk N, p. X]` / `[B: …]`),
`truncated`, and `sources: { contractA: Source[], contractB: Source[] }`. When neither document's
excerpts address the query, `analysis` is exactly
`The retrieved excerpts of these documents do not contain this information.`

Errors as for ask; a missing document is reported as 404 even if the other one isn't ready.

### `GET /audit-events`

Query (`ListAuditEventsQuery`): `limit`, `offset`, optional `action` (one of the audit actions).
Owners and admins only. Response:

```json
{
  "items": [
    {
      "id": "…",
      "action": "analysis.ask",
      "actor": { "id": "xYz123", "name": "Ada Lovelace" },
      "targetType": "document",
      "targetId": "0b6e8d1e-5a43-4b8e-9d0e-6c1f8a2b9c3d",
      "requestId": "3f2b9c1e-7a4d-4e8b-9c0d-1e2f3a4b5c6d",
      "metadata": { "sourceCount": 5, "truncated": false, "durationMs": 4210 },
      "createdAt": "2026-01-15T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

The actions are listed on [Authentication and authorization](Authentication-and-Authorization#audit-log).

### Health

`GET /health` answers without touching dependencies (liveness). `GET /health/ready` runs `select 1`
with a 2-second limit (readiness, used by healthchecks). Both are public, never rate-limited and
not traced.

## Errors

Every error response has the same body (`ApiErrorBody`):

```json
{
  "statusCode": 404,
  "message": "Document not found",
  "error": "Not Found",
  "errorCode": "DOCUMENT_NOT_FOUND"
}
```

`message` is a list of issues for validation errors. Map errors by `errorCode` first and status
second. Unexpected failures are 500 with a generic message and no details.

| `errorCode`               | Status | Meaning                                                    | Message shown in the web app                                         |
| ------------------------- | ------ | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `DOCUMENT_NOT_FOUND`      | 404    | No such document in your organization.                     | Document not found.                                                  |
| `DOCUMENT_NOT_READY`      | 409    | The document is still processing (or failed).              | This document is still processing.                                   |
| `FILE_REQUIRED`           | 400    | No file in the upload.                                     | Choose a PDF file to upload.                                         |
| `FILE_TOO_LARGE`          | 413    | The file exceeds `MAX_UPLOAD_MB`.                          | File exceeds {N} MB.                                                 |
| `UNSUPPORTED_FILE_TYPE`   | 415    | Not a readable PDF.                                        | Only PDF files are supported.                                        |
| `PDF_NO_TEXT_LAYER`       | 422    | The PDF has no text layer (a scan).                        | This PDF has no selectable text; scanned documents aren't supported. |
| `AI_PROVIDER_UNAVAILABLE` | 502    | Anthropic or Voyage AI failed or refused.                  | The AI service is temporarily unavailable. Try again.                |
| `VALIDATION_FAILED`       | 400    | The request didn't match its schema.                       | Check the highlighted fields and try again.                          |
| `ORIGIN_NOT_ALLOWED`      | 403    | A browser request from an origin that isn't allowed.       | This request was blocked by the site's security policy.              |
| `UNAUTHENTICATED`         | 401    | Missing or invalid token (or, in the web app, no session). | (redirects to sign-in)                                               |
| `FORBIDDEN`               | 403    | Not a member, or the role lacks the permission.            | You don't have permission to do this.                                |
| `NO_ACTIVE_ORGANIZATION`  | 403    | The session has no active organization.                    | (redirects to onboarding)                                            |
| `RATE_LIMITED`            | 429    | Per-user rate limit exceeded; see `Retry-After`.           | Too many requests. Try again in {N} seconds.                         |

## Rate limits

Limits are per user (from the token), not per IP:

| Budget   | Endpoints               | Default                                          |
| -------- | ----------------------- | ------------------------------------------------ |
| analysis | ask and compare, shared | `RATE_LIMIT_ANALYSIS_PER_MINUTE` = 30 per minute |
| uploads  | upload                  | `RATE_LIMIT_UPLOADS_PER_HOUR` = 20 per hour      |

Exceeding one returns 429 `RATE_LIMITED` with `Retry-After` (seconds). Counters live in the API's
memory, which is correct for the single API instance; running several instances would need shared
storage.

## Request ids

Every request has an `x-request-id`. Send a UUID to choose it (the web proxy does); otherwise the
API generates one. It is returned on every response, errors included, becomes the NestJS Observe
trace id, and is stored on audit events. The web app shows it as "Reference: …" with errors; see
[Observability](Observability#finding-a-trace-from-a-reference-id).

## CORS and origins

CORS is off by default: the web app calls the API server-to-server and needs none. It exists only
for trusted browser apps on other origins that call an exposed API directly.

- `CORS_ORIGINS` lists exact origins. Allowed origins get `Access-Control-Allow-Origin`, methods
  `GET, POST, DELETE`, headers `authorization, content-type, accept, x-request-id`, exposed
  `x-request-id`, no credentials (bearer tokens only), `max-age` 600 and `Vary: Origin`.
- **Any request whose `Origin` isn't allowed is rejected with 403 `ORIGIN_NOT_ALLOWED`**, preflight
  or not; with CORS off, that means every request carrying an `Origin`. Requests without `Origin`
  (servers, curl, health checks) are unaffected. CORS alone wouldn't stop a cross-site form POST,
  which needs no preflight; the origin check does.
- Never add the web app's own origin to `CORS_ORIGINS`; it doesn't need it.

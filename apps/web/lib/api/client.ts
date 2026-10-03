import type { z } from 'zod';

import {
  AskResponseSchema,
  AuditEventListResponseSchema,
  CompareResponseSchema,
  DocumentListResponseSchema,
  DocumentSchema,
  REQUEST_ID_HEADER,
  type AskRequest,
  type AskResponse,
  type AuditEventListResponse,
  type CompareRequest,
  type CompareResponse,
  type Document,
  type DocumentListResponse,
  type ListAuditEventsQuery,
  type ListDocumentsQuery,
} from '@repo/contracts';

import { networkError, toApiError } from './errors';

/** Every call goes through the same-origin proxy; the browser never calls the API directly. */
const BASE = '/api/backend';

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Performs a proxied call and throws an ApiError for any non-OK response. */
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set(REQUEST_ID_HEADER, requestId);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw networkError(requestId);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw toApiError(response.status, body, response.headers);
  }
  return response;
}

/** A call whose JSON response is validated against its contract schema. */
async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await call(path, init);
  return schema.parse(await response.json());
}

export function listDocuments(
  query: ListDocumentsQuery,
  signal?: AbortSignal,
): Promise<DocumentListResponse> {
  return request(`/documents${queryString(query)}`, DocumentListResponseSchema, { signal });
}

export function getDocument(id: string, signal?: AbortSignal): Promise<Document> {
  return request(`/documents/${encodeURIComponent(id)}`, DocumentSchema, { signal });
}

/**
 * The original PDF through the proxy, for links and the embedded viewer. `#page=` is read by the
 * browser's PDF viewer, never sent to the server.
 */
export function documentFileUrl(id: string, page?: number): string {
  return `${BASE}/documents/${encodeURIComponent(id)}/file${page ? `#page=${page}` : ''}`;
}

export async function deleteDocument(id: string): Promise<void> {
  await call(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function ask(body: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  return request('/analysis/ask', AskResponseSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function compare(body: CompareRequest, signal?: AbortSignal): Promise<CompareResponse> {
  return request('/analysis/compare', CompareResponseSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function listAuditEvents(
  query: ListAuditEventsQuery,
  signal?: AbortSignal,
): Promise<AuditEventListResponse> {
  return request(`/audit-events${queryString(query)}`, AuditEventListResponseSchema, { signal });
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Uploads a PDF with XMLHttpRequest rather than fetch, because fetch can't report upload
 * progress. Resolves once the API has finished processing (extracting, chunking, embedding).
 */
export function uploadDocument(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<Document> {
  const requestId = crypto.randomUUID();
  return new Promise<Document>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/documents/upload`);
    xhr.responseType = 'json';
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader(REQUEST_ID_HEADER, requestId);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.({ loaded: event.loaded, total: event.total });
    });
    xhr.addEventListener('load', () => {
      const headers = { get: (name: string) => xhr.getResponseHeader(name) };
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = DocumentSchema.safeParse(xhr.response);
        if (parsed.success) resolve(parsed.data);
        else reject(toApiError(500, null, headers));
      } else {
        reject(toApiError(xhr.status, xhr.response, headers));
      }
    });
    xhr.addEventListener('error', () => reject(networkError(requestId)));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

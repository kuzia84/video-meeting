// Shared fetch wrapper for apps/web API clients (see apps/web/src/lib/api/auth.ts
// for the first consumer). Centralizes: base URL resolution, JSON parsing
// (guarded against non-JSON bodies), and normalizing the API's two error
// shapes into a single ApiError — so new endpoint files don't re-derive this.

import type { PaginatedResponse } from '@video-meetings/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly messages: string[],
    public readonly field?: string,
  ) {
    super(messages.join(', '));
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** For callers that cannot go through `fetch` at all — see `uploadMeetingFile`, which
 *  needs XMLHttpRequest for upload progress. Base-URL resolution stays owned here. */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

interface ErrorBody {
  message?: string | string[];
  field?: string;
}

interface SuccessBody {
  data?: unknown;
}

/**
 * Turns an API error response into an ApiError, normalizing the two shapes the API
 * produces: a `string[]` from ValidationPipe 400s and a plain `string` from hand-thrown
 * exceptions. The one place that knows this mapping — every transport (fetch, blob,
 * XHR) funnels through it so a 401 means the same thing whichever one made the call.
 */
export function apiErrorFrom(status: number, body: unknown, fallback: string): ApiError {
  const errorBody = (body ?? {}) as ErrorBody;
  const raw = errorBody.message;
  const messages = Array.isArray(raw) ? raw : raw ? [raw] : [fallback];
  return new ApiError(status, messages, errorBody.field);
}

/**
 * The one place a request leaves this app: resolves the URL and turns a dead connection
 * into a message a person can read. Every transport below builds on it — the alternative
 * was each re-deriving both, which is how three copies of this preamble accumulated one
 * endpoint kind at a time.
 *
 * Returns the raw Response: what to do with a body is the caller's business, and that is
 * the only thing the transports actually differ in.
 */
async function send(path: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(apiUrl(path), options);
  } catch {
    throw new Error('Не удалось подключиться к серверу. Попробуйте ещё раз.');
  }
}

/** Parses an error body that may not be JSON at all (a proxy's HTML 502, an empty body). */
export function apiErrorFromText(status: number, text: string, fallback: string): ApiError {
  try {
    return apiErrorFrom(status, JSON.parse(text), fallback);
  } catch {
    return new ApiError(status, [fallback]);
  }
}

// Core request: performs the fetch, guards JSON parsing, and throws ApiError on
// a non-2xx response. Returns the raw success envelope (unknown) so callers can
// pull just `data` (fetchJson) or the full paginated envelope (fetchPaginated).
async function request(path: string, options?: RequestInit): Promise<unknown> {

  const res = await send(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }

  if (!res.ok) {
    throw apiErrorFrom(res.status, body, 'Unknown error');
  }

  return body;
}

export async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const body = (await request(path, options)) as SuccessBody;
  if (body.data === undefined) {
    throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }
  return body.data as T;
}

// Like fetchJson, but for the API's paginated endpoints — returns the whole
// envelope (`data: T[]` plus `total`/`page`/`limit`) so callers can drive
// server-side pagination rather than assuming everything fits in one response.
/**
 * Like fetchJson, but for endpoints that answer with bytes instead of an envelope —
 * file downloads. Shares this module's base-URL resolution and ApiError normalization,
 * so a 401 on a download is the same recognizable error as a 401 anywhere else, rather
 * than an anonymous "request failed" invented at the call site.
 *
 * It cannot go through `request()`: that one always parses the body as JSON, which is
 * exactly what must not happen to a 100 MB recording.
 */
export async function fetchBlob(path: string, options?: RequestInit): Promise<Blob> {
  const res = await send(path, options);

  if (!res.ok) {
    // Errors stay JSON even on this route; a non-JSON body falls back to the message.
    throw apiErrorFromText(
      res.status,
      await res.text(),
      'Не удалось скачать файл. Попробуйте ещё раз.',
    );
  }

  return res.blob();
}

/**
 * For endpoints that answer 204: there is no body to parse, and `request()` would choke
 * trying. Errors still come back as the same ApiError as everywhere else.
 */
export async function fetchVoid(path: string, options?: RequestInit): Promise<void> {
  const res = await send(path, options);
  if (!res.ok) {
    throw apiErrorFromText(res.status, await res.text(), 'Не удалось выполнить запрос.');
  }
}

export async function fetchPaginated<T>(
  path: string,
  options?: RequestInit,
): Promise<PaginatedResponse<T>> {
  const body = (await request(path, options)) as Partial<PaginatedResponse<T>>;
  if (!Array.isArray(body.data) || typeof body.total !== 'number') {
    throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }
  return body as PaginatedResponse<T>;
}

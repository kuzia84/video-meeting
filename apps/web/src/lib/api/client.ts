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

interface ErrorBody {
  message?: string | string[];
  field?: string;
}

interface SuccessBody {
  data?: unknown;
}

// Core request: performs the fetch, guards JSON parsing, and throws ApiError on
// a non-2xx response. Returns the raw success envelope (unknown) so callers can
// pull just `data` (fetchJson) or the full paginated envelope (fetchPaginated).
async function request(path: string, options?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Не удалось подключиться к серверу. Попробуйте ещё раз.');
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }

  if (!res.ok) {
    const errorBody = body as ErrorBody;
    const messages = Array.isArray(errorBody.message)
      ? errorBody.message
      : [errorBody.message ?? 'Unknown error'];
    throw new ApiError(res.status, messages, errorBody.field);
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
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, options);
  } catch {
    throw new Error('Не удалось подключиться к серверу. Попробуйте ещё раз.');
  }

  if (!res.ok) {
    // Errors stay JSON even on this route, so the shape below matches every other call.
    let messages = ['Не удалось скачать файл. Попробуйте ещё раз.'];
    try {
      const body = (await res.json()) as ErrorBody;
      if (body.message) {
        messages = Array.isArray(body.message) ? body.message : [body.message];
      }
    } catch {
      // Non-JSON error body: keep the fallback above rather than throwing over it.
    }
    throw new ApiError(res.status, messages);
  }

  return res.blob();
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

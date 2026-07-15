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

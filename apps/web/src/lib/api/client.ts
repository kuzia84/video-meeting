// Shared fetch wrapper for apps/web API clients (see apps/web/src/lib/api/auth.ts
// for the first consumer). Centralizes: base URL resolution, JSON parsing
// (guarded against non-JSON bodies), and normalizing the API's two error
// shapes into a single ApiError — so new endpoint files don't re-derive this.

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

export async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
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

  const successBody = body as SuccessBody;
  if (successBody.data === undefined) {
    throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }
  return successBody.data as T;
}

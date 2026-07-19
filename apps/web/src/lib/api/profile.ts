import type { UserProfile } from '@video-meetings/shared';
import { fetchJson } from './client';
import { getAccessToken } from '@/lib/auth/token';

export { ApiError } from './client';
export type { UserProfile };

// GET /users/me is JWT-protected: the guard requires an `Authorization: Bearer
// <token>` header. Mirrors authHeaders() in meetings.ts — a missing token still
// sends the request (the API answers 401, which the caller turns into a
// redirect to login) rather than silently doing nothing.
function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function assertProfile(data: Partial<UserProfile>): asserts data is UserProfile {
  if (!data.id || !data.email) {
    throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }
}

export async function getProfile(): Promise<UserProfile> {
  const data = await fetchJson<Partial<UserProfile>>('/users/me', {
    method: 'GET',
    headers: authHeaders(),
  });
  assertProfile(data);
  return data;
}

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

/** Auth header without Content-Type — for multipart, where the browser must set the
 *  boundary itself (setting Content-Type by hand produces a body the server can't parse). */
function authHeadersNoContentType(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

// PATCH /users/me — edit the current user's name. Same JWT header as getProfile;
// returns the updated profile so the caller can refresh name + avatar letter
// without a reload. The API validates the name (1..100, trimmed) and answers 400
// with the reason, which surfaces as an ApiError.
export async function updateProfileName(name: string): Promise<UserProfile> {
  const data = await fetchJson<Partial<UserProfile>>('/users/me', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  assertProfile(data);
  return data;
}

// POST /users/me/avatar — upload a new avatar image (multipart). Returns the updated
// profile (its avatarUrl now set). The API validates format/size/content and answers
// with the reason verbatim on rejection, which surfaces as an ApiError.
export async function uploadAvatar(file: File): Promise<UserProfile> {
  const form = new FormData();
  form.append('avatar', file);
  const data = await fetchJson<Partial<UserProfile>>('/users/me/avatar', {
    method: 'POST',
    headers: authHeadersNoContentType(),
    body: form,
  });
  assertProfile(data);
  return data;
}

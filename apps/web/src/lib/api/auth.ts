import type { AuthResult } from '@video-meetings/shared';
import { fetchJson } from './client';

export { ApiError } from './client';

function assertAuthResult(data: Partial<AuthResult>): asserts data is AuthResult {
  if (!data.accessToken || !data.user?.id || !data.user?.email) {
    throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }
}

export async function registerUser(email: string, password: string): Promise<AuthResult> {
  const data = await fetchJson<Partial<AuthResult>>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assertAuthResult(data);
  return data;
}

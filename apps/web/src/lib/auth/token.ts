const ACCESS_TOKEN_KEY = 'accessToken';

// Session storage (not localStorage): the token is scoped to the current
// browser tab and cleared when it's closed, rather than persisting
// indefinitely across sessions.
export class StorageError extends Error {}

export function saveAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    throw new StorageError(
      'Не удалось сохранить сессию в этом браузере (возможно, включён приватный режим).',
    );
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

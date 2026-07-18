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

export function removeAccessToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Nothing to do — if storage is unavailable there is no persisted token
    // to remove, and logout still proceeds (the in-memory app state resets).
  }
}

// The JWT payload is `{ sub, email }` (signed by the API's TokenService). The
// home view reads it to greet the user by email without a round-trip — the
// profile page fetches GET /users/me instead. This is not a security check: the
// token is still what the API validates. Returns null if the token is
// missing/malformed.
export function getUserEmailFromToken(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // atob yields a Latin1 byte-string; decode those bytes as UTF-8 so a
    // non-ASCII email (class-validator's @IsEmail allows UTF-8 local parts by
    // default, e.g. "иван@example.com") isn't mangled into mojibake.
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes)) as { email?: unknown };
    return typeof json.email === 'string' ? json.email : null;
  } catch {
    return null;
  }
}

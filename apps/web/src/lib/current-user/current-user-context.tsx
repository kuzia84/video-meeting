'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, getProfile, type UserProfile } from '@/lib/api/profile';
import { getAccessToken } from '@/lib/auth/token';

export type CurrentUserStatus = 'loading' | 'ready' | 'error' | 'unauthenticated';

interface CurrentUserContextValue {
  user: UserProfile | null;
  status: CurrentUserStatus;
  errorMessage: string | null;
  /** Re-run the fetch — for a retry after an error. */
  reload: () => void;
  /** Replace the cached user (e.g. after a rename) so every consumer updates at once. */
  setUser: (user: UserProfile) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

/**
 * The single source of the signed-in user in the frontend. Both the header and the
 * profile page read from here, so a rename on the profile page (`setUser`) updates the
 * card avatar **and** the header chip at once, with no reload — which is the whole point
 * of this provider. It also collapses what used to be two independent `GET /users/me`
 * calls (header + profile page) into one.
 *
 * Placed at the app root, it stays mounted across client navigations. It reconciles on
 * every route change: it (re)fetches when the token first appears (e.g. right after
 * login, which is a client `router.push`, not a reload) and clears to `unauthenticated`
 * when it is gone (logout) — so no auth code has to poke it. A `401` also lands on
 * `unauthenticated`; pages decide what to do with that (the profile page clears the dead
 * token and redirects), the provider does not redirect on anyone's behalf.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<CurrentUserStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The auth state (token value or null) the effect last acted on. Guards against
  // re-fetching the same token on every navigation, and — because it survives Strict
  // Mode's mount→unmount→remount on the same instance — against a duplicate initial
  // fetch. `undefined` means "never handled yet" (also reset to that on an error, so a
  // later navigation retries a transient failure rather than the chip staying gone).
  const handledTokenRef = useRef<string | null | undefined>(undefined);
  // Bumped on every load/reload; a resolving fetch commits its result only if it is
  // still the latest. Without it, a logout (or any auth change) mid-fetch would let the
  // stale in-flight `getProfile()` overwrite the fresh state with an authenticated user.
  const requestIdRef = useRef(0);

  const load = useCallback(async (token: string | null) => {
    const requestId = (requestIdRef.current += 1);
    const isCurrent = () => requestId === requestIdRef.current;

    if (!token) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    setStatus('loading');
    setErrorMessage(null);
    try {
      const profile = await getProfile();
      if (!isCurrent()) return;
      setUser(profile);
      setStatus('ready');
    } catch (err) {
      if (!isCurrent()) return;
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setStatus('unauthenticated');
        return;
      }
      // Let a later navigation reconcile again — don't leave this token "handled".
      handledTokenRef.current = undefined;
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить профиль.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    // Same auth state as last time (a navigation that didn't log in or out): keep the
    // cached user rather than re-fetching it.
    if (handledTokenRef.current === token) return;
    handledTokenRef.current = token;
    void load(token);
  }, [pathname, load]);

  const reload = useCallback(() => {
    const token = getAccessToken();
    handledTokenRef.current = token;
    void load(token);
  }, [load]);

  return (
    <CurrentUserContext.Provider value={{ user, status, errorMessage, reload, setUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserContextValue {
  const context = useContext(CurrentUserContext);
  if (!context) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  return context;
}

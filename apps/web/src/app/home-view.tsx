'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { ApiError, listMeetings, MEETINGS_PAGE_SIZE, type Meeting } from '@/lib/api/meetings';
import { getAccessToken, getUserEmailFromToken, removeAccessToken } from '@/lib/auth/token';
import { CreateMeetingLink } from './create-meeting-link';
import { MeetingCard } from './meeting-card';
import { MeetingsEmptyState } from './meetings-empty-state';
import { MeetingsPagination } from './meetings-pagination';

type Status = 'loading' | 'ready' | 'error';

// Russian noun agreement for "встреча" (1 встреча, 2 встречи, 5 встреч).
function meetingsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'встреча';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'встречи';
  return 'встреч';
}

export function HomeView() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [page, setPage] = useState(1);
  const [isPaging, setIsPaging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // React 18 Strict Mode runs effects twice in dev; guard the one-time
  // auth check so it doesn't fire (and redirect) twice.
  const startedRef = useRef(false);

  // Clicking through pages fast leaves several requests in flight, and they can resolve
  // out of order. Only the newest one may touch state, or the user ends up on a page
  // they did not ask for last.
  const requestIdRef = useRef(0);

  const loadPage = useCallback(
    async (nextPage: number) => {
      const requestId = ++requestIdRef.current;
      setErrorMessage(null);
      setIsPaging(true);

      try {
        const result = await listMeetings(nextPage);
        if (requestId !== requestIdRef.current) return;
        setMeetings(result.meetings);
        setTotal(result.total);
        setPage(result.page);
        setStatus('ready');
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        // Expired/invalid token → the guard returns 401. Drop the dead token
        // and send the user back to login rather than showing an error.
        if (err instanceof ApiError && err.status === 401) {
          removeAccessToken();
          router.replace('/login');
          return;
        }
        setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить встречи.');
        // Only the first load has nothing to fall back on. A later failure keeps the
        // page already on screen — tearing the list and its pagination down would
        // strand the user with no way back but a reload.
        setStatus((prev) => (prev === 'loading' ? 'error' : prev));
      } finally {
        if (requestId === requestIdRef.current) setIsPaging(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Client-side route protection: the token lives in sessionStorage, invisible
    // to the server/middleware, so gate here. No token → straight to login.
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setEmail(getUserEmailFromToken());
    void loadPage(1);
  }, [router, loadPage]);

  const pageCount = Math.max(1, Math.ceil(total / MEETINGS_PAGE_SIZE));
  // The empty state carries its own invitation, so the page-level CTA stands down while
  // it is on screen: two identical primary buttons would compete for the same click.
  // On an error there is no empty state, so the CTA stays — otherwise a failed load
  // would leave the user with no way forward at all.
  const showsEmptyState = status !== 'error' && meetings.length === 0;

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
        <section className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Здравствуйте{email ? `, ${email}` : ''}
          </h1>
          <p className="text-muted">
            У вас {total} {meetingsWord(total)}
          </p>
        </section>

        {showsEmptyState ? null : (
          <div className="self-start">
            <CreateMeetingLink size="lg">Создать встречу</CreateMeetingLink>
          </div>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Ваши встречи</h2>

          {status === 'error' ? (
            <p className="text-danger text-sm">{errorMessage}</p>
          ) : showsEmptyState ? (
            <MeetingsEmptyState />
          ) : (
            <>
              {/* Named because the pagination below is a list of <li> too — without this
                  the two are indistinguishable to assistive tech and to tests. */}
              <ul
                aria-label="Список встреч"
                aria-busy={isPaging}
                className={`flex flex-col gap-3 transition-opacity ${isPaging ? 'opacity-60' : ''}`}
              >
                {meetings.map((meeting) => (
                  <li key={meeting.id}>
                    <MeetingCard meeting={meeting} />
                  </li>
                ))}
              </ul>

              {/* A failure here is not fatal: the list above is still the last good page,
                  so report it beside the pagination and let the user try again. */}
              {errorMessage ? (
                <p className="text-danger text-center text-sm" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              {pageCount > 1 ? (
                <MeetingsPagination
                  page={page}
                  pageCount={pageCount}
                  isPaging={isPaging}
                  onPage={(next) => void loadPage(next)}
                />
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

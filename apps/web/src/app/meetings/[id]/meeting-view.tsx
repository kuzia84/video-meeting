'use client';

import { Button, buttonVariants } from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { ApiError, getMeeting, updateMeeting, type Meeting } from '@/lib/api/meetings';
import { getAccessToken, removeAccessToken } from '@/lib/auth/token';
import { MeetingForm } from '../meeting-form';
import { MeetingFiles } from './meeting-files';

// 'missing' is its own state, not an error: a meeting that is not there is a normal
// answer to a guessed or stale link, and reads very differently from a failed request.
type Status = 'loading' | 'ready' | 'missing' | 'error';

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
        {children}
      </main>
    </div>
  );
}

export function MeetingView({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditing, setEditing] = useState(false);

  // React Strict Mode runs effects twice in dev; guard the one-time auth check so it
  // doesn't fire (and redirect) twice.
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      setMeeting(await getMeeting(meetingId));
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Expired or invalid token: drop it and send the user to log in again.
        removeAccessToken();
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setStatus('missing');
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить встречу.');
      setStatus('error');
    }
  }, [router, meetingId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Client-side route protection, same as the home page: the token lives in
    // sessionStorage, invisible to the server, so there is no middleware to do this.
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [router, load]);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  if (status === 'missing') {
    return (
      <Shell>
        <section className="flex flex-col items-center gap-3 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Встреча не найдена</h1>
          <p className="text-muted max-w-sm text-sm text-balance">
            Возможно, её удалили, или ссылка ведёт на чужую встречу.
          </p>
          {/* buttonVariants, not <Button render={…}>: Button is a React Aria button and
              warns at runtime when its render function returns an <a>. See home-view. */}
          <NextLink className={buttonVariants({ variant: 'outline' })} href="/">
            К списку встреч
          </NextLink>
        </section>
      </Shell>
    );
  }

  // `!meeting` cannot happen while status is 'ready', but it must not be able to render
  // an empty alert if it ever does — hence the fallback text rather than a bare
  // `{errorMessage}`.
  if (status === 'error' || !meeting) {
    return (
      <Shell>
        <section className="flex flex-col items-center gap-3 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Не удалось загрузить встречу</h1>
          <p className="text-danger max-w-sm text-sm text-balance" role="alert">
            {errorMessage ?? 'Попробуйте ещё раз.'}
          </p>
          {/* Retries the request, not the whole document: no reason to re-boot the app. */}
          <Button onPress={() => void load()}>Попробовать снова</Button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <nav aria-label="Назад">
        <NextLink href="/" className="text-muted hover:text-foreground text-sm">
          ← К списку встреч
        </NextLink>
      </nav>

      {isEditing ? (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Редактирование встречи</h1>
          <MeetingForm
            // Pre-filled with what is on screen, so the form starts from the truth.
            initial={meeting}
            submitLabel="Сохранить"
            pendingLabel="Сохранение…"
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              try {
                // The response is the updated row, so the page can show it without a
                // second request.
                setMeeting(await updateMeeting(meeting.id, values));
                setEditing(false);
              } catch (err) {
                if (err instanceof ApiError && err.status === 401) {
                  removeAccessToken();
                  router.replace('/login');
                  return;
                }
                // Rethrown so the form reports it above the fields.
                throw err;
              }
            }}
          />
        </section>
      ) : (
        <article className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
              <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
                Редактировать
              </Button>
            </div>
            <p className="text-muted text-sm">
              <time dateTime={meeting.startTime}>
                {dateTimeFormatter.format(new Date(meeting.startTime))}
              </time>
              {' — '}
              <time dateTime={meeting.endTime}>
                {dateTimeFormatter.format(new Date(meeting.endTime))}
              </time>
            </p>
          </header>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Описание</h2>
            {meeting.description ? (
              <p className="whitespace-pre-wrap">{meeting.description}</p>
            ) : (
              <p className="text-muted text-sm">Описание не указано</p>
            )}
          </section>
        </article>
      )}

      {/* Rendered only once the meeting itself resolved: on a 404 there is no meeting to
          hang files off, and asking for its files would just be a second 404. */}
      <MeetingFiles meetingId={meeting.id} />
    </Shell>
  );
}

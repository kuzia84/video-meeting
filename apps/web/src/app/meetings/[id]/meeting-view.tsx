'use client';

import { Button, buttonVariants } from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/logo';
import { ApiError, getMeeting, type Meeting } from '@/lib/api/meetings';
import { getAccessToken, removeAccessToken } from '@/lib/auth/token';

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
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 p-4">
          <NextLink href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="size-7" />
            MeetingBrain
          </NextLink>
        </div>
      </header>
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

  // React Strict Mode runs effects twice in dev; guard the one-time auth check so it
  // doesn't fire (and redirect) twice.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Client-side route protection, same as the home page: the token lives in
    // sessionStorage, invisible to the server, so there is no middleware to do this.
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    getMeeting(meetingId)
      .then((data) => {
        setMeeting(data);
        setStatus('ready');
      })
      .catch((err) => {
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
      });
  }, [router, meetingId]);

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

  if (status === 'error' || !meeting) {
    return (
      <Shell>
        <section className="flex flex-col items-center gap-3 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Не удалось загрузить встречу</h1>
          <p className="text-danger max-w-sm text-sm text-balance" role="alert">
            {errorMessage}
          </p>
          <Button onPress={() => window.location.reload()}>Попробовать снова</Button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <nav aria-label="Хлебные крошки">
        <NextLink href="/" className="text-muted hover:text-foreground text-sm">
          ← К списку встреч
        </NextLink>
      </nav>

      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
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
    </Shell>
  );
}

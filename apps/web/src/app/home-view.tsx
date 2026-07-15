'use client';

import { Button, Card } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/logo';
import { ApiError, getRecentMeetings, type Meeting } from '@/lib/api/meetings';
import { getAccessToken, getUserEmailFromToken, removeAccessToken } from '@/lib/auth/token';

type Status = 'loading' | 'ready' | 'error';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

// Russian noun agreement for "встреча" (1 встреча, 2 встречи, 5 встреч).
function meetingsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'встреча';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'встречи';
  return 'встреч';
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

export function HomeView() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<Meeting[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // React 18 Strict Mode runs effects twice in dev; guard the one-time
  // auth check + fetch so it doesn't fire (and redirect) twice.
  const startedRef = useRef(false);

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

    getRecentMeetings()
      .then(({ total: t, recent: r }) => {
        setTotal(t);
        setRecent(r);
        setStatus('ready');
      })
      .catch((err) => {
        // Expired/invalid token → the guard returns 401. Drop the dead token
        // and send the user back to login rather than showing an error.
        if (err instanceof ApiError && err.status === 401) {
          removeAccessToken();
          router.replace('/login');
          return;
        }
        setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить встречи.');
        setStatus('error');
      });
  }, [router]);

  function handleLogout() {
    removeAccessToken();
    router.replace('/login');
  }

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 p-4">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="size-7" />
            MeetingBrain
          </span>
          <Button variant="outline" size="sm" onPress={handleLogout}>
            Выйти
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
        <section className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Здравствуйте{email ? `, ${email}` : ''}
          </h1>
          <p className="text-muted">
            У вас {total} {meetingsWord(total)}
          </p>
        </section>

        {/* Creating meetings is done via the API only (out of scope here), so
            this primary CTA is present as the obvious next action but has no
            client flow wired to it yet. */}
        <Button size="lg" className="self-start">
          Создать встречу
        </Button>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Последние встречи</h2>

          {status === 'error' ? (
            <p className="text-danger text-sm">{errorMessage}</p>
          ) : recent.length === 0 ? (
            <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
              <CalendarIcon className="text-muted size-12" />
              <p className="font-medium">Встреч пока нет</p>
              <p className="text-muted max-w-xs text-sm text-balance">
                Здесь появятся ваши встречи, как только они будут созданы.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {recent.map((meeting) => (
                <li key={meeting.id}>
                  <Card>
                    <Card.Header>
                      <Card.Title>{meeting.title}</Card.Title>
                      <Card.Description>
                        {dateFormatter.format(new Date(meeting.startTime))} —{' '}
                        {dateFormatter.format(new Date(meeting.endTime))}
                      </Card.Description>
                    </Card.Header>
                    {meeting.description ? (
                      <Card.Content>
                        <p className="text-muted text-sm">{meeting.description}</p>
                      </Card.Content>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

'use client';

import { Button, buttonVariants } from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import {
  ApiError,
  deleteMeeting,
  getMeeting,
  updateMeeting,
  type Meeting,
} from '@/lib/api/meetings';
import { getAccessToken, removeAccessToken } from '@/lib/auth/token';
import { MeetingForm, type MeetingFormValues } from '@/components/meeting-form';
import { MeetingDetails } from './meeting-details';
import { MeetingFiles } from './meeting-files';

// 'missing' is its own state, not an error: a meeting that is not there is a normal
// answer to a guessed or stale link, and reads very differently from a failed request.
type Status = 'loading' | 'ready' | 'missing' | 'error';

export function MeetingView({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  // Focus is on the Редактировать button when it unmounts, so it must be put back by
  // hand — otherwise it falls to <body> and the user restarts from the top of the page.
  const editButtonRef = useRef<HTMLButtonElement>(null);

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

  /** Saves the edited fields; a 401 bounces to login, anything else is left to the form. */
  async function handleUpdate(values: MeetingFormValues): Promise<void> {
    if (!meeting) return;
    try {
      // The response is the updated row, so the page can show it without a second request.
      setMeeting(await updateMeeting(meeting.id, values));
      setEditing(false);
      // Otherwise a save and a cancel look identical: the form just disappears.
      setSavedNotice(true);
      requestAnimationFrame(() => editButtonRef.current?.focus());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        removeAccessToken();
        router.replace('/login');
        return;
      }
      // Rethrown so the form reports it above the fields.
      throw err;
    }
  }

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  if (status === 'missing') {
    return (
      <PageShell>
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
      </PageShell>
    );
  }

  // `!meeting` cannot happen while status is 'ready', but it must not be able to render
  // an empty alert if it ever does — hence the fallback text rather than a bare
  // `{errorMessage}`.
  if (status === 'error' || !meeting) {
    return (
      <PageShell>
        <section className="flex flex-col items-center gap-3 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Не удалось загрузить встречу</h1>
          <p className="text-danger max-w-sm text-sm text-balance" role="alert">
            {errorMessage ?? 'Попробуйте ещё раз.'}
          </p>
          {/* Retries the request, not the whole document: no reason to re-boot the app. */}
          <Button onPress={() => void load()}>Попробовать снова</Button>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
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
            // The form replaces the button that had focus, so it takes focus with it.
            autoFocus
            onCancel={() => {
              setEditing(false);
              // Focus returns where it came from rather than falling to <body>.
              requestAnimationFrame(() => editButtonRef.current?.focus());
            }}
            onSubmit={handleUpdate}
          />
        </section>
      ) : (
        <MeetingDetails
          meeting={meeting}
          editButtonRef={editButtonRef}
          savedNotice={savedNotice}
          onEdit={() => {
            setSavedNotice(false);
            setEditing(true);
          }}
          onDelete={async () => {
            await deleteMeeting(meeting.id);
            // Nothing left to show here, so leave the page rather than render a meeting
            // that no longer exists.
            router.push('/');
          }}
        />
      )}

      {/* Rendered only once the meeting itself resolved: on a 404 there is no meeting to
          hang files off, and asking for its files would just be a second 404. */}
      <MeetingFiles meetingId={meeting.id} />
    </PageShell>
  );
}

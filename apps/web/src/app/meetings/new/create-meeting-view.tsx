'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { ApiError, createMeeting } from '@/lib/api/meetings';
import { getAccessToken, removeAccessToken } from '@/lib/auth/token';
import { MeetingForm } from '@/components/meeting-form';

export function CreateMeetingView() {
  const router = useRouter();
  const [isReady, setReady] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Client-side route protection: the token lives in sessionStorage, invisible to the
    // server, so every protected page gates in a mount effect.
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  // Nothing renders until the token check has run: flashing a form at someone about to
  // be bounced to /login is worse than a blank moment.
  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted text-sm">Загрузка…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Новая встреча</h1>

        <MeetingForm
          submitLabel="Создать встречу"
          pendingLabel="Создание…"
          onCancel={() => router.push('/')}
          onSubmit={async (values) => {
            try {
              const created = await createMeeting(values);
              router.push(`/meetings/${created.id}`);
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
      </main>
    </div>
  );
}

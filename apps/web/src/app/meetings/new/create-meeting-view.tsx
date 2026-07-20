'use client';

import { buttonVariants, ProgressBar } from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { MeetingForm } from '@/components/meeting-form';
import { getAccessToken } from '@/lib/auth/token';
import { useCreateMeeting } from './use-create-meeting';

export function CreateMeetingView() {
  const router = useRouter();
  const [isReady, setReady] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const { upload, partialFailure, createMeetingWithFiles } = useCreateMeeting(files);
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

        {/* The meeting exists; only its files did not all make it. Never a dead end — the
            link is the whole point, since the meeting is already there to open. */}
        {partialFailure ? (
          <div className="border-danger/40 flex flex-col items-start gap-3 rounded-xl border p-4">
            <p className="text-danger text-sm" role="alert">
              Встреча создана, но загрузка прервалась на файле {partialFailure.message}
              {partialFailure.uploaded > 0
                ? ` Загружено файлов: ${partialFailure.uploaded} из ${partialFailure.total}.`
                : ''}
            </p>
            <NextLink
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              href={`/meetings/${partialFailure.meetingId}`}
            >
              Открыть встречу
            </NextLink>
          </div>
        ) : null}

        <MeetingForm
          submitLabel="Создать встречу"
          pendingLabel="Создание…"
          onCancel={() => router.push('/')}
          onSubmit={createMeetingWithFiles}
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="meeting-files">
              Файлы записи
            </label>
            <input
              id="meeting-files"
              type="file"
              multiple
              // Exactly what the API accepts — a wildcard would offer files it refuses.
              accept=".mp3,.wav,.m4a,.mp4,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4,video/mp4"
              className="text-sm"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <p className="text-muted text-xs">
              Необязательно. Файлы загрузятся после создания встречи.
            </p>
          </div>

          {upload ? (
            <ProgressBar
              aria-label="Загрузка файлов"
              // Real bytes, spread across the queue: file 2 of 3 half-sent reads as 50%.
              value={Math.round(((upload.done + upload.fraction) / upload.total) * 100)}
            >
              <ProgressBar.Output />
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          ) : null}
        </MeetingForm>
      </main>
    </div>
  );
}

'use client';

import { Button, buttonVariants, ProgressBar } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadMeetingFile,
  listMeetingFiles,
  uploadMeetingFile,
  type MeetingFile,
} from '@/lib/api/meeting-files';
import { formatFileSize } from './format-file-size';

type Status = 'loading' | 'ready' | 'error';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function FileIcon(props: React.SVGProps<SVGSVGElement>) {
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
      <path d="M14 3v5h5" />
      <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
    </svg>
  );
}

export function MeetingFiles({ meetingId }: { meetingId: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // A Set, not one id: two downloads can be in flight, and a single value would let the
  // first to finish re-enable the other's button while it is still fetching.
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(new Set());

  // null when nothing is uploading; 0..1 while it is. A separate flag would let the two
  // disagree about whether an upload is in progress.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  // Strict Mode runs effects twice in dev; the fetch is idempotent, but the guard keeps
  // the request count honest.
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      setFiles(await listMeetingFiles(meetingId));
      setStatus('ready');
    } catch (err) {
      // A 401/404 is left to the meeting view around this block: it owns the page-level
      // outcome (redirect, "not found"), and two components racing to redirect on the
      // same response would fight.
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить файлы.');
      setStatus('error');
    }
  }, [meetingId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  // Stops an upload in flight when the user leaves: otherwise the browser keeps pushing
  // the whole file for a component that no longer exists, and the file lands anyway.
  useEffect(() => {
    return () => uploadAbortRef.current?.abort();
  }, []);

  function setDownloading(fileId: string, active: boolean) {
    setDownloadingIds((current) => {
      const next = new Set(current);
      if (active) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }

  async function handleDownload(file: MeetingFile) {
    setDownloading(file.id, true);
    setErrorMessage(null);
    try {
      await downloadMeetingFile(file);
    } catch (err) {
      // Names the file: with several rows, "не удалось скачать файл" alone leaves the
      // user guessing which one.
      const reason = err instanceof Error ? err.message : 'Попробуйте ещё раз.';
      setErrorMessage(`Не удалось скачать «${file.originalName}». ${reason}`);
    } finally {
      setDownloading(file.id, false);
    }
  }

  async function handleUpload(file: File) {
    setErrorMessage(null);
    setUploadProgress(0);
    uploadAbortRef.current = new AbortController();
    try {
      const created = await uploadMeetingFile(meetingId, file, {
        onProgress: setUploadProgress,
        signal: uploadAbortRef.current?.signal,
      });

      if (status === 'ready') {
        // Appended, not re-fetched: the API returned the created row, and the list is
        // ordered oldest-first, so the newest file belongs at the end.
        setFiles((current) => [...current, created]);
      } else {
        // The list never loaded, so this one row is not the whole story — showing it
        // alone would pass a one-file list off as complete. Ask the server instead.
        await load();
      }
    } catch (err) {
      // The reason (the 100 MB limit, the allowed types) comes from the API and is shown
      // verbatim — the PRD asks for the cause, not a generic failure.
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить файл.');
    } finally {
      setUploadProgress(null);
      // Cleared so picking the same file again still fires a change event.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const isUploading = uploadProgress !== null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Файлы</h2>

        {/* A plain file input, styled as a button via the label: the native control's
            look cannot be restyled reliably, and a fake button that opens a hidden input
            loses keyboard access unless it is wired back up by hand. */}
        {/* focus-within: the focusable element is the sr-only input, so without this a
            keyboard user sees no ring anywhere — the styled label would not react. */}
        <label
          className={`${buttonVariants({ size: 'sm' })} focus-within:outline-accent cursor-pointer focus-within:outline-2 focus-within:outline-offset-2`}
        >
          {isUploading ? 'Загрузка…' : 'Загрузить файл'}
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            // Exactly what the API accepts — no `audio/*` wildcard, which would let the
            // picker offer .flac or .ogg only for the upload to come back rejected.
            accept=".mp3,.wav,.m4a,.mp4,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4,video/mp4"
            disabled={isUploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
        </label>
      </div>

      {isUploading ? (
        <ProgressBar
          aria-label="Загрузка файла"
          // Real bytes on the wire, not a fake animation: the value comes from XHR's
          // upload progress events.
          value={Math.round(uploadProgress * 100)}
          className="w-full"
        >
          <ProgressBar.Output />
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : null}

      {/* One slot for every failure this block can have — a load, a download, an upload.
          Only one of them can be the newest thing that happened, so two competing red
          lines would only leave the reader deciding which is current. */}
      {errorMessage ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-danger text-sm" role="alert">
            {errorMessage}
          </p>
          {/* Retry belongs to a failed *list* only: there is nothing to re-run for a
              rejected upload — the user picks another file. */}
          {status === 'error' ? (
            <Button variant="outline" size="sm" onPress={() => void load()}>
              Попробовать снова
            </Button>
          ) : null}
        </div>
      ) : null}

      {status === 'loading' ? <p className="text-muted text-sm">Загрузка файлов…</p> : null}

      {status === 'ready' && files.length === 0 ? (
        // An empty list is not a failure — say so plainly rather than showing nothing.
        <div className="border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
          <FileIcon className="text-muted size-10" />
          <p className="font-medium">Файлов пока нет</p>
          <p className="text-muted max-w-xs text-sm text-balance">
            Загрузите запись встречи, чтобы она появилась здесь.
          </p>
        </div>
      ) : null}

      {files.length > 0 ? (
        <>
          {/* Named because the page has more than one list; also tells the two apart
              for assistive tech. */}
          <ul aria-label="Список файлов" className="flex flex-col gap-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="border-border flex items-center justify-between gap-4 rounded-xl border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileIcon className="text-muted size-5 shrink-0" />
                  <div className="flex min-w-0 flex-col">
                    {/* A long name must not push the download button off the row. */}
                    <span className="truncate font-medium" title={file.originalName}>
                      {file.originalName}
                    </span>
                    <span className="text-muted text-sm">
                      {formatFileSize(file.size)} ·{' '}
                      <time dateTime={file.createdAt}>
                        {dateFormatter.format(new Date(file.createdAt))}
                      </time>
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={downloadingIds.has(file.id)}
                  onPress={() => void handleDownload(file)}
                  // Every row's button reads "Скачать"; the name says which file.
                  aria-label={`Скачать ${file.originalName}`}
                >
                  {downloadingIds.has(file.id) ? 'Скачивание…' : 'Скачать'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

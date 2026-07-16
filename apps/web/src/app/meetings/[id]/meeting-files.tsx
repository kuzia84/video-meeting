'use client';

import { Button } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadMeetingFile, listMeetingFiles, type MeetingFile } from '@/lib/api/meeting-files';
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

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Файлы</h2>

      {status === 'loading' ? <p className="text-muted text-sm">Загрузка файлов…</p> : null}

      {status === 'error' && files.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-danger text-sm" role="alert">
            {errorMessage}
          </p>
          <Button variant="outline" size="sm" onPress={() => void load()}>
            Попробовать снова
          </Button>
        </div>
      ) : null}

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

          {/* A download failure must not wipe the list that is still perfectly good. */}
          {errorMessage ? (
            <p className="text-danger text-sm" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

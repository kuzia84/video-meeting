'use client';

import { Button, buttonVariants, ProgressBar } from '@heroui/react';
import { FileIcon } from '@/components/icons';
import { FileRow } from './file-row';
import { useMeetingFiles } from './use-meeting-files';

export function MeetingFiles({ meetingId }: { meetingId: string }) {
  const {
    status,
    files,
    errorMessage,
    downloadingIds,
    uploadProgress,
    fileInputRef,
    load,
    handleDownload,
    handleDelete,
    handleUpload,
  } = useMeetingFiles(meetingId);

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
        // Named because the page has more than one list; also tells the two apart for
        // assistive tech.
        <ul aria-label="Список файлов" className="flex flex-col gap-2">
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              isDownloading={downloadingIds.has(file.id)}
              onDownload={() => void handleDownload(file)}
              onDelete={() => handleDelete(file)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

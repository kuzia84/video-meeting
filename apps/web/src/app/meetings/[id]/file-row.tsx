'use client';

import { Button } from '@heroui/react';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { FileIcon } from '@/components/icons';
import type { MeetingFile } from '@/lib/api/meeting-files';
import { formatFileDate } from '@/lib/format-date';
import { formatFileSize } from './format-file-size';

export function FileRow({
  file,
  isDownloading,
  onDownload,
  onDelete,
}: {
  file: MeetingFile;
  isDownloading: boolean;
  onDownload: () => void;
  /** Rejecting is left to the caller's dialog to report; only removal on success matters here. */
  onDelete: () => Promise<void>;
}) {
  return (
    <li className="border-border flex items-center justify-between gap-4 rounded-xl border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileIcon className="text-muted size-5 shrink-0" />
        <div className="flex min-w-0 flex-col">
          {/* A long name must not push the download button off the row. */}
          <span className="truncate font-medium" title={file.originalName}>
            {file.originalName}
          </span>
          <span className="text-muted text-sm">
            {formatFileSize(file.size)} ·{' '}
            <time dateTime={file.createdAt}>{formatFileDate(file.createdAt)}</time>
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          isDisabled={isDownloading}
          onPress={onDownload}
          // Every row's button reads "Скачать"; the name says which file.
          aria-label={`Скачать ${file.originalName}`}
        >
          {isDownloading ? 'Скачивание…' : 'Скачать'}
        </Button>
        <ConfirmDeleteDialog
          trigger={
            <Button variant="ghost" size="sm" aria-label={`Удалить ${file.originalName}`}>
              Удалить
            </Button>
          }
          heading="Удалить файл?"
          body={
            <p>
              Файл <strong>{file.originalName}</strong> будет удалён безвозвратно.
            </p>
          }
          confirmLabel="Удалить файл"
          pendingLabel="Удаление…"
          onConfirm={onDelete}
        />
      </div>
    </li>
  );
}

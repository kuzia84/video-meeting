'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  deleteMeetingFile,
  downloadMeetingFile,
  listMeetingFiles,
  uploadMeetingFile,
  type MeetingFile,
} from '@/lib/api/meeting-files';
import { removeAccessToken } from '@/lib/auth/token';

export type MeetingFilesStatus = 'loading' | 'ready' | 'error';

export interface UseMeetingFiles {
  status: MeetingFilesStatus;
  files: MeetingFile[];
  errorMessage: string | null;
  /** Ids with a download in flight — a Set, since two can run at once. */
  downloadingIds: ReadonlySet<string>;
  /** null when nothing is uploading; 0..1 while it is. */
  uploadProgress: number | null;
  /** Attach to the file `<input>`; the hook clears its value after each upload. */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  load: () => Promise<void>;
  handleDownload: (file: MeetingFile) => Promise<void>;
  handleDelete: (file: MeetingFile) => Promise<void>;
  handleUpload: (file: File) => Promise<void>;
}

/**
 * Owns the meeting-files list and its actions. Extracted from `MeetingFiles` so the
 * component stays presentational; the load/upload/download/delete flows (and their
 * subtle state — the download Set, the abort-on-unmount, the append-vs-reload after an
 * upload) live here.
 */
export function useMeetingFiles(meetingId: string): UseMeetingFiles {
  const router = useRouter();
  const [status, setStatus] = useState<MeetingFilesStatus>('loading');
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

  function setDownloading(fileId: string, active: boolean): void {
    setDownloadingIds((current) => {
      const next = new Set(current);
      if (active) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }

  async function handleDownload(file: MeetingFile): Promise<void> {
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

  async function handleDelete(file: MeetingFile): Promise<void> {
    try {
      await deleteMeetingFile(meetingId, file.id);
    } catch (err) {
      // An expired token is "log in again", not "could not delete" — which is what the
      // dialog would otherwise show to someone who would keep retrying. Every other call
      // in the app handles it this way.
      if (err instanceof ApiError && err.status === 401) {
        removeAccessToken();
        router.replace('/login');
        return;
      }
      throw err;
    }
    // Dropped from what is on screen rather than re-fetching: the server has confirmed
    // it is gone, and the rest of the list was already right.
    setFiles((current) => current.filter((f) => f.id !== file.id));
  }

  async function handleUpload(file: File): Promise<void> {
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

  return {
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
  };
}

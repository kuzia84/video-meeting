'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { MeetingFormValues } from '@/components/meeting-form';
import { uploadMeetingFile } from '@/lib/api/meeting-files';
import { ApiError, createMeeting } from '@/lib/api/meetings';
import { removeAccessToken } from '@/lib/auth/token';

/** { done, total, fraction } while uploading; null otherwise. */
export interface UploadState {
  done: number;
  total: number;
  fraction: number;
}

/** What went wrong after the meeting itself was already created. */
export interface PartialFailure {
  meetingId: string;
  message: string;
  /** How many files made it before the failure — the rest never started. */
  uploaded: number;
  total: number;
}

export interface UseCreateMeeting {
  upload: UploadState | null;
  partialFailure: PartialFailure | null;
  /**
   * Creates the meeting, then uploads `files` against it. Rejecting is how it reports a
   * failure that belongs above the form fields (the create failed, nothing exists yet); a
   * per-file failure after create surfaces via `partialFailure` instead — see below.
   */
  createMeetingWithFiles: (values: MeetingFormValues) => Promise<void>;
}

/**
 * Owns creating a meeting and uploading its files. Extracted from the view so the
 * component stays presentational and the >40-line orchestration (create → serial upload
 * loop) is out of a JSX prop.
 */
export function useCreateMeeting(files: File[]): UseCreateMeeting {
  const router = useRouter();
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [partialFailure, setPartialFailure] = useState<PartialFailure | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  // Leaving mid-upload must not keep pushing the file at a page that is gone.
  useEffect(() => () => uploadAbortRef.current?.abort(), []);

  /**
   * Uploads the picked files one at a time against the created meeting. Serially, not in
   * parallel: it is what makes the progress bar's (done + fraction) / total mean anything,
   * and what lets the first failure stop the rest. Returns the `PartialFailure` for the
   * file that failed, or null when every file made it. The cost is wall-clock on
   * multi-file picks.
   */
  async function uploadFilesSerially(meetingId: string): Promise<PartialFailure | null> {
    uploadAbortRef.current = new AbortController();
    for (const [index, file] of files.entries()) {
      try {
        setUpload({ done: index, total: files.length, fraction: 0 });
        await uploadMeetingFile(meetingId, file, {
          onProgress: (fraction) => setUpload({ done: index, total: files.length, fraction }),
          // Without this, leaving mid-upload keeps pushing the whole file at a page that
          // is gone — the meeting-page uploader already aborts.
          signal: uploadAbortRef.current.signal,
        });
      } catch (err) {
        return {
          meetingId,
          // Names the file and how far the queue got: "не удалось загрузить файл" leaves a
          // three-file pick guessing which one and what survived.
          message: `«${file.name}» (${index + 1} из ${files.length}) — ${
            err instanceof Error ? err.message : 'попробуйте ещё раз.'
          }`,
          uploaded: index,
          total: files.length,
        };
      }
    }
    return null;
  }

  async function createMeetingWithFiles(values: MeetingFormValues): Promise<void> {
    setPartialFailure(null);
    let created;
    try {
      created = await createMeeting(values);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        removeAccessToken();
        router.replace('/login');
        return;
      }
      // Rethrown so the form reports it above the fields. Nothing was created.
      throw err;
    }

    // Files can only be uploaded against an existing meeting, so this is the one order
    // available: create, then upload. Everything past this point has to keep the created
    // meeting reachable, because it is already real.
    const failure = await uploadFilesSerially(created.id);
    setUpload(null);
    if (failure) {
      // Not thrown to the form: the form's error sits by the fields and would read as
      // "the meeting was not created", which is the opposite of true.
      setPartialFailure(failure);
      return;
    }
    router.push(`/meetings/${created.id}`);
  }

  return { upload, partialFailure, createMeetingWithFiles };
}
